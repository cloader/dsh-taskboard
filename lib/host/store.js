import { asBoardSettings, emptyLedger, isPlausibleTaskRecord, pruneExecutions } from "../shared/protocol.js";
import { dirname, join } from "node:path";
import { mkdir, open, readFile, rename } from "node:fs/promises";
//#region src/host/store.ts
/**
* Host-side task ledger: one JSON file under the active data directory, mutated through a
* serial write queue, published as immutable snapshots with a global
* monotonic revision. Change subscribers (P2: SSE route) observe every
* committed mutation.
*
* @module dsh-taskboard/host/store
*/
/**
* The durable ledger. All mutations run through {@link mutate}, which:
* validates the resulting document, bumps the global revision, persists
* atomically (temp file + rename), and only then notifies subscribers.
*/
var TaskStore = class {
	file;
	storageQueue;
	ledger = emptyLedger();
	subscribers = /* @__PURE__ */ new Set();
	queue = Promise.resolve();
	loaded = false;
	loadPromise;
	/** @param options - file location. */
	constructor(options) {
		this.file = options.file;
		this.storageQueue = options.queue;
	}
	/** Current absolute ledger path. */
	location() {
		return this.file;
	}
	/** Persist the live in-memory ledger to another file without switching. */
	async writeCopy(file) {
		await this.load();
		await persistAtomic(file, JSON.stringify(this.ledger));
	}
	/**
	* Re-read the ledger when the file has moved ahead of our cached copy.
	*
	* The ledger file is SHARED state: a second store instance (a previous
	* plugin generation whose long-lived callbacks are still running, or a
	* second host) can commit between our load and our write. Because a store
	* caches its snapshot forever (`load()` is a no-op once loaded) and
	* `mutate` persists the WHOLE document, writing a stale copy silently
	* rolls those commits back — same revision, no error, invisible to
	* subscribers. Re-read whenever the file is ahead so the cache is never
	* authority over a newer document.
	* @returns whether the cached ledger was replaced.
	*/
	async refreshIfStale() {
		let parsed;
		try {
			parsed = JSON.parse(await readFile(this.file, "utf8"));
		} catch {
			return false;
		}
		if (typeof parsed?.revision !== "number" || !Array.isArray(parsed.tasks)) return false;
		if (parsed.revision <= this.ledger.revision) return false;
		this.loaded = false;
		this.loadPromise = void 0;
		await this.load();
		return true;
	}
	/** Switch future writes after a prepared migration commits. */
	setLocation(file) {
		this.file = file;
	}
	/** Load (once) from disk; a missing file starts empty; a corrupt file is quarantined, not thrown. */
	load() {
		if (this.loaded) return Promise.resolve();
		if (this.loadPromise !== void 0) return this.loadPromise;
		this.loadPromise = this.loadOnce();
		return this.loadPromise;
	}
	/** Perform the single physical ledger read shared by all startup callers. */
	async loadOnce() {
		try {
			const raw = await readFile(this.file, "utf8");
			const parsed = JSON.parse(raw);
			if (typeof parsed.revision === "number" && Array.isArray(parsed.tasks)) {
				const plausible = [];
				for (const entry of parsed.tasks) {
					if (!isPlausibleTaskRecord(entry)) {
						const rawId = entry?.id;
						const id = typeof rawId === "string" ? rawId.slice(0, 60) : String(rawId);
						console.warn("[dsh-taskboard] dropping implausible ledger entry on load:", id);
						continue;
					}
					plausible.push(entry);
				}
				const tasks = plausible;
				for (const task of tasks) if (task.status === "in_progress" && task.claimedBy === void 0 && task.updatedBy?.kind === "agent" && typeof task.updatedBy.sessionId === "string") {
					task.claimedBy = task.updatedBy.sessionId;
					task.claimedAt = task.updatedAt;
				}
				let settings = void 0;
				if (parsed.settings !== void 0) try {
					settings = asBoardSettings(parsed.settings);
				} catch {
					console.warn("[dsh-taskboard] dropping invalid board settings on load");
				}
				this.ledger = {
					schemaVersion: 1,
					revision: parsed.revision,
					tasks,
					...settings !== void 0 ? { settings } : {}
				};
			}
		} catch (error) {
			if (error.code !== "ENOENT") try {
				await rename(this.file, `${this.file}.corrupt-${Date.now()}`);
			} catch {}
		}
		this.loaded = true;
	}
	/**
	* The current snapshot — a deep-frozen clone. Mutating the returned value
	* throws (strict mode) instead of silently bypassing the revision/persist
	* path; internal state is never handed out.
	*/
	snapshot() {
		return deepFreeze(structuredClone(this.ledger));
	}
	/** Find a task by id (frozen clone; internal state is never handed out). */
	get(id) {
		const task = this.ledger.tasks.find((t) => t.id === id);
		return task === void 0 ? void 0 : deepFreeze(structuredClone(task));
	}
	/** Subscribe to committed changes; returns the unsubscribe. */
	subscribe(fn) {
		this.subscribers.add(fn);
		return () => this.subscribers.delete(fn);
	}
	/**
	* Write a timestamped backup copy of the current ledger next to the live
	* file (import-replace safety, 0.4.0). Never throws the caller's flow —
	* a backup failure fails the import itself.
	* @returns the backup file path.
	*/
	async backup() {
		const run = async () => {
			await this.load();
			const target = `${this.file}.backup-${Date.now()}`;
			await persistAtomic(target, JSON.stringify(this.ledger, null, 2));
			return target;
		};
		return this.storageQueue === void 0 ? run() : this.storageQueue.run(run);
	}
	/**
	* Run one mutation inside the serial queue. The mutator works on a
	* structured clone; returning `undefined` aborts with no write.
	* @param kind - change kind for subscribers.
	* @param mutator - receives the cloned ledger; mutate tasks in place; return the touched tasks.
	*/
	async mutate(kind, mutator) {
		const run = async () => {
			await this.load();
			await this.refreshIfStale();
			const draft = structuredClone(this.ledger);
			const changed = mutator(draft);
			if (changed === void 0) return {
				ledger: deepFreeze(structuredClone(this.ledger)),
				changed: []
			};
			for (const task of changed) pruneExecutions(task);
			draft.revision += 1;
			const json = JSON.stringify(draft);
			await persistAtomic(this.file, json);
			this.ledger = draft;
			const change = {
				revision: draft.revision,
				tasks: changed,
				kind
			};
			for (const fn of this.subscribers) try {
				fn(change);
			} catch {}
			return {
				ledger: deepFreeze(structuredClone(draft)),
				changed: changed.map((t) => deepFreeze(structuredClone(t)))
			};
		};
		if (this.storageQueue !== void 0) return this.storageQueue.run(run);
		return this.queue = this.queue.then(run, run);
	}
	/**
	* Run a read INSIDE the serial queue (R3): observes exactly the ledger
	* state after all previously enqueued mutations — immune to the
	* write-then-publish window around `mutate`'s persistence. Read-only: the
	* callback receives a frozen deep clone and nothing is written.
	*/
	async read(fn) {
		const run = async () => {
			await this.load();
			return fn(deepFreeze(structuredClone(this.ledger)));
		};
		if (this.storageQueue !== void 0) return this.storageQueue.run(run);
		return this.queue = this.queue.then(run, run);
	}
};
/** Recursively freeze a plain-data value (defense in depth for handed-out snapshots). */
function deepFreeze(value) {
	if (value !== null && typeof value === "object") {
		if (!Object.isFrozen(value)) Object.freeze(value);
		for (const key of Object.keys(value)) deepFreeze(value[key]);
	}
	return value;
}
/**
* Atomic file persist: write temp, fsync, then rename over the target (S10:
* without the sync, a power loss after rename can leave a zero-length file —
* the next load would quarantine the ledger and start empty).
*/
async function persistAtomic(file, contents) {
	await mkdir(dirname(file), { recursive: true });
	const temp = join(dirname(file), `.${Math.random().toString(36).slice(2)}.tmp`);
	const fh = await open(temp, "w");
	try {
		await fh.writeFile(contents, "utf8");
		await fh.sync();
	} finally {
		await fh.close();
	}
	await rename(temp, file);
}
//#endregion
export { TaskStore };

//# sourceMappingURL=store.js.map
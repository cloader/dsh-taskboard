import { dirname, join } from "node:path";
import { mkdir } from "node:fs/promises";
import { mkdirSync, readFileSync, readdirSync, rmdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
//#region src/host/ledger-lock.ts
/** Cross-process ledger ownership, including recovery after a killed host. */
const STALE_LOCK_MS = 5 * 6e4;
const LOCK_TIMEOUT_MS = 36e4;
/** Only ESRCH establishes that a process is dead; EPERM is not evidence. */
function ownerState(token) {
	const match = /^([1-9]\d*):\d+:[a-z0-9]+$/.exec(token);
	const pid = match === null ? NaN : Number(match[1]);
	if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 2147483647) return "legacy";
	try {
		process.kill(pid, 0);
		return "alive";
	} catch (error) {
		return error.code === "ESRCH" ? "dead" : "unknown";
	}
}
/**
* Recover unique owner entries, then remove ONLY an empty lock directory.
* A second reclaimer cannot remove a replacement owner's different entry;
* rmdir refuses a nonempty directory, closing the stat/unlink replacement race.
* Legacy file locks are accepted during upgrade but never created here.
*/
function recoverLock(lock) {
	try {
		const before = statSync(lock);
		if (before.isDirectory()) {
			const entries = readdirSync(lock);
			if (entries.length === 0 && Date.now() - before.mtimeMs <= STALE_LOCK_MS) return false;
			for (const entry of entries) {
				const match = /^owner-([1-9]\d*)-(\d+)-([a-z0-9]+)$/.exec(entry);
				if (match === null || ownerState(match.slice(1).join(":")) !== "dead") return false;
				try {
					unlinkSync(join(lock, entry));
				} catch (error) {
					if (error.code !== "ENOENT") throw error;
				}
			}
			try {
				rmdirSync(lock);
				return true;
			} catch (error) {
				const code = error.code;
				if (code === "ENOTEMPTY" || code === "EEXIST") return false;
				if (code === "ENOENT") return true;
				throw error;
			}
		}
		const token = readFileSync(lock, "utf8");
		const state = ownerState(token);
		if (state === "alive" || state === "unknown") return false;
		if (state === "legacy" && Date.now() - before.mtimeMs <= STALE_LOCK_MS) return false;
		const after = statSync(lock);
		if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || readFileSync(lock, "utf8") !== token) return false;
		try {
			unlinkSync(lock);
			return true;
		} catch (error) {
			if (statSync(lock).isDirectory()) return false;
			throw error;
		}
	} catch (error) {
		const code = error.code;
		if (code === "ENOENT") return true;
		if (code === "EISDIR" || code === "ENOTDIR") return false;
		throw error;
	}
}
function release(lock, owner) {
	try {
		unlinkSync(owner);
	} catch {}
	try {
		rmdirSync(lock);
	} catch {}
}
/** Exclusive sidecar directory around the complete ledger read/modify/write. */
async function withLedgerWriteLock(file, run, options = {}) {
	const lock = file + ".lock";
	const token = process.pid + ":" + Date.now() + ":" + Math.random().toString(36).slice(2);
	const owner = join(lock, "owner-" + token.replaceAll(":", "-"));
	const deadline = Date.now() + (options.timeoutMs ?? LOCK_TIMEOUT_MS);
	await mkdir(dirname(file), { recursive: true });
	for (;;) {
		let acquired = false;
		try {
			mkdirSync(lock);
			acquired = true;
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
			if (recoverLock(lock)) continue;
		}
		if (acquired) {
			let ready = false;
			try {
				writeFileSync(owner, token, { flag: "wx" });
				const entries = readdirSync(lock);
				ready = entries.length === 1 && entries[0] === owner.slice(lock.length + 1);
			} catch (error) {
				if (error.code !== "ENOENT") {
					release(lock, owner);
					throw error;
				}
			}
			if (ready) try {
				return await run();
			} finally {
				release(lock, owner);
			}
			release(lock, owner);
		}
		if (Date.now() >= deadline) throw new Error("timed out waiting for task ledger lock: " + file);
		await new Promise((resolve) => setTimeout(resolve, options.retryMs ?? 25));
	}
}
//#endregion
export { withLedgerWriteLock };

//# sourceMappingURL=ledger-lock.js.map
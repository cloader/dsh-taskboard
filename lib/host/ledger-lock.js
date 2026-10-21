import { dirname } from "node:path";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { readFileSync, statSync, unlinkSync } from "node:fs";
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
* Recheck identity immediately before removing a recoverable lock. Keep this
* small section synchronous so concurrent callers in this host cannot resume
* between the identity check and removal. Never reclaim a known live owner.
*/
function recoverLock(lock) {
	try {
		const before = statSync(lock);
		const token = readFileSync(lock, "utf8");
		const state = ownerState(token);
		if (state === "alive" || state === "unknown") return false;
		if (state === "legacy" && Date.now() - before.mtimeMs <= STALE_LOCK_MS) return false;
		const after = statSync(lock);
		if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || readFileSync(lock, "utf8") !== token) return false;
		unlinkSync(lock);
		return true;
	} catch (error) {
		if (error.code === "ENOENT") return true;
		throw error;
	}
}
/** Exclusive sidecar lock around the complete ledger read/modify/write. */
async function withLedgerWriteLock(file, run, options = {}) {
	const lock = `${file}.lock`;
	const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
	const deadline = Date.now() + (options.timeoutMs ?? LOCK_TIMEOUT_MS);
	await mkdir(dirname(file), { recursive: true });
	for (;;) {
		let handle;
		try {
			handle = await open(lock, "wx");
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
			if (recoverLock(lock)) continue;
			if (Date.now() >= deadline) throw new Error(`timed out waiting for task ledger lock: ${file}`);
			await new Promise((resolve) => setTimeout(resolve, options.retryMs ?? 25));
			continue;
		}
		try {
			try {
				await handle.writeFile(token, "utf8");
			} finally {
				await handle.close();
			}
			return await run();
		} finally {
			if (await readFile(lock, "utf8").catch(() => void 0) === token) await unlink(lock).catch(() => {});
		}
	}
}
//#endregion
export { withLedgerWriteLock };

//# sourceMappingURL=ledger-lock.js.map
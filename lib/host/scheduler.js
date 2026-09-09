import { newCommentId, nextCronTime, normalizeBody, parseCron } from "../shared/protocol.js";
import "./execution.js";
//#region src/host/scheduler.ts
/**
* Host-side cron scheduler: one tick per minute over the ledger's scheduled
* tasks. A due task (nextRunAt reached, not running, not trashed) first has
* its next run advanced to the next cron match — then it executes through
* the same path as the manual button. Missed windows (host was down, tab
* closed — irrelevant here, this is the host process) simply advance: a
* nextRunAt more than one window in the past is skipped, not caught up.
*
* @module dsh-taskboard/host/scheduler
*/
/** Tick cadence. */
const TICK_MS = 6e4;
/** A due window older than this is skipped (missed while the host was down). */
const SKIP_AFTER_MS = 5 * 6e4;
const DEFAULT_TIMERS = {
	setInterval: (fn, ms) => setInterval(fn, ms),
	clearInterval: (handle) => {
		clearInterval(handle);
	},
	setTimeout: (fn, ms) => setTimeout(fn, ms),
	clearTimeout: (handle) => {
		clearTimeout(handle);
	}
};
/**
* The cron scheduler.
*/
var SchedulerService = class {
	deps;
	handle;
	catchup;
	timers = DEFAULT_TIMERS;
	/** @param deps - store + execution + clock. */
	constructor(deps) {
		this.deps = deps;
	}
	/** Start ticking. */
	start() {
		this.timers = this.deps.timers === void 0 ? DEFAULT_TIMERS : {
			...DEFAULT_TIMERS,
			...this.deps.timers
		};
		this.handle = this.timers.setInterval(() => {
			this.tick().catch((error) => {
				console.error("[dsh-taskboard] scheduler tick failed:", error);
			});
		}, TICK_MS);
		this.catchup = this.timers.setTimeout(() => {
			this.tick().catch((error) => {
				console.error("[dsh-taskboard] scheduler tick failed:", error);
			});
		}, 3e3);
	}
	/** Stop ticking. */
	dispose() {
		if (this.catchup !== void 0) {
			this.timers.clearTimeout(this.catchup);
			this.catchup = void 0;
		}
		if (this.handle === void 0) return;
		this.timers.clearInterval(this.handle);
		this.handle = void 0;
	}
	/** One scheduler pass (exported for tests). */
	async tick() {
		await this.deps.store.load();
		const now = this.deps.now();
		const ledger = this.deps.store.snapshot();
		for (const task of ledger.tasks) {
			if (task.execution.mode !== "scheduled" || task.execution.cron === void 0) continue;
			if (task.execution.nextRunAt === void 0) continue;
			if (task.status === "in_progress" || task.trashedAt !== void 0) continue;
			if (task.execution.nextRunAt > now) continue;
			if (this.deps.execution.inFlight() >= (this.deps.maxConcurrent ?? 3)) continue;
			const missed = now - task.execution.nextRunAt > SKIP_AFTER_MS;
			await this.advanceAndMark(task.id, now, missed ? void 0 : task.execution.nextRunAt);
			if (missed) continue;
			await this.deps.execution.run(task.id, "scheduled").catch((error) => {
				console.error("[dsh-taskboard] scheduled run failed:", error);
			});
		}
	}
	/**
	* Recompute the next run and record the trigger instant for one scheduled
	* task, in one serial-queue mutation. S12: a cron that can no longer match
	* anything within the 4-year scan window (only reachable through a
	* hand-edited ledger — every normal entry point validates) would otherwise
	* leave nextRunAt in the past and spin a full ~2M-iteration scan every
	* tick; it is cleared with a system comment instead of dying silently.
	*/
	async advanceAndMark(taskId, now, triggeredAt) {
		await this.deps.store.mutate("task-updated", (ledger) => {
			const task = ledger.tasks.find((t) => t.id === taskId);
			if (task === void 0 || task.execution.cron === void 0) return void 0;
			if (task.status === "in_progress" || task.trashedAt !== void 0) return void 0;
			const match = parseCron(task.execution.cron);
			const next = match === null ? void 0 : nextCronTime(match, now) ?? void 0;
			if (next === void 0) {
				const deadCron = task.execution.cron;
				task.execution.cron = void 0;
				task.execution.nextRunAt = void 0;
				task.comments.push({
					id: newCommentId(),
					body: normalizeBody(`[系统] 定时表达式 ${deadCron} 在 4 年内没有可触发时间，已停用定时；请修正 cron 后重新开启。`),
					systemKey: "sys.cronDead",
					systemParams: { cron: deadCron },
					version: 1,
					createdAt: now
				});
				return [task];
			}
			task.execution.nextRunAt = next;
			if (triggeredAt !== void 0) task.execution.lastTriggeredAt = triggeredAt;
			return [task];
		});
	}
};
//#endregion
export { SchedulerService };

//# sourceMappingURL=scheduler.js.map
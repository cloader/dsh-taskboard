import { newCommentId, nextCronTime, normalizeBody, parseCron } from "../shared/protocol.js";
//#region src/host/scheduler.ts
/**
* Host-side cron scheduler: one tick per minute over the ledger's scheduled
* tasks. Due tasks are first durably queued, then dispatched FIFO as global
* capacity becomes available. A queued window remains eligible across a host
* restart; only a window that was never queued can be classified as missed.
*
* @module dsh-taskboard/host/scheduler
*/
/** Tick cadence. */
const TICK_MS = 6e4;
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
	/** Reservations actively being handed to this scheduler instance's gate. */
	dispatching = /* @__PURE__ */ new Set();
	/** @param deps - store + execution + clock. */
	constructor(deps) {
		this.deps = deps;
	}
	maxConcurrent() {
		return typeof this.deps.maxConcurrent === "function" ? this.deps.maxConcurrent() : this.deps.maxConcurrent ?? 3;
	}
	skipAfterMs() {
		return typeof this.deps.skipAfterMs === "function" ? this.deps.skipAfterMs() : this.deps.skipAfterMs ?? 5 * 6e4;
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
			if (task.execution.mode !== "scheduled" || task.trashedAt !== void 0) continue;
			if (task.status !== "todo") continue;
			if (task.execution.queuedRunAt !== void 0) continue;
			if (task.execution.dispatchingRunAt !== void 0) {
				const key = `${task.id}:${task.execution.dispatchingRunAt}`;
				if (!this.dispatching.has(key)) await this.restoreQueued(task.id, task.execution.dispatchingRunAt);
				continue;
			}
			if (task.execution.cron !== void 0) {
				if (task.execution.nextRunAt === void 0) continue;
				if (task.execution.nextRunAt > now) continue;
				if (now - task.execution.nextRunAt > this.skipAfterMs()) await this.advanceAndMark(task.id, now, void 0, task.execution.nextRunAt);
				else await this.queueCron(task.id, now, task.execution.nextRunAt);
			} else if (task.execution.runAt !== void 0) {
				const due = task.execution.runAt;
				if (due > now) continue;
				if (now - due > this.skipAfterMs()) await this.consumeRunAt(task.id, now, due);
				else await this.queueRunAt(task.id, now, due);
			}
		}
		const queued = this.deps.store.snapshot().tasks.filter((task) => task.execution.mode === "scheduled" && task.status === "todo" && task.trashedAt === void 0 && task.execution.queuedRunAt !== void 0).sort((a, b) => a.execution.queuedRunAt - b.execution.queuedRunAt || (a.execution.queuedAt ?? 0) - (b.execution.queuedAt ?? 0) || a.id.localeCompare(b.id));
		for (const task of queued) {
			if (this.deps.execution.inFlight() >= this.maxConcurrent()) break;
			const queuedWindow = task.execution.queuedRunAt;
			if (!await this.reserveDispatch(task.id, queuedWindow)) continue;
			const key = `${task.id}:${queuedWindow}`;
			this.dispatching.add(key);
			try {
				const result = await this.deps.execution.run(task.id, "scheduled", { scheduledWindow: queuedWindow }).catch((error) => {
					console.error("[dsh-taskboard] scheduled run failed:", error);
				});
				if (result?.ok) await this.markDispatched(task.id, queuedWindow);
				else await this.restoreQueued(task.id, queuedWindow);
				if (result !== void 0 && !result.ok && !result.error.includes("concurrency")) console.error("[dsh-taskboard] scheduled dispatch rejected:", result.error);
			} finally {
				this.dispatching.delete(key);
			}
		}
	}
	/** Queue one periodic window and advance its next cron time atomically. */
	async queueCron(taskId, now, due) {
		await this.deps.store.mutate("task-updated", (ledger) => {
			const task = ledger.tasks.find((t) => t.id === taskId);
			if (task === void 0 || task.execution.cron === void 0 || task.execution.queuedRunAt !== void 0) return void 0;
			if (task.status !== "todo" || task.trashedAt !== void 0 || task.execution.nextRunAt !== due) return void 0;
			const match = parseCron(task.execution.cron);
			const next = match === null ? void 0 : nextCronTime(match, now) ?? void 0;
			if (next === void 0) return void 0;
			task.execution.nextRunAt = next;
			task.execution.queuedRunAt = due;
			task.execution.queuedAt = now;
			return [task];
		});
	}
	/** Queue a one-shot window atomically, consuming its public runAt field. */
	async queueRunAt(taskId, now, due) {
		await this.deps.store.mutate("task-updated", (ledger) => {
			const task = ledger.tasks.find((t) => t.id === taskId);
			if (task === void 0 || task.execution.runAt !== due || task.execution.queuedRunAt !== void 0) return void 0;
			if (task.status !== "todo" || task.trashedAt !== void 0) return void 0;
			delete task.execution.runAt;
			task.execution.nextRunAt = void 0;
			task.execution.queuedRunAt = due;
			task.execution.queuedAt = now;
			return [task];
		});
	}
	/** Finalize a queue entry when a lightweight execution adapter accepted it. */
	async markDispatched(taskId, queuedWindow) {
		await this.deps.store.mutate("task-updated", (ledger) => {
			const task = ledger.tasks.find((t) => t.id === taskId);
			if (task === void 0 || task.execution.dispatchingRunAt !== queuedWindow) return void 0;
			delete task.execution.dispatchingRunAt;
			delete task.execution.queuedAt;
			task.execution.lastTriggeredAt = queuedWindow;
			return [task];
		});
	}
	/** Reserve one FIFO entry before calling an execution face. */
	async reserveDispatch(taskId, queuedWindow) {
		let reserved = false;
		await this.deps.store.mutate("task-updated", (ledger) => {
			const task = ledger.tasks.find((t) => t.id === taskId);
			if (task === void 0 || task.execution.queuedRunAt !== queuedWindow) return void 0;
			if (task.status !== "todo" || task.trashedAt !== void 0) return void 0;
			delete task.execution.queuedRunAt;
			task.execution.dispatchingRunAt = queuedWindow;
			reserved = true;
			return [task];
		});
		return reserved;
	}
	/** Return an execution-gate rejection to the durable FIFO queue. */
	async restoreQueued(taskId, queuedWindow) {
		await this.deps.store.mutate("task-updated", (ledger) => {
			const task = ledger.tasks.find((t) => t.id === taskId);
			if (task === void 0 || task.execution.dispatchingRunAt !== queuedWindow) return void 0;
			delete task.execution.dispatchingRunAt;
			task.execution.queuedRunAt = queuedWindow;
			return [task];
		});
	}
	/**
	* Consume a one-shot task's runAt in one serial-queue mutation: the field
	* and nextRunAt are cleared the moment the trigger fires, so the task can
	* never fire twice. A window missed while the host was down is consumed
	* too, with a system comment instead of a silent drop.
	*/
	async consumeRunAt(taskId, now, missedDue) {
		await this.deps.store.mutate("task-updated", (ledger) => {
			const task = ledger.tasks.find((t) => t.id === taskId);
			if (task === void 0 || task.execution.runAt === void 0) return void 0;
			if (task.status !== "todo" || task.trashedAt !== void 0) return void 0;
			delete task.execution.runAt;
			task.execution.nextRunAt = void 0;
			task.execution.lastTriggeredAt = now;
			if (missedDue !== void 0) task.comments.push({
				id: newCommentId(),
				body: normalizeBody("[系统] 定时执行错过触发时间（主机当时未运行），本次不再补跑；可手动执行或修改定时。"),
				systemKey: "sys.runAtMissed",
				version: 1,
				createdAt: now
			});
			return [task];
		});
	}
	/**
	* Recompute the next run and record the trigger instant for one scheduled
	* task, in one serial-queue mutation. S12: a cron that can no longer match
	* anything within the 4-year scan window (only reachable through a
	* hand-edited ledger — every normal entry point validates) would otherwise
	* leave nextRunAt in the past and spin a full ~2M-iteration scan every
	* tick; it is cleared with a system comment instead of dying silently.
	*/
	async advanceAndMark(taskId, now, triggeredAt, missedDue) {
		await this.deps.store.mutate("task-updated", (ledger) => {
			const task = ledger.tasks.find((t) => t.id === taskId);
			if (task === void 0 || task.execution.cron === void 0) return void 0;
			if (task.status !== "todo" || task.trashedAt !== void 0) return void 0;
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
			if (missedDue !== void 0) task.comments.push({
				id: newCommentId(),
				body: normalizeBody("[系统] 定期执行错过触发时间（主机当时未运行），本次不再补跑；可手动执行或修改定时。"),
				systemKey: "sys.cronMissed",
				version: 1,
				createdAt: now
			});
			return [task];
		});
	}
};
//#endregion
export { SchedulerService };

//# sourceMappingURL=scheduler.js.map
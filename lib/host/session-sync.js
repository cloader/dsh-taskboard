import { defaultSyncExternalSessionsOf, newCommentId, newExecutionId, newTaskId, normalizeBody, normalizeTitle } from "../shared/protocol.js";
//#region src/host/session-sync.ts
/**
* External workspace session synchronization service.
*
* When `settings.syncExternalSessions` is enabled (0.5.4):
* - Listens to session lifecycle events from outside the taskboard.
* - On `turn/start`: automatically captures or resumes the session on the board
*   (status: `in_progress`, claimedBy: sessionId).
* - On `user/message` / `session/title`: enriches/updates task title & description.
* - On `turn/end`: settles the execution (success -> `in_review` 待验收, failure -> `todo`).
*
* @module dsh-taskboard/host/session-sync
*/
/** Extract text content from a user message event payload. */
function extractUserMessageText(msg) {
	if (typeof msg !== "object" || msg === null) return "";
	const content = msg.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) return content.map((part) => {
		if (typeof part === "string") return part;
		if (typeof part === "object" && part !== null && "text" in part && typeof part.text === "string") return part.text;
		return "";
	}).filter(Boolean).join("\n");
	return "";
}
/** Extract a short one-line title from prompt text. */
function titleFromText(text) {
	return (text.trim().replace(/^#+\s*/, "").split("\n")[0]?.trim() ?? "").slice(0, 50).trim();
}
/**
* Service that synchronizes external workspace sessions into the taskboard.
*/
var ExternalSessionSyncService = class {
	deps;
	unsubscribe;
	constructor(deps) {
		this.deps = deps;
		this.unsubscribe = deps.events.onSessionEvent((sessionId, event, sessionMeta) => {
			this.handleSessionEvent(sessionId, event, sessionMeta);
		});
	}
	/** Detach listener on teardown. */
	dispose() {
		this.unsubscribe();
	}
	async handleSessionEvent(sessionId, event, sessionMeta) {
		if (sessionId.startsWith("session-taskboard-")) return;
		if (!defaultSyncExternalSessionsOf(this.deps.store.snapshot().settings)) return;
		const now = this.deps.now();
		if (event.type === "turn/start") {
			await this.handleTurnStart(sessionId, sessionMeta?.header?.cwd, now);
			return;
		}
		if (event.type === "user/message") {
			await this.handleUserMessage(sessionId, event.data, now);
			return;
		}
		if (event.type === "session/title") {
			await this.handleSessionTitle(sessionId, event.data, now);
			return;
		}
		if (event.type === "turn/end") {
			await this.handleTurnEnd(sessionId, event.data, now);
			return;
		}
	}
	async handleTurnStart(sessionId, cwd, now) {
		let wsId;
		if (cwd !== void 0 && cwd.length > 0) wsId = (await this.deps.workspaces.resolveByPath(cwd))?.id;
		if (wsId === void 0) wsId = this.deps.workspaces.list()[0]?.id ?? "default";
		await this.deps.store.mutate("task-created", (ledger) => {
			const existing = ledger.tasks.find((t) => t.claimedBy === sessionId || t.executions.some((e) => e.sessionId === sessionId));
			if (existing !== void 0) {
				if (existing.trashedAt !== void 0) return void 0;
				if (existing.status === "in_progress" && existing.claimedBy === sessionId) {
					if (!existing.executions.some((e) => e.sessionId === sessionId && e.outcome === "running")) {
						existing.executions.push({
							id: newExecutionId(),
							sessionId,
							trigger: "manual",
							startedAt: now,
							outcome: "running",
							isolation: "none"
						});
						existing.updatedAt = now;
						existing.updatedBy = {
							kind: "agent",
							sessionId
						};
						return [existing];
					}
					return;
				}
				existing.status = "in_progress";
				existing.claimedBy = sessionId;
				existing.claimedAt = now;
				existing.updatedAt = now;
				existing.updatedBy = {
					kind: "agent",
					sessionId
				};
				existing.executions.push({
					id: newExecutionId(),
					sessionId,
					trigger: "manual",
					startedAt: now,
					outcome: "running",
					isolation: "none"
				});
				return [existing];
			}
			const shortId = sessionId.replace(/^session-/, "").slice(0, 8);
			const newTask = {
				id: newTaskId(),
				title: `会话 ${shortId}`,
				description: "",
				prompt: "",
				workspaceId: wsId,
				urgency: "normal",
				status: "in_progress",
				blocked: false,
				execution: { mode: "claim" },
				isolation: "none",
				claimedBy: sessionId,
				claimedAt: now,
				version: 1,
				createdAt: now,
				updatedAt: now,
				createdBy: {
					kind: "agent",
					sessionId
				},
				updatedBy: {
					kind: "agent",
					sessionId
				},
				comments: [],
				executions: [{
					id: newExecutionId(),
					sessionId,
					trigger: "manual",
					startedAt: now,
					outcome: "running",
					isolation: "none"
				}]
			};
			ledger.tasks.push(newTask);
			return [newTask];
		});
	}
	async handleUserMessage(sessionId, msgData, now) {
		const text = extractUserMessageText(msgData);
		if (text.trim().length === 0) return;
		await this.deps.store.mutate("task-updated", (ledger) => {
			const task = ledger.tasks.find((t) => t.claimedBy === sessionId || t.executions.some((e) => e.sessionId === sessionId));
			if (task === void 0 || task.trashedAt !== void 0) return void 0;
			let changed = false;
			if (task.title.startsWith("会话 ") && task.title.length <= 16) {
				const derived = titleFromText(text);
				if (derived.length > 0) {
					task.title = normalizeTitle(derived);
					changed = true;
				}
			}
			if (task.description.length === 0) {
				task.description = text.slice(0, 2e3);
				changed = true;
			}
			if (changed) {
				task.updatedAt = now;
				task.updatedBy = { kind: "user" };
				return [task];
			}
		});
	}
	async handleSessionTitle(sessionId, titleData, now) {
		const rawTitle = typeof titleData === "object" && titleData !== null && "title" in titleData && typeof titleData.title === "string" ? titleData.title : typeof titleData === "string" ? titleData : "";
		if (rawTitle.trim().length === 0) return;
		await this.deps.store.mutate("task-updated", (ledger) => {
			const task = ledger.tasks.find((t) => t.claimedBy === sessionId || t.executions.some((e) => e.sessionId === sessionId));
			if (task === void 0 || task.trashedAt !== void 0) return void 0;
			task.title = normalizeTitle(rawTitle);
			task.updatedAt = now;
			task.updatedBy = { kind: "user" };
			return [task];
		});
	}
	async handleTurnEnd(sessionId, endData, now) {
		const reason = typeof endData === "object" && endData !== null && "reason" in endData ? endData.reason : endData;
		let isFailure = false;
		let errorMessage = "";
		if (typeof reason === "object" && reason !== null) {
			const r = reason;
			if (r.kind === "error" || r.kind === "failure") {
				isFailure = true;
				errorMessage = typeof r.error === "string" ? r.error : typeof r.message === "string" ? r.message : "turn error";
			} else if (r.kind === "cancel") {
				isFailure = true;
				errorMessage = "cancelled";
			}
		} else if (typeof reason === "string" && (reason.includes("error") || reason.includes("fail"))) {
			isFailure = true;
			errorMessage = reason;
		}
		await this.deps.store.mutate("execution-recorded", (ledger) => {
			const task = ledger.tasks.find((t) => t.claimedBy === sessionId || t.executions.some((e) => e.sessionId === sessionId));
			if (task === void 0 || task.trashedAt !== void 0) return void 0;
			for (const exec of task.executions) if (exec.sessionId === sessionId && exec.outcome === "running") {
				exec.endedAt = now;
				if (isFailure) {
					exec.outcome = "failed";
					exec.error = errorMessage.slice(0, 500);
				} else exec.outcome = "succeeded";
			}
			delete task.claimedBy;
			delete task.claimedAt;
			task.updatedAt = now;
			task.updatedBy = {
				kind: "agent",
				sessionId
			};
			if (isFailure) {
				if (task.status === "in_progress") {
					task.status = "todo";
					task.comments.push({
						id: newCommentId(),
						body: normalizeBody(`[系统] 会话执行异常：${errorMessage.slice(0, 300)}；任务已退回待办。`),
						version: 1,
						createdAt: now
					});
				}
			} else if (task.status === "in_progress") {
				task.status = "in_review";
				task.comments.push({
					id: newCommentId(),
					body: normalizeBody("[系统] 会话执行完毕，已自动进入待验收。"),
					version: 1,
					createdAt: now
				});
			}
			return [task];
		});
	}
};
//#endregion
export { ExternalSessionSyncService, extractUserMessageText, titleFromText };

//# sourceMappingURL=session-sync.js.map
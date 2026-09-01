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
* Detect whether a session represents a subagent child conversation.
* Subagents are created by agent delegation (e.g. invoke_subagent / subagents service)
* and should never be automatically converted into user tasks on the taskboard.
*/
function isSubagentSession(sessionId, sessionMeta, event) {
	if (typeof sessionId === "string") {
		if (sessionId.startsWith("subagent-") || sessionId.startsWith("child-") || sessionId.startsWith("delegate-")) return true;
	}
	if (typeof sessionMeta === "object" && sessionMeta !== null) {
		const s = sessionMeta;
		const header = s.header;
		const meta = s.meta;
		const options = s.options;
		if (header?.origin === "subagent" || meta?.origin === "subagent") return true;
		if (header?.parentSession !== void 0 || header?.parentSessionId !== void 0 || meta?.parentSession !== void 0 || meta?.parentSessionId !== void 0) return true;
		if (typeof header?.delegationDepth === "number" && header.delegationDepth > 0) return true;
		if (typeof meta?.delegationDepth === "number" && meta.delegationDepth > 0) return true;
		if (typeof options?.subagentDepth === "number" && options.subagentDepth > 0) return true;
	}
	if (event !== void 0) {
		if (event.type === "subagent/descriptor" || event.type === "subagent/start" || event.type === "subagent/end") return true;
		if (typeof event.data === "object" && event.data !== null) {
			const d = event.data;
			if (d.origin === "subagent" || d.subagent === true || typeof d.subagentId === "string" || typeof d.parentSession === "string") return true;
		}
	}
	return false;
}
/**
* Detect whether a session represents an active working conversation.
* Inspects state, status, isWorking/isBusy methods, running flags, and active turns.
*/
function isSessionActiveWorking(session) {
	if (typeof session !== "object" || session === null) return false;
	const s = session;
	if (typeof s.isWorking === "function") try {
		if (Boolean(s.isWorking())) return true;
	} catch {}
	else if (s.isWorking === true) return true;
	if (typeof s.isBusy === "function") try {
		if (Boolean(s.isBusy())) return true;
	} catch {}
	else if (s.busy === true || s.isBusy === true) return true;
	if (s.running === true || s.active === true || s.isGenerating === true || s.generating === true) return true;
	if (typeof s.state === "string") {
		const st = s.state.toLowerCase();
		if (st === "running" || st === "working" || st === "busy" || st === "generating" || st === "executing") return true;
	}
	if (typeof s.status === "string") {
		const st = s.status.toLowerCase();
		if (st === "running" || st === "working" || st === "busy" || st === "active" || st === "generating" || st === "executing") return true;
	}
	if (s.activeTurn !== void 0 && s.activeTurn !== null && s.activeTurn !== false) return true;
	if (s.currentTurn !== void 0 && s.currentTurn !== null) if (typeof s.currentTurn === "object") {
		const ct = s.currentTurn;
		if (ct.status === "running" || ct.state === "running" || ct.outcome === "running" || ct.endedAt === void 0) return true;
	} else return true;
	if (Array.isArray(s.turns) && s.turns.length > 0) {
		const lastTurn = s.turns[s.turns.length - 1];
		if (typeof lastTurn === "object" && lastTurn !== null) {
			const lt = lastTurn;
			if (lt.status === "running" || lt.state === "running" || lt.outcome === "running" || lt.startedAt !== void 0 && lt.endedAt === void 0) return true;
		}
	}
	return false;
}
/** Default scan interval: 4s. */
const DEFAULT_SCAN_INTERVAL_MS = 4e3;
/**
* Service that synchronizes external workspace sessions into the taskboard.
*/
var ExternalSessionSyncService = class {
	deps;
	unsubscribe;
	ignoredSessions = /* @__PURE__ */ new Set();
	scanTimer;
	constructor(deps) {
		this.deps = deps;
		this.unsubscribe = deps.events.onSessionEvent((sessionId, event, sessionMeta) => {
			this.handleSessionEvent(sessionId, event, sessionMeta);
		});
		const interval = deps.scanIntervalMs ?? 4e3;
		if (interval > 0) this.scanTimer = setInterval(() => {
			this.scanActiveSessions();
		}, interval);
	}
	/** Detach listener and clear scanner on teardown. */
	dispose() {
		this.unsubscribe();
		if (this.scanTimer !== void 0) {
			clearInterval(this.scanTimer);
			this.scanTimer = void 0;
		}
	}
	/**
	* Periodic active scan: checks whether external sessions linked to board tasks
	* are actively working, ensuring tasks in `in_review` / `todo` / `backlog`
	* automatically pull back to `in_progress`.
	*/
	async scanActiveSessions() {
		const snapshot = this.deps.store.snapshot();
		if (!defaultSyncExternalSessionsOf(snapshot.settings)) return;
		if (this.deps.sessions === void 0) return;
		const now = this.deps.now();
		const tasks = snapshot.tasks.filter((t) => t.trashedAt === void 0);
		for (const task of tasks) {
			const sessionId = task.claimedBy ?? task.executions[task.executions.length - 1]?.sessionId;
			if (sessionId === void 0 || typeof sessionId !== "string") continue;
			if (this.ignoredSessions.has(sessionId) || sessionId.startsWith("session-taskboard-")) continue;
			let session;
			try {
				session = this.deps.sessions.get?.(sessionId);
			} catch {}
			if (session === void 0 && typeof this.deps.sessions.list === "function") try {
				session = this.deps.sessions.list()?.find((s) => s?.id === sessionId);
			} catch {}
			if (session === void 0 || session === null) continue;
			if (isSubagentSession(sessionId, session)) {
				this.ignoredSessions.add(sessionId);
				continue;
			}
			if (isSessionActiveWorking(session)) {
				if (task.status !== "in_progress") await this.deps.store.mutate("task-updated", (ledger) => {
					const current = ledger.tasks.find((t) => t.id === task.id);
					if (current === void 0 || current.trashedAt !== void 0) return void 0;
					current.status = "in_progress";
					current.claimedBy = sessionId;
					current.claimedAt = current.claimedAt ?? now;
					current.updatedAt = now;
					current.updatedBy = {
						kind: "agent",
						sessionId
					};
					if (!current.executions.some((e) => e.sessionId === sessionId && e.outcome === "running")) current.executions.push({
						id: newExecutionId(),
						sessionId,
						trigger: "manual",
						startedAt: now,
						outcome: "running",
						isolation: "none"
					});
					return [current];
				});
			}
		}
	}
	async handleSessionEvent(sessionId, event, sessionMeta) {
		if (this.ignoredSessions.has(sessionId)) return;
		if (sessionId.startsWith("session-taskboard-")) {
			this.ignoredSessions.add(sessionId);
			return;
		}
		if (isSubagentSession(sessionId, sessionMeta, event)) {
			this.ignoredSessions.add(sessionId);
			await this.deps.store.mutate("task-deleted", (ledger) => {
				const idx = ledger.tasks.findIndex((t) => t.claimedBy === sessionId && t.createdBy.kind === "agent" && t.createdBy.sessionId === sessionId);
				if (idx >= 0) {
					ledger.tasks.splice(idx, 1);
					return [];
				}
			});
			return;
		}
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
		if (event.type === "turn/step" || event.type === "turn/progress" || event.type === "agent/step" || event.type === "agent/thought" || event.type === "agent/turn/start") {
			await this.ensureSessionInProgress(sessionId, now);
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
	async ensureSessionInProgress(sessionId, now) {
		await this.deps.store.mutate("task-updated", (ledger) => {
			const task = ledger.tasks.find((t) => t.claimedBy === sessionId || t.executions.some((e) => e.sessionId === sessionId));
			if (task === void 0 || task.trashedAt !== void 0) return void 0;
			let changed = false;
			if (task.status !== "in_progress") {
				task.status = "in_progress";
				task.claimedBy = sessionId;
				task.claimedAt = task.claimedAt ?? now;
				changed = true;
			}
			if (!task.executions.some((e) => e.sessionId === sessionId && e.outcome === "running")) {
				task.executions.push({
					id: newExecutionId(),
					sessionId,
					trigger: "manual",
					startedAt: now,
					outcome: "running",
					isolation: "none"
				});
				changed = true;
			}
			if (changed) {
				task.updatedAt = now;
				task.updatedBy = {
					kind: "agent",
					sessionId
				};
				return [task];
			}
		});
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
		await this.deps.store.mutate("task-updated", (ledger) => {
			const task = ledger.tasks.find((t) => t.claimedBy === sessionId || t.executions.some((e) => e.sessionId === sessionId));
			if (task === void 0 || task.trashedAt !== void 0) return void 0;
			let changed = false;
			if (text.trim().length > 0) {
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
			}
			if (task.status !== "in_progress") {
				task.status = "in_progress";
				task.claimedBy = sessionId;
				task.claimedAt = now;
				changed = true;
			}
			if (!task.executions.some((e) => e.sessionId === sessionId && e.outcome === "running")) {
				task.executions.push({
					id: newExecutionId(),
					sessionId,
					trigger: "manual",
					startedAt: now,
					outcome: "running",
					isolation: "none"
				});
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
export { DEFAULT_SCAN_INTERVAL_MS, ExternalSessionSyncService, extractUserMessageText, isSessionActiveWorking, isSubagentSession, titleFromText };

//# sourceMappingURL=session-sync.js.map
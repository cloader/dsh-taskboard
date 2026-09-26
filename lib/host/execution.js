import { effectiveIsolation, effectivePrompt, newCommentId, newExecutionId, nextCronTime, normalizeBody, parseCron, spawnNextCycle } from "../shared/protocol.js";
import { sanitizeBranchName } from "./git.js";
import { isLegacySingle, prepareMirror } from "./isolation.js";
import { createRepoScanner } from "./repos.js";
import { MessageId } from "./sdk.js";
//#region src/host/execution.ts
/**
* Host execution service: runs a task through dsh's REAL session machinery —
* a fresh agent+session inside the task's project workspace (creation carries
* the pinned model when the task has one), the session is attached to the
* workspace so it appears in the GUI's project session list, the effective
* prompt is submitted as an ordinary user message, and the turn settlement
* (turn/end reason) is folded back into the task's execution record.
*
* Manual runs open fresh sessions; scheduled runs can resume their previous
* session while keeping separate execution records and settlement watchers.
*
* @module dsh-taskboard/host/execution
*/
/** Whether a turn/end payload closed with an error reason. */
function isErrorTurnEnd(data) {
	if (typeof data !== "object" || data === null) return void 0;
	const reason = data.reason;
	if (typeof reason !== "object" || reason === null) return void 0;
	if (reason.kind !== "error") return void 0;
	const error = reason.error;
	const message = typeof error?.message === "string" ? error.message : "turn failed";
	console.error("[dsh-taskboard] turn error detail:", JSON.stringify(error)?.slice(0, 2e3) ?? "");
	return { message };
}
const ACTIVITY_PERSIST_MS = 6e4;
const ACTIVITY_EVENTS = /* @__PURE__ */ new Set([
	"turn/start",
	"turn/step",
	"turn/progress",
	"agent/step",
	"agent/thought",
	"user/message"
]);
/**
* The execution service.
*/
var ExecutionService = class {
	deps;
	/** Live executions by execution id (settles and cancels remove entries). */
	runs = /* @__PURE__ */ new Map();
	/** Detaches the turn/end listener (plugin teardown — review P1). */
	unsubscribeEvents;
	/** Last activity persistence attempt per live session (avoid per-event disk writes). */
	lastActivityAt = /* @__PURE__ */ new Map();
	/** @param deps - store + agents + workspaces + events + clock. */
	constructor(deps) {
		this.deps = deps;
		this.unsubscribeEvents = deps.events.onSessionEvent((sessionId, event) => {
			if (ACTIVITY_EVENTS.has(event.type)) this.noteActivity(sessionId).catch((error) => {
				console.error("[dsh-taskboard] activity persistence error:", error);
			});
			if (event.type !== "turn/end") return;
			const failure = isErrorTurnEnd(event.data);
			if (failure !== void 0) this.noteFailure(sessionId, failure.message).catch((error) => {
				console.error("[dsh-taskboard] failure settlement error:", error);
			});
		});
	}
	/** Detach the settlement listener; safe to call once at plugin teardown. */
	dispose() {
		this.unsubscribeEvents();
	}
	/** Record execution activity at most once per minute for an accurate stale badge. */
	async noteActivity(sessionId) {
		const now = this.deps.now();
		const previous = this.lastActivityAt.get(sessionId);
		if (previous !== void 0 && now - previous < ACTIVITY_PERSIST_MS) return;
		const entry = [...this.runs.entries()].find(([, run]) => run.sessionId === sessionId);
		if (entry === void 0) return;
		this.lastActivityAt.set(sessionId, now);
		const [executionId] = entry;
		await this.deps.store.mutate("execution-recorded", (ledger) => {
			for (const task of ledger.tasks) {
				const execution = task.executions.find((current) => current.id === executionId);
				if (execution?.outcome !== "running") continue;
				if (execution.lastActivityAt !== void 0 && now - execution.lastActivityAt < ACTIVITY_PERSIST_MS) return void 0;
				execution.lastActivityAt = now;
				return [task];
			}
		});
	}
	/** Recreate enough mirror metadata from the durable start record to collect settlement facts. */
	preparedFromExecution(execution) {
		if (execution.repos !== void 0 && execution.repos.length > 0 && execution.repos.every((repo) => repo.baseCommit !== void 0)) {
			const repos = execution.repos.map((repo) => ({
				repo: repo.repo,
				branch: repo.branch,
				worktreePath: repo.worktreePath,
				baseCommit: repo.baseCommit,
				reused: true
			}));
			return {
				root: repos.find((repo) => repo.repo === "")?.worktreePath ?? repos[0].worktreePath,
				repos,
				skipped: [],
				allReused: true
			};
		}
		if (execution.branch !== void 0 && execution.worktreePath !== void 0 && execution.baseCommit !== void 0) return {
			root: execution.worktreePath,
			repos: [{
				repo: "",
				branch: execution.branch,
				worktreePath: execution.worktreePath,
				baseCommit: execution.baseCommit,
				reused: true
			}],
			skipped: [],
			allReused: true
		};
	}
	/** Attach a new-generation settlement watcher without taking ownership of the live agent. */
	adoptLiveRun(executionId, sessionId, agent, prepared) {
		if (this.runs.has(executionId)) return;
		const settle = () => {
			if (!this.runs.has(executionId)) return;
			this.runs.delete(executionId);
			this.settleExecution(executionId, sessionId, prepared);
		};
		this.runs.set(executionId, {
			sessionId,
			...prepared !== void 0 ? { prepared } : {},
			settle,
			dispose: async () => {
				agent.cancel({ kind: "user" });
				await agent.whenIdle();
			}
		});
		this.lastActivityAt.set(sessionId, this.deps.now());
		agent.whenIdle().then(settle, () => {
			this.noteFailure(sessionId, "agent did not reach quiescence", executionId).then(() => {
				this.runs.delete(executionId);
			}).catch(() => {
				this.runs.delete(executionId);
			});
		});
	}
	/**
	* Best-effort evidence collection for a prepared mirror: a repo whose git
	* collect fails is SKIPPED (missing pieces stay unset — settlement NEVER
	* blocks on git); all-fail resolves undefined.
	*/
	async collectEvidence(prepared) {
		if (prepared === void 0 || this.deps.git === void 0 || prepared.repos.length === 0) return void 0;
		const out = [];
		const nestedRels = prepared.repos.filter((r) => r.repo !== "").map((r) => r.repo);
		for (const repo of prepared.repos) try {
			const facts = await this.deps.git.collect(repo.worktreePath, repo.baseCommit, repo.repo === "" && nestedRels.length > 0 ? nestedRels : void 0);
			out.push({
				repo,
				facts
			});
		} catch {}
		return out.length > 0 ? out : void 0;
	}
	/** Map one repo's settlement facts onto evidence record fields. */
	factsFields(facts) {
		return {
			...facts.headCommit !== void 0 ? { headCommit: facts.headCommit } : {},
			commits: facts.commits,
			commitsTotal: facts.commitsTotal,
			dirtyFiles: facts.dirtyFiles,
			dirtyFilesTotal: facts.dirtyFilesTotal,
			changedFiles: facts.changedFiles,
			...facts.diffStat !== void 0 ? { diffStat: facts.diffStat } : {}
		};
	}
	/**
	* Copy collected facts onto an execution record (in place). The legacy
	* flat fields always carry the FIRST repo (the workspace root when it has
	* one) so single-repo records stay byte-identical to the pre-mirror shape;
	* non-legacy mirrors additionally fill the per-repo `repos` evidence.
	*/
	applyFacts(execution, prepared, evidence) {
		if (evidence === void 0 || evidence.length === 0) return;
		const first = evidence[0].facts;
		if (first.headCommit !== void 0) execution.headCommit = first.headCommit;
		execution.commits = first.commits;
		execution.commitsTotal = first.commitsTotal;
		execution.dirtyFiles = first.dirtyFiles;
		execution.dirtyFilesTotal = first.dirtyFilesTotal;
		execution.changedFiles = first.changedFiles;
		if (first.diffStat !== void 0) execution.diffStat = first.diffStat;
		if (prepared !== void 0 && !isLegacySingle(prepared)) execution.repos = evidence.map(({ repo, facts }) => ({
			repo: repo.repo,
			branch: repo.branch,
			worktreePath: repo.worktreePath,
			baseCommit: repo.baseCommit,
			...this.factsFields(facts)
		}));
	}
	/**
	* Record a turn failure against the running execution of that session and
	* give the task back. Resolves once the failure settlement has COMMITTED —
	* R2: the whenIdle rejection path awaits this (and only this) before
	* releasing its run entry, so a success settlement can never race it into
	* the ledger and record a failed run as succeeded.
	*/
	noteFailure(sessionId, message, executionId) {
		const match = [...this.runs.entries()].find(([id, e]) => e.sessionId === sessionId && (executionId === void 0 || id === executionId));
		if (match === void 0) return Promise.resolve();
		const [failedId, entry] = match;
		return this.collectEvidence(entry?.prepared).then((evidence) => this.deps.store.mutate("execution-recorded", (ledger) => {
			for (const task of ledger.tasks) for (const execution of task.executions) if (execution.id === failedId && execution.outcome === "running") {
				execution.outcome = "failed";
				execution.error = message.slice(0, 500);
				execution.endedAt = this.deps.now();
				this.applyFacts(execution, entry?.prepared, evidence);
				if (task.status === "in_progress" && task.claimedBy === sessionId) {
					task.status = "todo";
					task.updatedAt = this.deps.now();
					delete task.claimedBy;
					delete task.claimedAt;
					task.comments.push({
						id: newCommentId(),
						body: normalizeBody(`[系统] 执行失败：${message.slice(0, 300)}；任务已退回待办。`),
						systemKey: "sys.execFailed",
						systemParams: { error: message.slice(0, 300) },
						version: 1,
						createdAt: this.deps.now()
					});
				}
				return [task];
			}
		})).then(() => {});
	}
	/**
	* Patch one task's execution record in the ledger. R3 depth: a record that
	* already settled (cancelled/failed/succeeded) is never resurrected — the
	* startup path patches sessionId long after the gate opened, and a cancel
	* may have committed in between.
	*/
	async patchExecution(executionId, patch) {
		await this.deps.store.mutate("execution-recorded", (ledger) => {
			for (const task of ledger.tasks) {
				const execution = task.executions.find((e) => e.id === executionId);
				if (execution !== void 0) {
					if (execution.outcome !== "running") return void 0;
					Object.assign(execution, patch);
					return [task];
				}
			}
		});
	}
	/**
	* Run one task now (manual button or scheduler tick).
	*
	* The in-progress gate and the execution-open write happen inside ONE
	* serial-queue mutation, so two overlapping run() calls (double click,
	* overlapping scheduler ticks) can never both pass — exactly one session
	* is opened per task.
	* @param taskId - the task to run.
	* @param trigger - what started it.
	* @param options - per-run options (`reuseWorktree` = 续跑).
	* @returns the immediate result; settlement lands in the ledger.
	*/
	async run(taskId, trigger, options) {
		const max = typeof this.deps.maxConcurrent === "function" ? this.deps.maxConcurrent() : this.deps.maxConcurrent ?? 3;
		if (this.runs.size >= max) return {
			ok: false,
			error: `execution concurrency limit reached (${this.runs.size}/${max} running)`
		};
		const task = this.deps.store.get(taskId);
		if (task === void 0 || task.trashedAt !== void 0) return {
			ok: false,
			error: `no task ${taskId}`
		};
		const workspace = this.deps.workspaces.get(task.workspaceId);
		if (workspace === void 0) return {
			ok: false,
			error: `unknown workspace ${task.workspaceId}`
		};
		const executionId = newExecutionId();
		let sessionId = this.deps.mintSessionId?.() ?? `session-taskboard-${crypto.randomUUID()}`;
		const isolation = effectiveIsolation(task);
		const branch = task.branch ?? sanitizeBranchName(task.title, task.id);
		let gate;
		await this.deps.store.mutate("execution-recorded", (ledger) => {
			const target = ledger.tasks.find((t) => t.id === taskId);
			if (target === void 0 || target.trashedAt !== void 0) {
				gate = `no task ${taskId}`;
				return;
			}
			if (trigger === "scheduled" && target.status !== "todo") {
				gate = `scheduled task is not actionable (${target.status})`;
				return;
			}
			if (trigger === "scheduled" && options?.scheduledWindow !== void 0 && target.execution.dispatchingRunAt !== options.scheduledWindow) {
				gate = "scheduled dispatch is no longer queued";
				return;
			}
			if (target.status === "in_progress" || target.executions.some((e) => e.outcome === "running") || [...this.runs.values()].some((e) => target.executions.some((x) => x.sessionId === e.sessionId))) {
				gate = "task is already in progress";
				return;
			}
			const running = ledger.tasks.reduce((n, t) => n + t.executions.filter((e) => e.outcome === "running").length, 0);
			if (running >= max) {
				gate = `execution concurrency limit reached (${running}/${max} running)`;
				return;
			}
			target.executions.push({
				id: executionId,
				trigger,
				startedAt: this.deps.now(),
				lastActivityAt: this.deps.now(),
				outcome: "running",
				...isolation === "none" ? { isolation: "none" } : {
					isolation: "worktree",
					branch
				}
			});
			if (options?.scheduledWindow !== void 0) {
				delete target.execution.dispatchingRunAt;
				delete target.execution.queuedAt;
				target.execution.lastTriggeredAt = options.scheduledWindow;
			}
			target.status = "in_progress";
			target.updatedAt = this.deps.now();
			target.updatedBy = { kind: "system" };
			target.claimedBy = sessionId;
			target.claimedAt = this.deps.now();
			return [target];
		});
		if (gate !== void 0) return {
			ok: false,
			error: gate
		};
		let isolationNote;
		let prepared;
		const prepareIsolation = async () => {
			if (isolation === "worktree") if (this.deps.git === void 0) {
				isolationNote = "git 集成不可用，已在原目录执行";
				await this.patchExecution(executionId, {
					isolation: "none",
					isolationNote,
					branch: void 0,
					worktreePath: void 0,
					baseCommit: void 0
				});
			} else {
				const outcome = await prepareMirror({
					git: this.deps.git,
					scanner: this.deps.scanner ?? createRepoScanner()
				}, {
					workspacePath: workspace.path,
					taskId: task.id,
					branch,
					reuse: options?.reuseWorktree === true
				});
				if ("mirror" in outcome) {
					prepared = outcome.mirror;
					await this.pinBranches(task, prepared);
					const root = prepared.repos[0];
					await this.patchExecution(executionId, {
						worktreePath: root?.worktreePath,
						baseCommit: root?.baseCommit,
						...!isLegacySingle(prepared) ? { repos: prepared.repos.map((r) => ({
							repo: r.repo,
							branch: r.branch,
							worktreePath: r.worktreePath,
							baseCommit: r.baseCommit
						})) } : {}
					});
				} else {
					isolationNote = outcome.note;
					await this.patchExecution(executionId, {
						isolation: "none",
						isolationNote,
						branch: void 0,
						worktreePath: void 0,
						baseCommit: void 0
					});
				}
			}
		};
		if (trigger !== "scheduled") await prepareIsolation();
		let composition;
		try {
			composition = this.deps.composeAgent === void 0 ? void 0 : await this.deps.composeAgent(task.presetId);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.patchExecution(executionId, {
				outcome: "failed",
				error: `preset 组合失败：${message.slice(0, 400)}`,
				endedAt: this.deps.now()
			});
			await this.revertProgress(taskId);
			await this.cleanupMirror(prepared, workspace.path);
			return {
				ok: false,
				error: `preset composition failed: ${message}`
			};
		}
		let handle;
		let sessionReuseKey;
		try {
			const model = task.model ?? this.deps.defaultModel?.();
			const createOptions = {
				sessionId,
				meta: {
					cwd: workspace.path,
					...composition !== void 0 ? { agentPreset: composition.agentPreset } : {}
				},
				...model !== void 0 ? { agentOptions: {
					provider: model.provider,
					model: model.model,
					...model.reasoningEffort !== void 0 ? { reasoningEffort: model.reasoningEffort } : {}
				} } : {},
				...composition !== void 0 ? { setup: composition.setup } : {}
			};
			sessionReuseKey = JSON.stringify([
				task.workspaceId,
				workspace.path,
				composition?.agentPreset ?? null,
				model?.provider ?? null,
				model?.model ?? null,
				model?.reasoningEffort ?? null,
				task.permission ?? "workspace-write",
				isolation
			]);
			const previous = trigger === "scheduled" ? [...task.executions].reverse().find((e) => e.trigger === "scheduled" && e.sessionId !== void 0) : void 0;
			handle = (previous?.sessionReuseKey === sessionReuseKey && previous.sessionId !== void 0 ? await this.deps.agents.resumeScheduled?.(previous.sessionId, createOptions) : void 0) ?? await this.deps.agents.create(createOptions);
			sessionId = handle.agent.id;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.patchExecution(executionId, {
				outcome: "failed",
				error: message.slice(0, 500),
				endedAt: this.deps.now()
			});
			await this.revertProgress(taskId);
			await this.cleanupMirror(prepared, workspace.path);
			return {
				ok: false,
				error: message
			};
		}
		if (trigger === "scheduled") await prepareIsolation();
		if (!await this.deps.store.read((ledger) => ledger.tasks.some((t) => t.executions.some((e) => e.id === executionId && e.outcome === "running")))) {
			if (!handle.borrowed) await handle.dispose().catch(() => {});
			await this.cleanupMirror(prepared, workspace.path);
			return {
				ok: false,
				error: "cancelled during startup"
			};
		}
		await this.deps.workspaces.attach(task.workspaceId, sessionId).catch(() => {});
		if (this.deps.setPermission !== void 0) try {
			this.deps.setPermission(sessionId, task.permission ?? "workspace-write");
		} catch {}
		try {
			this.deps.renameSession?.(sessionId, task.title);
		} catch {}
		await this.deps.store.mutate("execution-recorded", (ledger) => {
			const target = ledger.tasks.find((t) => t.id === taskId);
			const execution = target?.executions.find((e) => e.id === executionId && e.outcome === "running");
			if (target === void 0 || execution === void 0) return void 0;
			Object.assign(execution, {
				sessionId,
				...trigger === "scheduled" ? { sessionReuseKey } : {}
			});
			target.claimedBy = sessionId;
			return [target];
		});
		const current = this.deps.store.get(taskId)?.executions.find((e) => e.id === executionId);
		if (current?.outcome !== "running" || handle.agent.status === "running") {
			if (!handle.borrowed) await handle.dispose().catch(() => {});
			if (current?.outcome === "running") {
				await this.patchExecution(executionId, {
					outcome: "failed",
					error: "scheduled session is busy",
					endedAt: this.deps.now()
				});
				await this.revertProgress(taskId);
			}
			return {
				ok: false,
				error: current?.outcome === "running" ? "scheduled session is busy" : "cancelled during startup"
			};
		}
		handle.agent.inject({
			id: this.deps.mintMessageId?.() ?? MessageId(`msg-taskboard-${crypto.randomUUID()}`),
			role: "user",
			content: [{
				type: "text",
				text: this.pluginFraming(task, prepared, isolationNote)
			}],
			source: { kind: "dsh-taskboard" }
		});
		handle.agent.followup({
			id: this.deps.mintMessageId?.() ?? MessageId(`msg-taskboard-${crypto.randomUUID()}`),
			role: "user",
			content: [{
				type: "text",
				text: this.userBody(task)
			}],
			source: { kind: "user" }
		});
		const settle = () => {
			if (!this.runs.has(executionId)) return;
			this.runs.delete(executionId);
			this.settleExecution(executionId, sessionId, prepared);
		};
		this.runs.set(executionId, {
			sessionId,
			...prepared !== void 0 ? { prepared } : {},
			settle,
			dispose: () => handle.dispose()
		});
		this.lastActivityAt.set(sessionId, this.deps.now());
		handle.agent.whenIdle().then(settle, () => {
			this.noteFailure(sessionId, "agent did not reach quiescence", executionId).then(() => {
				this.runs.delete(executionId);
			}).catch(() => {
				this.runs.delete(executionId);
			});
		});
		return {
			ok: true,
			executionId,
			sessionId
		};
	}
	/**
	* Settle one execution: collect worktree facts first (fail-soft — git
	* problems never block settlement), then commit outcome + release + the
	* protocol-auto-review move in ONE ledger mutation.
	*/
	async settleExecution(executionId, sessionId, prepared) {
		const evidence = await this.collectEvidence(prepared);
		await this.deps.store.mutate("execution-recorded", (ledger) => {
			for (const t of ledger.tasks) {
				const execution = t.executions.find((e) => e.id === executionId);
				if (execution !== void 0 && execution.outcome === "running") {
					const now = this.deps.now();
					execution.outcome = "succeeded";
					execution.endedAt = now;
					this.applyFacts(execution, prepared, evidence);
					if (t.status === "in_progress" && t.claimedBy === sessionId) {
						delete t.claimedBy;
						delete t.claimedAt;
					}
					const periodicCompletion = execution.trigger === "scheduled" && t.execution.cron !== void 0 ? t.execution.periodicCompletion ?? "spawn" : void 0;
					if (periodicCompletion === "rearm") {
						t.status = "todo";
						t.updatedAt = now;
						t.updatedBy = { kind: "system" };
						t.comments.push({
							id: newCommentId(),
							body: normalizeBody("[系统] 定期任务本轮执行完成，已按设置自动回到待办，等待下一次触发。"),
							systemKey: "sys.periodicRearmed",
							version: 1,
							createdAt: now
						});
						return [t];
					}
					if (periodicCompletion === "spawn") {
						const match = parseCron(t.execution.cron);
						const next = match === null ? void 0 : nextCronTime(match, now) ?? void 0;
						t.status = "in_review";
						t.updatedAt = now;
						t.updatedBy = { kind: "system" };
						if (next !== void 0) {
							const successor = spawnNextCycle(t, executionId, now);
							t.execution = { mode: "claim" };
							t.comments.push({
								id: newCommentId(),
								body: normalizeBody(`[系统] 定期任务本轮执行完毕，已按设置新建待办卡 ${successor.id} 承接下一轮，请审查本卡后验收。`),
								systemKey: "sys.periodicHandoff",
								systemParams: { nextTaskId: successor.id },
								version: 1,
								createdAt: now
							});
							ledger.tasks.push(successor);
							return [t, successor];
						}
						t.execution = { mode: "claim" };
						t.comments.push({
							id: newCommentId(),
							body: normalizeBody("[系统] 定期表达式已无未来触发时间，本轮结束后定时停用；如需继续请重新设置。"),
							systemKey: "sys.cronDead",
							version: 1,
							createdAt: now
						});
						return [t];
					}
					if (t.status === "in_progress") {
						const commented = t.comments.some((c) => c.threadId === sessionId && c.createdAt >= (execution.startedAt ?? 0));
						t.comments.push({
							id: newCommentId(),
							body: normalizeBody(commented ? "[系统] 执行会话已结束并留有评论，但未移至待验收；系统自动移入待验收。" : "[系统] 执行会话已结束，但未按协议交接（无评论、未移至待验收）；系统自动移入待验收，请审查后退回或验收。"),
							systemKey: commented ? "sys.endedWithComment" : "sys.endedNoHandoff",
							version: 1,
							createdAt: now
						});
						t.status = "in_review";
						t.updatedAt = now;
						t.updatedBy = { kind: "system" };
						if (execution.trigger === "scheduled" && t.execution.cron !== void 0) {
							const match = parseCron(t.execution.cron);
							if ((match === null ? void 0 : nextCronTime(match, now) ?? void 0) !== void 0) {
								const successor = spawnNextCycle(t, executionId, now);
								t.execution = { mode: "claim" };
								t.comments.push({
									id: newCommentId(),
									body: normalizeBody(`[系统] 定期任务本轮执行完毕，定时已由新待办卡 ${successor.id} 承接，请审查本卡后验收。`),
									systemKey: "sys.periodicHandoff",
									systemParams: { nextTaskId: successor.id },
									version: 1,
									createdAt: now
								});
								ledger.tasks.push(successor);
								return [t, successor];
							}
							t.execution = { mode: "claim" };
							t.comments.push({
								id: newCommentId(),
								body: normalizeBody("[系统] 定期表达式已无未来触发时间，本轮结束后定时停用；如需继续请重新设置。"),
								systemKey: "sys.cronDead",
								version: 1,
								createdAt: now
							});
						}
					}
					return [t];
				}
			}
		});
	}
	/**
	* Pin branch names at FIRST successful creation (§9: 改名不改分支) — the
	* workspace root repo onto the legacy `branch` field, every nested repo
	* into the `branches` map. Re-checked inside the mutation (the task may
	* have moved between preparation and commit).
	*/
	async pinBranches(task, mirror) {
		const wanted = [];
		for (const repo of mirror.repos) if (repo.repo === "") {
			if (task.branch === void 0) wanted.push({
				repo: "",
				branch: repo.branch
			});
		} else if (task.branches?.[repo.repo] === void 0) wanted.push({
			repo: repo.repo,
			branch: repo.branch
		});
		if (wanted.length === 0) return;
		await this.deps.store.mutate("task-updated", (ledger) => {
			const target = ledger.tasks.find((t) => t.id === task.id);
			if (target === void 0) return void 0;
			let touched = false;
			for (const w of wanted) if (w.repo === "") {
				if (target.branch === void 0) {
					target.branch = w.branch;
					touched = true;
				}
			} else if (target.branches?.[w.repo] === void 0) {
				target.branches = {
					...target.branches,
					[w.repo]: w.branch
				};
				touched = true;
			}
			return touched ? [target] : void 0;
		});
	}
	/**
	* Best-effort mirror teardown after a failed start (S1): each repo's
	* worktree is removed through its OWN repo root; dirty worktrees are kept
	* — never a data-loss primitive.
	*/
	async cleanupMirror(mirror, workspacePath) {
		if (mirror === void 0 || this.deps.git === void 0) return;
		const nestedRels = mirror.repos.filter((r) => r.repo !== "").map((r) => r.repo);
		for (const repo of [...mirror.repos].reverse()) {
			const root = repo.repo === "" ? workspacePath : workspacePath + "/" + repo.repo;
			try {
				await this.deps.git.removeWorktree(root, repo.worktreePath, repo.repo === "" && nestedRels.length > 0 ? { exempt: nestedRels } : void 0);
			} catch {}
		}
	}
	/** How many executions are currently running (for the concurrency cap). */
	inFlight() {
		return this.runs.size;
	}
	/**
	* Cancel the running execution of a task (user action): stop the agent
	* session, mark the execution cancelled, and hand the task back to todo.
	* @param taskId - the task whose execution should be stopped.
	* @returns the immediate result.
	*/
	async cancel(taskId) {
		const task = this.deps.store.get(taskId);
		if (task === void 0) return {
			ok: false,
			error: `no task ${taskId}`
		};
		const running = [...task.executions].reverse().find((e) => e.outcome === "running");
		if (running === void 0) return {
			ok: false,
			error: "no running execution"
		};
		const entry = this.runs.get(running.id);
		this.runs.delete(running.id);
		try {
			await entry?.dispose();
		} catch {}
		const evidence = await this.collectEvidence(entry?.prepared);
		let settled = false;
		await this.deps.store.mutate("execution-recorded", (ledger) => {
			const target = ledger.tasks.find((t) => t.id === taskId);
			if (target === void 0) return void 0;
			const execution = target.executions.find((e) => e.id === running.id);
			if (execution === void 0 || execution.outcome !== "running") return void 0;
			settled = true;
			execution.outcome = "cancelled";
			execution.endedAt = this.deps.now();
			this.applyFacts(execution, entry?.prepared, evidence);
			if (target.status === "in_progress") {
				target.status = "todo";
				target.updatedAt = this.deps.now();
				delete target.claimedBy;
				delete target.claimedAt;
			}
			return [target];
		});
		if (!settled) return {
			ok: false,
			error: "execution already settled"
		};
		return {
			ok: true,
			executionId: running.id
		};
	}
	/**
	* Reconcile running records after load. A real process restart leaves no
	* live agent, but a plugin hot reload does; retain and adopt those runs
	* instead of recording a false "interrupted by host restart" failure.
	*/
	async reconcile() {
		const adopted = /* @__PURE__ */ new Map();
		for (const task of this.deps.store.snapshot().tasks) for (const execution of task.executions) {
			if (execution.outcome !== "running" || execution.sessionId === void 0) continue;
			const agent = this.deps.liveAgent?.(execution.sessionId);
			if (agent !== void 0) adopted.set(execution.id, {
				sessionId: execution.sessionId,
				agent,
				prepared: this.preparedFromExecution(execution)
			});
		}
		await this.deps.store.mutate("execution-recorded", (ledger) => {
			const now = this.deps.now();
			const touched = [];
			for (const task of ledger.tasks) {
				let dirty = false;
				for (const execution of task.executions) if (execution.outcome === "running" && !adopted.has(execution.id)) {
					execution.outcome = "failed";
					execution.error = "interrupted by host restart";
					execution.endedAt = now;
					dirty = true;
				}
				if (!dirty) continue;
				if (task.status === "in_progress") {
					task.status = "todo";
					task.updatedAt = now;
					delete task.claimedBy;
					delete task.claimedAt;
				}
				touched.push(task);
			}
			return touched.length > 0 ? touched : void 0;
		});
		for (const [executionId, entry] of adopted) {
			if (!this.deps.store.snapshot().tasks.some((task) => task.executions.some((execution) => execution.id === executionId && execution.outcome === "running"))) continue;
			this.adoptLiveRun(executionId, entry.sessionId, entry.agent, entry.prepared);
		}
	}
	/**
	* The plugin framing line (rendered as a plugin context row): task head,
	* already-claimed state, and the handoff protocol — everything the session
	* must know about the board. The task id appears exactly once (here); the
	* protocol steps below refer to it as 本任务. Isolated runs add one line
	* steering the session onto its dedicated branch (commits are the evidence
	* the user reviews at merge time); 续跑 and degraded runs each add their
	* own steering line (0.3.1).
	* @param task - the task.
	* @param prepared - the task mirror when this run is isolated.
	* @param degradeNote - why a worktree task degraded to the main directory.
	*/
	pluginFraming(task, prepared, degradeNote) {
		const periodicCompletion = task.execution.mode === "scheduled" && task.execution.cron !== void 0 ? task.execution.periodicCompletion ?? "spawn" : void 0;
		let text = `【任务看板】${task.title}（ID: ${task.id}）\n本会话由任务看板执行服务启动，任务已置为进行中——无需认领；「已完成」仅限用户在界面操作（代码已限制，移了会被拒）。\n完成后按序交接：\n1. taskboard_get 读取本任务，取得最新 version\n2. taskboard_execution_report 提交结构化执行报告（做了什么/改了哪些文件/如何验证/剩余风险；提交与评论不冲突，都会展示给验收人）\n3. taskboard_comment_add 留评论：做了什么改动 / 如何验证 / 剩余风险\n${periodicCompletion === "rearm" ? "4. 本任务设为“完成后移回待办”：完成报告和评论后无需改变状态，宿主会在会话结束时自动回到待办。\n" : periodicCompletion === "spawn" ? "4. 本任务设为“完成后新建待办”：完成报告和评论后无需改变状态，宿主会保留本卡待验收并新建下一轮待办卡。\n" : "4. taskboard_move 将本任务移至待验收 in_review（带 ifVersion）\n"}若无法完成：留评论说明原因，将任务移回待办 todo。`;
		if (task.checklist !== void 0 && task.checklist.length > 0) {
			const items = task.checklist.map((item, index) => `${item.checked ? "☑" : "☐"} ${index + 1}. ${item.text}${item.note !== void 0 ? `（证据: ${item.note}）` : ""}`).join("\n");
			const done = task.checklist.filter((i) => i.checked).length;
			text += `\n本任务有验收清单（DoD，${done}/${task.checklist.length} 已完成）——按清单干活：\n${items}\n完成一项就用 taskboard_checklist（action=check，附 note 证据）勾选；未完成项会在验收时高亮，全部完成再移待验收。需要补充验收项也可用 action=add 追加。`;
		}
		if (prepared !== void 0) if (isLegacySingle(prepared)) {
			const only = prepared.repos[0];
			if (only.reused === true) text += `\n本任务启用了 Git Worktree 隔离，且本次为续跑：任务工作目录是独立分支 ${only.branch} 的 worktree——\n${only.worktreePath}\n上一次执行的改动与提交都保留在原处——请先查看已有改动（git status / git log）再继续，避免重复劳动，并把新完成的工作提交到该分支。`;
			else text += `\n本任务启用了 Git Worktree 隔离：任务工作目录是独立分支 ${only.branch} 的全新 worktree——\n${only.worktreePath}\n（全新检出，不含 node_modules/构建产物，构建或测试前可能需要先安装依赖）。\n⚠ 边界纪律：你的会话根目录是整个项目，但本任务的全部改动必须只发生在上述 worktree 目录内——命令用 workdir 指向它、文件读写用它的绝对路径；不要改动主工作区的任何其它文件；把完成的工作提交（git commit）到该分支，验收将基于该分支的提交记录合并。`;
		} else text += this.mirrorFraming(prepared);
		else if (degradeNote !== void 0) text += `\n⚠ 本次执行未能建立隔离，正在主项目目录中工作（原因：${degradeNote}）。该目录可能有他人未提交的改动：动手前先 git status 检查现状，改动尽量集中，结束时在评论中说明动了哪些文件；避免把未经验证的改动直接提交到主分支。`;
		return text;
	}
	/**
	* The multi-repo mirror section of the framing line (0.6.3): per-repo
	* checkout list, the (possibly partial) coverage boundary, per-repo commit
	* discipline, and the 禁改 list for repos that failed to mirror.
	*/
	mirrorFraming(mirror) {
		const mode = mirror.allReused ? "续跑" : "全新";
		const lines = mirror.repos.map((r) => `- ${r.repo === "" ? "根仓库" : r.repo} → ${r.worktreePath}（分支 ${r.branch}${r.reused === true ? "，续跑" : ""}）`).join("\n");
		let text = `\n本任务启用了 Git Worktree 隔离（多仓库镜像模式，本次${mode}）：整个工作区已镜像到任务目录——\n${mirror.root}\n各仓库检出位置与任务分支（每仓库各一个同名任务分支）：\n${lines}\n（全新检出的镜像不含 node_modules/构建产物，构建或测试前可能需要先安装依赖）。\n⚠ 边界纪律：你的会话根目录是整个项目，但本任务的全部改动必须只发生在上述任务目录内对应仓库的镜像里——命令用 workdir 指向它、文件读写用它的绝对路径；不要改动镜像之外的任何文件；改动发生在哪个仓库，就把完成的工作提交（git commit）到那个仓库的任务分支，验收将按仓库合并各分支的提交记录。`;
		if (mirror.skipped.length > 0) {
			const skipped = mirror.skipped.map((s) => `- ${s.repo}（原因：${s.reason}）`).join("\n");
			text += `\n⚠ 以下仓库未能建立镜像：\n${skipped}\n本次执行严禁改动这些仓库的主目录。`;
		}
		if (mirror.allReused) text += `\n本次为续跑：各仓库上一次执行的改动与提交都保留在镜像原处——动手前先在各仓库镜像里查看已有改动（git status / git log），避免重复劳动。`;
		return text;
	}
	/**
	* The card body as a normal user bubble: the effective prompt (title+
	* description, with the explicit prompt appended when set) with template
	* variables resolved from
	* the task's own history at submit time (valuable for recurring patrols):
	* `{{lastExecution}}` → the previous execution's trigger/outcome/error;
	* `{{lastComments}}` → the last three comments (who + body).
	*/
	userBody(task) {
		const lastExec = [...task.executions].reverse().find((e) => e.outcome !== "running");
		const lastExecText = lastExec === void 0 ? "（无）" : `${lastExec.trigger} · ${lastExec.outcome}${lastExec.error !== void 0 ? ` · ${lastExec.error.slice(0, 200)}` : ""} · ${lastExec.startedAt !== void 0 ? new Date(lastExec.startedAt).toISOString() : "?"}`;
		const lastCommentsText = task.comments.slice(-3).map((c) => `[${c.threadId !== void 0 ? "agent" : "user"}] ${c.body}`).join("\n") || "（无）";
		return effectivePrompt(task).replace(/\{\{lastExecution\}\}/g, lastExecText).replace(/\{\{lastComments\}\}/g, lastCommentsText);
	}
	/** Move a task back out of in_progress (and release its hold) after a failed start. */
	async revertProgress(taskId) {
		await this.deps.store.mutate("execution-recorded", (ledger) => {
			const target = ledger.tasks.find((t) => t.id === taskId);
			if (target !== void 0 && target.status === "in_progress") {
				target.status = "todo";
				target.updatedAt = this.deps.now();
				delete target.claimedBy;
				delete target.claimedAt;
				return [target];
			}
		});
	}
};
//#endregion
export { ExecutionService };

//# sourceMappingURL=execution.js.map
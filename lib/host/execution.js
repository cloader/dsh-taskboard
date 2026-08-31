import { effectiveIsolation, effectivePrompt, newCommentId, newExecutionId, normalizeBody } from "../shared/protocol.js";
import { sanitizeBranchName, worktreePathOf } from "./git.js";
import { MessageId } from "./sdk.js";
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
/**
* The execution service.
*/
var ExecutionService = class {
	deps;
	/** Live executions by execution id (settles and cancels remove entries). */
	runs = /* @__PURE__ */ new Map();
	/** Detaches the turn/end listener (plugin teardown — review P1). */
	unsubscribeEvents;
	/** @param deps - store + agents + workspaces + events + clock. */
	constructor(deps) {
		this.deps = deps;
		this.unsubscribeEvents = deps.events.onSessionEvent((sessionId, event) => {
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
	/**
	* Best-effort evidence collection for a prepared run (fail-soft: undefined
	* on any git problem — settlement NEVER blocks on git).
	*/
	async collectEvidence(prepared) {
		if (prepared === void 0 || this.deps.git === void 0) return void 0;
		try {
			return await this.deps.git.collect(prepared.worktreePath, prepared.baseCommit);
		} catch {
			return;
		}
	}
	/** Copy collected facts onto an execution record (in place). */
	applyFacts(execution, facts) {
		if (facts === void 0) return;
		if (facts.headCommit !== void 0) execution.headCommit = facts.headCommit;
		execution.commits = facts.commits;
		execution.commitsTotal = facts.commitsTotal;
		execution.dirtyFiles = facts.dirtyFiles;
		execution.dirtyFilesTotal = facts.dirtyFilesTotal;
		execution.changedFiles = facts.changedFiles;
		if (facts.diffStat !== void 0) execution.diffStat = facts.diffStat;
	}
	/**
	* Record a turn failure against the running execution of that session and
	* give the task back. Resolves once the failure settlement has COMMITTED —
	* R2: the whenIdle rejection path awaits this (and only this) before
	* releasing its run entry, so a success settlement can never race it into
	* the ledger and record a failed run as succeeded.
	*/
	noteFailure(sessionId, message) {
		const entry = [...this.runs.values()].find((e) => e.sessionId === sessionId);
		return this.collectEvidence(entry?.prepared).then((facts) => this.deps.store.mutate("execution-recorded", (ledger) => {
			for (const task of ledger.tasks) for (const execution of task.executions) if (execution.sessionId === sessionId && execution.outcome === "running") {
				execution.outcome = "failed";
				execution.error = message.slice(0, 500);
				execution.endedAt = this.deps.now();
				this.applyFacts(execution, facts);
				if (task.status === "in_progress" && task.claimedBy === sessionId) {
					task.status = "todo";
					task.updatedAt = this.deps.now();
					delete task.claimedBy;
					delete task.claimedAt;
					task.comments.push({
						id: newCommentId(),
						body: normalizeBody(`[系统] 执行失败：${message.slice(0, 300)}；任务已退回待办。`),
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
		const max = this.deps.maxConcurrent ?? 3;
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
		const sessionId = this.deps.mintSessionId?.() ?? `session-taskboard-${crypto.randomUUID()}`;
		const isolation = effectiveIsolation(task);
		const branch = task.branch ?? sanitizeBranchName(task.title, task.id);
		const worktreePath = worktreePathOf(workspace.path, task.id);
		let gate;
		await this.deps.store.mutate("execution-recorded", (ledger) => {
			const target = ledger.tasks.find((t) => t.id === taskId);
			if (target === void 0 || target.trashedAt !== void 0) {
				gate = `no task ${taskId}`;
				return;
			}
			if (target.status === "in_progress") {
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
				outcome: "running",
				...isolation === "none" ? { isolation: "none" } : {
					isolation: "worktree",
					branch
				}
			});
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
		if (isolation === "worktree") {
			const outcome = await this.prepareIsolation(task, workspace.path, worktreePath, branch, options?.reuseWorktree === true);
			if (outcome.prepared !== void 0) {
				prepared = outcome.prepared;
				await this.patchExecution(executionId, {
					worktreePath: outcome.prepared.worktreePath,
					baseCommit: outcome.prepared.baseCommit
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
			if (prepared !== void 0 && this.deps.git !== void 0) try {
				await this.deps.git.removeWorktree(workspace.path, prepared.worktreePath);
			} catch {}
			return {
				ok: false,
				error: `preset composition failed: ${message}`
			};
		}
		let handle;
		try {
			const model = task.model ?? this.deps.defaultModel?.();
			handle = await this.deps.agents.create({
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
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.patchExecution(executionId, {
				outcome: "failed",
				error: message.slice(0, 500),
				endedAt: this.deps.now()
			});
			await this.revertProgress(taskId);
			if (prepared !== void 0 && this.deps.git !== void 0) try {
				await this.deps.git.removeWorktree(workspace.path, prepared.worktreePath);
			} catch {}
			return {
				ok: false,
				error: message
			};
		}
		if (!await this.deps.store.read((ledger) => ledger.tasks.some((t) => t.executions.some((e) => e.id === executionId && e.outcome === "running")))) {
			await handle.dispose().catch(() => {});
			if (prepared !== void 0 && this.deps.git !== void 0) try {
				await this.deps.git.removeWorktree(workspace.path, prepared.worktreePath);
			} catch {}
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
		await this.patchExecution(executionId, { sessionId });
		handle.agent.inject({
			id: this.deps.mintMessageId?.() ?? MessageId(`msg-taskboard-${crypto.randomUUID()}`),
			role: "user",
			content: [{
				type: "text",
				text: this.pluginFraming(task, prepared, isolationNote)
			}],
			source: {
				kind: "plugin",
				plugin: "dsh-taskboard"
			}
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
			this.runs.delete(executionId);
			this.settleExecution(executionId, sessionId, prepared);
		};
		this.runs.set(executionId, {
			sessionId,
			...prepared !== void 0 ? { prepared } : {},
			settle,
			dispose: () => handle.dispose()
		});
		handle.agent.whenIdle().then(settle, () => {
			this.noteFailure(sessionId, "agent did not reach quiescence").then(() => {
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
		const facts = await this.collectEvidence(prepared);
		await this.deps.store.mutate("execution-recorded", (ledger) => {
			for (const t of ledger.tasks) {
				const execution = t.executions.find((e) => e.id === executionId);
				if (execution !== void 0 && execution.outcome === "running") {
					const now = this.deps.now();
					execution.outcome = "succeeded";
					execution.endedAt = now;
					this.applyFacts(execution, facts);
					if (t.status === "in_progress" && t.claimedBy === sessionId) {
						delete t.claimedBy;
						delete t.claimedAt;
					}
					if (t.status === "in_progress") {
						const commented = t.comments.some((c) => c.threadId === sessionId);
						t.comments.push({
							id: newCommentId(),
							body: normalizeBody(commented ? "[系统] 执行会话已结束并留有评论，但未移至待验收；系统自动移入待验收。" : "[系统] 执行会话已结束，但未按协议交接（无评论、未移至待验收）；系统自动移入待验收，请审查后退回或验收。"),
							version: 1,
							createdAt: now
						});
						t.status = "in_review";
						t.updatedAt = now;
						t.updatedBy = { kind: "system" };
					}
					return [t];
				}
			}
		});
	}
	/**
	* Prepare the dedicated worktree for a run (fail-soft): detect git, then
	* create/reset the fixed task branch — fresh baseline, or keep a live
	* worktree as-is for 续跑. On success the branch name is pinned onto the
	* task once (renames never change it); on any failure the run degrades
	* with a human-readable note.
	*/
	async prepareIsolation(task, workspacePath, worktreePath, branch, reuse) {
		const git = this.deps.git;
		if (git === void 0) return { note: "git 集成不可用，已在原目录执行" };
		let inside = false;
		try {
			inside = await git.detect(workspacePath);
		} catch {}
		if (!inside) {
			let hasBinary = true;
			try {
				hasBinary = await git.binaryAvailable();
			} catch {}
			return { note: hasBinary ? "当前项目不是 git 仓库，已在原目录执行" : "git 不可用（未安装或不在 PATH），已在原目录执行" };
		}
		let info;
		try {
			info = await git.prepareWorktree(workspacePath, worktreePath, branch, reuse ? "reuse" : "fresh");
		} catch {}
		if (info === void 0) return { note: "worktree 准备失败（git 报错或目录被占用），已在原目录执行" };
		if (task.branch === void 0) await this.deps.store.mutate("task-updated", (ledger) => {
			const target = ledger.tasks.find((t) => t.id === task.id);
			if (target !== void 0 && target.branch === void 0) {
				target.branch = branch;
				return [target];
			}
		});
		return { prepared: {
			branch: info.branch,
			worktreePath: info.path,
			baseCommit: info.baseCommit,
			...info.reused === true ? { reused: true } : {}
		} };
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
		const facts = await this.collectEvidence(entry?.prepared);
		let settled = false;
		await this.deps.store.mutate("execution-recorded", (ledger) => {
			const target = ledger.tasks.find((t) => t.id === taskId);
			if (target === void 0) return void 0;
			const execution = target.executions.find((e) => e.id === running.id);
			if (execution === void 0 || execution.outcome !== "running") return void 0;
			settled = true;
			execution.outcome = "cancelled";
			execution.endedAt = this.deps.now();
			this.applyFacts(execution, facts);
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
	* Startup reconciliation after a host restart: executions left `running`
	* by the previous process can never settle here (their settlement watchers
	* died with it), so mark them failed and hand their tasks back to todo.
	*/
	async reconcile() {
		await this.deps.store.mutate("execution-recorded", (ledger) => {
			const now = this.deps.now();
			const touched = [];
			for (const task of ledger.tasks) {
				let dirty = false;
				for (const execution of task.executions) if (execution.outcome === "running") {
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
	* @param prepared - worktree facts when this run is isolated.
	* @param degradeNote - why a worktree task degraded to the main directory.
	*/
	pluginFraming(task, prepared, degradeNote) {
		let text = `【任务看板】${task.title}（ID: ${task.id}）\n本会话由任务看板执行服务启动，任务已置为进行中——无需认领；「已完成」仅限用户在界面操作（代码已限制，移了会被拒）。\n完成后按序交接：\n1. taskboard_get 读取本任务，取得最新 version\n2. taskboard_execution_report 提交结构化执行报告（做了什么/改了哪些文件/如何验证/剩余风险；提交与评论不冲突，都会展示给验收人）\n3. taskboard_comment_add 留评论：做了什么改动 / 如何验证 / 剩余风险\n4. taskboard_move 将本任务移至待验收 in_review（带 ifVersion）\n若无法完成：留评论说明原因，将任务移回待办 todo。`;
		if (task.checklist !== void 0 && task.checklist.length > 0) {
			const items = task.checklist.map((item, index) => `${item.checked ? "☑" : "☐"} ${index + 1}. ${item.text}${item.note !== void 0 ? `（证据: ${item.note}）` : ""}`).join("\n");
			const done = task.checklist.filter((i) => i.checked).length;
			text += `\n本任务有验收清单（DoD，${done}/${task.checklist.length} 已完成）——按清单干活：\n${items}\n完成一项就用 taskboard_checklist（action=check，附 note 证据）勾选；未完成项会在验收时高亮，全部完成再移待验收。需要补充验收项也可用 action=add 追加。`;
		}
		if (prepared !== void 0) if (prepared.reused === true) text += `\n本任务启用了 Git Worktree 隔离，且本次为续跑：任务工作目录是独立分支 ${prepared.branch} 的 worktree——\n${prepared.worktreePath}\n上一次执行的改动与提交都保留在原处——请先查看已有改动（git status / git log）再继续，避免重复劳动，并把新完成的工作提交到该分支。`;
		else text += `\n本任务启用了 Git Worktree 隔离：任务工作目录是独立分支 ${prepared.branch} 的全新 worktree——\n${prepared.worktreePath}\n（全新检出，不含 node_modules/构建产物，构建或测试前可能需要先安装依赖）。\n⚠ 边界纪律：你的会话根目录是整个项目，但本任务的全部改动必须只发生在上述 worktree 目录内——命令用 workdir 指向它、文件读写用它的绝对路径；不要改动主工作区的任何其它文件；把完成的工作提交（git commit）到该分支，验收将基于该分支的提交记录合并。`;
		else if (degradeNote !== void 0) text += `\n⚠ 本次执行未能建立隔离，正在主项目目录中工作（原因：${degradeNote}）。该目录可能有他人未提交的改动：动手前先 git status 检查现状，改动尽量集中，结束时在评论中说明动了哪些文件；避免把未经验证的改动直接提交到主分支。`;
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
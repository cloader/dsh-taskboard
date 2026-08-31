/**
 * Host execution service: runs a task through dsh's REAL session machinery —
 * a fresh agent+session inside the task's project workspace (creation carries
 * the pinned model when the task has one), the session is attached to the
 * workspace so it appears in the GUI's project session list, the effective
 * prompt is submitted as an ordinary user message, and the turn settlement
 * (turn/end reason) is folded back into the task's execution record.
 *
 * Every execution is a NEW session: clean context, no reuse of previous runs.
 *
 * @module dsh-taskboard/host/execution
 */
import {
  DEFAULT_PERMISSION,
  effectiveIsolation,
  effectivePrompt,
  newCommentId,
  newExecutionId,
  normalizeBody,
  type ExecutionRecord,
  type IsolationMode,
  type PermissionMode,
  type TaskModel,
  type TaskRecord,
} from '../shared/protocol.ts'
import { sanitizeBranchName, worktreePathOf, type GitFace, type SettlementFacts } from './git.ts'
import { MessageId } from './sdk.ts'
import type { TaskStore } from './store.ts'

/** Default cap on concurrently running executions (env-overridable). */
export const DEFAULT_MAX_CONCURRENT = 3

/** Narrow agents face (the registry's create, structurally). */
export interface AgentsFace {
  create(options: {
    sessionId: string
    meta?: { cwd?: string; agentPreset?: string }
    agentOptions?: { provider?: string; model?: string; reasoningEffort?: string }
    /** Preset composition callback: mounts tools/persona into the agent's scoped context. */
    setup?: (agentCtx: unknown) => Promise<void> | void
  }): Promise<{
    agent: {
      id: string
      followup(message: unknown): void
      inject(message: unknown): void
      whenIdle(): Promise<void>
    }
    dispose(): Promise<void>
  }>
}

/**
 * The preset composition an execution session is built from — the shape
 * apiproxy's ensureSession produces: resolve → record on the session header,
 * mount → inside agents.create's setup callback.
 */
export interface AgentComposition {
  /** The resolved preset id recorded on the session header. */
  agentPreset: string
  /** Mounts the preset's plugins (tools, persona) into the agent's scope. */
  setup: (agentCtx: unknown) => Promise<void> | void
}

/** Narrow workspaces face for execution. */
export interface ExecutionWorkspaceFace {
  get(id: string): { id: string; path: string } | undefined
  attach(workspaceId: string, sessionId: string): Promise<void>
}

/** Narrow event-bus face for settlement listening. */
export interface EventsFace {
  onSessionEvent(listener: (sessionId: string, event: { type: string; data?: unknown }, sessionMeta?: { header?: { cwd?: string } }) => void): () => void
}

/** Everything the execution service needs. */
export interface ExecutionDeps {
  store: TaskStore
  agents: AgentsFace
  workspaces: ExecutionWorkspaceFace
  events: EventsFace
  now: () => number
  /** The deployment default model (fills sessions of unpinned tasks). */
  defaultModel?: () => TaskModel | undefined
  /** Mint session ids (injectable for tests). */
  mintSessionId?: () => string
  /** Mint message ids (injectable for tests). */
  mintMessageId?: () => string
  /** Best-effort session rename (pins the session list title to the task title). */
  renameSession?: (sessionId: string, title: string) => void
  /** Max concurrently running executions across all tasks (default 3). */
  maxConcurrent?: number
  /**
   * Git face for worktree isolation (0.3.0). Absent → every worktree-mode
   * task degrades to the original directory with an isolationNote.
   */
  git?: GitFace
  /**
   * Resolve the preset composition for an execution session (0.3.3): hands
   * the session its tool set. Absent → sessions run on the bare host
   * composition (pre-preset behavior). A rejection fails the run through
   * the existing failure path — a broken preset never yields a half-composed
   * session (same rollback semantics as apiproxy).
   */
  composeAgent?: (presetId?: string) => Promise<AgentComposition | undefined>
  /**
   * Set execution session permission (0.5.5; 'workspace-write' | 'read-only' | 'danger-full-access').
   */
  setPermission?: (sessionId: string, permission: PermissionMode) => void
}

/** Outcome of a run request (immediate; the run settles asynchronously). */
export type RunRequestResult =
  | { ok: true; executionId: string; sessionId: string }
  | { ok: false; error: string }

/** Outcome of a cancel request. */
export type CancelRequestResult =
  | { ok: true; executionId: string }
  | { ok: false; error: string }

/** Whether a turn/end payload closed with an error reason. */
function isErrorTurnEnd(data: unknown): { message: string } | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const reason = (data as { reason?: unknown }).reason
  if (typeof reason !== 'object' || reason === null) return undefined
  const kind = (reason as { kind?: unknown }).kind
  if (kind !== 'error') return undefined
  const error = (reason as { error?: { message?: unknown } }).error
  const message = typeof error?.message === 'string' ? error.message : 'turn failed'
  console.error('[dsh-taskboard] turn error detail:', JSON.stringify(error)?.slice(0, 2000) ?? '')
  return { message }
}

/** Prepared worktree facts threaded through a live run (settlement evidence). */
export interface PreparedWorktree {
  branch: string
  worktreePath: string
  baseCommit: string
  /** True when an existing live worktree was kept as-is (续跑). */
  reused?: boolean
}

/** Per-run options. */
export interface RunOptions {
  /**
   * 续跑: keep a live worktree/branch exactly as-is (the previous agent's
   * commits and uncommitted changes survive) instead of resetting to the
   * main HEAD. Falls back to a fresh preparation when none is alive.
   */
  reuseWorktree?: boolean
}

/** One live execution tracked for settlement and cancellation. */
interface RunEntry {
  sessionId: string
  /** Worktree prepared for this run (evidence collection at ANY settlement). */
  prepared?: PreparedWorktree
  settle: () => void
  dispose: () => Promise<void>
}

/**
 * The execution service.
 */
export class ExecutionService {
  /** Live executions by execution id (settles and cancels remove entries). */
  private readonly runs = new Map<string, RunEntry>()

  /** Detaches the turn/end listener (plugin teardown — review P1). */
  private readonly unsubscribeEvents: () => void

  /** @param deps - store + agents + workspaces + events + clock. */
  constructor(private readonly deps: ExecutionDeps) {
    this.unsubscribeEvents = deps.events.onSessionEvent((sessionId, event) => {
      if (event.type !== 'turn/end') return
      // S7 (open question): ANY turn/end with an error reason fails the whole
      // execution and hands the task back. Whether the DSH session loop can
      // produce recoverable per-turn errors (and keep the session alive) needs
      // host-side confirmation; if it can, this should count consecutive
      // errors or wait for an explicit termination signal instead.
      const failure = isErrorTurnEnd(event.data)
      if (failure !== undefined) {
        this.noteFailure(sessionId, failure.message).catch(error => {
          console.error('[dsh-taskboard] failure settlement error:', error)
        })
      }
    })
  }

  /** Detach the settlement listener; safe to call once at plugin teardown. */
  dispose(): void {
    this.unsubscribeEvents()
  }

  /**
   * Best-effort evidence collection for a prepared run (fail-soft: undefined
   * on any git problem — settlement NEVER blocks on git).
   */
  private async collectEvidence(prepared: PreparedWorktree | undefined): Promise<SettlementFacts | undefined> {
    if (prepared === undefined || this.deps.git === undefined) return undefined
    try {
      return await this.deps.git.collect(prepared.worktreePath, prepared.baseCommit)
    } catch {
      return undefined
    }
  }

  /** Copy collected facts onto an execution record (in place). */
  private applyFacts(execution: ExecutionRecord, facts: SettlementFacts | undefined): void {
    if (facts === undefined) return
    if (facts.headCommit !== undefined) execution.headCommit = facts.headCommit
    execution.commits = facts.commits
    execution.commitsTotal = facts.commitsTotal
    execution.dirtyFiles = facts.dirtyFiles
    execution.dirtyFilesTotal = facts.dirtyFilesTotal
    execution.changedFiles = facts.changedFiles
    if (facts.diffStat !== undefined) execution.diffStat = facts.diffStat
  }

  /**
   * Record a turn failure against the running execution of that session and
   * give the task back. Resolves once the failure settlement has COMMITTED —
   * R2: the whenIdle rejection path awaits this (and only this) before
   * releasing its run entry, so a success settlement can never race it into
   * the ledger and record a failed run as succeeded.
   */
  private noteFailure(sessionId: string, message: string): Promise<void> {
    // The failed session may already have committed work — collect the
    // evidence (best effort) BEFORE marking the execution failed (0.3.1).
    const entry = [...this.runs.values()].find(e => e.sessionId === sessionId)
    return this.collectEvidence(entry?.prepared).then(facts =>
      this.deps.store.mutate('execution-recorded', (ledger) => {
        for (const task of ledger.tasks) {
          for (const execution of task.executions) {
            if (execution.sessionId === sessionId && execution.outcome === 'running') {
              execution.outcome = 'failed'
              execution.error = message.slice(0, 500)
              execution.endedAt = this.deps.now()
              this.applyFacts(execution, facts)
              // The failed session will not finish the work: hand the task back
              // instead of leaving it stuck in in_progress forever — and leave a
              // system comment so the GUI shows why.
              if (task.status === 'in_progress' && task.claimedBy === sessionId) {
                task.status = 'todo'
                task.updatedAt = this.deps.now()
                delete task.claimedBy
                delete task.claimedAt
                task.comments.push({
                  id: newCommentId(),
                  body: normalizeBody(`[系统] 执行失败：${message.slice(0, 300)}；任务已退回待办。`),
                  version: 1,
                  createdAt: this.deps.now(),
                })
              }
              return [task]
            }
          }
        }
        return undefined
      }),
    ).then(() => { /* failure settlement committed */ })
  }

  /**
   * Patch one task's execution record in the ledger. R3 depth: a record that
   * already settled (cancelled/failed/succeeded) is never resurrected — the
   * startup path patches sessionId long after the gate opened, and a cancel
   * may have committed in between.
   */
  private async patchExecution(executionId: string, patch: Partial<ExecutionRecord>): Promise<void> {
    await this.deps.store.mutate('execution-recorded', (ledger) => {
      for (const task of ledger.tasks) {
        const execution = task.executions.find(e => e.id === executionId)
        if (execution !== undefined) {
          if (execution.outcome !== 'running') return undefined
          Object.assign(execution, patch)
          return [task]
        }
      }
      return undefined
    })
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
  async run(taskId: string, trigger: ExecutionRecord['trigger'], options?: RunOptions): Promise<RunRequestResult> {
    const max = this.deps.maxConcurrent ?? DEFAULT_MAX_CONCURRENT
    if (this.runs.size >= max) {
      return { ok: false, error: `execution concurrency limit reached (${this.runs.size}/${max} running)` }
    }
    const task = this.deps.store.get(taskId)
    if (task === undefined || task.trashedAt !== undefined) {
      return { ok: false, error: `no task ${taskId}` }
    }
    const workspace = this.deps.workspaces.get(task.workspaceId)
    if (workspace === undefined) {
      return { ok: false, error: `unknown workspace ${task.workspaceId}` }
    }

    const executionId = newExecutionId()
    const sessionId = this.deps.mintSessionId?.() ?? `session-taskboard-${crypto.randomUUID()}`

    // 0. Resolve code isolation (plan §3.2): explicit 'none' → zero git calls;
    //    'worktree' (also the omitted default) → prepare below, degrading to
    //    the original directory fail-soft on any git problem.
    const isolation: IsolationMode = effectiveIsolation(task)
    const branch = task.branch ?? sanitizeBranchName(task.title, task.id)
    const worktreePath = worktreePathOf(workspace.path, task.id)

    // 1. Open the execution record, flip the card to in_progress, and record
    //    the executing session as the claim holder — atomically.
    let gate: string | undefined
    await this.deps.store.mutate('execution-recorded', (ledger) => {
      const target = ledger.tasks.find(t => t.id === taskId)
      if (target === undefined || target.trashedAt !== undefined) {
        gate = `no task ${taskId}`
        return undefined
      }
      if (target.status === 'in_progress') {
        gate = 'task is already in progress'
        return undefined
      }
      // S4: authoritative capacity check INSIDE the gate — counts ledger-wide
      // running executions, immune to the startup window (`runs` registers
      // only after agent creation, seconds later).
      const running = ledger.tasks.reduce((n, t) => n + t.executions.filter(e => e.outcome === 'running').length, 0)
      if (running >= max) {
        gate = `execution concurrency limit reached (${running}/${max} running)`
        return undefined
      }
      target.executions.push({
        id: executionId,
        trigger,
        startedAt: this.deps.now(),
        outcome: 'running',
        ...(isolation === 'none' ? { isolation: 'none' as const } : { isolation: 'worktree' as const, branch }),
      })
      target.status = 'in_progress'
      target.updatedAt = this.deps.now()
      target.updatedBy = { kind: 'system' }
      target.claimedBy = sessionId
      target.claimedAt = this.deps.now()
      return [target]
    })
    if (gate !== undefined) return { ok: false, error: gate }

    // 1b. Worktree preparation (fail-soft): any failure degrades this run to
    //     the original directory with an isolationNote — the ledger and the
    //     execution pipeline itself never fail over git.
    let isolationNote: string | undefined
    let prepared: PreparedWorktree | undefined
    if (isolation === 'worktree') {
      const outcome = await this.prepareIsolation(task, workspace.path, worktreePath, branch, options?.reuseWorktree === true)
      if (outcome.prepared !== undefined) {
        prepared = outcome.prepared
        // Persist the isolation facts of the run (branch is already on the
        // record from the gate mutation).
        await this.patchExecution(executionId, {
          worktreePath: outcome.prepared.worktreePath,
          baseCommit: outcome.prepared.baseCommit,
        })
      } else {
        isolationNote = outcome.note
        // Degraded run: clear the optimistic worktree markers.
        await this.patchExecution(executionId, { isolation: 'none', isolationNote, branch: undefined, worktreePath: undefined, baseCommit: undefined })
      }
    }

    // 2. Create the fresh agent+session inside the task's project, carrying
    //    the pinned model — or the deployment default when unpinned (the
    //    persona template renders {{model}}, so the session always needs one).
    //    The session cwd is ALWAYS the project root: DSH's session model
    //    requires cwd === the workspace path EXACTLY (attachSession validates
    //    it, the sidebar groups by it, and the file sandbox takes it as the
    //    workspace-write boundary) — a subdirectory cwd (the worktree) breaks
    //    all three. The worktree is instead handed to the agent explicitly in
    //    the framing line below.
    //    Preset composition (0.3.3): resolve BEFORE creation so the header
    //    snapshots `agentPreset` and the setup callback mounts the preset's
    //    tools/persona into the agent's scope. undefined composeAgent (or an
    //    absent preset roster) keeps the bare host composition.
    let composition: AgentComposition | undefined
    try {
      composition = this.deps.composeAgent === undefined ? undefined : await this.deps.composeAgent(task.presetId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.patchExecution(executionId, { outcome: 'failed', error: `preset 组合失败：${message.slice(0, 400)}`, endedAt: this.deps.now() })
      await this.revertProgress(taskId)
      // S1: a run that never started must not leave its worktree behind.
      if (prepared !== undefined && this.deps.git !== undefined) {
        try { await this.deps.git.removeWorktree(workspace.path, prepared.worktreePath) } catch { /* best effort (dirty worktrees are kept) */ }
      }
      return { ok: false, error: `preset composition failed: ${message}` }
    }
    let handle: Awaited<ReturnType<AgentsFace['create']>>
    try {
      const model = task.model ?? this.deps.defaultModel?.()
      handle = await this.deps.agents.create({
        sessionId,
        meta: {
          cwd: workspace.path,
          ...(composition !== undefined ? { agentPreset: composition.agentPreset } : {}),
        },
        ...(model !== undefined ? {
          agentOptions: {
            provider: model.provider,
            model: model.model,
            ...(model.reasoningEffort !== undefined ? { reasoningEffort: model.reasoningEffort } : {}),
          },
        } : {}),
        ...(composition !== undefined ? { setup: composition.setup } : {}),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.patchExecution(executionId, { outcome: 'failed', error: message.slice(0, 500), endedAt: this.deps.now() })
      await this.revertProgress(taskId)
      // S1: a run that never started must not leave its worktree behind.
      if (prepared !== undefined && this.deps.git !== undefined) {
        try { await this.deps.git.removeWorktree(workspace.path, prepared.worktreePath) } catch { /* best effort (dirty worktrees are kept) */ }
      }
      return { ok: false, error: message }
    }

    // R3: the startup path above awaited seconds of git + agent work. A
    // cancel() that landed inside that window already settled the execution
    // (cancelled + task back to todo) — with nothing registered in `runs`,
    // it could not dispose the agent this path was about to create. Re-verify
    // INSIDE the queue (after any enqueued cancel committed) BEFORE injecting:
    // a cancelled card must not gain a zombie session that burns tokens and
    // edits files while the task sits in todo, re-runnable by anyone.
    const stillRunning = await this.deps.store.read(ledger =>
      ledger.tasks.some(t => t.executions.some(e => e.id === executionId && e.outcome === 'running')))
    if (!stillRunning) {
      await handle.dispose().catch(() => { /* best effort */ })
      // S1: do not leave the startup artifacts behind a cancelled run either.
      if (prepared !== undefined && this.deps.git !== undefined) {
        try { await this.deps.git.removeWorktree(workspace.path, prepared.worktreePath) } catch { /* best effort */ }
      }
      return { ok: false, error: 'cancelled during startup' }
    }

    // 3. Attach the session to the workspace (GUI project session list).
    await this.deps.workspaces.attach(task.workspaceId, sessionId).catch(() => { /* cosmetic */ })

    // 3a. Apply execution session permission (0.5.5; 'workspace-write' | 'read-only' | 'danger-full-access').
    if (this.deps.setPermission !== undefined) {
      try {
        this.deps.setPermission(sessionId, task.permission ?? DEFAULT_PERMISSION)
      } catch { /* best effort */ }
    }

    // 3b. Best-effort rename: pin the session title to the task title so the
    //     session list shows the task name (a user-sourced title also stops
    //     automatic first-prompt retitling).
    try {
      this.deps.renameSession?.(sessionId, task.title)
    } catch { /* cosmetic */ }

    // 4. Record the session id (execution is really started now).
    await this.patchExecution(executionId, { sessionId })

    // 5. Submit the opening pair and settle on quiescence (turn/end errors
    //    were already folded by the listener). Two messages, ONE turn:
    //    - inject() queues the plugin framing line (next-step, no wake); it
    //      renders as a plugin context row in the conversation.
    //    - followup() queues the card body as a normal user message
    //      (next-turn, wakes the driver). At claim time the loop drains ALL
    //      next-step messages plus the one next-turn message into a single
    //    turn — framing first, then the user bubble.
    handle.agent.inject({
      id: this.deps.mintMessageId?.() ?? MessageId(`msg-taskboard-${crypto.randomUUID()}`),
      role: 'user' as const,
      content: [{ type: 'text' as const, text: this.pluginFraming(task, prepared, isolationNote) }],
      source: { kind: 'plugin' as const, plugin: 'dsh-taskboard' },
    })
    handle.agent.followup({
      id: this.deps.mintMessageId?.() ?? MessageId(`msg-taskboard-${crypto.randomUUID()}`),
      role: 'user' as const,
      content: [{ type: 'text' as const, text: this.userBody(task) }],
      source: { kind: 'user' as const },
    })

    // 6. Settlement watcher: mark succeeded, release the executing session's
    //    hold, collect the worktree evidence (commits / dirty / diff), and —
    //    when the session did NOT follow the handoff protocol — auto-move the
    //    card to in_review with a system comment.
    const settle = (): void => {
      this.runs.delete(executionId)
      void this.settleExecution(executionId, sessionId, prepared)
    }
    this.runs.set(executionId, { sessionId, ...(prepared !== undefined ? { prepared } : {}), settle, dispose: () => handle.dispose() })
    // R2: the rejection path owns its state transition EXCLUSIVELY — the old
    // code also called settle() here, racing two evidence collections whose
    // mutations both checked outcome === 'running': whoever committed first
    // won, so a run that never reached quiescence could be recorded as
    // succeeded (and auto-moved to in_review). Now only the failure
    // settlement writes, and the run entry is released after it commits.
    void handle.agent.whenIdle().then(settle, () => {
      this.noteFailure(sessionId, 'agent did not reach quiescence')
        .then(() => { this.runs.delete(executionId) })
        .catch(() => { this.runs.delete(executionId) })
    })

    return { ok: true, executionId, sessionId }
  }

  /**
   * Settle one execution: collect worktree facts first (fail-soft — git
   * problems never block settlement), then commit outcome + release + the
   * protocol-auto-review move in ONE ledger mutation.
   */
  private async settleExecution(
    executionId: string,
    sessionId: string,
    prepared: PreparedWorktree | undefined,
  ): Promise<void> {
    const facts = await this.collectEvidence(prepared)
    await this.deps.store.mutate('execution-recorded', (ledger) => {
      for (const t of ledger.tasks) {
        const execution = t.executions.find(e => e.id === executionId)
        if (execution !== undefined && execution.outcome === 'running') {
          const now = this.deps.now()
          execution.outcome = 'succeeded'
          execution.endedAt = now
          this.applyFacts(execution, facts)
          if (t.status === 'in_progress' && t.claimedBy === sessionId) {
            delete t.claimedBy
            delete t.claimedAt
          }
          if (t.status === 'in_progress') {
            const commented = t.comments.some(c => c.threadId === sessionId)
            t.comments.push({
              id: newCommentId(),
              body: normalizeBody(commented
                ? '[系统] 执行会话已结束并留有评论，但未移至待验收；系统自动移入待验收。'
                : '[系统] 执行会话已结束，但未按协议交接（无评论、未移至待验收）；系统自动移入待验收，请审查后退回或验收。'),
              version: 1,
              createdAt: now,
            })
            t.status = 'in_review'
            t.updatedAt = now
            t.updatedBy = { kind: 'system' }
          }
          return [t]
        }
      }
      return undefined
    })
  }

  /**
   * Prepare the dedicated worktree for a run (fail-soft): detect git, then
   * create/reset the fixed task branch — fresh baseline, or keep a live
   * worktree as-is for 续跑. On success the branch name is pinned onto the
   * task once (renames never change it); on any failure the run degrades
   * with a human-readable note.
   */
  private async prepareIsolation(
    task: TaskRecord,
    workspacePath: string,
    worktreePath: string,
    branch: string,
    reuse: boolean,
  ): Promise<{ prepared?: PreparedWorktree; note?: string }> {
    const git = this.deps.git
    if (git === undefined) return { note: 'git 集成不可用，已在原目录执行' }
    let inside = false
    try {
      inside = await git.detect(workspacePath)
    } catch { /* fail-soft */ }
    if (!inside) {
      // Distinguish 未装 git from 非 git 仓库 (0.3.1): probe the binary so the
      // degradation note names the real cause.
      let hasBinary = true
      try {
        hasBinary = await git.binaryAvailable()
      } catch { /* fail-soft → treat as repo-side */ }
      return { note: hasBinary ? '当前项目不是 git 仓库，已在原目录执行' : 'git 不可用（未安装或不在 PATH），已在原目录执行' }
    }
    let info
    try {
      info = await git.prepareWorktree(workspacePath, worktreePath, branch, reuse ? 'reuse' : 'fresh')
    } catch { /* fail-soft */ }
    if (info === undefined) return { note: 'worktree 准备失败（git 报错或目录被占用），已在原目录执行' }
    // Pin the branch name at first SUCCESSFUL creation (§9: 改名不改分支).
    if (task.branch === undefined) {
      await this.deps.store.mutate('task-updated', (ledger) => {
        const target = ledger.tasks.find(t => t.id === task.id)
        if (target !== undefined && target.branch === undefined) {
          target.branch = branch
          return [target]
        }
        return undefined
      })
    }
    return {
      prepared: {
        branch: info.branch,
        worktreePath: info.path,
        baseCommit: info.baseCommit,
        ...(info.reused === true ? { reused: true } : {}),
      },
    }
  }

  /** How many executions are currently running (for the concurrency cap). */
  inFlight(): number {
    return this.runs.size
  }

  /**
   * Cancel the running execution of a task (user action): stop the agent
   * session, mark the execution cancelled, and hand the task back to todo.
   * @param taskId - the task whose execution should be stopped.
   * @returns the immediate result.
   */
  async cancel(taskId: string): Promise<CancelRequestResult> {
    const task = this.deps.store.get(taskId)
    if (task === undefined) return { ok: false, error: `no task ${taskId}` }
    const running = [...task.executions].reverse().find(e => e.outcome === 'running')
    if (running === undefined) return { ok: false, error: 'no running execution' }

    const entry = this.runs.get(running.id)
    this.runs.delete(running.id)
    // Stop the agent first (best effort): dispose stops the loop, unregisters
    // the agent, and removes its session. A late whenIdle settlement no-ops —
    // the record is no longer 'running'.
    try {
      await entry?.dispose()
    } catch { /* already gone */ }

    // The cancelled session may already have committed work — keep the
    // evidence (best effort) so the user can inspect or 续跑 (0.3.1).
    const facts = await this.collectEvidence(entry?.prepared)
    let settled = false
    await this.deps.store.mutate('execution-recorded', (ledger) => {
      const target = ledger.tasks.find(t => t.id === taskId)
      if (target === undefined) return undefined
      const execution = target.executions.find(e => e.id === running.id)
      if (execution === undefined || execution.outcome !== 'running') return undefined
      settled = true
      execution.outcome = 'cancelled'
      execution.endedAt = this.deps.now()
      this.applyFacts(execution, facts)
      if (target.status === 'in_progress') {
        target.status = 'todo'
        target.updatedAt = this.deps.now()
        delete target.claimedBy
        delete target.claimedAt
      }
      return [target]
    })
    // The execution may have settled (succeeded/failed) between the stale
    // read above and this mutation — a no-op cancel must NOT report success
    // (the GUI used to show 取消成功 for an already-succeeded run, review P1).
    if (!settled) return { ok: false, error: 'execution already settled' }
    return { ok: true, executionId: running.id }
  }

  /**
   * Startup reconciliation after a host restart: executions left `running`
   * by the previous process can never settle here (their settlement watchers
   * died with it), so mark them failed and hand their tasks back to todo.
   */
  async reconcile(): Promise<void> {
    await this.deps.store.mutate('execution-recorded', (ledger) => {
      const now = this.deps.now()
      const touched: TaskRecord[] = []
      for (const task of ledger.tasks) {
        let dirty = false
        for (const execution of task.executions) {
          if (execution.outcome === 'running') {
            execution.outcome = 'failed'
            execution.error = 'interrupted by host restart'
            execution.endedAt = now
            dirty = true
          }
        }
        if (!dirty) continue
        if (task.status === 'in_progress') {
          task.status = 'todo'
          task.updatedAt = now
          delete task.claimedBy
          delete task.claimedAt
        }
        touched.push(task)
      }
      return touched.length > 0 ? touched : undefined
    })
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
  private pluginFraming(task: TaskRecord, prepared?: PreparedWorktree, degradeNote?: string): string {
    let text = `【任务看板】${task.title}（ID: ${task.id}）\n`
      + `本会话由任务看板执行服务启动，任务已置为进行中——无需认领；「已完成」仅限用户在界面操作（代码已限制，移了会被拒）。\n`
      + `完成后按序交接：\n`
      + `1. taskboard_get 读取本任务，取得最新 version\n`
      + `2. taskboard_execution_report 提交结构化执行报告（做了什么/改了哪些文件/如何验证/剩余风险；提交与评论不冲突，都会展示给验收人）\n`
      + `3. taskboard_comment_add 留评论：做了什么改动 / 如何验证 / 剩余风险\n`
      + `4. taskboard_move 将本任务移至待验收 in_review（带 ifVersion）\n`
      + `若无法完成：留评论说明原因，将任务移回待办 todo。`
    if (task.checklist !== undefined && task.checklist.length > 0) {
      const items = task.checklist
        .map((item, index) => `${item.checked ? '☑' : '☐'} ${index + 1}. ${item.text}${item.note !== undefined ? `（证据: ${item.note}）` : ''}`)
        .join('\n')
      const done = task.checklist.filter(i => i.checked).length
      text += `\n本任务有验收清单（DoD，${done}/${task.checklist.length} 已完成）——按清单干活：\n${items}\n完成一项就用 taskboard_checklist（action=check，附 note 证据）勾选；未完成项会在验收时高亮，全部完成再移待验收。需要补充验收项也可用 action=add 追加。`
    }
    if (prepared !== undefined) {
      if (prepared.reused === true) {
        text += `\n本任务启用了 Git Worktree 隔离，且本次为续跑：任务工作目录是独立分支 ${prepared.branch} 的 worktree——\n${prepared.worktreePath}\n上一次执行的改动与提交都保留在原处——请先查看已有改动（git status / git log）再继续，避免重复劳动，并把新完成的工作提交到该分支。`
      } else {
        text += `\n本任务启用了 Git Worktree 隔离：任务工作目录是独立分支 ${prepared.branch} 的全新 worktree——\n${prepared.worktreePath}\n（全新检出，不含 node_modules/构建产物，构建或测试前可能需要先安装依赖）。\n⚠ 边界纪律：你的会话根目录是整个项目，但本任务的全部改动必须只发生在上述 worktree 目录内——命令用 workdir 指向它、文件读写用它的绝对路径；不要改动主工作区的任何其它文件；把完成的工作提交（git commit）到该分支，验收将基于该分支的提交记录合并。`
      }
    } else if (degradeNote !== undefined) {
      text += `\n⚠ 本次执行未能建立隔离，正在主项目目录中工作（原因：${degradeNote}）。该目录可能有他人未提交的改动：动手前先 git status 检查现状，改动尽量集中，结束时在评论中说明动了哪些文件；避免把未经验证的改动直接提交到主分支。`
    }
    return text
  }

  /**
   * The card body as a normal user bubble: the effective prompt (title+
   * description, with the explicit prompt appended when set) with template
   * variables resolved from
   * the task's own history at submit time (valuable for recurring patrols):
   * `{{lastExecution}}` → the previous execution's trigger/outcome/error;
   * `{{lastComments}}` → the last three comments (who + body).
   */
  private userBody(task: TaskRecord): string {
    const lastExec = [...task.executions].reverse().find(e => e.outcome !== 'running')
    const lastExecText = lastExec === undefined
      ? '（无）'
      : `${lastExec.trigger} · ${lastExec.outcome}${lastExec.error !== undefined ? ` · ${lastExec.error.slice(0, 200)}` : ''} · ${lastExec.startedAt !== undefined ? new Date(lastExec.startedAt).toISOString() : '?'}`
    const lastCommentsText = task.comments.slice(-3)
      .map(c => `[${c.threadId !== undefined ? 'agent' : 'user'}] ${c.body}`)
      .join('\n') || '（无）'
    return effectivePrompt(task)
      .replace(/\{\{lastExecution\}\}/g, lastExecText)
      .replace(/\{\{lastComments\}\}/g, lastCommentsText)
  }

  /** Move a task back out of in_progress (and release its hold) after a failed start. */
  private async revertProgress(taskId: string): Promise<void> {
    await this.deps.store.mutate('execution-recorded', (ledger) => {
      const target = ledger.tasks.find(t => t.id === taskId)
      if (target !== undefined && target.status === 'in_progress') {
        target.status = 'todo'
        target.updatedAt = this.deps.now()
        delete target.claimedBy
        delete target.claimedAt
        return [target]
      }
      return undefined
    })
  }
}

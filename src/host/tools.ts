/**
 * The ten `taskboard_*` agent tools. All writes require a calling agent
 * session (ownership audit), carry optimistic-version checks, and enforce
 * the protocol gates in CODE, not in prompt text:
 *
 * - `move → done` is rejected for agent callers (user confirmation only)
 * - `move todo → in_progress` requires the calling session's workspace to
 *   match the task's project (claim boundary)
 * - taking over a task held by another session is rejected
 * - `delete` for agent callers only sets the soft-delete marker
 * - checklist items may be added/checked by agents, but checking never
 *   completes the task (done stays user-only)
 *
 * OUTPUT CONTRACT (lesson: registry `createSuccessResult` renders
 * `output.render(args, value)` into `result.content`, and the loop feeds
 * exactly that content to the model — the raw JSON `value` never reaches
 * the model): render() IS the model-facing tool result. Every render must
 * carry the complete facts an agent needs to act (ids, versions, statuses);
 * a "terse UI summary" here starves the agent.
 *
 * @module dsh-taskboard/host/tools
 */
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import { defineTool } from './sdk.ts'
import {
  MAX_CHECKLIST_ITEMS,
  asIsolation,
  asStatus,
  asUrgency,
  canTransition,
  checklistFromTexts,
  defaultIsolationOf,
  effectivePrompt,
  isClaim,
  isClaimedBy,
  newChecklistItemId,
  newCommentId,
  newTaskId,
  normalizeBody,
  normalizeExecution,
  normalizeExecutionReport,
  normalizeModel,
  normalizePrompt,
  normalizeTitle,
  summarize,
  syncClaim,
  type Actor,
  type ChecklistItem,
  type TaskLedger,
  type TaskModel,
  type TaskRecord,
} from '../shared/protocol.ts'
import type { TaskStore } from './store.ts'

/** Render side: one compact task line (id/status/version are load-bearing). */
function taskLine(t: {
  id: string
  title: string
  status: string
  urgency: string
  version: number
  workspaceId: string
  blocked: boolean
  executionMode: string
  commentCount?: number
  lastExecutionOutcome?: string
  checklist?: { done: number; total: number }
  trashed?: boolean
}): string {
  const parts = [
    `- ${t.id} [${t.status}] v${t.version} · ${t.urgency} · 项目 ${t.workspaceId}`,
    `「${t.title}」`,
  ]
  if (t.blocked) parts.push('·受阻')
  if (t.executionMode === 'scheduled') parts.push('·定时')
  if (t.commentCount !== undefined && t.commentCount > 0) parts.push(`·评论${t.commentCount}`)
  if (t.checklist !== undefined && t.checklist.total > 0) parts.push(`·清单${t.checklist.done}/${t.checklist.total}`)
  if (t.lastExecutionOutcome !== undefined) parts.push(`·上次执行${t.lastExecutionOutcome}`)
  if (t.trashed === true) parts.push('·已删')
  return parts.join(' ')
}

/** Render side: the full task detail block (everything an executor needs). */
function taskDetail(t: TaskRecord & { effectivePrompt?: string }): string {
  const lines: string[] = [
    `任务 ${t.id} 「${t.title}」`,
    `状态: ${t.status} (v${t.version}) · 紧急度: ${t.urgency} · 项目: ${t.workspaceId}${t.blocked ? ' · 受阻' : ''}`,
    `执行方式: ${t.execution.mode}${t.execution.cron !== undefined ? ` cron=${t.execution.cron}` : ''}`,
    `隔离: ${t.isolation === 'none' ? '关闭（原目录执行）' : 'Git Worktree'}${t.branch !== undefined ? `（分支 ${t.branch}）` : ''}`,
  ]
  const holder = isClaimedBy(t)
  if (holder !== undefined) lines.push(`认领: agent ${String(holder).slice(0, 24)}（持有期间其他会话不可移动）`)
  if (t.execution.nextRunAt !== undefined) lines.push(`下次触发: ${new Date(t.execution.nextRunAt).toISOString()}`)
  if (t.model !== undefined) lines.push(`固定模型: ${t.model.provider}/${t.model.model}${t.model.reasoningEffort !== undefined ? ` (思考强度: ${t.model.reasoningEffort})` : ''}`)
  if (t.presetId !== undefined) lines.push(`执行模式: ${t.presetId}（未指定时为部署默认 preset）`)
  lines.push(`描述: ${t.description.length > 0 ? t.description : '（无）'}`)
  lines.push(`执行 Prompt: ${t.effectivePrompt ?? effectivePrompt(t)}`)
  if (t.checklist !== undefined && t.checklist.length > 0) {
    const done = t.checklist.filter(i => i.checked).length
    lines.push(`验收清单 (${done}/${t.checklist.length}):`)
    for (const item of t.checklist) {
      const mark = item.checked ? '☑' : '☐'
      const who = item.checkedBy === undefined ? '' : item.checkedBy === 'user' ? ' ·用户勾选' : ` ·agent ${String(item.checkedBy).slice(0, 24)}勾选`
      const note = item.note !== undefined ? ` ·证据: ${item.note}` : ''
      lines.push(`  ${mark} ${item.text}${who}${note}`)
    }
  }
  if (t.comments.length > 0) {
    lines.push(`评论 (${t.comments.length}):`)
    for (const c of t.comments) {
      const who = c.threadId !== undefined ? `agent ${String(c.threadId).slice(0, 24)}` : 'user'
      lines.push(`  - [${who} ${new Date(c.createdAt).toISOString()}] ${c.body}`)
    }
  } else {
    lines.push('评论: 无')
  }
  if (t.executions.length > 0) {
    lines.push(`执行记录 (${t.executions.length}):`)
    for (const e of t.executions) {
      const at = e.startedAt !== undefined ? new Date(e.startedAt).toISOString() : '?'
      const err = e.error !== undefined ? ` 错误: ${e.error}` : ''
      const report = e.report !== undefined ? ' [已交报告]' : ''
      lines.push(`  - [${e.trigger} ${at}] ${e.outcome}${report}${err}`)
    }
  } else {
    lines.push('执行记录: 无')
  }
  const updatedBy = t.updatedBy.kind === 'agent' ? `agent ${String(t.updatedBy.sessionId).slice(0, 24)}` : t.updatedBy.kind === 'system' ? 'system' : 'user'
  lines.push(`更新: ${new Date(t.updatedAt).toISOString()} 由 ${updatedBy}`)
  return lines.join('\n')
}

/** Stable error codes surfaced at the head of tool error messages. */
export const ERR = {
  notFound: 'not_found',
  versionConflict: 'version_conflict',
  workspaceMismatch: 'workspace_mismatch',
  invalidTransition: 'invalid_transition',
  forbidden: 'forbidden',
  requiresAgent: 'unauthorized_actor',
  invalidInput: 'invalid_input',
} as const

/** Tool failure: an Error whose message starts with a stable code. The code
 *  is also carried structurally so the routes layer can map failures without
 *  re-parsing messages (review P2). */
export class ToolError extends Error {
  constructor(readonly code: string, detail: string) {
    super(`Error: ${code}: ${detail}`)
  }
}

/** The workspace face the tools need (narrow for tests). */
export interface WorkspaceFace {
  /** Resolve the workspace owning a canonical cwd, if any. */
  resolveByPath(path: string): Promise<{ id: string } | undefined>
  /** Get a workspace by id. */
  get(id: string): { id: string; path: string; title: string } | undefined
  /** List all workspaces. */
  list(): Array<{ id: string; path: string; title: string }>
}

/** Adapt the real registry to the narrow face. */
export function workspaceFace(registry: WorkspaceRegistry): WorkspaceFace {
  // Explicit field mapping: Workspace entities expose path/title as prototype
  // getters, which JSON.stringify skips (own enumerable properties only).
  return {
    resolveByPath: async (path) => {
      const ws = await registry.resolveByPath(path as never)
      return ws === undefined ? undefined : { id: ws.id }
    },
    get: id => {
      const ws = registry.get(id as never)
      return ws === undefined ? undefined : { id: ws.id, path: ws.path, title: ws.title }
    },
    list: () => registry.list().map(ws => ({ id: ws.id, path: ws.path, title: ws.title })),
  }
}

/** Everything the tool set needs. */
export interface ToolDeps {
  store: TaskStore
  workspaces: WorkspaceFace
  /** Current epoch ms (injectable for tests). */
  now: () => number
  /**
   * Registered model provider routes (from the host llm runtime), for
   * advisory validation of pinned models; undefined = runtime unavailable,
   * in which case only the structural check applies.
   */
  modelProviders?: () => string[] | undefined
}

/** Validate a pinned model: structural check always, provider route when known. */
function checkModel(deps: ToolDeps, raw: unknown): TaskModel {
  const model = normalizeModel(raw)
  const providers = deps.modelProviders?.()
  if (providers !== undefined && !providers.includes(model.provider)) {
    throw new ToolError(ERR.invalidInput, `model provider "${model.provider}" has no registered route (available: ${providers.join(', ')})`)
  }
  return model
}

/** Resolve the calling agent's actor and session id. */
function caller(exec: ToolRunContext): { actor: Actor & { kind: 'agent' }; sessionId: string } {
  if (!exec.agent) throw new ToolError(ERR.requiresAgent, 'taskboard tools require a calling agent session')
  const sessionId = exec.agent.id
  return { actor: { kind: 'agent', sessionId }, sessionId }
}

/** The calling session's workspace id (undefined when unaffiliated). */
async function callerWorkspace(deps: ToolDeps, exec: ToolRunContext): Promise<string | undefined> {
  const cwd = exec.agent?.session.header.cwd
  if (typeof cwd !== 'string' || cwd.length === 0) return undefined
  const ws = await deps.workspaces.resolveByPath(cwd)
  return ws?.id
}

/** Guard: version match. */
function versionGuard(task: TaskRecord, ifVersion: number | undefined): void {
  if (ifVersion === undefined) {
    throw new ToolError(ERR.versionConflict, 'this write requires ifVersion; read the task first')
  }
  if (ifVersion !== task.version) {
    throw new ToolError(ERR.versionConflict, `stale version ${ifVersion} (current ${task.version}); re-read the task and retry once`)
  }
}

/**
 * Find a live (non-trashed) task INSIDE a mutator (R1: every guard must run
 * on the fresh draft the serial queue hands us, never on a pre-read clone —
 * a pre-read can pass its version check and then blind-overwrite a task that
 * changed while the caller awaited). Throws not_found for missing/trashed.
 */
function liveTaskAt(ledger: TaskLedger, id: string): { index: number; task: TaskRecord } {
  const index = ledger.tasks.findIndex(t => t.id === id)
  if (index < 0) throw new ToolError(ERR.notFound, `no task ${id}`)
  const task = ledger.tasks[index]!
  if (task.trashedAt !== undefined) throw new ToolError(ERR.notFound, `no task ${id}`)
  return { index, task }
}

/** Re-throw with a stable code; non-ToolErrors become invalid_input. */
function fail(error: unknown): never {
  if (error instanceof ToolError) throw error
  const message = error instanceof Error ? error.message : String(error)
  throw new ToolError(ERR.invalidInput, message)
}

/** Loose json output schema shared by every taskboard tool. */
const JSON_OUT = { type: 'json' } as const

/** Deep-JSON a value for a json-rooted tool output (spread results lose implicit index signatures). */
function json<T>(value: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

/** The exec context face the tools read (agent identity + session cwd). */
export interface ToolRunContext {
  agent?: { id: string; session: { header: { cwd?: string } } }
}

/** Registry-like context face (tests stub this). */
export interface ToolContextFace {
  tools: { register(tool: { name: string }): unknown }
}

/**
 * Register all ten tools.
 * @param ctx - a context exposing `tools.register`.
 * @param deps - store + workspaces + clock.
 * @returns dispose functions, one per tool.
 */
export function registerTaskboardTools(ctx: ToolContextFace, deps: ToolDeps): Array<() => void> {
  const disposers: Array<() => void> = []
  const { store, workspaces } = deps

  // Env-gated tool-call tracing (ATB_TRACE=1) — evidence for protocol E2E.
  const register = (tool: { name: string; execute?: unknown }) => {
    if (process.env.ATB_TRACE === '1' && typeof tool.execute === 'function') {
      const orig = tool.execute as (args: unknown, exec: unknown) => Promise<unknown>
      tool.execute = async (args: unknown, exec: unknown) => {
        console.error(`[atb ▶] ${tool.name}`, JSON.stringify(args).slice(0, 300))
        try {
          const result = await orig(args, exec)
          console.error(`[atb ✓] ${tool.name}`, JSON.stringify(result).slice(0, 300))
          return result
        } catch (error) {
          console.error(`[atb ✗] ${tool.name}`, String(error).slice(0, 400))
          throw error
        }
      }
    }
    return ctx.tools.register(tool as { name: string })
  }

  // ------------------------------------------------------------------ list
  disposers.push(register(defineTool({
    name: 'taskboard_list',
    description:
      'List task-board tasks. Filter by project (workspaceId), status, or urgency. '
      + 'Returns compact summaries (id, title, status, urgency, version, claim owner). '
      + 'Check this before starting work to find claimable todo tasks in your project.',
    parameters: {
      workspaceId: { type: 'string', description: 'Filter by project (DSH workspace id).' },
      status: { type: 'string', description: 'Filter by exact status (backlog/todo/in_progress/in_review/done/canceled/archived).' },
      urgency: { type: 'string', description: 'Filter by urgency (urgent/normal/relaxed).' },
      includeTrashed: { type: 'boolean', description: 'Include soft-deleted tasks (default false).' },
    },
    output: {
      schema: JSON_OUT,
      render: (_args, value) => {
        const v = value as { revision?: number; tasks?: Array<Record<string, unknown>> }
        const tasks = v.tasks ?? []
        const head = `任务 ${tasks.length} 条（台账 rev ${v.revision ?? '?'}）`
        if (tasks.length === 0) return [{ type: 'text', text: `${head}：无匹配任务。` }]
        return [{ type: 'text', text: [head, ...tasks.map(t => taskLine(t as never))].join('\n') }]
      },
    },
    async execute(args) {
      try {
        const a = args as { workspaceId?: string; status?: string; urgency?: string; includeTrashed?: boolean }
        const tasks = store.snapshot().tasks.filter(t =>
          (a.workspaceId === undefined || t.workspaceId === a.workspaceId)
          && (a.status === undefined || t.status === a.status)
          && (a.urgency === undefined || t.urgency === a.urgency)
          && (a.includeTrashed === true || t.trashedAt === undefined))
        return json({ revision: store.snapshot().revision, tasks: tasks.map(summarize) })
      } catch (error) { fail(error) }
    },
  })) as () => void)

  // ------------------------------------------------------------------- get
  disposers.push(register(defineTool({
    name: 'taskboard_get',
    description:
      'Read one task in full: description, prompt, project, urgency, status, comments, executions, version. '
      + 'Read this (and the comments) BEFORE claiming or starting work on a task.',
    parameters: {
      id: { type: 'string', required: true, description: 'Task id from the board.' },
    },
    output: {
      schema: JSON_OUT,
      render: (_args, value) => {
        const v = value as { task?: TaskRecord & { effectivePrompt?: string } }
        return [{ type: 'text', text: v.task === undefined ? '任务不存在。' : taskDetail(v.task) }]
      },
    },
    async execute(args: { id: string }) {
      try {
        const { id } = args
        const task = store.get(id)
        if (task === undefined || task.trashedAt !== undefined) throw new ToolError(ERR.notFound, `no task ${id}`)
        return json({ task: { ...task, effectivePrompt: effectivePrompt(task) } })
      } catch (error) { fail(error) }
    },
  })) as () => void)

  // ---------------------------------------------------------------- create
  disposers.push(register(defineTool({
    name: 'taskboard_create',
    description:
      'Create a task on the board. Required: title, workspaceId (project), urgency (urgent/normal/relaxed). '
      + 'Optional: description, prompt (sent to a fresh session on execution), status (default todo), '
      + 'execution mode (claim|scheduled + cron), model {provider, model} to pin executions to a model. '
      + 'Do not track trivial requests as tasks.',
    parameters: {
      title: { type: 'string', required: true, description: 'Short imperative line (1..200 chars).' },
      workspaceId: { type: 'string', required: true, description: 'Project (DSH workspace id) this task belongs to.' },
      urgency: { type: 'string', required: true, description: 'urgent (red) | normal (purple) | relaxed (blue).' },
      description: { type: 'string', description: 'What the task involves (plain text).' },
      prompt: { type: 'string', description: 'Extra execution instructions; the session receives title+description+this prompt.' },
      status: { type: 'string', description: 'Initial status; default todo. backlog = not approved for execution.' },
      execution: {
        type: 'object',
        additionalProperties: false,
        description: 'Execution config: { mode: "claim" } (default) or { mode: "scheduled", cron: "m h dom mon dow" }.',
        properties: {
          mode: { type: 'string', description: 'claim | scheduled.' },
          cron: { type: 'string', description: 'Five-field cron expression (scheduled only).' },
        },
      },
      model: {
        type: 'object',
        additionalProperties: false,
        description: 'Pin executions to one configured model: { provider, model, reasoningEffort? }. Omit to use the default model.',
        properties: {
          provider: { type: 'string', description: 'Provider route id.' },
          model: { type: 'string', description: 'Provider-owned model id.' },
          reasoningEffort: { type: 'string', description: 'Optional thinking intensity / reasoning effort (e.g. low, medium, high).' },
        },
      },
      isolation: {
        type: 'string',
        description: 'Code isolation for executions: "worktree" (each run gets a fresh git worktree on branch task/<标题>+<taskId>) or "none" (run in the project directory, zero git interaction). Omitted → the board default (看板设置 → 默认执行隔离; factory default "none").',
      },
      presetId: {
        type: 'string',
        description: 'Agent preset the execution session is composed from (its tool set / persona); default = the deployment default preset. Optional.',
      },
      checklist: {
        type: 'array',
        description: `Acceptance checklist (DoD) item texts (≤${MAX_CHECKLIST_ITEMS} × 200 chars); agents check them off at handoff, the user reviews.`,
        items: { type: 'string' },
      },
    },
    output: {
      schema: JSON_OUT,
      render: (_args, value) => {
        const v = value as { task?: { id?: string; status?: string; version?: number } }
        const t = v.task
        return [{ type: 'text', text: t === undefined ? '创建失败。' : `已创建任务 ${t.id} [${t.status}] v${t.version}。写入前先 taskboard_get 读取。` }]
      },
    },
    async execute(args: {
      title: string
      workspaceId: string
      urgency: string
      status?: string
      description?: string
      prompt?: string
      execution?: { mode?: string; cron?: string }
      model?: { provider?: string; model?: string }
      isolation?: string
      presetId?: string
      checklist?: string[]
    }, exec: unknown) {
      try {
        const { actor } = caller(exec as ToolRunContext)
        const title = normalizeTitle(args.title)
        if (workspaces.get(args.workspaceId) === undefined) {
          throw new ToolError(ERR.notFound, `unknown workspaceId ${args.workspaceId}`)
        }
        const urgency = asUrgency(args.urgency)
        const status = args.status === undefined ? 'todo' as const : asStatus(args.status)
        if (status !== 'backlog' && status !== 'todo') {
          throw new ToolError(ERR.invalidTransition, 'a new task must start as backlog or todo (in_progress requires claiming the task)')
        }
        const execution = normalizeExecution(args.execution ?? {}, deps.now())
        const model = args.model !== undefined ? checkModel(deps, args.model) : undefined
        // 0.5.0: an omitted isolation is MATERIALIZED from the board setting
        // (看板设置) at creation, so later setting changes never rewrite
        // existing tasks.
        const isolation = args.isolation === undefined ? defaultIsolationOf(store.snapshot().settings) : asIsolation(args.isolation)
        const presetId = args.presetId?.trim() || undefined
        // T9: match the GUI create route — trim and drop blank lines instead
        // of failing the whole call over one empty string.
        const checklistTexts = args.checklist?.map(c => c.trim()).filter(c => c.length > 0)
        const checklist = checklistTexts !== undefined && checklistTexts.length > 0 ? checklistFromTexts(checklistTexts) : undefined
        const now = deps.now()
        const task: TaskRecord = {
          id: newTaskId(),
          title,
          description: (args.description ?? '').trim(),
          prompt: normalizePrompt(args.prompt),
          workspaceId: args.workspaceId,
          urgency,
          status,
          blocked: false,
          execution,
          model,
          isolation,
          ...(presetId !== undefined ? { presetId } : {}),
          ...(checklist !== undefined ? { checklist } : {}),
          version: 1,
          createdAt: now,
          updatedAt: now,
          createdBy: actor,
          updatedBy: actor,
          comments: [],
          executions: [],
        }
        await store.mutate('task-created', ledger => {
          ledger.tasks.push(task)
          return [task]
        })
        return json({ task: summarize(task) })
      } catch (error) { fail(error) }
    },
  })) as () => void)

  // ---------------------------------------------------------------- update
  disposers.push(register(defineTool({
    name: 'taskboard_update',
    description:
      'Update a task\'s title/description/prompt/urgency/blocked. Requires ifVersion (read first). '
      + 'The model and execution config are read-only through this tool (they belong to the task owner/user).',
    parameters: {
      id: { type: 'string', required: true, description: 'Task id.' },
      ifVersion: { type: 'number', required: true, description: 'The task version you read; the write fails on mismatch.' },
      title: { type: 'string', description: 'New title.' },
      description: { type: 'string', description: 'New description.' },
      prompt: { type: 'string', description: 'New execution prompt.' },
      urgency: { type: 'string', description: 'urgent | normal | relaxed.' },
      blocked: { type: 'boolean', description: 'Blocked marker (work cannot continue right now).' },
    },
    output: {
      schema: JSON_OUT,
      render: (_args, value) => {
        const v = value as { task?: { id?: string; status?: string; version?: number } }
        const t = v.task
        return [{ type: 'text', text: t === undefined ? '更新失败。' : `已更新任务 ${t.id}，当前 v${t.version} [${t.status}]。` }]
      },
    },
    async execute(args: {
      id: string
      ifVersion: number
      title?: string
      description?: string
      prompt?: string
      urgency?: string
      blocked?: boolean
    }, exec: unknown) {
      try {
        const { actor } = caller(exec as ToolRunContext)
        // R1: lookup + version guard + write run inside the serial-queue
        // mutation, on the fresh draft — a pre-read clone could pass its
        // version check and then blind-overwrite a concurrent writer.
        let next: TaskRecord | undefined
        await store.mutate('task-updated', ledger => {
          const { index, task } = liveTaskAt(ledger, args.id)
          versionGuard(task, args.ifVersion)
          if (task.status === 'archived') throw new ToolError(ERR.invalidTransition, 'archived tasks are immutable')
          next = structuredClone(task)
          if (args.title !== undefined) next.title = normalizeTitle(args.title)
          if (args.description !== undefined) next.description = args.description.trim()
          if (args.prompt !== undefined) next.prompt = normalizePrompt(args.prompt)
          if (args.urgency !== undefined) next.urgency = asUrgency(args.urgency)
          if (args.blocked !== undefined) next.blocked = args.blocked
          next.version = task.version + 1
          next.updatedAt = deps.now()
          next.updatedBy = actor
          ledger.tasks[index] = next
          return [next]
        })
        return json({ task: summarize(next!) })
      } catch (error) { fail(error) }
    },
  })) as () => void)

  // ------------------------------------------------------------------ move
  disposers.push(register(defineTool({
    name: 'taskboard_move',
    description:
      'Move a task between statuses (requires ifVersion). Claim = todo→in_progress (only a session '
      + 'inside the task\'s project may claim; never take over a task held by another session). '
      + 'After implementing and self-verifying: comment, then in_progress→in_review. '
      + 'You can NEVER move a task to done — that requires explicit user confirmation.',
    parameters: {
      id: { type: 'string', required: true, description: 'Task id.' },
      status: { type: 'string', required: true, description: 'Target status.' },
      ifVersion: { type: 'number', required: true, description: 'Task version you read; fails on mismatch.' },
    },
    output: {
      schema: JSON_OUT,
      render: (_args, value) => {
        const v = value as { task?: { id?: string; status?: string; version?: number } }
        const t = v.task
        return [{ type: 'text', text: t === undefined ? '移动失败。' : `任务 ${t.id} 已移到 ${t.status}，当前 v${t.version}。` }]
      },
    },
    async execute(args: { id: string; status: string; ifVersion: number }, exec: unknown) {
      try {
        const { actor } = caller(exec as ToolRunContext)
        const to = asStatus(args.status)
        // Claim boundary (policy gate): resolving the caller's workspace is
        // async, so it happens BEFORE the mutation — the comparison runs INSIDE
        // against the FRESH task (stronger than the old stale-clone compare).
        const callerWsId = to === 'in_progress'
          ? await callerWorkspace(deps, exec as ToolRunContext)
          : undefined
        // R1: every state guard + the write itself run inside the mutation.
        let next: TaskRecord | undefined
        await store.mutate('task-moved', ledger => {
          const { index, task } = liveTaskAt(ledger, args.id)
          versionGuard(task, args.ifVersion)

          // Code-level gate: agents never complete a task.
          if (to === 'done') {
            throw new ToolError(ERR.forbidden, 'moving a task to done requires explicit user confirmation (GUI); agents cannot do it')
          }
          if (!canTransition(task.status, to)) {
            throw new ToolError(ERR.invalidTransition, `illegal transition ${task.status} → ${to}`)
          }
          // Exclusive hold: while a task is in_progress under a session
          // (explicit claimedBy — an agent claim or a live execution), no other
          // session may move it (that would be a takeover).
          if (task.status === 'in_progress' && task.claimedBy !== undefined && task.claimedBy !== actor.sessionId) {
            throw new ToolError(ERR.forbidden, `task is held by session ${task.claimedBy}; never take over another session's claim`)
          }
          // Claim boundary: the calling session must belong to the task's project.
          if (isClaim(task.status, to) && callerWsId !== task.workspaceId) {
            throw new ToolError(ERR.workspaceMismatch, 'only a session inside this task\'s project may claim it')
          }
          next = structuredClone(task)
          next.status = to
          next.version = task.version + 1
          next.updatedAt = deps.now()
          next.updatedBy = actor
          if (isClaim(task.status, to)) next.blocked = false
          // Record the holder on a claim; every move out of in_progress releases it.
          syncClaim(next, to, deps.now(), isClaim(task.status, to) ? actor.sessionId : undefined)
          ledger.tasks[index] = next
          return [next]
        })
        return json({ task: summarize(next!) })
      } catch (error) { fail(error) }
    },
  })) as () => void)

  // ----------------------------------------------------------- comment_add
  disposers.push(register(defineTool({
    name: 'taskboard_comment_add',
    description:
      'Append a progress/report comment to a task. When handing off to review, the comment should cover: '
      + 'what changed, how it was verified, outcome, and remaining risks.',
    parameters: {
      id: { type: 'string', required: true, description: 'Task id.' },
      body: { type: 'string', required: true, description: 'Comment text (1..4000 chars).' },
    },
    output: {
      schema: JSON_OUT,
      render: (_args, value) => {
        const v = value as { comment?: { id?: string }; task?: { id?: string; version?: number; status?: string } }
        const c = v.comment
        const t = v.task
        if (c === undefined || t === undefined) return [{ type: 'text', text: '评论失败。' }]
        // The comment bumped the version — echo it so the agent can chain the
        // next write (e.g. move → in_review) WITHOUT re-reading.
        return [{
          type: 'text',
          text: `评论 ${c.id} 已添加；任务 ${t.id} 当前 v${t.version} [${t.status}]（后续写操作用此版本号）.`,
        }]
      },
    },
    async execute(args: { id: string; body: string }, exec: unknown) {
      try {
        const { sessionId } = caller(exec as ToolRunContext)
        const comment = {
          id: newCommentId(),
          body: normalizeBody(args.body),
          version: 1,
          createdAt: deps.now(),
          threadId: sessionId,
        }
        // R1: find + append inside the mutation (no ifVersion by design —
        // comments are append-only — but the write must not clobber a task
        // that changed while we were queued).
        let next: TaskRecord | undefined
        await store.mutate('comment-added', ledger => {
          const { index, task } = liveTaskAt(ledger, args.id)
          if (task.status === 'archived') throw new ToolError(ERR.invalidTransition, 'archived tasks are immutable')
          next = structuredClone(task)
          next.comments.push(comment)
          next.version = task.version + 1
          next.updatedAt = deps.now()
          ledger.tasks[index] = next
          return [next]
        })
        return json({ comment, task: { id: next!.id, version: next!.version, status: next!.status } })
      } catch (error) { fail(error) }
    },
  })) as () => void)

  // -------------------------------------------------------------- comments
  disposers.push(register(defineTool({
    name: 'taskboard_comments',
    description: 'List a task\'s comments, oldest first. Read them before deciding to start work.',
    parameters: {
      id: { type: 'string', required: true, description: 'Task id.' },
    },
    output: {
      schema: JSON_OUT,
      render: (_args, value) => {
        const v = value as { comments?: unknown[] }
        const list = v.comments as Array<{ body: string; createdAt: number; threadId?: string }> | undefined
        if (list === undefined || list.length === 0) return [{ type: 'text', text: '无评论。' }]
        const lines = list.map(c => {
          const who = c.threadId !== undefined ? `agent ${String(c.threadId).slice(0, 24)}` : 'user'
          return `- [${who} ${new Date(c.createdAt).toISOString()}] ${c.body}`
        })
        return [{ type: 'text', text: `评论 ${list.length} 条：\n${lines.join('\n')}` }]
      },
    },
    async execute(args: { id: string }) {
      try {
        const task = store.get(args.id)
        if (task === undefined || task.trashedAt !== undefined) throw new ToolError(ERR.notFound, `no task ${args.id}`)
        return json({ comments: task.comments })
      } catch (error) { fail(error) }
    },
  })) as () => void)

  // ---------------------------------------------------------------- delete
  disposers.push(register(defineTool({
    name: 'taskboard_delete',
    description:
      'Soft-delete a task (marks it trashed; the user confirms the purge in the GUI). '
      + 'Requires ifVersion. Prefer canceled/archived over delete unless the task was a mistake.',
    parameters: {
      id: { type: 'string', required: true, description: 'Task id.' },
      ifVersion: { type: 'number', required: true, description: 'Task version you read.' },
    },
    output: {
      schema: JSON_OUT,
      render: (_args, value) => {
        const v = value as { trashed?: boolean }
        return [{ type: 'text', text: v.trashed === true ? '任务已标记删除（等待用户在 GUI 清除）。' : '删除失败。' }]
      },
    },
    async execute(args: { id: string; ifVersion: number }, exec: unknown) {
      try {
        caller(exec as ToolRunContext)
        // R1: guards inside the mutation. S5: a running execution keeps
        // writing to the task (report, settlement) — refuse the soft-delete
        // until it is cancelled or settled. T8: clear claim residue.
        let next: TaskRecord | undefined
        await store.mutate('task-deleted', ledger => {
          const { index, task } = liveTaskAt(ledger, args.id)
          versionGuard(task, args.ifVersion)
          if (task.executions.some(e => e.outcome === 'running')) {
            throw new ToolError(ERR.invalidInput, '任务有正在运行的执行（先在 GUI 取消或等它结束再删除）')
          }
          next = structuredClone(task)
          next.trashedAt = deps.now()
          next.version = task.version + 1
          delete next.claimedBy
          delete next.claimedAt
          next.blocked = false
          ledger.tasks[index] = next
          return [next]
        })
        return { trashed: true }
      } catch (error) { fail(error) }
    },
  })) as () => void)

  // -------------------------------------------------------------- checklist
  disposers.push(register(defineTool({
    name: 'taskboard_checklist',
    description:
      `Manage the task's acceptance checklist (DoD). Actions: "add" (append item texts, ≤10 per call), `
      + '"check" (mark an item done, with an optional evidence note), "uncheck" (reopen an item). '
      + 'Checking items NEVER completes the task — done stays a user-only action. Requires ifVersion.',
    parameters: {
      id: { type: 'string', required: true, description: 'Task id.' },
      action: { type: 'string', required: true, description: 'add | check | uncheck.' },
      ifVersion: { type: 'number', required: true, description: 'Task version you read; fails on mismatch.' },
      items: {
        type: 'array',
        description: 'Item texts to append (action=add only; 1..10 per call, 200 chars each).',
        items: { type: 'string' },
      },
      itemId: { type: 'string', description: 'The checklist item id (action=check/uncheck).' },
      note: { type: 'string', description: 'Evidence note recorded with the check (≤400 chars).' },
    },
    output: {
      schema: JSON_OUT,
      render: (_args, value) => {
        const v = value as { task?: { id?: string; version?: number }; checklist?: Array<Record<string, unknown>>; done?: number; total?: number }
        if (v.task === undefined || v.checklist === undefined) return [{ type: 'text', text: '清单操作失败。' }]
        const lines = v.checklist.map((i, index) => `${i.checked === true ? '☑' : '☐'} [${index + 1}] ${String(i.text)}${i.note !== undefined ? `（证据: ${String(i.note)}）` : ''} id=${String(i.id)}`)
        return [{
          type: 'text',
          text: `任务 ${v.task.id} 验收清单 ${v.done ?? 0}/${v.total ?? 0} 已完成，当前 v${v.task.version}：\n${lines.join('\n')}`,
        }]
      },
    },
    async execute(args: {
      id: string
      action: string
      ifVersion: number
      items?: string[]
      itemId?: string
      note?: string
    }, exec: unknown) {
      try {
        const { actor } = caller(exec as ToolRunContext)
        // R1: guards + the checklist edit itself run inside the mutation.
        let next: TaskRecord | undefined
        await store.mutate('task-updated', ledger => {
          const { index, task } = liveTaskAt(ledger, args.id)
          versionGuard(task, args.ifVersion)
          if (task.status === 'archived') throw new ToolError(ERR.invalidTransition, 'archived tasks are immutable')
          next = structuredClone(task)
          const checklist: ChecklistItem[] = next.checklist === undefined ? [] : [...next.checklist]

          if (args.action === 'add') {
            const texts = args.items ?? []
            if (texts.length === 0 || texts.length > 10) {
              throw new ToolError(ERR.invalidInput, 'items must carry 1..10 texts per add call')
            }
            if (checklist.length + texts.length > MAX_CHECKLIST_ITEMS) {
              throw new ToolError(ERR.invalidInput, `checklist may hold at most ${MAX_CHECKLIST_ITEMS} items (currently ${checklist.length})`)
            }
            checklist.push(...checklistFromTexts(texts))
          } else if (args.action === 'check') {
            if (args.itemId === undefined) throw new ToolError(ERR.invalidInput, 'itemId is required for check')
            const item = checklist.find(i => i.id === args.itemId)
            if (item === undefined) throw new ToolError(ERR.notFound, `no checklist item ${args.itemId} (task ${args.id})`)
            const note = args.note !== undefined && args.note.trim().length > 0 ? args.note.trim().slice(0, 400) : undefined
            item.checked = true
            item.checkedBy = actor.sessionId
            item.checkedAt = deps.now()
            if (note !== undefined) item.note = note
          } else if (args.action === 'uncheck') {
            if (args.itemId === undefined) throw new ToolError(ERR.invalidInput, 'itemId is required for uncheck')
            const item = checklist.find(i => i.id === args.itemId)
            if (item === undefined) throw new ToolError(ERR.notFound, `no checklist item ${args.itemId} (task ${args.id})`)
            item.checked = false
            delete item.checkedBy
            delete item.checkedAt
            delete item.note
          } else {
            throw new ToolError(ERR.invalidInput, `action must be add | check | uncheck (got "${args.action}")`)
          }

          if (checklist.length > 0) next.checklist = checklist
          else delete next.checklist
          next.version = task.version + 1
          next.updatedAt = deps.now()
          next.updatedBy = actor
          ledger.tasks[index] = next
          return [next]
        })
        const progress = next!.checklist !== undefined
          ? { done: next!.checklist.filter(i => i.checked).length, total: next!.checklist.length }
          : { done: 0, total: 0 }
        return json({ task: { id: next!.id, version: next!.version }, checklist: next!.checklist ?? [], ...progress })
      } catch (error) { fail(error) }
    },
  })) as () => void)

  // ------------------------------------------------------- execution report
  disposers.push(register(defineTool({
    name: 'taskboard_execution_report',
    description:
      'Submit the structured execution report for the task you are currently executing (summary / changed '
      + 'files / how you verified / artifacts / remaining risk). Submit BEFORE moving the task to in_review; '
      + 'a later submission overwrites the previous report. If your run already settled, you may back-submit '
      + 'onto your latest succeeded execution while you still hold the task. Commits and diffs are host-collected.',
    parameters: {
      summary: { type: 'string', required: true, description: 'What was done (1..2000 chars).' },
      changedFiles: {
        type: 'array',
        description: 'Files you changed (paths, ≤50 × 300 chars).',
        items: { type: 'string' },
      },
      checks: {
        type: 'array',
        description: 'How the work was verified (e.g. test commands + outcomes, ≤50 entries).',
        items: { type: 'string' },
      },
      artifacts: {
        type: 'array',
        description: 'Artifacts worth reviewing (build outputs, screenshots, docs, ≤30 entries).',
        items: { type: 'string' },
      },
      risk: { type: 'string', description: 'Known remaining risks or follow-ups (≤2000 chars, optional).' },
    },
    output: {
      schema: JSON_OUT,
      render: (_args, value) => {
        const v = value as { taskId?: string; executionId?: string; report?: { summary?: string } }
        if (v.taskId === undefined || v.report === undefined) return [{ type: 'text', text: '报告提交失败。' }]
        return [{
          type: 'text',
          text: `执行报告已记录到任务 ${v.taskId}（执行 ${v.executionId}）：${v.report.summary?.slice(0, 120) ?? ''}\n`
            + '接下来：taskboard_comment_add 留交接评论，然后 taskboard_move 移至待验收 in_review。',
        }]
      },
    },
    async execute(args: {
      summary: string
      changedFiles?: string[]
      checks?: string[]
      artifacts?: string[]
      risk?: string
    }, exec: unknown) {
      try {
        const { sessionId } = caller(exec as ToolRunContext)
        const report = normalizeExecutionReport(args)
        // Path 1 (unchanged): attach to the RUNNING execution this session
        // owns — reports ride the live run, so the agent never needs ids.
        let taskId: string | undefined
        let executionId: string | undefined
        await store.mutate('execution-recorded', ledger => {
          for (const task of ledger.tasks) {
            const execution = task.executions.find(e => e.sessionId === sessionId && e.outcome === 'running')
            if (execution !== undefined) {
              execution.report = report
              taskId = task.id
              executionId = execution.id
              return [task]
            }
          }
          return undefined
        })
        // Path 2 (review follow-up, P2): back-submit onto a session-owned
        // SETTLED execution — the main conversation claims tasks directly and
        // has no live run. Allowed when the session holds the task or owns
        // its latest successful execution; never touches anyone else's runs.
        if (taskId === undefined || executionId === undefined) {
          await store.mutate('execution-recorded', ledger => {
            for (const task of ledger.tasks) {
              if (task.trashedAt !== undefined || task.status === 'archived') continue
              const last = task.executions[task.executions.length - 1]
              const owned = last !== undefined && last.sessionId === sessionId && last.outcome === 'succeeded'
              const holds = task.claimedBy === sessionId && last !== undefined && last.sessionId === sessionId
              if (!owned && !holds) continue
              last!.report = report
              taskId = task.id
              executionId = last!.id
              return [task]
            }
            return undefined
          })
        }
        if (taskId === undefined || executionId === undefined) {
          throw new ToolError(ERR.forbidden, 'no running execution and no settled execution of yours to report on — reports attach to your running execution, or back-submit onto your latest succeeded one while you hold the task')
        }
        return json({ taskId, executionId, report })
      } catch (error) { fail(error) }
    },
  })) as () => void)

  return disposers
}

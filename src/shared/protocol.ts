/**
 * Task domain model, state machine, urgency classes, and cron math — the
 * framework-free core shared verbatim by the host half (tools, store, routes,
 * scheduler) and, from P2 on, the browser half (board view).
 *
 * Everything here is a pure function over plain data: no imports beyond the
 * standard library, no I/O, no globals. Tests drive it directly.
 *
 * @module dsh-taskboard/shared/protocol
 */

// ---------------------------------------------------------------------------
// Status vocabulary
// ---------------------------------------------------------------------------

/**
 * Task lifecycle states. Main board columns render `backlog → todo →
 * in_progress → in_review → done`; `canceled` and `archived` are secondary
 * states collected under an "other tasks" tab. `blocked` is NOT a status —
 * it is a horizontal marker any non-terminal state may carry.
 */
export type TaskStatus =
  | 'backlog'
  | 'todo'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'canceled'
  | 'archived'

/** Statuses shown as the five main board columns, in order. */
export const MAIN_STATUSES: readonly TaskStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'done',
]

/** Statuses collected under the secondary tab. */
export const SECONDARY_STATUSES: readonly TaskStatus[] = ['canceled', 'archived']

/** Every valid status, main first. */
export const ALL_STATUSES: readonly TaskStatus[] = [...MAIN_STATUSES, ...SECONDARY_STATUSES]

/**
 * Legal forward/sideways transitions. Anything not listed is rejected with
 * `invalid_transition`. `archived` is terminal.
 */
const TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  backlog: ['todo', 'canceled'],
  todo: ['in_progress', 'backlog', 'canceled'],
  in_progress: ['in_review', 'todo', 'canceled'],
  in_review: ['in_progress', 'todo', 'done', 'canceled'],
  done: ['archived'],
  canceled: ['archived', 'todo'],
  archived: [],
}

/**
 * Whether a status move is legal per the state machine.
 * @param from - current status.
 * @param to - requested status.
 * @returns true when the transition is allowed.
 */
export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/**
 * The claim move: the one transition that transfers ownership of a task to
 * the calling session. Guarded by the project (workspace) boundary in the
 * tool layer.
 */
export function isClaim(from: TaskStatus, to: TaskStatus): boolean {
  return from === 'todo' && to === 'in_progress'
}

/** Statuses a `done` move may depart from (user confirmation only). */
export function canCompleteFrom(from: TaskStatus): boolean {
  return from === 'in_review'
}

// ---------------------------------------------------------------------------
// Urgency
// ---------------------------------------------------------------------------

/** Urgency classes with fixed UI colors. */
export type Urgency = 'urgent' | 'normal' | 'relaxed'

/** All valid urgency values. */
export const URGENCIES: readonly Urgency[] = ['urgent', 'normal', 'relaxed']

/** CSS color token per urgency: red / purple / blue. */
export const URGENCY_COLOR: Readonly<Record<Urgency, string>> = {
  urgent: '#e5484d',
  normal: '#8e4ec6',
  relaxed: '#3e63dd',
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Per-task code isolation mode (0.3.0).
 * - `worktree`: each execution runs in a fresh `git worktree` on a dedicated
 *   task branch (`task/<标题>+<taskId>`) under `<workspace>/.dsh-worktrees/`.
 * - `none`: run in the workspace directory as before, zero git interaction.
 * Omitted = {@link DEFAULT_ISOLATION}; since 0.5.0 creation materializes the
 * board default onto the record (看板设置 → 执行隔离), and non-git projects
 * still auto-degrade at run time (the execution record carries an
 * `isolationNote` explaining why).
 */
export type IsolationMode = 'worktree' | 'none'

/**
 * Factory-default isolation (0.5.0): 原目录执行. Applies when neither the
 * task record nor the board setting (`BoardSettings.defaultIsolation`)
 * says otherwise. Before 0.5.0 the implicit default was 'worktree'.
 */
export const DEFAULT_ISOLATION: IsolationMode = 'none'

/** Validate an isolation value. */
export function asIsolation(raw: string): IsolationMode {
  if (raw !== 'worktree' && raw !== 'none') {
    throw new Error("isolation must be 'worktree' or 'none'")
  }
  return raw
}

/** Resolve a task's effective isolation (omitted → the factory default). */
export function effectiveIsolation(task: Pick<TaskRecord, 'isolation'>): IsolationMode {
  return task.isolation === undefined ? DEFAULT_ISOLATION : task.isolation
}

/**
 * Board-level settings persisted with the ledger (0.5.0). Only fields the
 * user explicitly set are present; absent fields follow factory defaults.
 */
export type BoardSettings = {
  /** Default code isolation applied when a NEW task is created without an explicit choice. */
  defaultIsolation?: IsolationMode
}

/** Validate raw input into sanitized {@link BoardSettings} (unknown fields dropped). */
export function asBoardSettings(raw: unknown): BoardSettings {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('board settings must be an object')
  }
  const e = raw as Record<string, unknown>
  const out: BoardSettings = {}
  if (e.defaultIsolation !== undefined) {
    if (typeof e.defaultIsolation !== 'string') {
      throw new Error("defaultIsolation must be 'worktree' or 'none'")
    }
    out.defaultIsolation = asIsolation(e.defaultIsolation)
  }
  return out
}

/** The effective default isolation for NEW tasks (board setting → factory default). */
export function defaultIsolationOf(settings?: BoardSettings): IsolationMode {
  return settings?.defaultIsolation ?? DEFAULT_ISOLATION
}

/** How a task may run. */
export type ExecutionMode = 'claim' | 'scheduled'

/**
 * Per-task execution configuration. `claim` tasks wait for an in-project
 * session to claim them; `scheduled` tasks run on the host cron scheduler.
 */
export interface ExecutionConfig {
  mode: ExecutionMode
  /** Five-field cron expression (minute hour day month weekday); required for `scheduled`. */
  cron?: string
  /** Next due time (epoch ms); maintained by the host scheduler. */
  nextRunAt?: number
  /** Last time the scheduler triggered this task (epoch ms). */
  lastTriggeredAt?: number
}

/**
 * Parse a five-field cron expression. Supported field syntax: star, star/step
 * (`* / n` without spaces), a single number, an `a-b` range, and comma lists
 * of those. Day-of-week accepts both 0 and 7 as Sunday (normalized to 0).
 *
 * @param expr - the expression to parse.
 * @returns the match sets per field, or null when invalid.
 */
export function parseCron(expr: string): CronMatch | null {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) return null
  const ranges: ReadonlyArray<readonly [number, number]> = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ]
  const sets: Array<Set<number>> = []
  for (let i = 0; i < 5; i++) {
    const [min, max] = ranges[i]!
    const set = new Set<number>()
    if (!parseCronField(fields[i]!, min, max, set)) return null
    sets.push(set)
  }
  const weekdays = new Set<number>()
  for (const day of sets[4]!) weekdays.add(day === 7 ? 0 : day)
  return { minutes: sets[0]!, hours: sets[1]!, days: sets[2]!, months: sets[3]!, weekdays }
}

/** Parsed cron field match sets. */
export type CronMatch = {
  minutes: ReadonlySet<number>
  hours: ReadonlySet<number>
  days: ReadonlySet<number>
  months: ReadonlySet<number>
  weekdays: ReadonlySet<number>
}

/** Parse one cron field into a match set; false on any syntax error. */
function parseCronField(field: string, min: number, max: number, out: Set<number>): boolean {
  for (const part of field.split(',')) {
    const [range, stepRaw] = part.split('/')
    const step = stepRaw === undefined ? 1 : Number.parseInt(stepRaw, 10)
    if (!Number.isInteger(step) || step < 1) return false
    let lo: number
    let hi: number
    if (range === undefined || range === '') return false
    if (range === '*') {
      lo = min
      hi = max
    } else if (range.includes('-')) {
      const [a, b] = range.split('-')
      lo = Number.parseInt(a ?? '', 10)
      hi = Number.parseInt(b ?? '', 10)
      if (!Number.isInteger(lo) || !Number.isInteger(hi)) return false
    } else {
      lo = Number.parseInt(range, 10)
      if (!Number.isInteger(lo)) return false
      hi = stepRaw === undefined ? lo : max
    }
    if (lo < min || hi > max || lo > hi) return false
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out.size > 0
}

/**
 * The next time at or after `from` matching the cron sets (local time),
 * or null when no match exists within four years (e.g. Feb 30).
 * @param match - parsed cron sets.
 * @param from - epoch ms start point (inclusive match candidate).
 * @returns the next match's epoch ms, or null.
 */
export function nextCronTime(match: CronMatch, from: number): number | null {
  // Walk minute by minute from the next whole minute, capped at ~4 years.
  const start = new Date(from)
  start.setSeconds(0, 0)
  start.setMinutes(start.getMinutes() + 1)
  const cap = from + 4 * 366 * 24 * 60 * 60 * 1000
  let t = start.getTime()
  while (t <= cap) {
    const d = new Date(t)
    if (
      match.months.has(d.getMonth() + 1)
      && match.days.has(d.getDate())
      && match.weekdays.has(d.getDay())
      && match.hours.has(d.getHours())
      && match.minutes.has(d.getMinutes())
    ) {
      return t
    }
    t += 60_000
  }
  return null
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/** Who performed a write. */
export type Actor =
  | { kind: 'user' }
  | { kind: 'agent'; sessionId: string }
  | { kind: 'system' }

/** A progress/report comment on a task. */
export type CommentRecord = {
  id: string
  /** Comment body (plain text; UI renders as pre-wrapped). */
  body: string
  /** Optimistic-concurrency version of this comment. */
  version: number
  createdAt: number
  /** The session that wrote this comment; absent for user-written ones. */
  threadId?: string
}

/** One commit produced by an isolated execution (hash + subject). */
export type CommitInfo = { hash: string; subject: string }

/**
 * The structured execution report an agent submits at handoff (0.4.0).
 * Commits/dirty/diff facts are host-collected git evidence — the report
 * covers the BUSINESS side the host cannot see.
 */
export type ExecutionReport = {
  /** What was done (1..2000 chars, required). */
  summary: string
  /** Files the agent changed (paths, ≤50 × 300 chars). */
  changedFiles: string[]
  /** How the work was self-verified (≤50 × 300 chars). */
  checks: string[]
  /** Produced artifacts worth reviewing (≤30 × 300 chars). */
  artifacts: string[]
  /** Known remaining risks / follow-ups (≤2000 chars, '' allowed). */
  risk: string
}

/** One Definition-of-Done checklist item (0.4.0). */
export type ChecklistItem = {
  id: string
  /** What must be true for acceptance (1..200 chars). */
  text: string
  checked: boolean
  /** Who checked it: an agent session id, or 'user' for GUI toggles. */
  checkedBy?: string
  /** When it was checked (epoch ms). */
  checkedAt?: number
  /** Evidence note attached when checking (≤400 chars). */
  note?: string
}

/** One execution attempt of a task. */
export type ExecutionRecord = {
  id: string
  /** The session this execution ran in; set once the session is really started. */
  sessionId?: string
  /** Trigger: manual button or the host scheduler. */
  trigger: 'manual' | 'scheduled'
  startedAt?: number
  endedAt?: number
  outcome: 'running' | 'succeeded' | 'failed' | 'cancelled'
  error?: string
  /** Code isolation actually used (`none` also covers degraded worktree runs). */
  isolation?: IsolationMode
  /** Why worktree isolation degraded to running in the original directory. */
  isolationNote?: string
  /** The task branch this execution worked on (worktree runs only). */
  branch?: string
  /** Absolute path of the dedicated worktree (worktree runs only). */
  worktreePath?: string
  /** HEAD of the task branch before the execution started. */
  baseCommit?: string
  /** HEAD at settlement. */
  headCommit?: string
  /** Commits between baseCommit and headCommit (hash + subject; capped at 50, newest first). */
  commits?: CommitInfo[]
  /** Total commits before the evidence cap (equals commits.length when under it). */
  commitsTotal?: number
  /** Uncommitted changes present at settlement (`git status --porcelain` lines; capped at 100). */
  dirtyFiles?: string[]
  /** Total uncommitted lines before the evidence cap. */
  dirtyFilesTotal?: number
  /** Aggregate diff stat between baseCommit and headCommit. */
  diffStat?: string
  /** How many files differ between baseCommit and headCommit. */
  changedFiles?: number
  /** The agent's structured report, submitted via taskboard_execution_report. */
  report?: ExecutionReport
}

/** The per-model override a task may carry; absent = session default model. */
export type TaskModel = {
  provider: string
  model: string
  /** Thinking intensity / reasoning effort (optional; e.g. 'low', 'medium', 'high', 'none'). */
  reasoningEffort?: string
}

/** One task on the board. */
export type TaskRecord = {
  id: string
  title: string
  description: string
  /** Extra execution prompt; the execution session receives title+description+prompt. */
  prompt: string
  /** Owning project: a DSH workspace id. */
  workspaceId: string
  urgency: Urgency
  status: TaskStatus
  /** Horizontal marker: work cannot continue right now (any non-terminal status). */
  blocked: boolean
  execution: ExecutionConfig
  model?: TaskModel
  /** Code isolation for executions (omitted = the worktree default; see {@link IsolationMode}). */
  isolation?: IsolationMode
  /**
   * The agent preset execution sessions are composed from (omitted = the
   * deployment default preset). Recorded on the session header and mounted
   * via the presets service at creation — this is what hands the session its
   * tool set. Editable any time (each run composes fresh).
   */
  presetId?: string
  /**
   * Definition-of-Done acceptance checklist (0.4.0). Agents may append items
   * and check/uncheck them (with evidence); the GUI may edit the whole list.
   * Unchecked items highlight at review time; done stays user-only.
   */
  checklist?: ChecklistItem[]
  /**
   * The task branch fixed at the FIRST worktree creation (`task/<标题>+<taskId>`).
   * Renaming the task afterwards never changes it (history preservation).
   */
  branch?: string
  /**
   * The session currently holding the in-progress claim (explicit claim or a
   * live execution). Present only while `status === 'in_progress'`: any move
   * out of in_progress releases it. `updatedBy` is audit-only — user edits no
   * longer erase the holder.
   */
  claimedBy?: string
  /** When the current holder claimed the task (epoch ms). */
  claimedAt?: number
  version: number
  createdAt: number
  updatedAt: number
  createdBy: Actor
  updatedBy: Actor
  comments: CommentRecord[]
  executions: ExecutionRecord[]
  /** How many older execution records were pruned by the retention cap. */
  executionsPruned?: number
  /** Soft-delete marker set by agent `taskboard_delete`; user confirms the purge. */
  trashedAt?: number
}

/** Retention cap: how many execution records each task keeps (oldest pruned). */
export const MAX_EXECUTIONS = 20

/**
 * Enforce the execution-record retention cap on one task (in place): keep the
 * newest {@link MAX_EXECUTIONS} records, count the dropped ones in
 * `executionsPruned`. Running records are always the newest, never dropped.
 * @param task - the task to prune.
 */
export function pruneExecutions(task: TaskRecord): void {
  if (task.executions.length <= MAX_EXECUTIONS) return
  const dropped = task.executions.length - MAX_EXECUTIONS
  task.executions = task.executions.slice(-MAX_EXECUTIONS)
  task.executionsPruned = (task.executionsPruned ?? 0) + dropped
}

/** The whole durable ledger. */
export type TaskLedger = {
  schemaVersion: number
  /** Global monotonic revision; every mutation bumps it. */
  revision: number
  tasks: TaskRecord[]
  /** Board-level settings (0.5.0); absent on ledgers never touched by 设置. */
  settings?: BoardSettings
}

/** Current ledger format version. */
export const LEDGER_SCHEMA_VERSION = 1

/** An empty ledger. */
export function emptyLedger(): TaskLedger {
  return { schemaVersion: LEDGER_SCHEMA_VERSION, revision: 0, tasks: [] }
}

// ---------------------------------------------------------------------------
// ids
// ---------------------------------------------------------------------------

/** Random base36 suffix. */
function suffix(): string {
  return Math.random().toString(36).slice(2, 8)
}

/**
 * Legal task id charset (R4): `t-<base36>-<base36>` from {@link newTaskId},
 * and the ONLY shape accepted from the outside (import) or used to build
 * filesystem paths (worktree dirs). Ids ride into `join(ws, '.dsh-worktrees',
 * id)` — a lax charset here is an arbitrary-directory delete primitive.
 */
export function isValidTaskId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(id)
}

/** Mint a task id. */
export function newTaskId(): string {
  return `t-${Date.now().toString(36)}-${suffix()}`
}

/** Mint a comment id. */
export function newCommentId(): string {
  return `c-${Date.now().toString(36)}-${suffix()}`
}

/** Mint a checklist item id. */
export function newChecklistItemId(): string {
  return `k-${Date.now().toString(36)}-${suffix()}`
}

/** Mint an execution id. */
export function newExecutionId(): string {
  return `e-${Date.now().toString(36)}-${suffix()}`
}

// ---------------------------------------------------------------------------
// validation helpers (input shaping for tools and routes)
// ---------------------------------------------------------------------------

/**
 * Validate and normalize a title: trimmed, 1..200 chars.
 * @param raw - the raw input.
 * @returns the normalized title.
 * @throws when empty or too long.
 */
export function normalizeTitle(raw: string): string {
  const t = raw.trim()
  if (t.length === 0 || t.length > 200) {
    throw new Error('title must be 1..200 characters')
  }
  return t
}

/**
 * Validate a task prompt: trimmed, at most 8000 chars; empty becomes ''.
 * @param raw - the raw input.
 */
export function normalizePrompt(raw: string | undefined): string {
  const t = (raw ?? '').trim()
  if (t.length > 8000) throw new Error('prompt must be at most 8000 characters')
  return t
}

/**
 * Validate and normalize a comment body: trimmed, 1..4000 chars.
 * @param raw - the raw input.
 */
export function normalizeBody(raw: string): string {
  const t = raw.trim()
  if (t.length === 0 || t.length > 4000) {
    throw new Error('comment body must be 1..4000 characters')
  }
  return t
}

/**
 * Validate an urgency value.
 * @param raw - the raw input.
 */
export function asUrgency(raw: string): Urgency {
  if (!URGENCIES.includes(raw as Urgency)) {
    throw new Error(`urgency must be one of: ${URGENCIES.join(', ')}`)
  }
  return raw as Urgency
}

/**
 * Validate a status value.
 * @param raw - the raw input.
 */
export function asStatus(raw: string): TaskStatus {
  if (!ALL_STATUSES.includes(raw as TaskStatus)) {
    throw new Error(`status must be one of: ${ALL_STATUSES.join(', ')}`)
  }
  return raw as TaskStatus
}

/**
 * Validate an execution config request from raw tool/route input.
 * `scheduled` requires a valid cron; computes the first `nextRunAt` from
 * `now`.
 * @param raw - raw execution input ({@link ExecutionConfig} fields, untyped).
 * @param now - current epoch ms.
 * @returns the normalized config.
 */
export function normalizeExecution(
  raw: { mode?: string; cron?: string },
  now: number,
): ExecutionConfig {
  const mode = raw.mode ?? 'claim'
  if (mode !== 'claim' && mode !== 'scheduled') {
    throw new Error("execution.mode must be 'claim' or 'scheduled'")
  }
  if (mode === 'claim') return { mode }
  const cron = (raw.cron ?? '').trim()
  const match = parseCron(cron)
  if (match === null) throw new Error('execution.cron is not a valid 5-field cron expression')
  const next = nextCronTime(match, now)
  if (next === null) throw new Error('execution.cron never matches within 4 years')
  return { mode, cron, nextRunAt: next }
}

/**
 * The effective prompt of a task: title+description, with the explicit
 * prompt appended when set — title+description+prompt.
 * @param task - the task.
 */
export function effectivePrompt(task: TaskRecord): string {
  const head = task.title
  const body = task.description.length > 0 ? `${head}\n\n${task.description}` : head
  return task.prompt.length > 0 ? `${body}\n\n${task.prompt}` : body
}

/**
 * Whether the task is currently claimed by a session (running state).
 * @param task - the task.
 */
export function isClaimedBy(task: TaskRecord): string | undefined {
  return task.status === 'in_progress' && task.claimedBy !== undefined ? task.claimedBy : undefined
}

/**
 * Maintain the explicit claim fields around a status change: entering
 * in_progress under a session records the holder (an execution-start or an
 * agent claim); every move out of in_progress releases the claim (handoff,
 * give-back, cancel). A user-driven move into in_progress records no holder —
 * no session works on it yet.
 * @param task - the task being written (mutated in place).
 * @param to - the target status.
 * @param now - current epoch ms.
 * @param holder - the session id claiming the task, when applicable.
 */
export function syncClaim(task: TaskRecord, to: TaskStatus, now: number, holder?: string): void {
  if (to !== 'in_progress') {
    delete task.claimedBy
    delete task.claimedAt
  } else if (holder !== undefined) {
    task.claimedBy = holder
    task.claimedAt = now
  }
}

/**
 * Validate and normalize a pinned model: `{ provider, model, reasoningEffort? }`,
 * provider and model must be non-empty trimmed strings.
 * @param raw - the raw input.
 * @returns the normalized model.
 * @throws when the shape or the fields are invalid.
 */
export function normalizeModel(raw: unknown): TaskModel {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('model must be { provider: string, model: string }')
  }
  const { provider, model, reasoningEffort } = raw as { provider?: unknown; model?: unknown; reasoningEffort?: unknown }
  if (typeof provider !== 'string' || typeof model !== 'string') {
    throw new Error('model must be { provider: string, model: string }')
  }
  const p = provider.trim()
  const m = model.trim()
  if (p.length === 0 || m.length === 0) {
    throw new Error('model.provider and model.model must be non-empty strings')
  }
  const eff = typeof reasoningEffort === 'string' && reasoningEffort.trim().length > 0 ? reasoningEffort.trim() : undefined
  return { provider: p, model: m, ...(eff !== undefined ? { reasoningEffort: eff } : {}) }
}

// ---------------------------------------------------------------------------
// checklist + report validation (0.4.0)
// ---------------------------------------------------------------------------

/** Checklist size cap per task. */
export const MAX_CHECKLIST_ITEMS = 30

/** Checklist item text cap (chars). */
export const MAX_CHECKLIST_TEXT = 200

/**
 * Validate and normalize one checklist text line: trimmed, 1..200 chars.
 * @param raw - the raw text.
 * @throws when empty or too long.
 */
export function normalizeChecklistText(raw: string): string {
  const t = raw.trim()
  if (t.length === 0 || t.length > MAX_CHECKLIST_TEXT) {
    throw new Error(`checklist item text must be 1..${MAX_CHECKLIST_TEXT} characters`)
  }
  return t
}

/**
 * Build a fresh unchecked checklist from plain text lines (create route /
 * templates / tool adds).
 * @param texts - the item texts (validated individually).
 */
export function checklistFromTexts(texts: readonly string[]): ChecklistItem[] {
  const items = texts.map(text => ({ id: newChecklistItemId(), text: normalizeChecklistText(text), checked: false }))
  if (items.length > MAX_CHECKLIST_ITEMS) {
    throw new Error(`checklist may hold at most ${MAX_CHECKLIST_ITEMS} items`)
  }
  return items
}

/**
 * Validate and normalize a full checklist array (GUI update route, import):
 * missing ids are minted, text is checked, checked flags must be booleans,
 * checkedBy/checkedAt are kept only on checked items.
 * @param raw - untyped array from the wire.
 * @throws with a readable reason on any invalid entry.
 */
export function normalizeChecklist(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) throw new Error('checklist must be an array')
  if (raw.length > MAX_CHECKLIST_ITEMS) {
    throw new Error(`checklist may hold at most ${MAX_CHECKLIST_ITEMS} items`)
  }
  return raw.map((entry): ChecklistItem => {
    if (typeof entry !== 'object' || entry === null) throw new Error('checklist item must be an object')
    const e = entry as Record<string, unknown>
    const text = normalizeChecklistText(typeof e.text === 'string' ? e.text : '')
    const id = typeof e.id === 'string' && e.id.trim().length > 0 ? e.id.trim() : newChecklistItemId()
    const checked = e.checked === true
    const checkedBy = typeof e.checkedBy === 'string' ? e.checkedBy.trim().slice(0, 100) : undefined
    const checkedAt = typeof e.checkedAt === 'number' && Number.isFinite(e.checkedAt) ? e.checkedAt : undefined
    const note = typeof e.note === 'string' && e.note.trim().length > 0 ? e.note.trim().slice(0, 400) : undefined
    if (!checked) return { id, text, checked: false }
    return {
      id,
      text,
      checked: true,
      ...(checkedBy !== undefined && checkedBy.length > 0 ? { checkedBy } : {}),
      ...(checkedAt !== undefined ? { checkedAt } : {}),
      ...(note !== undefined ? { note } : {}),
    }
  })
}

/** Checklist progress: how many items are checked (absent checklist → 0/0). */
export function checklistProgress(task: Pick<TaskRecord, 'checklist'>): { done: number; total: number } {
  const items = task.checklist ?? []
  return { done: items.filter(i => i.checked).length, total: items.length }
}

/** Report string-list caps. */
const REPORT_LIST_CAPS = { changedFiles: 50, checks: 50, artifacts: 30 } as const

/** Per-entry cap for report lists (chars). */
const REPORT_ENTRY_MAX = 300

/** Validate one report string list: strings trimmed 1..300 chars. */
function normalizeReportList(raw: unknown, field: keyof typeof REPORT_LIST_CAPS): string[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new Error(`report.${field} must be an array of strings`)
  const out = raw.map(entry => {
    if (typeof entry !== 'string') throw new Error(`report.${field} must be an array of strings`)
    const t = entry.trim()
    if (t.length === 0 || t.length > REPORT_ENTRY_MAX) {
      throw new Error(`report.${field} entries must be 1..${REPORT_ENTRY_MAX} characters`)
    }
    return t
  })
  if (out.length > REPORT_LIST_CAPS[field]) {
    throw new Error(`report.${field} may hold at most ${REPORT_LIST_CAPS[field]} entries`)
  }
  return out
}

/**
 * Validate and normalize a structured execution report.
 * @param raw - untyped tool/route input.
 * @throws with a readable reason on any invalid field.
 */
export function normalizeExecutionReport(raw: unknown): ExecutionReport {
  if (typeof raw !== 'object' || raw === null) throw new Error('report must be an object')
  const e = raw as Record<string, unknown>
  const summary = typeof e.summary === 'string' ? e.summary.trim() : ''
  if (summary.length === 0 || summary.length > 2000) {
    throw new Error('report.summary must be 1..2000 characters')
  }
  const risk = typeof e.risk === 'string' ? e.risk.trim().slice(0, 2000) : ''
  return {
    summary,
    changedFiles: normalizeReportList(e.changedFiles, 'changedFiles'),
    checks: normalizeReportList(e.checks, 'checks'),
    artifacts: normalizeReportList(e.artifacts, 'artifacts'),
    risk,
  }
}

// ---------------------------------------------------------------------------
// ledger import validation (0.4.0)
// ---------------------------------------------------------------------------

/** Result classifying every task in an import file against the live ledger. */
export type ImportPlan = {
  /** Structurally valid tasks whose ids are new (merge adds them). */
  create: TaskRecord[]
  /** Structurally valid tasks whose ids already exist (merge replaces them). */
  overwrite: TaskRecord[]
  /** Invalid entries with a human-readable reason (never imported). */
  invalid: Array<{ id?: string; reason: string }>
  /** The file's board settings (0.5.0); replace-mode swaps them, merge keeps the live ones. */
  settings?: BoardSettings
}

/** One unknown-value read helper: string fields with defaults. */
function strOr(raw: Record<string, unknown>, key: string, fallback: string): string {
  const v = raw[key]
  return typeof v === 'string' ? v : fallback
}

/** One unknown-value read helper: finite numbers with defaults. */
function numOr(raw: Record<string, unknown>, key: string, fallback: number): number {
  const v = raw[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

/**
 * Validate ONE imported task record (pure): rebuilds it field by field with
 * the normal validators, minting missing ids and re-arming cron. Executions
 * left `running` by the exporting machine are marked failed — their
 * settlement watchers died there and can never settle here.
 * @param raw - the untyped record.
 * @param now - current epoch ms (defaults for timestamps).
 * @returns the rebuilt record, or a rejection reason.
 */
export function validateImportedTask(raw: unknown, now: number): { ok: true; task: TaskRecord } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'not an object' }
  const e = raw as Record<string, unknown>
  const id = typeof e.id === 'string' ? e.id.trim() : ''
  const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason })
  // R4①: length alone let traversal-shaped ids (`../../x`, `..\..\x`) into
  // the ledger; the charset gate is the primary defense for every downstream
  // filesystem use of a task id.
  if (!isValidTaskId(id)) return fail('missing/invalid id (must match ^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$)')
  try {
    const execution = normalizeExecution(
      typeof e.execution === 'object' && e.execution !== null ? e.execution as { mode?: string; cron?: string } : {},
      now,
    )
    const comments: CommentRecord[] = []
    if (Array.isArray(e.comments)) {
      for (const c of e.comments) {
        if (typeof c !== 'object' || c === null) return fail('invalid comment entry')
        const ce = c as Record<string, unknown>
        const body = typeof ce.body === 'string' ? ce.body : ''
        if (body.trim().length === 0 || body.length > 4000) return fail('invalid comment body')
        comments.push({
          id: typeof ce.id === 'string' && ce.id.length > 0 ? ce.id : newCommentId(),
          body,
          version: numOr(ce, 'version', 1),
          createdAt: numOr(ce, 'createdAt', now),
          ...(typeof ce.threadId === 'string' ? { threadId: ce.threadId } : {}),
        })
      }
    } else return fail('comments must be an array')
    const executions: ExecutionRecord[] = []
    if (Array.isArray(e.executions)) {
      for (const x of e.executions) {
        if (typeof x !== 'object' || x === null) return fail('invalid execution entry')
        const xe = x as Record<string, unknown>
        const trigger = xe.trigger === 'scheduled' ? 'scheduled' : 'manual'
        const outcomeRaw = xe.outcome
        if (outcomeRaw !== 'running' && outcomeRaw !== 'succeeded' && outcomeRaw !== 'failed' && outcomeRaw !== 'cancelled') {
          return fail('invalid execution outcome')
        }
        // A running execution from the exporting machine can never settle
        // here — import it as failed with the reason recorded.
        const outcome = outcomeRaw === 'running' ? 'failed' as const : outcomeRaw
        executions.push({
          id: typeof xe.id === 'string' && xe.id.length > 0 ? xe.id : newExecutionId(),
          ...(typeof xe.sessionId === 'string' ? { sessionId: xe.sessionId } : {}),
          trigger,
          ...(typeof xe.startedAt === 'number' ? { startedAt: xe.startedAt } : {}),
          ...(typeof xe.endedAt === 'number' ? { endedAt: xe.endedAt } : {}),
          outcome,
          ...(outcomeRaw === 'running' ? { error: 'imported while still running (settlement watcher died with the exporting host)' } : (typeof xe.error === 'string' ? { error: xe.error } : {})),
          ...(typeof xe.isolation === 'string' && (xe.isolation === 'worktree' || xe.isolation === 'none') ? { isolation: xe.isolation } : {}),
          ...(typeof xe.isolationNote === 'string' ? { isolationNote: xe.isolationNote } : {}),
          ...(typeof xe.branch === 'string' ? { branch: xe.branch } : {}),
          ...(typeof xe.worktreePath === 'string' ? { worktreePath: xe.worktreePath } : {}),
          ...(typeof xe.baseCommit === 'string' ? { baseCommit: xe.baseCommit } : {}),
          ...(typeof xe.headCommit === 'string' ? { headCommit: xe.headCommit } : {}),
          ...(Array.isArray(xe.commits) ? { commits: xe.commits.filter((c): c is CommitInfo =>
            typeof c === 'object' && c !== null && typeof (c as CommitInfo).hash === 'string' && typeof (c as CommitInfo).subject === 'string') } : {}),
          ...(typeof xe.commitsTotal === 'number' ? { commitsTotal: xe.commitsTotal } : {}),
          ...(Array.isArray(xe.dirtyFiles) ? { dirtyFiles: xe.dirtyFiles.filter((l): l is string => typeof l === 'string') } : {}),
          ...(typeof xe.dirtyFilesTotal === 'number' ? { dirtyFilesTotal: xe.dirtyFilesTotal } : {}),
          ...(typeof xe.diffStat === 'string' ? { diffStat: xe.diffStat } : {}),
          ...(typeof xe.changedFiles === 'number' ? { changedFiles: xe.changedFiles } : {}),
          ...(typeof xe.report === 'object' && xe.report !== null ? { report: normalizeExecutionReport(xe.report) } : {}),
        })
      }
    } else return fail('executions must be an array')
    const status = asStatus(strOr(e, 'status', 'todo'))
    const actorOf = (v: unknown): Actor => (typeof v === 'object' && v !== null && (v as Actor).kind === 'agent' && typeof (v as { sessionId?: unknown }).sessionId === 'string'
      ? { kind: 'agent', sessionId: (v as { sessionId: string }).sessionId }
      : { kind: 'user' })
    const task: TaskRecord = {
      id,
      title: normalizeTitle(strOr(e, 'title', '')),
      description: strOr(e, 'description', '').trim(),
      prompt: normalizePrompt(strOr(e, 'prompt', '')),
      workspaceId: strOr(e, 'workspaceId', ''),
      urgency: asUrgency(strOr(e, 'urgency', 'normal')),
      status,
      blocked: e.blocked === true,
      execution,
      ...(typeof e.model === 'object' && e.model !== null ? { model: normalizeModel(e.model) } : {}),
      ...(typeof e.isolation === 'string' && (e.isolation === 'worktree' || e.isolation === 'none') ? { isolation: e.isolation } : {}),
      ...(typeof e.presetId === 'string' && e.presetId.trim().length > 0 ? { presetId: e.presetId.trim() } : {}),
      ...(Array.isArray(e.checklist) ? { checklist: normalizeChecklist(e.checklist) } : {}),
      ...(typeof e.branch === 'string' ? { branch: e.branch } : {}),
      ...(status === 'in_progress' && typeof e.claimedBy === 'string' ? { claimedBy: e.claimedBy } : {}),
      ...(status === 'in_progress' && typeof e.claimedAt === 'number' ? { claimedAt: e.claimedAt } : {}),
      version: Math.max(1, Math.trunc(numOr(e, 'version', 1))),
      createdAt: numOr(e, 'createdAt', now),
      updatedAt: numOr(e, 'updatedAt', now),
      createdBy: actorOf(e.createdBy),
      updatedBy: actorOf(e.updatedBy),
      comments,
      executions,
      ...(typeof e.executionsPruned === 'number' ? { executionsPruned: e.executionsPruned } : {}),
      ...(typeof e.trashedAt === 'number' ? { trashedAt: e.trashedAt } : {}),
    }
    if (task.workspaceId.length === 0) return fail('missing workspaceId')
    return { ok: true, task }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
}

/**
 * Minimal structural check for ONE ledger record at load time (S11): unlike
 * {@link validateImportedTask} this REBUILDS NOTHING (cron state, ids and
 * timestamps must survive a load untouched) — it only rejects entries whose
 * shape would break downstream consumers, including the R4 id charset.
 * @param raw - the untyped record.
 */
export function isPlausibleTaskRecord(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false
  const t = raw as Record<string, unknown>
  return typeof t.id === 'string' && isValidTaskId(t.id)
    && typeof t.title === 'string' && t.title.length > 0
    && typeof t.workspaceId === 'string' && t.workspaceId.length > 0
    && ALL_STATUSES.includes(t.status as TaskStatus)
    && typeof t.version === 'number' && Number.isFinite(t.version) && t.version >= 1
    && Array.isArray(t.comments) && Array.isArray(t.executions)
    && typeof t.execution === 'object' && t.execution !== null
    && (t.execution as { mode?: unknown }).mode !== undefined
}

/**
 * Validate a whole imported ledger and classify its tasks against the live
 * one (pure). Duplicate ids INSIDE the file are invalid (first wins, later
 * copies reported); schemaVersion must match {@link LEDGER_SCHEMA_VERSION}.
 * @param raw - the parsed import file.
 * @param knownIds - live ledger task ids.
 * @param now - current epoch ms.
 * @throws when the file is not a ledger or the schemaVersion is unsupported.
 */
export function validateLedgerImport(raw: unknown, knownIds: ReadonlySet<string>, now: number): ImportPlan {
  if (typeof raw !== 'object' || raw === null) throw new Error('导入文件不是 JSON 对象')
  const e = raw as Record<string, unknown>
  if (e.schemaVersion !== LEDGER_SCHEMA_VERSION) {
    throw new Error(`不支持的 schemaVersion ${String(e.schemaVersion)}（当前支持 ${LEDGER_SCHEMA_VERSION}）`)
  }
  if (!Array.isArray(e.tasks)) throw new Error('导入文件的 tasks 不是数组')
  const plan: ImportPlan = { create: [], overwrite: [], invalid: [], ...(e.settings !== undefined ? { settings: asBoardSettings(e.settings) } : {}) }
  const seen = new Set<string>()
  for (const entry of e.tasks) {
    const id = typeof (entry as { id?: unknown })?.id === 'string' ? (entry as { id: string }).id : undefined
    const result = validateImportedTask(entry, now)
    if (!result.ok) {
      plan.invalid.push({ ...(id !== undefined ? { id } : {}), reason: result.reason })
      continue
    }
    if (seen.has(result.task.id)) {
      plan.invalid.push({ id: result.task.id, reason: '文件内重复 id' })
      continue
    }
    seen.add(result.task.id)
    if (knownIds.has(result.task.id)) plan.overwrite.push(result.task)
    else plan.create.push(result.task)
  }
  return plan
}

/**
 * Compact list-projection of a task (token-friendly for `taskboard_list`).
 * @param task - the task.
 */
export type TaskSummary = {
  id: string
  title: string
  workspaceId: string
  urgency: Urgency
  status: TaskStatus
  blocked: boolean
  executionMode: ExecutionMode
  nextRunAt?: number
  model?: TaskModel
  version: number
  claimOwner?: string
  commentCount: number
  lastExecutionOutcome?: ExecutionRecord['outcome']
  /** Checklist progress (present only when the task has a checklist). */
  checklist?: { done: number; total: number }
  trashed: boolean
}

/**
 * Build the compact summary of a task.
 * @param task - the task.
 */
export function summarize(task: TaskRecord): TaskSummary {
  const last = task.executions.length > 0 ? task.executions[task.executions.length - 1] : undefined
  const checklist = task.checklist !== undefined && task.checklist.length > 0 ? checklistProgress(task) : undefined
  return {
    id: task.id,
    title: task.title,
    workspaceId: task.workspaceId,
    urgency: task.urgency,
    status: task.status,
    blocked: task.blocked,
    executionMode: task.execution.mode,
    nextRunAt: task.execution.nextRunAt,
    model: task.model,
    version: task.version,
    claimOwner: isClaimedBy(task),
    commentCount: task.comments.length,
    lastExecutionOutcome: last?.outcome,
    ...(checklist !== undefined ? { checklist } : {}),
    trashed: task.trashedAt !== undefined,
  }
}

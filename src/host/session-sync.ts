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
import {
  defaultSyncExternalSessionsOf,
  newCommentId,
  newExecutionId,
  newTaskId,
  normalizeBody,
  normalizeTitle,
  type TaskRecord,
} from '../shared/protocol.ts'
import type { EventsFace } from './execution.ts'
import type { TaskStore } from './store.ts'
import type { WorkspaceFace } from './tools.ts'

/** Extract text content from a user message event payload. */
export function extractUserMessageText(msg: unknown): string {
  if (typeof msg !== 'object' || msg === null) return ''
  const content = (msg as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part
        if (typeof part === 'object' && part !== null && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
          return (part as { text: string }).text
        }
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

/** Extract a short one-line title from prompt text. */
export function titleFromText(text: string): string {
  const clean = text.trim().replace(/^#+\s*/, '')
  const firstLine = clean.split('\n')[0]?.trim() ?? ''
  return firstLine.slice(0, 50).trim()
}

/**
 * Detect whether a session represents a subagent child conversation.
 * Subagents are created by agent delegation (e.g. invoke_subagent / subagents service)
 * and should never be automatically converted into user tasks on the taskboard.
 */
export function isSubagentSession(
  sessionId: string,
  sessionMeta?: unknown,
  event?: { type: string; data?: unknown },
): boolean {
  if (typeof sessionId === 'string') {
    if (sessionId.startsWith('subagent-') || sessionId.startsWith('child-') || sessionId.startsWith('delegate-')) {
      return true
    }
  }

  if (typeof sessionMeta === 'object' && sessionMeta !== null) {
    const s = sessionMeta as {
      header?: Record<string, unknown>
      meta?: Record<string, unknown>
      options?: Record<string, unknown>
    }

    const header = s.header
    const meta = s.meta
    const options = s.options

    // Check origin
    if (header?.origin === 'subagent' || meta?.origin === 'subagent') return true

    // Check parent session lineage
    if (
      header?.parentSession !== undefined
      || header?.parentSessionId !== undefined
      || meta?.parentSession !== undefined
      || meta?.parentSessionId !== undefined
    ) {
      return true
    }

    // Check delegation depth
    if (typeof header?.delegationDepth === 'number' && header.delegationDepth > 0) return true
    if (typeof meta?.delegationDepth === 'number' && meta.delegationDepth > 0) return true
    if (typeof options?.subagentDepth === 'number' && options.subagentDepth > 0) return true
  }

  if (event !== undefined) {
    if (event.type === 'subagent/descriptor' || event.type === 'subagent/start' || event.type === 'subagent/end') {
      return true
    }
    if (typeof event.data === 'object' && event.data !== null) {
      const d = event.data as Record<string, unknown>
      if (
        d.origin === 'subagent'
        || d.subagent === true
        || typeof d.subagentId === 'string'
        || typeof d.parentSession === 'string'
      ) {
        return true
      }
    }
  }

  return false
}

/**
 * Detect whether a session represents an active working conversation.
 * Inspects state, status, isWorking/isBusy methods, running flags, and active turns.
 */
export function isSessionActiveWorking(session: unknown): boolean {
  if (typeof session !== 'object' || session === null) return false
  const s = session as Record<string, unknown>

  // 1. Method checks
  if (typeof s.isWorking === 'function') {
    try { if (Boolean((s.isWorking as () => boolean)())) return true } catch { /* ignore */ }
  } else if (s.isWorking === true) {
    return true
  }

  if (typeof s.isBusy === 'function') {
    try { if (Boolean((s.isBusy as () => boolean)())) return true } catch { /* ignore */ }
  } else if (s.busy === true || s.isBusy === true) {
    return true
  }

  // 2. Boolean flags
  if (s.running === true || s.active === true || s.isGenerating === true || s.generating === true) {
    return true
  }

  // 3. State string
  if (typeof s.state === 'string') {
    const st = s.state.toLowerCase()
    if (st === 'running' || st === 'working' || st === 'busy' || st === 'generating' || st === 'executing') {
      return true
    }
  }

  // 4. Status string
  if (typeof s.status === 'string') {
    const st = s.status.toLowerCase()
    if (st === 'running' || st === 'working' || st === 'busy' || st === 'active' || st === 'generating' || st === 'executing') {
      return true
    }
  }

  // 5. Active turn checks
  if (s.activeTurn !== undefined && s.activeTurn !== null && s.activeTurn !== false) {
    return true
  }
  if (s.currentTurn !== undefined && s.currentTurn !== null) {
    if (typeof s.currentTurn === 'object') {
      const ct = s.currentTurn as Record<string, unknown>
      if (ct.status === 'running' || ct.state === 'running' || ct.outcome === 'running' || ct.endedAt === undefined) {
        return true
      }
    } else {
      return true
    }
  }

  // 6. Turns list
  if (Array.isArray(s.turns) && s.turns.length > 0) {
    const lastTurn = s.turns[s.turns.length - 1]
    if (typeof lastTurn === 'object' && lastTurn !== null) {
      const lt = lastTurn as Record<string, unknown>
      if (lt.status === 'running' || lt.state === 'running' || lt.outcome === 'running' || (lt.startedAt !== undefined && lt.endedAt === undefined)) {
        return true
      }
    }
  }

  return false
}

/** Dependencies required by the external session sync service. */
export interface SessionSyncDeps {
  store: TaskStore
  workspaces: WorkspaceFace
  events: EventsFace
  sessions?: {
    get?: (id: string) => unknown
    list?: () => unknown[]
  }
  now: () => number
  scanIntervalMs?: number
}

/** Default scan interval: 4s. */
export const DEFAULT_SCAN_INTERVAL_MS = 4000

/**
 * Service that synchronizes external workspace sessions into the taskboard.
 */
export class ExternalSessionSyncService {
  private readonly unsubscribe: () => void
  private readonly ignoredSessions = new Set<string>()
  private scanTimer?: NodeJS.Timeout | number

  constructor(private readonly deps: SessionSyncDeps) {
    this.unsubscribe = deps.events.onSessionEvent((sessionId, event, sessionMeta) => {
      void this.handleSessionEvent(sessionId, event, sessionMeta)
    })

    const interval = deps.scanIntervalMs ?? DEFAULT_SCAN_INTERVAL_MS
    if (interval > 0) {
      this.scanTimer = setInterval(() => {
        void this.scanActiveSessions()
      }, interval)
    }
  }

  /** Detach listener and clear scanner on teardown. */
  dispose(): void {
    this.unsubscribe()
    if (this.scanTimer !== undefined) {
      clearInterval(this.scanTimer as NodeJS.Timeout)
      this.scanTimer = undefined
    }
  }

  /**
   * Periodic active scan: checks whether external sessions linked to board tasks
   * are actively working, ensuring tasks in `in_review` / `todo` / `backlog`
   * automatically pull back to `in_progress`.
   */
  async scanActiveSessions(): Promise<void> {
    const snapshot = this.deps.store.snapshot()
    if (!defaultSyncExternalSessionsOf(snapshot.settings)) return
    if (this.deps.sessions === undefined) return

    const now = this.deps.now()
    const tasks = snapshot.tasks.filter(t => t.trashedAt === undefined)

    for (const task of tasks) {
      const sessionId = task.claimedBy ?? task.executions[task.executions.length - 1]?.sessionId
      if (sessionId === undefined || typeof sessionId !== 'string') continue
      if (this.ignoredSessions.has(sessionId) || sessionId.startsWith('session-taskboard-')) continue

      let session: unknown
      try {
        session = this.deps.sessions.get?.(sessionId)
      } catch { /* ignore */ }

      if (session === undefined && typeof this.deps.sessions.list === 'function') {
        try {
          const list = this.deps.sessions.list()
          session = list?.find(s => (s as { id?: string })?.id === sessionId)
        } catch { /* ignore */ }
      }

      if (session === undefined || session === null) continue
      if (isSubagentSession(sessionId, session)) {
        this.ignoredSessions.add(sessionId)
        continue
      }

      const isWorking = isSessionActiveWorking(session)
      if (isWorking) {
        if (task.status !== 'in_progress') {
          await this.deps.store.mutate('task-updated', (ledger) => {
            const current = ledger.tasks.find(t => t.id === task.id)
            if (current === undefined || current.trashedAt !== undefined) return undefined
            current.status = 'in_progress'
            current.claimedBy = sessionId
            current.claimedAt = current.claimedAt ?? now
            current.updatedAt = now
            current.updatedBy = { kind: 'agent', sessionId }
            const hasRunning = current.executions.some(e => e.sessionId === sessionId && e.outcome === 'running')
            if (!hasRunning) {
              current.executions.push({
                id: newExecutionId(),
                sessionId,
                trigger: 'manual',
                startedAt: now,
                outcome: 'running',
                isolation: 'none',
              })
            }
            return [current]
          })
        }
      }
    }
  }

  private async handleSessionEvent(
    sessionId: string,
    event: { type: string; data?: unknown },
    sessionMeta?: {
      header?: { cwd?: string; origin?: string; parentSession?: string; parentSessionId?: string; delegationDepth?: number }
      meta?: { origin?: string; parentSession?: string; delegationDepth?: number }
      options?: { subagentDepth?: number }
    },
  ): Promise<void> {
    // 1. Check if already ignored
    if (this.ignoredSessions.has(sessionId)) return

    // 2. Ignore taskboard's internal execution sessions
    if (sessionId.startsWith('session-taskboard-')) {
      this.ignoredSessions.add(sessionId)
      return
    }

    // 3. Ignore subagent sessions (delegated children)
    if (isSubagentSession(sessionId, sessionMeta, event)) {
      this.ignoredSessions.add(sessionId)
      // If a task was previously created for this subagent before detection, clean it up
      await this.deps.store.mutate('task-deleted', (ledger) => {
        const idx = ledger.tasks.findIndex(
          t => t.claimedBy === sessionId && t.createdBy.kind === 'agent' && t.createdBy.sessionId === sessionId,
        )
        if (idx >= 0) {
          ledger.tasks.splice(idx, 1)
          return []
        }
        return undefined
      })
      return
    }

    // 4. Check if external session sync is enabled in board settings
    const snapshot = this.deps.store.snapshot()
    if (!defaultSyncExternalSessionsOf(snapshot.settings)) return

    const now = this.deps.now()

    if (event.type === 'turn/start') {
      await this.handleTurnStart(sessionId, sessionMeta?.header?.cwd, now)
      return
    }

    if (event.type === 'user/message') {
      await this.handleUserMessage(sessionId, event.data, now)
      return
    }

    if (
      event.type === 'turn/step'
      || event.type === 'turn/progress'
      || event.type === 'agent/step'
      || event.type === 'agent/thought'
      || event.type === 'agent/turn/start'
    ) {
      await this.ensureSessionInProgress(sessionId, now)
      return
    }

    if (event.type === 'session/title') {
      await this.handleSessionTitle(sessionId, event.data, now)
      return
    }

    if (event.type === 'turn/end') {
      await this.handleTurnEnd(sessionId, event.data, now)
      return
    }
  }

  private async ensureSessionInProgress(sessionId: string, now: number): Promise<void> {
    await this.deps.store.mutate('task-updated', (ledger) => {
      const task = ledger.tasks.find(
        t => t.claimedBy === sessionId || t.executions.some(e => e.sessionId === sessionId),
      )
      if (task === undefined || task.trashedAt !== undefined) return undefined

      let changed = false
      if (task.status !== 'in_progress') {
        task.status = 'in_progress'
        task.claimedBy = sessionId
        task.claimedAt = task.claimedAt ?? now
        changed = true
      }
      const hasRunning = task.executions.some(e => e.sessionId === sessionId && e.outcome === 'running')
      if (!hasRunning) {
        task.executions.push({
          id: newExecutionId(),
          sessionId,
          trigger: 'manual',
          startedAt: now,
          outcome: 'running',
          isolation: 'none',
        })
        changed = true
      }
      if (changed) {
        task.updatedAt = now
        task.updatedBy = { kind: 'agent', sessionId }
        return [task]
      }
      return undefined
    })
  }

  private async handleTurnStart(sessionId: string, cwd: string | undefined, now: number): Promise<void> {
    // Resolve workspace
    let wsId: string | undefined
    if (cwd !== undefined && cwd.length > 0) {
      const resolved = await this.deps.workspaces.resolveByPath(cwd)
      wsId = resolved?.id
    }
    if (wsId === undefined) {
      wsId = this.deps.workspaces.list()[0]?.id ?? 'default'
    }

    await this.deps.store.mutate('task-created', (ledger) => {
      // Find existing task linked to this session
      const existing = ledger.tasks.find(
        t => t.claimedBy === sessionId || t.executions.some(e => e.sessionId === sessionId),
      )

      if (existing !== undefined) {
        if (existing.trashedAt !== undefined) return undefined
        // If already in_progress and holding claim, ensure running execution
        if (existing.status === 'in_progress' && existing.claimedBy === sessionId) {
          const hasRunning = existing.executions.some(e => e.sessionId === sessionId && e.outcome === 'running')
          if (!hasRunning) {
            existing.executions.push({
              id: newExecutionId(),
              sessionId,
              trigger: 'manual',
              startedAt: now,
              outcome: 'running',
              isolation: 'none',
            })
            existing.updatedAt = now
            existing.updatedBy = { kind: 'agent', sessionId }
            return [existing]
          }
          return undefined
        }

        // Resumed or continued turn (e.g. from in_review or todo)
        existing.status = 'in_progress'
        existing.claimedBy = sessionId
        existing.claimedAt = now
        existing.updatedAt = now
        existing.updatedBy = { kind: 'agent', sessionId }
        existing.executions.push({
          id: newExecutionId(),
          sessionId,
          trigger: 'manual',
          startedAt: now,
          outcome: 'running',
          isolation: 'none',
        })
        return [existing]
      }

      // Create new task for this external session
      const shortId = sessionId.replace(/^session-/, '').slice(0, 8)
      const newTask: TaskRecord = {
        id: newTaskId(),
        title: `会话 ${shortId}`,
        description: '',
        prompt: '',
        workspaceId: wsId,
        urgency: 'normal',
        status: 'in_progress',
        blocked: false,
        execution: { mode: 'claim' },
        isolation: 'none',
        claimedBy: sessionId,
        claimedAt: now,
        version: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: { kind: 'agent', sessionId },
        updatedBy: { kind: 'agent', sessionId },
        comments: [],
        executions: [
          {
            id: newExecutionId(),
            sessionId,
            trigger: 'manual',
            startedAt: now,
            outcome: 'running',
            isolation: 'none',
          },
        ],
      }
      ledger.tasks.push(newTask)
      return [newTask]
    })
  }

  private async handleUserMessage(sessionId: string, msgData: unknown, now: number): Promise<void> {
    const text = extractUserMessageText(msgData)

    await this.deps.store.mutate('task-updated', (ledger) => {
      const task = ledger.tasks.find(
        t => t.claimedBy === sessionId || t.executions.some(e => e.sessionId === sessionId),
      )
      if (task === undefined || task.trashedAt !== undefined) return undefined

      let changed = false
      if (text.trim().length > 0) {
        // If title is default placeholder "会话 ...", replace with prompt summary
        if (task.title.startsWith('会话 ') && task.title.length <= 16) {
          const derived = titleFromText(text)
          if (derived.length > 0) {
            task.title = normalizeTitle(derived)
            changed = true
          }
        }
        // If description is empty, record initial prompt
        if (task.description.length === 0) {
          task.description = text.slice(0, 2000)
          changed = true
        }
      }

      // If task was in in_review, todo, or backlog, user message resumes work -> move to in_progress
      if (task.status !== 'in_progress') {
        task.status = 'in_progress'
        task.claimedBy = sessionId
        task.claimedAt = now
        changed = true
      }

      // Ensure running execution exists
      const hasRunning = task.executions.some(e => e.sessionId === sessionId && e.outcome === 'running')
      if (!hasRunning) {
        task.executions.push({
          id: newExecutionId(),
          sessionId,
          trigger: 'manual',
          startedAt: now,
          outcome: 'running',
          isolation: 'none',
        })
        changed = true
      }

      if (changed) {
        task.updatedAt = now
        task.updatedBy = { kind: 'user' }
        return [task]
      }
      return undefined
    })
  }

  private async handleSessionTitle(sessionId: string, titleData: unknown, now: number): Promise<void> {
    const rawTitle = typeof titleData === 'object' && titleData !== null && 'title' in titleData && typeof (titleData as { title: unknown }).title === 'string'
      ? (titleData as { title: string }).title
      : typeof titleData === 'string'
        ? titleData
        : ''
    if (rawTitle.trim().length === 0) return

    await this.deps.store.mutate('task-updated', (ledger) => {
      const task = ledger.tasks.find(
        t => t.claimedBy === sessionId || t.executions.some(e => e.sessionId === sessionId),
      )
      if (task === undefined || task.trashedAt !== undefined) return undefined
      task.title = normalizeTitle(rawTitle)
      task.updatedAt = now
      task.updatedBy = { kind: 'user' }
      return [task]
    })
  }

  private async handleTurnEnd(sessionId: string, endData: unknown, now: number): Promise<void> {
    const reason = typeof endData === 'object' && endData !== null && 'reason' in endData
      ? (endData as { reason: unknown }).reason
      : endData

    // Check if error or failure
    let isFailure = false
    let errorMessage = ''
    if (typeof reason === 'object' && reason !== null) {
      const r = reason as Record<string, unknown>
      if (r.kind === 'error' || r.kind === 'failure') {
        isFailure = true
        errorMessage = typeof r.error === 'string' ? r.error : typeof r.message === 'string' ? r.message : 'turn error'
      } else if (r.kind === 'cancel') {
        isFailure = true
        errorMessage = 'cancelled'
      }
    } else if (typeof reason === 'string' && (reason.includes('error') || reason.includes('fail'))) {
      isFailure = true
      errorMessage = reason
    }

    await this.deps.store.mutate('execution-recorded', (ledger) => {
      const task = ledger.tasks.find(
        t => t.claimedBy === sessionId || t.executions.some(e => e.sessionId === sessionId),
      )
      if (task === undefined || task.trashedAt !== undefined) return undefined

      // Settle running execution
      for (const exec of task.executions) {
        if (exec.sessionId === sessionId && exec.outcome === 'running') {
          exec.endedAt = now
          if (isFailure) {
            exec.outcome = 'failed'
            exec.error = errorMessage.slice(0, 500)
          } else {
            exec.outcome = 'succeeded'
          }
        }
      }

      delete task.claimedBy
      delete task.claimedAt
      task.updatedAt = now
      task.updatedBy = { kind: 'agent', sessionId }

      if (isFailure) {
        // Failed session hands back to todo with comment
        if (task.status === 'in_progress') {
          task.status = 'todo'
          task.comments.push({
            id: newCommentId(),
            body: normalizeBody(`[系统] 会话执行异常：${errorMessage.slice(0, 300)}；任务已退回待办。`),
            version: 1,
            createdAt: now,
          })
        }
      } else {
        // Successful settlement automatically moves to in_review (待验收)
        if (task.status === 'in_progress') {
          task.status = 'in_review'
          task.comments.push({
            id: newCommentId(),
            body: normalizeBody('[系统] 会话执行完毕，已自动进入待验收。'),
            version: 1,
            createdAt: now,
          })
        }
      }
      return [task]
    })
  }
}

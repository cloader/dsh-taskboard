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

/** Dependencies required by the external session sync service. */
export interface SessionSyncDeps {
  store: TaskStore
  workspaces: WorkspaceFace
  events: EventsFace
  now: () => number
}

/**
 * Service that synchronizes external workspace sessions into the taskboard.
 */
export class ExternalSessionSyncService {
  private readonly unsubscribe: () => void

  constructor(private readonly deps: SessionSyncDeps) {
    this.unsubscribe = deps.events.onSessionEvent((sessionId, event, sessionMeta) => {
      void this.handleSessionEvent(sessionId, event, sessionMeta)
    })
  }

  /** Detach listener on teardown. */
  dispose(): void {
    this.unsubscribe()
  }

  private async handleSessionEvent(
    sessionId: string,
    event: { type: string; data?: unknown },
    sessionMeta?: { header?: { cwd?: string } },
  ): Promise<void> {
    // 1. Ignore taskboard's internal execution sessions
    if (sessionId.startsWith('session-taskboard-')) return

    // 2. Check if external session sync is enabled in board settings
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

    if (event.type === 'session/title') {
      await this.handleSessionTitle(sessionId, event.data, now)
      return
    }

    if (event.type === 'turn/end') {
      await this.handleTurnEnd(sessionId, event.data, now)
      return
    }
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
    if (text.trim().length === 0) return

    await this.deps.store.mutate('task-updated', (ledger) => {
      const task = ledger.tasks.find(
        t => t.claimedBy === sessionId || t.executions.some(e => e.sessionId === sessionId),
      )
      if (task === undefined || task.trashedAt !== undefined) return undefined

      let changed = false
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

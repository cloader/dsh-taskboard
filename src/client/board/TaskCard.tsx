/**
 * One board card: urgency edge, title, project/urgency/model/schedule/
 * blocked/trashed badges, comment count, and the last execution outcome.
 * Click opens the detail pane; cards in the backlog/todo columns are
 * draggable between those two columns (HTML5 drag & drop). Cards sitting
 * in the in_review column also carry quick-review actions (✓ complete /
 * ✗ send back with an optional note).
 *
 * The root is a div[role=button] (not a <button>) so the quick actions can
 * be real nested buttons — valid HTML and native keyboard activation.
 *
 * @module dsh-taskboard/client/board/TaskCard
 */
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import type { BoardController } from '../controller.ts'
import { taskSessionId, type TaskRecord } from '../../shared/protocol.ts'
import { checkNeedsHuman, fmtTime, isStaleClaim } from './format.ts'
import { OUTCOME_KEYS, URGENCY_KEYS } from './labels.ts'
import { useT } from '../i18n/runtime.ts'
import { externalTypeLabel } from '../external-api.ts'

/** dataTransfer type carrying the dragged task id. */
export const DRAG_TYPE = 'application/x-dsh-atb-task'

/** Compact session-id display (execution sessions carry the taskboard infix). */
export function shortId(id: string | undefined): string {
  if (id === undefined) return ''
  return id.replace(/^session-(taskboard-)?/, '').slice(0, 8)
}

/**
 * Resolve the most relevant session ID associated with a task.
 * Thin alias over the shared {@link taskSessionId} so the card and the detail
 * pane can never drift apart again (they had two copies, and the detail pane's
 * copy had lost the originating-conversation fallback).
 */
export const resolveTaskSessionId = taskSessionId

/**
 * The card view.
 * @param task - the task record.
 * @param controller - the controller.
 * @param draggable - enable dragging.
 * @param now - current epoch ms (stale-claim highlight).
 * @param onAlert - show an alert message (replaces native alert).
 */
export function TaskCard({ task, controller, draggable = false, now, onAlert }: { task: TaskRecord; controller: BoardController; draggable?: boolean; now?: number; onAlert?: (msg: string) => void }) {
  const t = useT()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [note, setNote] = useState('')
  const last = task.executions.length > 0 ? task.executions[task.executions.length - 1] : undefined
  const running = task.executions.find(ex => ex.outcome === 'running')
  const stale = now !== undefined && isStaleClaim(task, now)
  const reviewing = task.status === 'in_review' && task.trashedAt === undefined
  const needsHuman = checkNeedsHuman(task)
  const latestReport = [...task.executions].reverse().find(e => e.report !== undefined)?.report
  const latestWithGit = [...task.executions].reverse().find(e => (e.changedFiles ?? 0) > 0 || (e.commits?.length ?? 0) > 0 || e.diffStat)
  const targetSessionId = resolveTaskSessionId(task)
  const sessionTitle = controller.getSessionTitle(targetSessionId)
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) {
        clearTimeout(clickTimerRef.current)
        clickTimerRef.current = null
      }
    }
  }, [])

  /** Submit the quick-reject: one atomic route (move + optional note). */
  const submitReject = (): void => {
    void controller.reject(task.id, task.version, note).then(ok => {
      if (ok) { setRejectOpen(false); setNote('') }
      // On failure the error surface explains; the form stays open for retry.
    })
  }

  /** Single-click handler: debounce when a target session exists so double-click won't open details if closed. */
  const handleClick = (e: MouseEvent): void => {
    if (e.target !== e.currentTarget && (e.target as HTMLElement).closest('button, input, textarea')) return

    // If no target session, or this task's detail is ALREADY open, select immediately
    if (targetSessionId === undefined || controller.getSnapshot().selectedId === task.id) {
      controller.select(task.id)
      return
    }

    // Otherwise, debounce single click so double-click can jump to session WITHOUT opening details
    if (clickTimerRef.current !== null) {
      clearTimeout(clickTimerRef.current)
    }
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null
      controller.select(task.id)
    }, 250)
  }

  /** Double-click opens the associated session conversation directly without opening details. */
  const handleDoubleClick = (e: MouseEvent): void => {
    if (clickTimerRef.current !== null) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }

    // Only the card surface itself, ignore nested buttons/inputs (like quick-reject controls)
    if (e.target !== e.currentTarget && (e.target as HTMLElement).closest('button, input, textarea')) return
    if (targetSessionId !== undefined) {
      void controller.openSession(targetSessionId).then(result => {
        if (result === 'missing') {
          const msg = t('card.session.missing', { id: shortId(targetSessionId) })
          if (onAlert !== undefined) onAlert(msg)
          else alert(msg)
        } else if (result === 'archived') {
          const msg = t('card.session.archived', { id: shortId(targetSessionId) })
          if (onAlert !== undefined) onAlert(msg)
          else alert(msg)
        } else if (result === 'unavailable') {
          const msg = t('card.session.unavailable', { id: targetSessionId })
          if (onAlert !== undefined) onAlert(msg)
          else alert(msg)
        }
      })
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="dsh-atb-card"
      data-urgency={task.urgency}
      data-needs-human={needsHuman.needs ? 'true' : undefined}
      draggable={draggable && !rejectOpen}
      onDragStart={(e) => {
        // Block drag if a session is still executing this task
        if (running !== undefined) {
          e.preventDefault()
          const msg = t('card.drag.running', { title: task.title })
          if (onAlert !== undefined) onAlert(msg)
          else alert(msg)
          return
        }
        e.dataTransfer.setData(DRAG_TYPE, task.id)
        e.dataTransfer.effectAllowed = 'move'
        e.currentTarget.dataset.dragging = 'true'
      }}
      onDragEnd={(e) => { delete e.currentTarget.dataset.dragging }}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={(e) => {
        // Only the card itself (not the nested quick-action controls).
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          controller.select(task.id)
        }
      }}
    >
      <div className="dsh-atb-card-title">
        {needsHuman.needs && <span className="dsh-atb-badge" data-kind="needs-human" style={{ marginRight: 6, verticalAlign: 'middle' }}>🙋 {needsHuman.reason ?? t('card.badge.needsHuman')}</span>}
        {task.title}
      </div>
      {task.external && <small>{task.external.providerName ?? task.external.provider} · {externalTypeLabel(task.external.item.type, t)} #{task.external.item.id}{task.external.conflicts.length > 0 ? ' ⚠' : ''}</small>}
      
      {(task.status === 'in_review' || task.status === 'done') && (
        <div className="dsh-atb-card-deliverable">
          <div className="dsh-atb-card-deliv-row">
            <span className="dsh-atb-card-deliv-tag">📄 {t('card.deliv.changed')}:</span>
            {latestReport?.changedFiles && latestReport.changedFiles.length > 0 ? (
              <span className="dsh-atb-card-deliv-val" title={latestReport.changedFiles.join('\n')}>
                {latestReport.changedFiles.length} {t('card.deliv.filesUnit')} ({latestReport.changedFiles[0].split('/').pop()}{latestReport.changedFiles.length > 1 ? ` +${latestReport.changedFiles.length - 1}` : ''})
              </span>
            ) : latestWithGit?.changedFiles ? (
              <span className="dsh-atb-card-deliv-val">
                {latestWithGit.changedFiles} {t('card.deliv.gitFilesChanged')}
              </span>
            ) : (
              <span className="dsh-atb-card-deliv-val dsh-atb-deliv-warn">{t('card.deliv.noFilesRecorded')}</span>
            )}
          </div>
          <div className="dsh-atb-card-deliv-row">
            <span className="dsh-atb-card-deliv-tag">☑ {t('card.deliv.acceptance')}:</span>
            {task.checklist && task.checklist.length > 0 ? (
              <span className="dsh-atb-card-deliv-val" title={task.checklist.map(c => `${c.checked ? '✓' : '✗'} ${c.text}`).join('\n')}>
                {t('card.deliv.checklistProgress', { done: task.checklist.filter(c => c.checked).length, total: task.checklist.length })}
                {task.status === 'in_review' && task.checklist.some(c => !c.checked) && (
                  <span className="dsh-atb-deliv-warn"> ({t('card.deliv.uncheckedWarn')})</span>
                )}
              </span>
            ) : latestReport?.checks && latestReport.checks.length > 0 ? (
              <span className="dsh-atb-card-deliv-val" title={latestReport.checks.join('\n')}>
                ✓ {t('card.deliv.checksCount', { n: latestReport.checks.length })}
              </span>
            ) : (
              <span className="dsh-atb-card-deliv-val dsh-atb-deliv-warn">
                ⚠ {t('card.deliv.noVerificationWarn')}
              </span>
            )}
          </div>
          {latestReport?.summary && (
            <div className="dsh-atb-card-deliv-summary" title={latestReport.summary}>
              💡 {latestReport.summary}
            </div>
          )}
        </div>
      )}

      <div className="dsh-atb-card-meta">
        <span className="dsh-atb-badge">{t(URGENCY_KEYS[task.urgency])}</span>
        {task.blocked && <span className="dsh-atb-badge" data-kind="blocked">{t('shared.blocked')}</span>}
        {stale && <span className="dsh-atb-badge" data-kind="stale">{t('card.badge.stale')}</span>}
        {task.execution.mode === 'scheduled' && (
          <span className="dsh-atb-badge" data-kind="scheduled">⏰ {fmtTime(task.execution.nextRunAt)}</span>
        )}
        {task.model !== undefined && (
          <span
            className="dsh-atb-badge"
            title={t('card.badge.modelTitle', { model: task.model.provider + '/' + task.model.model }) + (task.model.reasoningEffort !== undefined ? t('card.badge.modelEffort', { effort: task.model.reasoningEffort }) : '')}
          >
            {task.model.model}{task.model.reasoningEffort !== undefined ? ` (${task.model.reasoningEffort})` : ''}
          </span>
        )}
        {task.permission === 'read-only' && (
          <span className="dsh-atb-badge" data-kind="blocked" title={t('card.badge.permReadOnlyTitle')}>
            {t('card.badge.permReadOnly')}
          </span>
        )}
        {task.permission === 'danger-full-access' && (
          <span className="dsh-atb-badge" data-kind="urgent" title={t('card.badge.permFullTitle')}>
            {t('card.badge.permFull')}
          </span>
        )}
        {task.checklist !== undefined && task.checklist.length > 0 && (
          <span
            className="dsh-atb-badge"
            data-kind={task.status === 'in_review' && task.checklist.some(i => !i.checked) ? 'blocked' : 'checklist'}
            title={task.status === 'in_review' && task.checklist.some(i => !i.checked) ? t('card.badge.checklistReview') : t('card.badge.checklist')}
          >
            ☑ {task.checklist.filter(i => i.checked).length}/{task.checklist.length}
          </span>
        )}
        {task.status === 'done' && <span className="dsh-atb-badge" data-kind="done">{t('status.pill.done')}</span>}
        {last !== undefined && (
          <span className="dsh-atb-badge" data-kind={last.outcome === 'running' ? 'running' : last.outcome}>
            {t(OUTCOME_KEYS[last.outcome] ?? last.outcome)}
          </span>
        )}
        {targetSessionId !== undefined && (
          <span
            className="dsh-atb-badge"
            data-kind="session"
            title={
              sessionTitle && sessionTitle !== task.title
                ? t('card.session.tagTitleWithTitle', { title: sessionTitle, id: targetSessionId })
                : t('card.session.tagTitle', { id: targetSessionId })
            }
            onClick={(e) => {
              e.stopPropagation()
              void controller.openSession(targetSessionId).then(result => {
                if (result === 'missing') {
                  const msg = t('card.session.missing', { id: shortId(targetSessionId) })
                  if (onAlert !== undefined) onAlert(msg)
                  else alert(msg)
                } else if (result === 'archived') {
                  const msg = t('card.session.archived', { id: shortId(targetSessionId) })
                  if (onAlert !== undefined) onAlert(msg)
                  else alert(msg)
                } else if (result === 'unavailable') {
                  const msg = t('card.session.unavailable', { id: targetSessionId })
                  if (onAlert !== undefined) onAlert(msg)
                  else alert(msg)
                }
              })
            }}
          >
            💬 {t('card.session.badge', { id: shortId(targetSessionId) })}
          </span>
        )}
        {task.comments.length > 0 && <span>💬 {task.comments.length}</span>}
        {task.trashedAt !== undefined && <span className="dsh-atb-badge" data-kind="trashed">{t('card.badge.pendingPurge')}</span>}
        <span style={{ marginLeft: 'auto' }}>{fmtTime(task.updatedAt)}</span>
      </div>
      {reviewing && (rejectOpen
        ? (
            <div className="dsh-atb-quick-reject" onClick={e => e.stopPropagation()}>
              <input
                className="dsh-atb-input dsh-atb-quick-note"
                value={note}
                placeholder={t('card.reject.placeholder')}
                autoFocus
                spellCheck={false}
                onChange={e => setNote(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') submitReject()
                  else if (e.key === 'Escape') { setRejectOpen(false); setNote('') }
                }}
              />
              <button type="button" className="dsh-atb-quickbtn" data-act="reject-confirm" onClick={submitReject}>{t('card.reject.confirm')}</button>
              <button type="button" className="dsh-atb-quickbtn" data-act="reject-cancel" onClick={() => { setRejectOpen(false); setNote('') }}>{t('shared.cancel')}</button>
            </div>
          )
        : (
            <div className="dsh-atb-quick" onClick={e => e.stopPropagation()}>
              <button
                type="button"
                className="dsh-atb-quickbtn"
                data-act="done"
                title={t('card.action.doneTitle')}
                onClick={() => void controller.move(task.id, task.version, 'done')}
              >
                {t('card.action.done')}
              </button>
              <button
                type="button"
                className="dsh-atb-quickbtn"
                data-act="reject"
                title={t('card.action.rejectTitle')}
                onClick={() => setRejectOpen(true)}
              >
                {t('card.action.reject')}
              </button>
            </div>
          ))}
    </div>
  )
}

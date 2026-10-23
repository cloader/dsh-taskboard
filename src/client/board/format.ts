/**
 * Pure display helpers shared by the board components.
 *
 * Review P2: these lived in TaskBoard.tsx and were imported back out by
 * TaskCard/TaskDetail/TaskFormModal, forming import cycles with the view
 * root. They have no component dependencies — they belong here.
 *
 * @module dsh-taskboard/client/board/format
 */
import { humanWaiting } from '../../shared/human-wait.ts'
import type { BoardSettings, TaskRecord } from '../../shared/protocol.ts'

/**
 * Initial project for the task form (#56): the task being edited wins, then
 * the board's project filter, then the configured default project when it is
 * still a registered workspace, then the first registered workspace.
 */
export function initialWorkspaceId(input: {
  editing?: string
  filter?: string
  settings?: BoardSettings
  workspaces?: ReadonlyArray<{ id: string }>
}): string {
  const list = input.workspaces ?? []
  if (input.editing !== undefined) return input.editing
  if (input.filter !== undefined) return input.filter
  const preferred = input.settings?.defaultWorkspaceId
  if (preferred !== undefined && list.some(w => w.id === preferred)) return preferred
  return list[0]?.id ?? ''
}

/** Format an epoch ms as a short local stamp. */
export function fmtTime(ms: number | undefined): string {
  if (ms === undefined) return ''
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A running execution silent for longer than this is highlighted as stale (ms). */
export const STALE_CLAIM_MS = 30 * 60_000

/**
 * Whether a live execution is silent. `claimedAt` is a compatibility fallback
 * for records created before execution activity was persisted; it is not used
 * when a real activity timestamp exists.
 */
export function isStaleClaim(task: TaskRecord, now: number): boolean {
  if (task.status !== 'in_progress') return false
  const running = task.executions.filter(execution => execution.outcome === 'running')
  if (running.length === 0) return false
  const activity = Math.max(...running.map(execution => execution.lastActivityAt ?? task.claimedAt ?? -Infinity))
  return Number.isFinite(activity) && now - activity > STALE_CLAIM_MS
}

/** Localize both explicit reasons and conservative automatic suggestions. */
export function checkNeedsHuman(task: TaskRecord, t: import('../i18n/runtime.ts').Translate) {
  const result = humanWaiting(task)
  const reason = result.reason ?? (result.reasonKey ? t(result.reasonKey) : undefined)
  return { ...result, reason: result.source === 'inferred' ? t('human.suspected', { reason: reason ?? '' }) : reason }
}

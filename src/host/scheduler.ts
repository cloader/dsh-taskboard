/**
 * Host-side cron scheduler: one tick per minute over the ledger's scheduled
 * tasks. A due task (nextRunAt reached, not running, not trashed) first has
 * its next run advanced to the next cron match — then it executes through
 * the same path as the manual button. Missed windows (host was down, tab
 * closed — irrelevant here, this is the host process) simply advance: a
 * nextRunAt more than one window in the past is skipped, not caught up.
 *
 * @module dsh-taskboard/host/scheduler
 */
import { newCommentId, nextCronTime, normalizeBody, parseCron, type TaskLedger } from '../shared/protocol.ts'
import { DEFAULT_MAX_CONCURRENT, type ExecutionService } from './execution.ts'
import type { TaskStore } from './store.ts'

/** Tick cadence. */
const TICK_MS = 60_000

/** A due window older than this is skipped (missed while the host was down). */
const SKIP_AFTER_MS = 5 * 60_000

/** Everything the scheduler needs. */
export interface SchedulerDeps {
  store: TaskStore
  execution: Pick<ExecutionService, 'run' | 'inFlight'>
  now: () => number
  /** Max concurrently running executions (default 3; must match the execution service). */
  maxConcurrent?: number
  /** Timer face (injectable for tests). The timeout pair is optional so
   *  older injections keep working; gaps fall back to the globals. */
  timers?: {
    setInterval(fn: () => void, ms: number): unknown
    clearInterval(handle: unknown): void
    setTimeout?(fn: () => void, ms: number): unknown
    clearTimeout?(handle: unknown): void
  }
}

type SchedulerTimers = NonNullable<SchedulerDeps['timers']>

const DEFAULT_TIMERS: Required<SchedulerTimers> = {
  setInterval: (fn: () => void, ms: number): unknown => setInterval(fn, ms),
  clearInterval: (handle: unknown): void => { clearInterval(handle as Parameters<typeof clearInterval>[0]) },
  setTimeout: (fn: () => void, ms: number): unknown => setTimeout(fn, ms),
  clearTimeout: (handle: unknown): void => { clearTimeout(handle as Parameters<typeof clearTimeout>[0]) },
}

/**
 * The cron scheduler.
 */
export class SchedulerService {
  private handle: unknown
  private catchup: unknown
  private timers: Required<SchedulerTimers> = DEFAULT_TIMERS

  /** @param deps - store + execution + clock. */
  constructor(private readonly deps: SchedulerDeps) {}

  /** Start ticking. */
  start(): void {
    // Fill optional timer slots from the globals so a legacy injection that
    // only carries the interval pair still works end to end.
    this.timers = this.deps.timers === undefined ? DEFAULT_TIMERS : { ...DEFAULT_TIMERS, ...this.deps.timers }
    // A tick rejection (disk error inside a mutation) must never surface as
    // an unhandled rejection — log it and keep the schedule alive.
    this.handle = this.timers.setInterval(() => { void this.tick().catch(error => {
      console.error('[dsh-taskboard] scheduler tick failed:', error)
    }) }, TICK_MS)
    // Catch up promptly on host restart: run one tick soon after start. The
    // handles are cleared on dispose so a torn-down scheduler never fires.
    this.catchup = this.timers.setTimeout(() => { void this.tick().catch(error => {
      console.error('[dsh-taskboard] scheduler tick failed:', error)
    }) }, 3_000)
  }

  /** Stop ticking. */
  dispose(): void {
    if (this.catchup !== undefined) {
      this.timers.clearTimeout(this.catchup)
      this.catchup = undefined
    }
    if (this.handle === undefined) return
    this.timers.clearInterval(this.handle)
    this.handle = undefined
  }

  /** One scheduler pass (exported for tests). */
  async tick(): Promise<void> {
    // Load once before reading: snapshot() does not trigger a load, and the
    // scheduler may be the first consumer after a host restart (otherwise it
    // would tick over an empty ledger until something else loads it).
    await this.deps.store.load()
    const now = this.deps.now()
    const ledger: TaskLedger = this.deps.store.snapshot()
    for (const task of ledger.tasks) {
      if (task.execution.mode !== 'scheduled' || task.execution.cron === undefined) continue
      if (task.execution.nextRunAt === undefined) continue
      if (task.status === 'in_progress' || task.trashedAt !== undefined) continue
      if (task.execution.nextRunAt > now) continue
      // At the concurrency cap (S4: checked FRESH per task — runs register
      // only after agent creation, so a once-per-tick snapshot under-counted
      // the startup window): leave nextRunAt in the past and retry next tick
      // — advancing here would silently burn this window.
      if (this.deps.execution.inFlight() >= (this.deps.maxConcurrent ?? DEFAULT_MAX_CONCURRENT)) continue
      const missed = now - task.execution.nextRunAt > SKIP_AFTER_MS

      // Advance the schedule AND record the trigger in ONE mutation (S13:
      // one revision bump, one broadcast, and the two writes can no longer
      // straddle a status change), then run unless the window was missed.
      await this.advanceAndMark(task.id, now, missed ? undefined : task.execution.nextRunAt)
      if (missed) continue
      await this.deps.execution.run(task.id, 'scheduled').catch(error => {
        console.error('[dsh-taskboard] scheduled run failed:', error)
      })
    }
  }

  /**
   * Recompute the next run and record the trigger instant for one scheduled
   * task, in one serial-queue mutation. S12: a cron that can no longer match
   * anything within the 4-year scan window (only reachable through a
   * hand-edited ledger — every normal entry point validates) would otherwise
   * leave nextRunAt in the past and spin a full ~2M-iteration scan every
   * tick; it is cleared with a system comment instead of dying silently.
   */
  private async advanceAndMark(taskId: string, now: number, triggeredAt: number | undefined): Promise<void> {
    await this.deps.store.mutate('task-updated', (ledger) => {
      const task = ledger.tasks.find(t => t.id === taskId)
      if (task === undefined || task.execution.cron === undefined) return undefined
      if (task.status === 'in_progress' || task.trashedAt !== undefined) return undefined
      const match = parseCron(task.execution.cron)
      const next = match === null ? undefined : nextCronTime(match, now) ?? undefined
      if (next === undefined) {
        const deadCron = task.execution.cron
        task.execution.cron = undefined
        task.execution.nextRunAt = undefined
        task.comments.push({
          id: newCommentId(),
          body: normalizeBody(`[系统] 定时表达式 ${deadCron} 在 4 年内没有可触发时间，已停用定时；请修正 cron 后重新开启。`),
          systemKey: 'sys.cronDead',
          systemParams: { cron: deadCron },
          version: 1,
          createdAt: now,
        })
        return [task]
      }
      task.execution.nextRunAt = next
      if (triggeredAt !== undefined) task.execution.lastTriggeredAt = triggeredAt
      return [task]
    })
  }
}

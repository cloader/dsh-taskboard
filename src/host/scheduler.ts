/**
 * Host-side cron scheduler: one tick per minute over the ledger's scheduled
 * tasks. Due tasks are first durably queued, then dispatched FIFO as global
 * capacity becomes available. A queued window remains eligible across a host
 * restart; only a window that was never queued can be classified as missed.
 *
 * @module dsh-taskboard/host/scheduler
 */
import { DEFAULT_MAX_CONCURRENT, newCommentId, nextCronTime, normalizeBody, parseCron, type TaskLedger } from '../shared/protocol.ts'
import type { ExecutionService } from './execution.ts'
import type { TaskStore } from './store.ts'

/** Tick cadence. */
const TICK_MS = 60_000

/** Everything the scheduler needs. */
export interface SchedulerDeps {
  store: TaskStore
  execution: Pick<ExecutionService, 'run' | 'inFlight'>
  now: () => number
  /** Max concurrently running executions (default 3; must match the execution service). */
  maxConcurrent?: number | (() => number)
  /** Offline missed-window threshold in milliseconds. Queued work never uses it. */
  skipAfterMs?: number | (() => number)
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
  /** Reservations actively being handed to this scheduler instance's gate. */
  private readonly dispatching = new Set<string>()

  /** @param deps - store + execution + clock. */
  constructor(private readonly deps: SchedulerDeps) {}

  private maxConcurrent(): number {
    return typeof this.deps.maxConcurrent === 'function' ? this.deps.maxConcurrent() : this.deps.maxConcurrent ?? DEFAULT_MAX_CONCURRENT
  }

  private skipAfterMs(): number {
    return typeof this.deps.skipAfterMs === 'function' ? this.deps.skipAfterMs() : this.deps.skipAfterMs ?? 5 * 60_000
  }

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
      if (task.execution.mode !== 'scheduled' || task.trashedAt !== undefined) continue
      // Only todo fires. A finished periodic run settles in review (its cron
      // moves to a freshly minted successor todo card), and terminal/parked
      // states retain their config so an explicit reopen can resume — none
      // of these ever refire from here.
      if (task.status !== 'todo') continue
      // Already queued while this host was online: do not apply the offline
      // missed-window policy to it. Dispatch happens in the FIFO pass below.
      if (task.execution.queuedRunAt !== undefined) continue
      if (task.execution.dispatchingRunAt !== undefined) {
        // A prior host died after reserving but before opening the execution.
        // Live reservations are protected by the in-memory guard; stale ones
        // are returned to the durable queue on the first tick after restart.
        const key = `${task.id}:${task.execution.dispatchingRunAt}`
        if (!this.dispatching.has(key)) await this.restoreQueued(task.id, task.execution.dispatchingRunAt)
        continue
      }

      if (task.execution.cron !== undefined) {
        // Periodic (定期执行): refire at every cron match.
        if (task.execution.nextRunAt === undefined) continue
        if (task.execution.nextRunAt > now) continue
        const missed = now - task.execution.nextRunAt > this.skipAfterMs()

        if (missed) await this.advanceAndMark(task.id, now, undefined, task.execution.nextRunAt)
        else await this.queueCron(task.id, now, task.execution.nextRunAt)
      } else if (task.execution.runAt !== undefined) {
        // One-shot (定时执行): fire once at the instant, then consume it.
        const due = task.execution.runAt
        if (due > now) continue
        const missed = now - due > this.skipAfterMs()

        if (missed) await this.consumeRunAt(task.id, now, due)
        else await this.queueRunAt(task.id, now, due)
      }
    }

    // Re-read after the queue mutations. Stable due-time order prevents cards
    // later in the ledger from starving behind a fixed snapshot order.
    const queued = this.deps.store.snapshot().tasks
      .filter(task => task.execution.mode === 'scheduled' && task.status === 'todo'
        && task.trashedAt === undefined && task.execution.queuedRunAt !== undefined)
      .sort((a, b) => (a.execution.queuedRunAt! - b.execution.queuedRunAt!)
        || ((a.execution.queuedAt ?? 0) - (b.execution.queuedAt ?? 0)) || a.id.localeCompare(b.id))
    for (const task of queued) {
      if (this.deps.execution.inFlight() >= this.maxConcurrent()) break
      const queuedWindow = task.execution.queuedRunAt!
      if (!await this.reserveDispatch(task.id, queuedWindow)) continue
      const key = `${task.id}:${queuedWindow}`
      this.dispatching.add(key)
      try {
        const result = await this.deps.execution.run(task.id, 'scheduled', { scheduledWindow: queuedWindow }).catch(error => {
          console.error('[dsh-taskboard] scheduled run failed:', error)
          return undefined
        })
        // The production execution gate consumes this marker atomically with
        // opening its running record. Retain this idempotent cleanup for narrow
        // execution adapters (and test faces) that only report a successful
        // dispatch and do not own the ledger mutation.
        if (result?.ok) await this.markDispatched(task.id, queuedWindow)
        else await this.restoreQueued(task.id, queuedWindow)
        // A capacity race leaves the durable entry intact for the next pump.
        if (result !== undefined && !result.ok && !result.error.includes('concurrency')) {
          console.error('[dsh-taskboard] scheduled dispatch rejected:', result.error)
        }
      } finally {
        this.dispatching.delete(key)
      }
    }
  }

  /** Queue one periodic window and advance its next cron time atomically. */
  private async queueCron(taskId: string, now: number, due: number): Promise<void> {
    await this.deps.store.mutate('task-updated', ledger => {
      const task = ledger.tasks.find(t => t.id === taskId)
      if (task === undefined || task.execution.cron === undefined || task.execution.queuedRunAt !== undefined) return undefined
      if (task.status !== 'todo' || task.trashedAt !== undefined || task.execution.nextRunAt !== due) return undefined
      const match = parseCron(task.execution.cron)
      const next = match === null ? undefined : nextCronTime(match, now) ?? undefined
      if (next === undefined) return undefined
      task.execution.nextRunAt = next
      task.execution.queuedRunAt = due
      task.execution.queuedAt = now
      return [task]
    })
  }

  /** Queue a one-shot window atomically, consuming its public runAt field. */
  private async queueRunAt(taskId: string, now: number, due: number): Promise<void> {
    await this.deps.store.mutate('task-updated', ledger => {
      const task = ledger.tasks.find(t => t.id === taskId)
      if (task === undefined || task.execution.runAt !== due || task.execution.queuedRunAt !== undefined) return undefined
      if (task.status !== 'todo' || task.trashedAt !== undefined) return undefined
      delete task.execution.runAt
      task.execution.nextRunAt = undefined
      task.execution.queuedRunAt = due
      task.execution.queuedAt = now
      return [task]
    })
  }

  /** Finalize a queue entry when a lightweight execution adapter accepted it. */
  private async markDispatched(taskId: string, queuedWindow: number): Promise<void> {
    await this.deps.store.mutate('task-updated', ledger => {
      const task = ledger.tasks.find(t => t.id === taskId)
      if (task === undefined || task.execution.dispatchingRunAt !== queuedWindow) return undefined
      delete task.execution.dispatchingRunAt
      delete task.execution.queuedAt
      task.execution.lastTriggeredAt = queuedWindow
      return [task]
    })
  }

  /** Reserve one FIFO entry before calling an execution face. */
  private async reserveDispatch(taskId: string, queuedWindow: number): Promise<boolean> {
    let reserved = false
    await this.deps.store.mutate('task-updated', ledger => {
      const task = ledger.tasks.find(t => t.id === taskId)
      if (task === undefined || task.execution.queuedRunAt !== queuedWindow) return undefined
      if (task.status !== 'todo' || task.trashedAt !== undefined) return undefined
      delete task.execution.queuedRunAt
      task.execution.dispatchingRunAt = queuedWindow
      reserved = true
      return [task]
    })
    return reserved
  }

  /** Return an execution-gate rejection to the durable FIFO queue. */
  private async restoreQueued(taskId: string, queuedWindow: number): Promise<void> {
    await this.deps.store.mutate('task-updated', ledger => {
      const task = ledger.tasks.find(t => t.id === taskId)
      if (task === undefined || task.execution.dispatchingRunAt !== queuedWindow) return undefined
      delete task.execution.dispatchingRunAt
      task.execution.queuedRunAt = queuedWindow
      return [task]
    })
  }

  /**
   * Consume a one-shot task's runAt in one serial-queue mutation: the field
   * and nextRunAt are cleared the moment the trigger fires, so the task can
   * never fire twice. A window missed while the host was down is consumed
   * too, with a system comment instead of a silent drop.
   */
  private async consumeRunAt(taskId: string, now: number, missedDue: number | undefined): Promise<void> {
    await this.deps.store.mutate('task-updated', (ledger) => {
      const task = ledger.tasks.find(t => t.id === taskId)
      if (task === undefined || task.execution.runAt === undefined) return undefined
      if (task.status !== 'todo' || task.trashedAt !== undefined) return undefined
      delete task.execution.runAt
      task.execution.nextRunAt = undefined
      task.execution.lastTriggeredAt = now
      if (missedDue !== undefined) {
        task.comments.push({
          id: newCommentId(),
          body: normalizeBody('[系统] 定时执行错过触发时间（主机当时未运行），本次不再补跑；可手动执行或修改定时。'),
          systemKey: 'sys.runAtMissed',
          version: 1,
          createdAt: now,
        })
      }
      return [task]
    })
  }

  /**
   * Recompute the next run and record the trigger instant for one scheduled
   * task, in one serial-queue mutation. S12: a cron that can no longer match
   * anything within the 4-year scan window (only reachable through a
   * hand-edited ledger — every normal entry point validates) would otherwise
   * leave nextRunAt in the past and spin a full ~2M-iteration scan every
   * tick; it is cleared with a system comment instead of dying silently.
   */
  private async advanceAndMark(taskId: string, now: number, triggeredAt: number | undefined, missedDue?: number): Promise<void> {
    await this.deps.store.mutate('task-updated', (ledger) => {
      const task = ledger.tasks.find(t => t.id === taskId)
      if (task === undefined || task.execution.cron === undefined) return undefined
      if (task.status !== 'todo' || task.trashedAt !== undefined) return undefined
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
      if (missedDue !== undefined) {
        task.comments.push({
          id: newCommentId(),
          body: normalizeBody('[系统] 定期执行错过触发时间（主机当时未运行），本次不再补跑；可手动执行或修改定时。'),
          systemKey: 'sys.cronMissed',
          version: 1,
          createdAt: now,
        })
      }
      return [task]
    })
  }
}

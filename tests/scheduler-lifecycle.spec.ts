/**
 * Lifecycle tests for the host cron scheduler (`SchedulerService`): the
 * start()/dispose() timer wiring (60s interval + 3s catchup setTimeout) and
 * the tick() semantics around due / not-due / running / trashed / missed
 * scheduled tasks — previously zero coverage.
 *
 * Fake timers drive the scheduler's OWN clock (setInterval face + global
 * setTimeout catchup + the injected `now`), while the ledger stays a REAL
 * TaskStore over a mkdtemp file. Because tick()'s async chain awaits real
 * fs IO, every advance is followed by a real-event-loop pump
 * (`node:timers`'s unfaked setTimeout) so chains settle before asserting.
 *
 * @module dsh-taskboard/tests/scheduler-lifecycle
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as realSetTimeout } from 'node:timers'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExecutionService } from '../src/host/execution.ts'
import { SchedulerService } from '../src/host/scheduler.ts'
import { TaskStore } from '../src/host/store.ts'
import type { ExecutionConfig, TaskRecord } from '../src/shared/protocol.ts'

/**
 * Deterministic epoch base: a whole UTC minute (1_700_000_040_000 ms), and
 * since every real timezone offset is a whole number of minutes, also a whole
 * LOCAL minute — nextCronTime for '* * * * *' therefore lands exactly on
 * T0 + 60_000, T0 + 120_000, ... regardless of the machine's timezone.
 */
const T0 = 1_700_000_040_000

let dir: string
let storeSeq = 0
let store: InstanceType<typeof TaskStore>
let scheduler: SchedulerService
let runs: Array<{ id: string; trigger: 'manual' | 'scheduled' }>

/** Real-event-loop delay — immune to vi.useFakeTimers (builtin module ref). */
function realDelay(ms: number): Promise<void> {
  return new Promise(resolve => { realSetTimeout(resolve, ms) })
}

/** Pump the REAL loop until `predicate` holds (real fs IO settles here). */
async function waitFor(predicate: () => boolean, budgetMs = 2_000): Promise<boolean> {
  for (let waited = 0; waited < budgetMs; waited += 5) {
    if (predicate()) return true
    await realDelay(5)
  }
  return predicate()
}

/** Give any in-flight tick chain real time to finish (negative assertions). */
async function settle(budgetMs = 100): Promise<void> {
  for (let waited = 0; waited < budgetMs; waited += 10) await realDelay(10)
}

/** A complete, plausible scheduled task record for the ledger file. */
function scheduledTask(id: string, execution: ExecutionConfig, extra: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id,
    title: `scheduled ${id}`,
    description: '',
    prompt: '',
    workspaceId: 'ws-sched',
    urgency: 'normal',
    status: 'todo',
    blocked: false,
    execution,
    version: 1,
    createdAt: T0,
    updatedAt: T0,
    createdBy: { kind: 'user' },
    updatedBy: { kind: 'user' },
    comments: [],
    executions: [],
    ...extra,
  }
}

/**
 * Seed a ledger FILE directly and hand back a fresh, not-yet-loaded store —
 * tick() must call store.load() itself to ever see these tasks.
 */
async function seed(tasks: TaskRecord[]): Promise<InstanceType<typeof TaskStore>> {
  storeSeq += 1
  const file = join(dir, `ledger-${storeSeq}.json`)
  await writeFile(file, JSON.stringify({ schemaVersion: 1, revision: 1, tasks }, null, 2))
  return new TaskStore({ file })
}

/** Scheduler under a run-counting execution stub and faked global timers. */
function makeScheduler(options: { queueMaxAgeMs?: number; dispatchIntervalMs?: number } = {}): SchedulerService {
  const executionFace: Pick<ExecutionService, 'run' | 'inFlight'> = {
    run: async (taskId, trigger) => {
      runs.push({ id: taskId, trigger })
      return { ok: true, executionId: 'e-stub', sessionId: 's-stub' }
    },
    inFlight: () => 0,
  }
  return new SchedulerService({
    store,
    execution: executionFace,
    now: () => Date.now(),
    queueMaxAgeMs: options.queueMaxAgeMs,
    dispatchIntervalMs: options.dispatchIntervalMs,
    // Injectable timer face (exercised on purpose): delegates to the faked
    // globals, so vi.advanceTimersByTimeAsync drives the 60s interval.
    timers: {
      setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
      clearInterval: (handle: unknown) => clearInterval(handle as ReturnType<typeof setInterval>),
    },
  })
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tb-scheduler-'))
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(T0)
  runs = []
})

afterEach(() => {
  // Safety net: a failed test must not leak the interval into the next one.
  scheduler?.dispose()
  scheduler = undefined as unknown as SchedulerService
  vi.useRealTimers()
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('SchedulerService lifecycle', () => {
  it('clearQueue(): drops every durable queue entry with a system comment, without running them', async () => {
    store = await seed(['q1', 'q2'].map(id => scheduledTask(id, {
      mode: 'scheduled', cron: '* * * * *', nextRunAt: T0 + 60_000,
      queuedRunAt: T0, queuedAt: T0,
    })))
    scheduler = makeScheduler()

    let changes = 0
    const unsubscribe = store.subscribe(() => { changes += 1 })
    const cleared = await scheduler.clearQueue()
    unsubscribe()

    expect(cleared).toBe(2)
    expect(changes).toBe(1)
    expect(runs).toEqual([])
    for (const id of ['q1', 'q2']) {
      const task = store.get(id)
      expect(task?.execution.queuedRunAt).toBeUndefined()
      expect(task?.execution.queuedAt).toBeUndefined()
      expect(task?.comments.some(c => c.systemKey === 'sys.queueCleared')).toBe(true)
    }
    // A follow-up tick must not resurrect or dispatch anything.
    await scheduler.tick()
    expect(runs).toEqual([])
  })

  it('clearQueue(): returns 0 on an empty queue and leaves dispatching entries alone', async () => {
    store = await seed([scheduledTask('q-dispatching', {
      mode: 'scheduled', cron: '* * * * *', nextRunAt: T0 + 60_000,
      dispatchingRunAt: T0, queuedAt: T0,
    })])
    scheduler = makeScheduler()

    expect(await scheduler.clearQueue()).toBe(0)
    expect(store.get('q-dispatching')?.execution.dispatchingRunAt).toBe(T0)
  })

  it('expires an old durable queue entry only when an explicit shelf life is configured', async () => {
    store = await seed([scheduledTask('t-expired', {
      mode: 'scheduled', cron: '* * * * *', nextRunAt: T0 + 60_000,
      queuedRunAt: T0 - 120_000, queuedAt: T0 - 61_000,
    })])
    scheduler = makeScheduler({ queueMaxAgeMs: 60_000 })

    await scheduler.tick()

    expect(runs).toEqual([])
    const task = store.get('t-expired')
    expect(task?.execution.queuedRunAt).toBeUndefined()
    expect(task?.execution.queuedAt).toBeUndefined()
    expect(task?.comments.some(c => c.systemKey === 'sys.queuedExpired')).toBe(true)
  })

  it('spaces dispatches and serializes overlapping tick requests', async () => {
    store = await seed(['a', 'b', 'c'].map(id => scheduledTask(id, {
      mode: 'scheduled', cron: '* * * * *', nextRunAt: T0 + 60_000,
      queuedRunAt: T0, queuedAt: T0,
    })))
    const startedAt: number[] = []
    const executionFace: Pick<ExecutionService, 'run' | 'inFlight'> = {
      run: async (taskId, trigger) => {
        runs.push({ id: taskId, trigger })
        startedAt.push(Date.now())
        return { ok: true, executionId: `e-${taskId}`, sessionId: `s-${taskId}` }
      },
      inFlight: () => 0,
    }
    scheduler = new SchedulerService({
      store,
      execution: executionFace,
      now: () => Date.now(),
      dispatchIntervalMs: 1_000,
      timers: {
        setInterval: (fn, ms) => setInterval(fn, ms),
        clearInterval: handle => clearInterval(handle as ReturnType<typeof setInterval>),
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
    })

    const first = scheduler.tick()
    const overlapping = scheduler.tick()
    expect(await waitFor(() => runs.length === 1)).toBe(true)
    await settle(30)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await waitFor(() => runs.length === 2)).toBe(true)
    await settle(30)
    await vi.advanceTimersByTimeAsync(1_000)
    await Promise.all([first, overlapping])

    expect(runs.map(run => run.id)).toEqual(['a', 'b', 'c'])
    expect(startedAt).toEqual([T0, T0 + 1_000, T0 + 2_000])
  })

  it('start(): the 3s catchup tick runs a due task once and advances nextRunAt into the future', async () => {
    store = await seed([scheduledTask('t-due', { mode: 'scheduled', cron: '* * * * *', nextRunAt: T0 - 30_000 })])
    scheduler = makeScheduler()
    scheduler.start()

    // 3s + ε: only the catchup setTimeout is in range (interval fires at 60s).
    await vi.advanceTimersByTimeAsync(3_100)
    expect(await waitFor(() => runs.length >= 1)).toBe(true)
    await settle(50)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toEqual({ id: 't-due', trigger: 'scheduled' })

    // '* * * * *' from T0 + 3s (a whole local minute) → next window T0 + 60s.
    const task = store.get('t-due')
    expect(task?.execution.nextRunAt).toBe(T0 + 60_000)
    expect(task?.execution.nextRunAt).toBeGreaterThan(Date.now())
    // The trigger instant recorded is the DUE time, not the tick time.
    expect(task?.execution.lastTriggeredAt).toBe(T0 - 30_000)
  })

  it('the 60s interval keeps ticking: one more run per due window', async () => {
    store = await seed([scheduledTask('t-due', { mode: 'scheduled', cron: '* * * * *', nextRunAt: T0 - 30_000 })])
    scheduler = makeScheduler()
    scheduler.start()

    await vi.advanceTimersByTimeAsync(3_100) // catchup: run #1, nextRunAt → T0+60s
    expect(await waitFor(() => runs.length >= 1)).toBe(true)
    // The scheduler now durably reserves then dispatches the queue entry;
    // wait for that serial mutation before advancing fake time into tick #2.
    await settle(50)

    // Crosses the interval's first firing at exactly T0 + 60s, where
    // nextRunAt (T0+60s) <= now makes the task due again: run #2.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await waitFor(() => runs.length >= 2)).toBe(true)
    await settle(50)
    expect(runs).toHaveLength(2)
    expect(runs[1]).toEqual({ id: 't-due', trigger: 'scheduled' })

    const task = store.get('t-due')
    expect(task?.execution.nextRunAt).toBe(T0 + 120_000)
    expect(task?.execution.lastTriggeredAt).toBe(T0 + 60_000)
  })

  it('dispose() stops both timers: no further ticks after teardown', async () => {
    store = await seed([scheduledTask('t-due', { mode: 'scheduled', cron: '* * * * *', nextRunAt: T0 - 30_000 })])
    scheduler = makeScheduler()
    scheduler.start()
    await vi.advanceTimersByTimeAsync(3_100)
    expect(await waitFor(() => runs.length >= 1)).toBe(true)
    await settle(50)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await waitFor(() => runs.length >= 2)).toBe(true)

    scheduler.dispose()
    expect(vi.getTimerCount()).toBe(0)

    // Way past the next two interval windows — nothing may fire again.
    await vi.advanceTimersByTimeAsync(120_000)
    await settle(150)
    expect(runs).toHaveLength(2)
  })

  it('dispose() before the catchup fires clears it too (never runs once)', async () => {
    store = await seed([scheduledTask('t-due', { mode: 'scheduled', cron: '* * * * *', nextRunAt: T0 - 30_000 })])
    scheduler = makeScheduler()
    scheduler.start()
    scheduler.dispose()
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(120_000)
    await settle(150)
    expect(runs).toHaveLength(0)
  })

  it('a not-yet-due task (future nextRunAt) is never triggered', async () => {
    store = await seed([scheduledTask('t-future', { mode: 'scheduled', cron: '* * * * *', nextRunAt: T0 + 10 * 60_000 })])
    scheduler = makeScheduler()
    scheduler.start()

    await vi.advanceTimersByTimeAsync(3_100) // catchup tick
    await vi.advanceTimersByTimeAsync(130_000) // two interval ticks (60s, 120s)
    await settle(150)
    expect(runs).toHaveLength(0)
    expect(store.get('t-future')?.execution.nextRunAt).toBe(T0 + 10 * 60_000) // untouched
  })

  it('an in_progress task is skipped (and its schedule is NOT advanced)', async () => {
    store = await seed([scheduledTask('t-busy', { mode: 'scheduled', cron: '* * * * *', nextRunAt: T0 - 30_000 }, { status: 'in_progress' })])
    scheduler = makeScheduler()
    scheduler.start()

    await vi.advanceTimersByTimeAsync(3_100)
    await settle(150)
    expect(runs).toHaveLength(0)
    // Still in the past: the guard runs before advanceAndMark.
    expect(store.get('t-busy')?.execution.nextRunAt).toBe(T0 - 30_000)
  })

  it.each(['backlog', 'done', 'canceled', 'archived'] as const)(
    'a %s task is skipped without consuming its scheduled window',
    async status => {
      store = await seed([scheduledTask(`t-${status}`, { mode: 'scheduled', cron: '* * * * *', nextRunAt: T0 - 30_000 }, { status })])
      scheduler = makeScheduler()
      scheduler.start()

      await vi.advanceTimersByTimeAsync(3_100)
      await settle(100)
      expect(runs).toHaveLength(0)
      expect(store.get(`t-${status}`)?.execution.nextRunAt).toBe(T0 - 30_000)
    },
  )

  it('a trashed task is skipped (and its schedule is NOT advanced)', async () => {
    store = await seed([scheduledTask('t-trashed', { mode: 'scheduled', cron: '* * * * *', nextRunAt: T0 - 30_000 }, { trashedAt: T0 - 1_000 })])
    scheduler = makeScheduler()
    scheduler.start()

    await vi.advanceTimersByTimeAsync(3_100)
    await settle(150)
    expect(runs).toHaveLength(0)
    expect(store.get('t-trashed')?.execution.nextRunAt).toBe(T0 - 30_000)
  })

  it('a window missed by more than 5 minutes is advanced but not caught up', async () => {
    // 6 minutes overdue: the scheduler moves on to the next window and does
    // NOT execute (missed-while-down semantics), recording no trigger.
    store = await seed([scheduledTask('t-missed', { mode: 'scheduled', cron: '* * * * *', nextRunAt: T0 - 6 * 60_000 })])
    scheduler = makeScheduler()
    scheduler.start()

    await vi.advanceTimersByTimeAsync(3_100)
    // The store starts unloaded: undefined must not satisfy the wait before
    // the catchup has loaded and durably advanced the schedule.
    expect(await waitFor(() => store.get('t-missed')?.execution.nextRunAt === T0 + 60_000)).toBe(true)
    await settle(100)
    expect(runs).toHaveLength(0)
    const task = store.get('t-missed')
    expect(task?.execution.nextRunAt).toBe(T0 + 60_000)
    expect(task?.execution.lastTriggeredAt).toBeUndefined()
    expect(task?.comments.some(c => c.systemKey === 'sys.cronMissed')).toBe(true)
  })
})

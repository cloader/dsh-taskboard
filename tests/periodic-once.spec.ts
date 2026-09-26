/**
 * 0.7.x execution-mode split tests: PERIODIC scheduled tasks (cron) vs
 * ONE-SHOT scheduled tasks (runAt, fires exactly once), plus the pure
 * helpers behind them — normalizeExecution's runAt handling, the import
 * path's historical-runAt tolerance, and spawnNextCycle (the successor
 * todo card minted when a periodic round finishes).
 *
 * @module dsh-taskboard/tests/periodic-once
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { ExecutionService } from '../src/host/execution.ts'
import { SchedulerService } from '../src/host/scheduler.ts'
import { TaskStore } from '../src/host/store.ts'
import {
  normalizeExecution,
  spawnNextCycle,
  validateImportedTask,
  type TaskRecord,
} from '../src/shared/protocol.ts'

const T0 = 1_700_000_040_000

let dir: string | undefined
afterAll(async () => { if (dir !== undefined) await rm(dir, { recursive: true, force: true }) })

function taskOf(id: string, execution: TaskRecord['execution'], extra: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id, title: 't ' + id, description: '', prompt: '', workspaceId: 'ws',
    urgency: 'normal', status: 'todo', blocked: false, execution,
    version: 1, createdAt: T0, updatedAt: T0,
    createdBy: { kind: 'user' }, updatedBy: { kind: 'user' },
    comments: [], executions: [], ...extra,
  }
}

describe('normalizeExecution runAt', () => {
  it('accepts an epoch-ms one-shot and mirrors it into nextRunAt', () => {
    const cfg = normalizeExecution({ mode: 'scheduled', runAt: T0 + 60_000 }, T0)
    expect(cfg).toEqual({ mode: 'scheduled', runAt: T0 + 60_000, nextRunAt: T0 + 60_000 })
  })

  it('accepts an ISO string and normalizes to epoch ms', () => {
    const cfg = normalizeExecution({ mode: 'scheduled', runAt: new Date(T0 + 60_000).toISOString() }, T0)
    expect(cfg.runAt).toBe(T0 + 60_000)
  })

  it('defaults periodic cron completion to a new todo successor', () => {
    expect(normalizeExecution({ mode: 'scheduled', cron: '0 9 * * *' }, T0).periodicCompletion).toBe('spawn')
  })

  it('rejects a past runAt by default and cron/runAt together', () => {
    expect(() => normalizeExecution({ mode: 'scheduled', runAt: T0 - 1 }, T0)).toThrow()
    expect(() => normalizeExecution({ mode: 'scheduled', cron: '* * * * *', runAt: T0 + 1 }, T0)).toThrow(/mutually exclusive/)
    expect(() => normalizeExecution({ mode: 'scheduled', runAt: 'not-a-date' }, T0)).toThrow()
  })

  it('the import path keeps a historical (past) runAt', () => {
    const raw = taskOf('t-hist', { mode: 'scheduled', runAt: T0 - 60_000, nextRunAt: T0 - 60_000 })
    const result = validateImportedTask(JSON.parse(JSON.stringify(raw)), T0)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.task.execution.runAt).toBe(T0 - 60_000)
  })
})

describe('spawnNextCycle', () => {
  it('mints a todo successor carrying the recomputed cron and spawnedFrom', () => {
    const source = taskOf('t-src', { mode: 'scheduled', cron: '0 9 * * *' }, {
      urgency: 'urgent',
      checklist: [{ id: 'k1', text: 'done?', checked: true, checkedBy: 'user', checkedAt: T0, note: 'x' }],
      branch: 'task/t-src+abc',
    })
    const next = spawnNextCycle(source, 'e-1', T0)
    expect(next.id).not.toBe(source.id)
    expect(next.status).toBe('todo')
    expect(next.spawnedFrom).toBe('t-src')
    expect(next.execution).toEqual({ mode: 'scheduled', cron: '0 9 * * *', nextRunAt: expect.any(Number), periodicCompletion: 'spawn' })
    expect(next.execution.nextRunAt!).toBeGreaterThan(T0)
    expect(next.urgency).toBe('urgent')
    expect(next.branch).toBe('task/t-src+abc')
    expect(next.checklist?.[0]?.checked).toBe(false)
    expect(next.createdBy).toEqual({ kind: 'system' })
    expect(next.executions).toEqual([])
    expect(next.comments[0]?.systemKey).toBe('sys.spawnedFrom')
  })

  it('preserves the configured completion policy on a successor', () => {
    const source = taskOf('t-src', { mode: 'scheduled', cron: '0 9 * * *', periodicCompletion: 'spawn' })
    expect(spawnNextCycle(source, 'e-1', T0).execution.periodicCompletion).toBe('spawn')
  })

  it('throws on a dead cron (no future match)', () => {
    const source = taskOf('t-dead', { mode: 'scheduled', cron: '99 9 * * *' })
    expect(() => spawnNextCycle(source, 'e-1', T0)).toThrow()
  })
})

describe('scheduler periodic vs one-shot', () => {
  async function seeded(tasks: TaskRecord[]): Promise<TaskStore> {
    dir = dir ?? await mkdtemp(join(tmpdir(), 'tb-periodic-'))
    const file = join(dir, 'ledger-' + Math.random().toString(36).slice(2) + '.json')
    await writeFile(file, JSON.stringify({ schemaVersion: 1, revision: 1, tasks }, null, 2))
    return new TaskStore({ file })
  }

  function schedulerOver(store: TaskStore, runs: Array<{ id: string }>): SchedulerService {
    const face: Pick<ExecutionService, 'run' | 'inFlight'> = {
      run: async (id: string) => { runs.push({ id }); return { ok: true, executionId: 'e', sessionId: 's' } },
      inFlight: () => 0,
    }
    return new SchedulerService({ store, execution: face, now: () => T0 + 30_000 })
  }

  it('an in_review cron card is never fired (only todo triggers)', async () => {
    const store = await seeded([taskOf('t-rev', { mode: 'scheduled', cron: '* * * * *', nextRunAt: T0 - 1_000 }, { status: 'in_review' })])
    const runs: Array<{ id: string }> = []
    await schedulerOver(store, runs).tick()
    expect(runs).toHaveLength(0)
    expect(store.get('t-rev')?.execution.nextRunAt).toBe(T0 - 1_000)
  })

  it('a due one-shot fires once and consumes its runAt', async () => {
    const store = await seeded([taskOf('t-once', { mode: 'scheduled', runAt: T0 - 10_000, nextRunAt: T0 - 10_000 })])
    const runs: Array<{ id: string }> = []
    await schedulerOver(store, runs).tick()
    expect(runs).toEqual([{ id: 't-once' }])
    const task = store.get('t-once')
    expect(task?.execution.runAt).toBeUndefined()
    expect(task?.execution.nextRunAt).toBeUndefined()
    // A second tick must not re-fire (runAt consumed).
    await schedulerOver(store, runs).tick()
    expect(runs).toHaveLength(1)
  })

  it('a long-missed one-shot is consumed with a comment and never runs', async () => {
    const store = await seeded([taskOf('t-missed', { mode: 'scheduled', runAt: T0 - 10 * 60_000, nextRunAt: T0 - 10 * 60_000 })])
    const runs: Array<{ id: string }> = []
    await schedulerOver(store, runs).tick()
    expect(runs).toHaveLength(0)
    const task = store.get('t-missed')
    expect(task?.execution.runAt).toBeUndefined()
    expect(task?.comments.some(c => c.systemKey === 'sys.runAtMissed')).toBe(true)
  })
})

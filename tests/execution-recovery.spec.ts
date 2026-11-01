import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { ExecutionService, type EventsFace } from '../src/host/execution.ts'
import { ExternalSessionSyncService } from '../src/host/session-sync.ts'
import { TaskStore } from '../src/host/store.ts'
import type { TaskRecord } from '../src/shared/protocol.ts'
import { waitFor } from './wait-for.ts'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const fn of cleanups.splice(0).reverse()) await fn(); vi.restoreAllMocks() })

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'tb-p1-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  const store = new TaskStore({ file: join(dir, 'ledger.json') })
  await store.mutate('settings-updated', l => { l.settings = { syncExternalSessions: true }; return [] })
  const listeners = new Set<Parameters<EventsFace['onSessionEvent']>[0]>()
  const events: EventsFace = { onSessionEvent: fn => { listeners.add(fn); return () => { listeners.delete(fn) } } }
  let finish!: () => void
  const idle = new Promise<void>(resolve => { finish = resolve })
  const agent = { id: 'ordinary-user-session', inject: vi.fn(), followup: vi.fn(), whenIdle: vi.fn(() => idle), cancel: vi.fn() }
  const stop = vi.fn(async () => { agent.cancel(); await idle })
  const workspaces = { get: () => ({ id: 'ws-a', path: dir, title: 'A' }), list: () => [{ id: 'ws-a', path: dir, title: 'A' }], resolveByPath: async () => ({ id: 'ws-a' }), attach: async () => {} }
  const service = new ExecutionService({ store, events, workspaces, now: () => 120_000, settlementRetryDelaysMs: [0, 0],
    agents: { create: async () => ({ agent, dispose: stop }) }, liveAgent: () => agent })
  cleanups.push(() => service.dispose())
  const sync = new ExternalSessionSyncService({ store, events, workspaces, now: () => 120_000, scanIntervalMs: 0,
    isSessionManaged: id => service.managesSession(id), sessions: { get: () => ({ status: 'running' }) } })
  cleanups.push(() => sync.dispose())
  const emit = async (type: string, reason: unknown = 'stop') => {
    for (const fn of listeners) await fn(agent.id, { type, data: { reason } }, { header: { cwd: dir } })
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})
  return { store, service, sync, agent, stop, finish, emit }
}

it('stops an externally synced agent and waits for idle before reporting cancellation', async () => {
  const f = await fixture()
  await f.emit('turn/start')
  const id = f.store.snapshot().tasks[0]!.id
  const cancelling = f.service.cancel(id)
  await waitFor(() => f.agent.cancel.mock.calls.length === 1)
  expect(f.agent.cancel).toHaveBeenCalledWith({ kind: 'user' })
  expect(f.store.get(id)!.executions[0]!.outcome).toBe('running')
  // Cancellation can emit turn/end before the driver reaches idle. The sync
  // service must leave this managed run for the cancellation writer to settle.
  await f.emit('turn/end', { kind: 'cancel' })
  await f.sync.scanActiveSessions()
  expect(f.store.get(id)!.executions[0]!.outcome).toBe('running')
  f.finish()
  expect(await cancelling).toMatchObject({ ok: true })
  expect(f.store.get(id)!.executions[0]!.outcome).toBe('cancelled')
  expect(f.store.get(id)!.status).toBe('todo')
  expect(f.store.get(id)!.claimedBy).toBeUndefined()
  expect(f.service.inFlight()).toBe(0)
})

it('retries an external agent stop failure without reporting a false cancellation', async () => {
  const f = await fixture()
  await f.emit('turn/start')
  const id = f.store.snapshot().tasks[0]!.id
  f.agent.cancel.mockImplementationOnce(() => { throw new Error('stop failed') })
  expect(await f.service.cancel(id)).toMatchObject({ ok: false })
  expect(f.store.get(id)!.executions[0]!.outcome).toBe('running')
  await waitFor(() => f.agent.cancel.mock.calls.length === 2)
  f.finish()
  await waitFor(() => f.service.inFlight() === 0)
  expect(f.store.get(id)!.executions[0]!.outcome).toBe('cancelled')
})

async function reviewFixture() {
  const f = await fixture()
  f.sync.dispose()
  const seed: TaskRecord = { id: 't-review', title: 'Review', description: '', prompt: '', workspaceId: 'ws-a',
    urgency: 'normal', status: 'in_review', blocked: false, isolation: 'none', execution: { mode: 'claim' },
    version: 1, createdAt: 1, updatedAt: 1, createdBy: { kind: 'user' }, updatedBy: { kind: 'user' },
    comments: [{ id: 'c-review', body: 'Please adjust this', version: 1, createdAt: 2 }], executions: [] }
  await f.store.mutate('task-created', l => { l.tasks.push(seed); return [seed] })
  return f
}

it.each(['before commit', 'after commit'] as const)('keeps comment execution tracked when delivery metadata fails %s', async timing => {
  const f = await reviewFixture()
  const mutate = f.store.mutate.bind(f.store)
  let fail = true
  vi.spyOn(f.store, 'mutate').mockImplementation(async (kind, fn) => {
    if (kind === 'comment-added' && fail) {
      fail = false
      if (timing === 'after commit') await mutate(kind, fn)
      throw new Error('delivery write failed')
    }
    return mutate(kind, fn)
  })
  expect(await f.service.deliverComments('t-review')).toMatchObject({ ok: true, delivered: 'run' })
  expect(f.service.inFlight()).toBe(1)
  expect(f.agent.whenIdle).toHaveBeenCalled()
  await f.store.mutate('task-moved', l => {
    l.tasks[0]!.status = 'in_review'
    delete l.tasks[0]!.claimedBy
    delete l.tasks[0]!.claimedAt
    return l.tasks
  })
  expect(await f.service.deliverComments('t-review')).toMatchObject({ ok: false, error: '没有待投递的留言' })
  expect(f.agent.followup).toHaveBeenCalledOnce()
  f.finish()
  await waitFor(() => f.service.inFlight() === 0)
  const task = f.store.get('t-review')!
  expect(task.executions[0]!.outcome).toBe('succeeded')
  expect(task.claimedBy).toBeUndefined()
  expect(task.comments.find(c => c.id === 'c-review')!.deliveredExecutionId).toBe(task.executions[0]!.id)
  expect(task.comments.filter(c => c.systemKey === 'sys.commentWoke')).toHaveLength(1)
})

it('retains a stoppable comment execution through persistent metadata failure and recovers without redelivery', async () => {
  const f = await reviewFixture()
  const mutate = f.store.mutate.bind(f.store)
  let unavailable = true
  vi.spyOn(f.store, 'mutate').mockImplementation((kind, fn) => {
    if (kind === 'comment-added' && unavailable) return Promise.reject(new Error('ENOSPC'))
    return mutate(kind, fn)
  })
  expect(await f.service.deliverComments('t-review')).toMatchObject({ ok: true })
  const cancelling = f.service.cancel('t-review')
  await waitFor(() => f.agent.cancel.mock.calls.length === 1)
  f.finish()
  expect(await cancelling).toMatchObject({ ok: false })
  await waitFor(() => vi.mocked(console.error).mock.calls.some(call => String(call[0]).includes('exhausted')))
  expect(f.service.inFlight()).toBe(1)
  expect(f.store.get('t-review')!.executions[0]!.outcome).toBe('running')
  unavailable = false
  expect(await f.service.cancel('t-review')).toMatchObject({ ok: true })
  expect(f.store.get('t-review')!.executions[0]!.outcome).toBe('cancelled')
  expect(f.store.get('t-review')!.comments[0]!.deliveredAt).toBeDefined()
  expect(f.agent.followup).toHaveBeenCalledOnce()
  expect(f.stop).toHaveBeenCalledOnce()
})

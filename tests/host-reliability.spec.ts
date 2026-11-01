import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExecutionService, type AgentsFace, type ExecutionDeps, type EventsFace } from '../src/host/execution.ts'
import { ExternalSessionSyncService } from '../src/host/session-sync.ts'
import { TaskStore } from '../src/host/store.ts'
import type { TaskRecord } from '../src/shared/protocol.ts'
import { waitFor } from './wait-for.ts'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  vi.restoreAllMocks()
})

async function directory() {
  const dir = await mkdtemp(join(tmpdir(), 'tb-reliability-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  return dir
}

// A real child process makes any missing terminal catch fatal without relying
// on Vitest's own unhandled-rejection listeners or killing the test runner.
const startupProbe = `
  import { apply } from './lib/index.js'
  import { Readable } from 'node:stream'
  process.on('unhandledRejection', error => { console.error('fatal load failure', error); process.exit(91) })
  const tools = [], routes = [], cleanups = []
  const ctx = {
    tools: { register(tool) { tools.push(tool); return () => {} } },
    systemPrompt: { section: () => () => {} },
    effect(fn) { cleanups.push(fn()) },
    get: () => undefined, on: () => () => {},
    workspaceRegistry: { get: () => undefined, list: () => [], archivedSessionIds: [] },
    agents: { get: () => undefined },
    webServer: { register(route) { routes.push(route); return () => {} } },
    inject(keys, fn) { const dispose = fn(ctx); if (dispose) cleanups.push(dispose) },
  }
  apply(ctx)
  await new Promise(resolve => setImmediate(resolve))
  async function request(url, method = 'GET', body) {
    let status, response
    const req = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), {
      method, url, headers: { 'content-type': 'application/json', 'x-dsh-taskboard-upload': '1' },
    })
    const route = routes.find(route => route.kind === 'exact' && route.path === url)
      ?? routes.find(route => route.kind === 'prefix')
    await route.handler(req, { writeHead(s) { status = s }, end(b) { response = JSON.parse(b) } })
    return { status, body: response }
  }
  let toolError
  try { await tools.find(tool => tool.name === 'taskboard_list').execute({}, {}) }
  catch (error) { toolError = String(error) }
  const storage = await request('/dsh-taskboard/storage')
  const state = await request('/dsh-taskboard/state')
  const upload = await request('/dsh-taskboard/assets', 'POST', {})
  const events = await request('/dsh-taskboard/events')
  await new Promise(resolve => setImmediate(resolve))
  for (const cleanup of cleanups.reverse()) cleanup()
  console.log(JSON.stringify({ storage, state, upload, events, toolError }))
`

describe('storage startup failure isolation (#74)', () => {
  it.each(['missing configured directory', 'unusable default directory'])('%s keeps the host alive and storage guards closed', async mode => {
    const dir = await directory()
    let dataHome = dir
    if (mode === 'missing configured directory') {
      await writeFile(join(dir, 'dsh-taskboard-storage.json'), JSON.stringify({
        schemaVersion: 1, dataDirectory: join(dir, 'unmounted-volume'),
      }))
    } else {
      dataHome = join(dir, 'not-a-directory')
      await writeFile(dataHome, 'occupied')
    }
    const child = spawnSync(process.execPath, ['--input-type=module', '-e', startupProbe], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, DSH_HOME: dataHome }, encoding: 'utf8', timeout: 10_000,
    })
    expect(child.status, child.stderr).toBe(0)
    const report = JSON.parse(child.stdout.trim())
    expect(report.storage.status).toBe(200)
    expect(report.storage.body.value).toMatchObject({ writable: false, error: expect.any(String) })
    expect(report.state.status).toBe(500)
    expect(report.toolError).toContain('taskboard_storage_unavailable')
    expect(child.stderr).toContain('[dsh-taskboard]')
    expect(child.stderr).toContain(dataHome)
    expect(child.stderr).not.toContain('fatal load failure')
  })
})

describe('damaged ledger startup isolation (#84)', () => {
  it.each(['damaged live ledger', 'legacy quarantine only'])('%s retains attachments and reports recovery across restarts', async mode => {
    const dir = await directory()
    const file = join(dir, 'dsh-taskboard.json')
    const retainedFile = mode === 'damaged live ledger' ? file : `${file}.corrupt-1234`
    await writeFile(retainedFile, '{truncated')
    const assets = join(dir, 'dsh-taskboard-assets')
    await mkdir(assets)
    const image = join(assets, `${'a'.repeat(64)}.png`)
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await writeFile(image, bytes)
    const old = new Date(Date.now() - 48 * 60 * 60_000)
    await utimes(image, old, old)
    for (let boot = 0; boot < 2; boot++) {
      const child = spawnSync(process.execPath, ['--input-type=module', '-e', startupProbe], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: { ...process.env, DSH_HOME: dir }, encoding: 'utf8', timeout: 10_000,
      })
      expect(child.status, child.stderr).toBe(0)
      const report = JSON.parse(child.stdout.trim())
      expect(report.storage.status).toBe(200)
      expect(report.storage.body.value).toMatchObject({ writable: false, error: expect.stringContaining(retainedFile) })
      expect(report.state.status).toBe(500)
      expect(report.state.body.error.message).toContain('Repair or restore')
      expect(report.upload.status).toBe(500)
      expect(report.events.status).toBe(500)
      expect(report.toolError).toContain('taskboard_ledger_unavailable')
      expect(child.stderr).toContain(retainedFile)
      expect(child.stderr).not.toContain('fatal load failure')
      expect(await readFile(image)).toEqual(bytes)
      expect(await readFile(retainedFile, 'utf8')).toBe('{truncated')
    }
    expect((await readdir(dir)).sort()).toEqual(['dsh-taskboard-assets', retainedFile.slice(dir.length + 1)].sort())
  })
})

function task(id = 't-reliable'): TaskRecord {
  return {
    id, title: id, description: '', prompt: '', workspaceId: 'ws-a',
    urgency: 'normal', status: 'todo', blocked: false, isolation: 'none',
    execution: { mode: 'claim' }, version: 1, createdAt: 0, updatedAt: 0,
    createdBy: { kind: 'user' }, updatedBy: { kind: 'user' }, comments: [], executions: [],
  }
}

async function fixture(delays: readonly number[] = [40, 40], seed = task()) {
  const dir = await directory()
  const store = new TaskStore({ file: join(dir, 'ledger.json') })
  await store.mutate('task-created', ledger => { ledger.tasks.push(seed); return [seed] })
  let finish!: () => void
  let rejectIdle!: (error: Error) => void
  const idle = new Promise<void>((resolve, reject) => { finish = resolve; rejectIdle = reject })
  const stop = vi.fn(async () => { finish() })
  const followup = vi.fn()
  const agent = { id: 'session-reliable', inject: () => {}, followup, whenIdle: () => idle, cancel: () => finish() }
  let listener!: Parameters<EventsFace['onSessionEvent']>[0]
  const deps: ExecutionDeps = {
    store, now: () => 1_000, settlementRetryDelaysMs: delays,
    workspaces: { get: () => ({ id: 'ws-a', path: dir }), attach: async () => {} },
    events: { onSessionEvent: fn => { listener = fn; return () => {} } },
    mintSessionId: () => agent.id,
    agents: { create: async () => ({ agent, dispose: stop }) },
  }
  const service = new ExecutionService(deps)
  cleanups.push(() => service.dispose())
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const mutate = store.mutate.bind(store)
  let failures = 0
  let attempts = 0
  const write = vi.spyOn(store, 'mutate').mockImplementation((kind, mutation) => {
    if (kind === 'execution-recorded' && failures > 0) {
      attempts += 1
      failures -= 1
      return Promise.reject(new Error('injected ENOSPC'))
    }
    return mutate(kind, mutation)
  })
  return {
    dir, store, service, deps, agent, finish, rejectIdle, stop, followup, log, write,
    fail: (count = 1) => { failures = count }, attempts: () => attempts,
    emitFailure: () => listener(agent.id, { type: 'turn/end', data: { reason: { kind: 'error', error: { message: 'provider failed' } } } }),
    start: async (trigger: 'manual' | 'scheduled' = 'manual', svc = service) => {
      const result = await svc.run(seed.id, trigger)
      expect(result).toMatchObject({ ok: true })
      return result
    },
    done: (outcome: string) => waitFor(() => store.get(seed.id)?.executions.at(-1)?.outcome === outcome && service.inFlight() === 0),
  }
}

describe('durable execution settlement (#74)', () => {
  it.each(['fresh', 'adopted'] as const)('%s execution keeps its reservation until the retry commits', async mode => {
    const f = await fixture([200])
    await f.start()
    let service = f.service
    if (mode === 'adopted') {
      f.service.dispose()
      service = new ExecutionService({ ...f.deps, liveAgent: () => f.agent })
      cleanups.push(() => service.dispose())
      await service.reconcile()
    }
    f.fail()
    f.finish()
    await waitFor(() => f.log.mock.calls.length > 0)
    expect(service.inFlight()).toBe(1)
    const disk = JSON.parse(await readFile(f.store.location(), 'utf8'))
    expect(disk.tasks[0].executions[0].outcome).toBe('running')
    await waitFor(() => service.inFlight() === 0)
    expect(f.store.get('t-reliable')).toMatchObject({ status: 'in_review' })
    expect(f.store.get('t-reliable')!.claimedBy).toBeUndefined()
    expect(f.store.get('t-reliable')!.executions[0]).toMatchObject({ outcome: 'succeeded', endedAt: 1_000 })
  })

  it.each(['idle rejection', 'turn error'] as const)('retries %s as failure, preserving its error and releasing the claim', async mode => {
    const f = await fixture()
    await f.start()
    f.fail()
    if (mode === 'idle rejection') f.rejectIdle(new Error('driver failed'))
    else { await f.emitFailure(); f.finish() }
    await f.done('failed')
    expect(f.store.get('t-reliable')).toMatchObject({ status: 'todo' })
    expect(f.store.get('t-reliable')!.claimedBy).toBeUndefined()
    expect(f.store.get('t-reliable')!.executions[0]!.error).toContain(mode === 'idle rejection' ? 'quiescence' : 'provider failed')
    expect(f.store.get('t-reliable')!.comments.filter(c => c.systemKey === 'sys.execFailed')).toHaveLength(1)
  })

  it('retries cancellation after a write failure without allowing idle success to win', async () => {
    const f = await fixture()
    await f.start()
    f.fail()
    expect(await f.service.cancel('t-reliable')).toMatchObject({ ok: false })
    expect(f.service.inFlight()).toBe(1)
    await f.done('cancelled')
    expect(f.stop).toHaveBeenCalledTimes(1)
    expect(f.store.get('t-reliable')).toMatchObject({ status: 'todo' })
    expect(f.store.get('t-reliable')!.claimedBy).toBeUndefined()
  })

  it('cancels a pending successful retry before a periodic successor can be spawned', async () => {
    const seed = task()
    seed.execution = { mode: 'scheduled', cron: '* * * * *', periodicCompletion: 'spawn' }
    const f = await fixture([200], seed)
    await f.start('scheduled')
    f.fail()
    f.finish()
    await waitFor(() => f.log.mock.calls.length > 0)
    expect(await f.service.cancel(seed.id)).toMatchObject({ ok: true })
    expect(f.store.get(seed.id)!.executions[0]!.outcome).toBe('cancelled')
    expect(f.store.snapshot().tasks).toHaveLength(1)
    expect(f.service.inFlight()).toBe(0)
  })

  it('waits for the agent to stop when cancellation overtakes a queued success write', async () => {
    const f = await fixture()
    await f.start()
    let releaseWrite!: () => void
    let releaseStop!: () => void
    const writeGate = new Promise<void>(resolve => { releaseWrite = resolve })
    const stopGate = new Promise<void>(resolve => { releaseStop = resolve })
    f.stop.mockImplementation(async () => { await stopGate })
    const mutate = TaskStore.prototype.mutate.bind(f.store)
    let entered = false
    let skipped = false
    f.write.mockImplementation(async (kind, mutation) => {
      if (kind === 'execution-recorded' && !entered) {
        entered = true
        await writeGate
        const result = await mutate(kind, mutation)
        skipped = true
        return result
      }
      return mutate(kind, mutation)
    })
    try {
      f.finish()
      await waitFor(() => entered)
      const cancelling = f.service.cancel('t-reliable')
      releaseWrite()
      await waitFor(() => skipped)
      expect(f.store.get('t-reliable')!.executions[0]!.outcome).toBe('running')
      expect(f.service.inFlight()).toBe(1)
      releaseStop()
      expect(await cancelling).toMatchObject({ ok: true })
      expect(f.store.get('t-reliable')!.executions[0]!.outcome).toBe('cancelled')
    } finally { releaseWrite(); releaseStop() }
  })

  it.each(['agent creation', 'workspace attachment'])('failed cancellation during %s prevents prompt submission', async stage => {
    const f = await fixture([200])
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let entered = false
    if (stage === 'agent creation') {
      f.deps.agents.create = async () => { entered = true; await gate; return { agent: f.agent, dispose: f.stop } }
    } else {
      f.deps.workspaces.attach = async () => { entered = true; await gate }
    }
    try {
      const starting = f.service.run('t-reliable', 'manual')
      await waitFor(() => entered)
      f.fail()
      expect(await f.service.cancel('t-reliable')).toMatchObject({ ok: false })
      release()
      expect(await starting).toMatchObject({ ok: false })
      expect(f.followup).not.toHaveBeenCalled()
      await f.done('cancelled')
      expect(f.stop).toHaveBeenCalledTimes(1)
    } finally { release() }
  })

  it.each(['before commit', 'after commit'])('spawns exactly one periodic successor when a write rejects %s', async timing => {
    const seed = task()
    seed.execution = { mode: 'scheduled', cron: '* * * * *', periodicCompletion: 'spawn' }
    const f = await fixture(undefined, seed)
    await f.start('scheduled')
    if (timing === 'before commit') f.fail()
    else {
      const mutate = TaskStore.prototype.mutate.bind(f.store)
      let rejectOnce = true
      f.write.mockImplementation(async (kind, mutation) => {
        const result = await mutate(kind, mutation)
        if (kind === 'execution-recorded' && rejectOnce) {
          rejectOnce = false
          throw new Error('injected lost acknowledgement after commit')
        }
        return result
      })
    }
    f.finish()
    await f.done('succeeded')
    expect(f.store.snapshot().tasks.filter(t => t.spawnedFrom === seed.id)).toHaveLength(1)
    expect(f.store.get(seed.id)!.comments.filter(c => c.systemKey === 'sys.periodicHandoff')).toHaveLength(1)
  })

  it('bounds automatic retries and lets Stop retry after storage recovers', async () => {
    const f = await fixture([0, 0])
    await f.start()
    f.fail(100)
    f.finish()
    await waitFor(() => f.log.mock.calls.some(call => String(call[0]).includes('exhausted')))
    expect(f.attempts()).toBe(3)
    expect(f.service.inFlight()).toBe(1)
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(f.attempts()).toBe(3)
    f.fail(0)
    expect(await f.service.cancel('t-reliable')).toMatchObject({ ok: true })
    expect(f.service.inFlight()).toBe(0)
    expect(f.store.get('t-reliable')!.executions[0]!.outcome).toBe('cancelled')
  })

  it('disposes retry timers so a replacement service owns the final write', async () => {
    const f = await fixture([60])
    await f.start()
    f.fail()
    f.finish()
    await waitFor(() => f.log.mock.calls.length > 0)
    f.service.dispose()
    const replacement = new ExecutionService({ ...f.deps, liveAgent: () => f.agent })
    cleanups.push(() => replacement.dispose())
    await replacement.reconcile()
    await waitFor(() => replacement.inFlight() === 0)
    const revision = f.store.snapshot().revision
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(f.store.snapshot().revision).toBe(revision)
    expect(f.store.get('t-reliable')!.executions[0]!.outcome).toBe('succeeded')
  })
})

describe('external session sync rejection handling (#74)', () => {
  it('handles a rejected event even when the bus discards its promise', async () => {
    const f = await fixture()
    await f.store.mutate('settings-updated', ledger => { ledger.settings = { syncExternalSessions: true }; return [] })
    let event!: Parameters<EventsFace['onSessionEvent']>[0]
    const service = new ExternalSessionSyncService({ store: f.store, now: Date.now, scanIntervalMs: 0,
      workspaces: { get: () => ({ id: 'ws-a', path: f.dir, title: 'A' }), list: () => [], resolveByPath: async () => ({ id: 'ws-a' }) },
      events: { onSessionEvent: fn => { event = fn; return () => {} } },
    })
    cleanups.push(async () => { service.dispose(); await f.store.read(() => undefined) })
    f.write.mockRejectedValueOnce(new Error('event write failed'))
    void event('external-session', { type: 'turn/start' }, { header: { cwd: f.dir } })
    await waitFor(() => f.log.mock.calls.some(call => String(call[0]).includes('event sync failed')))
  })

  it('handles a rejected timer scan and recovers on the next scan', async () => {
    const f = await fixture()
    await f.store.mutate('settings-updated', ledger => {
      ledger.settings = { syncExternalSessions: true }
      ledger.tasks[0]!.executions.push({ id: 'external-run', trigger: 'manual', sessionId: 'external-session', outcome: 'succeeded' })
      return ledger.tasks
    })
    f.write.mockRejectedValueOnce(new Error('scan write failed'))
    const service = new ExternalSessionSyncService({ store: f.store, now: Date.now, scanIntervalMs: 10,
      workspaces: { get: () => ({ id: 'ws-a', path: f.dir, title: 'A' }), list: () => [], resolveByPath: async () => ({ id: 'ws-a' }) },
      events: { onSessionEvent: () => () => {} },
      sessions: { get: () => ({ status: 'running' }) },
    })
    cleanups.push(async () => { service.dispose(); await f.store.read(() => undefined) })
    await waitFor(() => f.log.mock.calls.some(call => String(call[0]).includes('scan failed')))
    await waitFor(() => f.store.get('t-reliable')!.status === 'in_progress')
  })
})

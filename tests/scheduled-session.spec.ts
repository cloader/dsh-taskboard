import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExecutionService, type AgentsFace, type EventsFace } from '../src/host/execution.ts'
import { scheduledSessionResumer, type ScheduledSessionDeps } from '../src/host/scheduled-session.ts'
import { TaskStore } from '../src/host/store.ts'
import type { TaskRecord } from '../src/shared/protocol.ts'
import { waitFor } from './wait-for.ts'

const dirs: string[] = []
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }) })

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'tb-recurring-'))
  dirs.push(dir)
  const store = new TaskStore({ file: join(dir, 'ledger.json') })
  const task: TaskRecord = {
    id: 'recurring', title: 'Daily check', description: '', prompt: 'Check current state',
    workspaceId: 'project', urgency: 'normal', status: 'todo', blocked: false,
    isolation: 'none', execution: { mode: 'scheduled', cron: '* * * * *' },
    version: 1, createdAt: 1, updatedAt: 1, createdBy: { kind: 'user' }, updatedBy: { kind: 'user' },
    comments: [], executions: [],
  }
  await store.mutate('task-created', ledger => { ledger.tasks.push(task); return [task] })
  type Options = Parameters<AgentsFace['create']>[0]
  type Live = NonNullable<ReturnType<ScheduledSessionDeps['agents']['get']>>
  const live = new Map<string, Live>()
  const durable = new Map<string, Options>()
  const archived = new Set<string>()
  const idle = new Map<string, () => void>()
  const prompts: unknown[] = []
  const frames: unknown[] = []
  let now = 100
  let listener: Parameters<EventsFace['onSessionEvent']>[0] = () => {}
  const events: EventsFace = { onSessionEvent: fn => { listener = fn; return () => {} } }
  const make = (id: string, options: Options) => {
    let idlePromise = Promise.resolve()
    const agent = {
      id, status: 'idle' as 'idle' | 'running',
      session: { header: options.meta ?? {} }, options: options.agentOptions,
      inject: (message: unknown) => { frames.push(message) },
      followup: (message: unknown) => {
        prompts.push(message)
        agent.status = 'running'
        idlePromise = new Promise<void>(resolve => idle.set(id, () => { agent.status = 'idle'; resolve() }))
      },
      whenIdle: () => idlePromise,
      cancel: vi.fn(() => idle.get(id)?.()),
    }
    live.set(id, agent)
    return { agent, dispose: async () => { agent.cancel(); live.delete(id) } }
  }
  const create = vi.fn(async (options: Options) => { durable.set(options.sessionId, options); return make(options.sessionId, options) })
  const resume = vi.fn(async (options: { resumeSessionId: string; agentOptions?: Options['agentOptions']; setup?: Options['setup'] }) => {
    const stored = durable.get(options.resumeSessionId)!
    return make(options.resumeSessionId, { ...stored, agentOptions: options.agentOptions })
  })
  const stat = vi.fn(async (id: string) => {
    const stored = durable.get(id)
    return stored === undefined ? undefined : { header: stored.meta ?? {} }
  })
  const resumeScheduled = scheduledSessionResumer({ agents: { get: id => live.get(id), resume }, persistence: () => ({ stat }), isArchived: id => archived.has(id) })
  const agents: AgentsFace = { create, resumeScheduled }
  const deps = { store, agents, workspaces: { get: () => ({ id: 'project', path: dir }), attach: async () => {} }, events, now: () => now }
  const svc = new ExecutionService(deps)
  const finish = async (id: string, service = svc, ledger = store) => {
    idle.get(id)?.()
    await waitFor(() => ledger.get(task.id)!.executions.at(-1)!.outcome !== 'running')
    expect(service.inFlight()).toBe(0)
    now += 100
  }
  // 0.7.x periodic semantics: a finished round lives in in_review while a
  // fresh todo card carries the cron. The fixture keeps ONE card, so each
  // scheduled run first re-arms it (todo + cron) — standing in for the
  // successor card the host would mint — before triggering.
  const run = async (trigger: 'scheduled' | 'manual' = 'scheduled', service = svc, ledger = store) => {
    if (trigger === 'scheduled') {
      await ledger.mutate('task-updated', l => {
        const t = l.tasks.find(x => x.id === task.id)!
        t.status = 'todo'
        t.execution = { mode: 'scheduled', cron: '* * * * *' }
        return [t]
      })
    }
    const result = await service.run(task.id, trigger)
    if (!result.ok) throw new Error(result.error)
    return result
  }
  return { task, store, live, durable, archived, idle, create, resume, stat, prompts, frames, deps, svc, run, finish, emit: (id: string, event: { type: string; data?: unknown }) => listener(id, event) }
}

describe('scheduled session reuse', () => {
  it('uses one live conversation for repeated triggers, with fresh prompts and separate execution records', async () => {
    const f = await fixture()
    const first = await f.run()
    await f.finish(first.sessionId)
    await f.store.mutate('task-updated', ledger => {
      ledger.tasks[0]!.prompt = 'Check again using current data'
      return [ledger.tasks[0]!]
    })
    const second = await f.run()
    expect(second.sessionId).toBe(first.sessionId)
    expect(second.executionId).not.toBe(first.executionId)
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.resume).not.toHaveBeenCalled()
    expect(f.store.get(f.task.id)!.claimedBy).toBe(first.sessionId)
    expect(JSON.stringify(f.prompts[1])).toContain('Check again using current data')
    expect(f.frames).toHaveLength(2)
    await f.finish(second.sessionId)
    expect(f.store.get(f.task.id)!.executions.map(e => e.outcome)).toEqual(['succeeded', 'succeeded'])
  })

  it('reloads the ledger and restores the persisted conversation after a host restart', async () => {
    const f = await fixture()
    const first = await f.run()
    await f.finish(first.sessionId)
    f.svc.dispose()
    f.live.clear()
    const store = new TaskStore({ file: f.store.location() })
    await store.load()
    const restarted = new ExecutionService({ ...f.deps, store })
    const second = await f.run('scheduled', restarted, store)
    expect(second.sessionId).toBe(first.sessionId)
    expect(f.create).toHaveBeenCalledTimes(1)
    expect(f.resume).toHaveBeenCalledWith(expect.objectContaining({ resumeSessionId: first.sessionId }))
    await f.finish(second.sessionId, restarted, store)
  })

  it.each(['deleted', 'archived'] as const)('replaces a %s session once, then reuses its replacement', async kind => {
    const f = await fixture()
    const first = await f.run()
    await f.finish(first.sessionId)
    if (kind === 'deleted') { f.live.clear(); f.durable.clear() }
    else f.archived.add(first.sessionId)
    const second = await f.run()
    expect(second.sessionId).not.toBe(first.sessionId)
    await f.finish(second.sessionId)
    const third = await f.run()
    expect(third.sessionId).toBe(second.sessionId)
    expect(f.create).toHaveBeenCalledTimes(2)
    await f.finish(third.sessionId)
  })

  it('keeps manual runs separate from the recurring conversation', async () => {
    const f = await fixture()
    const first = await f.run()
    await f.finish(first.sessionId)
    const manual = await f.run('manual')
    expect(manual.sessionId).not.toBe(first.sessionId)
    await f.finish(manual.sessionId)
    const second = await f.run()
    expect(second.sessionId).toBe(first.sessionId)
    await f.finish(second.sessionId)
  })

  it.each(['model', 'preset', 'permission', 'workspace'] as const)('starts a new conversation when %s changes', async kind => {
    const f = await fixture()
    const first = await f.run()
    await f.finish(first.sessionId)
    await f.store.mutate('task-updated', ledger => {
      const task = ledger.tasks[0]!
      if (kind === 'model') task.model = { provider: 'other', model: 'new' }
      if (kind === 'permission') task.permission = 'read-only'
      if (kind === 'workspace') task.workspaceId = 'moved'
      if (kind === 'preset') task.presetId = 'new-preset'
      return [task]
    })
    // Resolve the effective preset just as the host adapter does.
    const service = new ExecutionService({ ...f.deps, composeAgent: async id => id ? { agentPreset: id, setup: () => {} } : undefined })
    const second = await f.run('scheduled', service)
    expect(second.sessionId).not.toBe(first.sessionId)
    await f.finish(second.sessionId, service)
  })

  it('falls back to a new session when the previous one is busy', async () => {
    const f = await fixture()
    const first = await f.run()
    await f.finish(first.sessionId)
    const agent = f.live.get(first.sessionId)!
    Object.assign(agent, { status: 'running' })
    const second = await f.run()
    expect(second.sessionId).not.toBe(first.sessionId)
    expect(f.create).toHaveBeenCalledTimes(2)
    await f.finish(second.sessionId)
  })

  it.each(['stat fails', 'resume fails'] as const)('falls back to a new session when %s', async kind => {
    const f = await fixture()
    const first = await f.run()
    await f.finish(first.sessionId)
    f.live.clear()
    if (kind === 'stat fails') f.stat.mockRejectedValueOnce(new Error('disk unavailable'))
    else f.resume.mockRejectedValueOnce(new Error('session already owned'))
    const second = await f.run()
    expect(second.sessionId).not.toBe(first.sessionId)
    expect(f.create).toHaveBeenCalledTimes(2)
    await f.finish(second.sessionId)
  })

  it('cancels a borrowed run without disposing its session or settling it as success', async () => {
    const f = await fixture()
    const first = await f.run()
    await f.finish(first.sessionId)
    const second = await f.run()
    expect((await f.svc.cancel(f.task.id)).ok).toBe(true)
    expect(f.live.has(first.sessionId)).toBe(true)
    expect(f.store.get(f.task.id)!.executions.at(-1)!.outcome).toBe('cancelled')
    const third = await f.run()
    expect(third.sessionId).toBe(second.sessionId)
    await f.finish(third.sessionId)
  })

  it('cannot overlap a still-running execution after the agent moves the card to review', async () => {
    const f = await fixture()
    const first = await f.run()
    await f.store.mutate('task-moved', ledger => { ledger.tasks[0]!.status = 'in_review'; return [ledger.tasks[0]!] })
    expect((await f.svc.run(f.task.id, 'scheduled')).ok).toBe(false)
    expect(f.create).toHaveBeenCalledTimes(1)
    await f.finish(first.sessionId)
  })

  it('does not count an earlier run comment as the current handoff', async () => {
    const f = await fixture()
    const first = await f.run()
    await f.store.mutate('comment-added', ledger => {
      ledger.tasks[0]!.comments.push({ id: 'old-comment', body: 'Previous work', threadId: first.sessionId, version: 1, createdAt: 100 })
      return [ledger.tasks[0]!]
    })
    await f.finish(first.sessionId)
    const second = await f.run()
    await f.finish(second.sessionId)
    const keys = f.store.get(f.task.id)!.comments.map(c => c.systemKey)
    expect(keys).toContain('sys.endedNoHandoff')
    expect(keys.at(-1)).toBe('sys.periodicHandoff')
  })
})

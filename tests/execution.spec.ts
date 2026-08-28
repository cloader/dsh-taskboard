/**
 * P3 tests: the execution service (fresh in-project session with the pinned
 * model, prompt submission, settlement incl. turn errors) and the cron
 * scheduler (due → advance → run; missed windows skip).
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ExecutionService, type AgentsFace, type EventsFace } from '../src/host/execution.ts'
import { waitFor } from './wait-for.ts'
import { SchedulerService } from '../src/host/scheduler.ts'
import { TaskStore } from '../src/host/store.ts'
import { normalizeExecution, type TaskRecord } from '../src/shared/protocol.ts'

let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'tb-exec-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

/** A task fixture. */
function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 't-run',
    title: 'Run me',
    description: '',
    prompt: 'DO THE THING',
    workspaceId: 'ws-a',
    urgency: 'normal',
    status: 'todo',
    blocked: false,
    execution: { mode: 'claim' },
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    createdBy: { kind: 'user' },
    updatedBy: { kind: 'user' },
    comments: [],
    executions: [],
    ...overrides,
  }
}

/** Build a store holding the given tasks. */
async function storeWith(...tasks: TaskRecord[]): Promise<TaskStore> {
  const store = new TaskStore({ file: join(dir, `led-${Math.random().toString(36).slice(2)}.json`) })
  await store.mutate('task-created', ledger => {
    ledger.tasks.push(...tasks)
    return [...tasks]
  })
  return store
}

// Shared mutable flag for the fail-path test.
const fakeAgentsState = { failNext: false }

/** Capturing agents fake: records create options, injected + followup messages, disposals. */
function fakeAgents(): AgentsFace & {
  created: Array<{ sessionId: string; cwd?: string; agentPreset?: string; setup?: unknown; agentOptions?: { provider?: string; model?: string; reasoningEffort?: string } }>
  followups: unknown[]
  injects: unknown[]
  idle: (sessionId?: string) => void
  disposedSessions: string[]
} {
  const created: Array<{ sessionId: string; cwd?: string; agentPreset?: string; setup?: unknown; agentOptions?: { provider?: string; model?: string; reasoningEffort?: string } }> = []
  const followups: unknown[] = []
  const injects: unknown[] = []
  const disposedSessions: string[] = []
  const idles = new Map<string, () => void>()
  const svc = {
    created,
    followups,
    injects,
    disposedSessions,
    idle: (sessionId?: string) => {
      if (sessionId !== undefined) idles.get(sessionId)?.()
      else for (const resolve of idles.values()) resolve()
    },
    async create(options: { sessionId: string; meta?: { cwd?: string; agentPreset?: string }; setup?: (agentCtx: unknown) => Promise<void> | void; agentOptions?: { provider?: string; model?: string; reasoningEffort?: string } }) {
      if (fakeAgentsState.failNext) {
        fakeAgentsState.failNext = false
        throw new Error('provider has no adapter')
      }
      created.push({ sessionId: options.sessionId, cwd: options.meta?.cwd, agentPreset: options.meta?.agentPreset, setup: options.setup, agentOptions: options.agentOptions })
      return {
        agent: {
          id: options.sessionId,
          followup: (message: unknown) => { followups.push(message) },
          inject: (message: unknown) => { injects.push(message) },
          whenIdle: () => new Promise<void>(resolve => { idles.set(options.sessionId, resolve) }),
        },
        dispose: async () => { disposedSessions.push(options.sessionId) },
      }
    },
  } as never
  return svc as AgentsFace & { created: typeof created; followups: typeof followups; injects: typeof injects; idle: (sessionId?: string) => void; disposedSessions: string[] }
}

/** Event-bus fake with manual dispatch. */
function fakeEvents(): EventsFace & { dispatch(sessionId: string, event: { type: string; data?: unknown }): void } {
  const listeners: Array<(sessionId: string, event: { type: string; data?: unknown }) => void> = []
  return {
    onSessionEvent: (listener) => {
      listeners.push(listener)
      return () => { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1) }
    },
    dispatch: (sessionId, event) => { for (const l of [...listeners]) l(sessionId, event) },
  }
}

const workspaces = {
  get: (id: string) => (id === 'ws-a' ? { id: 'ws-a', path: '/proj/a' } : undefined),
  attach: async () => {},
}

describe('ExecutionService', () => {
  it('runs a task in a fresh in-project session with the pinned model', async () => {
    const store = await storeWith(task({ model: { provider: 'deepseek', model: 'reasoner' } }))
    const agents = fakeAgents()
    const events = fakeEvents()
    const svc = new ExecutionService({ store, agents, workspaces, events, now: () => 1_000 })

    const result = await svc.run('t-run', 'manual')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Session created inside the project, carrying the pinned model.
    expect(agents.created).toHaveLength(1)
    expect(agents.created[0]!.cwd).toBe('/proj/a')
    expect(agents.created[0]!.agentOptions).toEqual({ provider: 'deepseek', model: 'reasoner' })

    // The ledger shows in_progress + a running execution with the session id.
    let t = store.get('t-run')!
    expect(t.status).toBe('in_progress')
    expect(t.executions[0]!.outcome).toBe('running')
    expect(t.executions[0]!.sessionId).toBe(result.sessionId)
    expect(t.executions[0]!.trigger).toBe('manual')

    // The opening pair went in as ONE turn: a plugin context line (inject,
    // next-step) carrying the task framing + handoff protocol, then the card
    // body as a normal user message (followup, next-turn).
    expect(agents.injects).toHaveLength(1)
    expect(agents.followups).toHaveLength(1)
    const inject = agents.injects[0] as { content: Array<{ type: string; text: string }>; source: { kind: string; plugin?: string } }
    const user = agents.followups[0] as { content: Array<{ type: string; text: string }>; source: { kind: string } }
    expect(inject.content[0]!.type).toBe('text')
    expect(inject.source.kind).toBe('plugin')
    expect(inject.source.plugin).toBe('dsh-taskboard')
    expect(inject.content[0]!.text).toContain('【任务看板】Run me')
    expect(inject.content[0]!.text).toContain('ID: t-run')
    expect(inject.content[0]!.text).toContain('taskboard_get')
    expect(inject.content[0]!.text).toContain('taskboard_comment_add')
    expect(inject.content[0]!.text).toContain('taskboard_move')
    expect(inject.content[0]!.text).toContain('in_review')
    expect(inject.content[0]!.text).toContain('移回待办 todo')
    // The framing line carries NO card content; the user bubble carries NO protocol.
    expect(inject.content[0]!.text).not.toContain('DO THE THING')
    expect(user.content[0]!.type).toBe('text')
    expect(user.source.kind).toBe('user')
    expect(user.content[0]!.text).toContain('DO THE THING')
    expect(user.content[0]!.text).not.toContain('taskboard_move')

    // Quiescence settles the execution as succeeded.
    agents.idle()
    await waitFor(() => store.get('t-run')!.executions[0]!.outcome === 'succeeded')
    t = store.get('t-run')!
    expect(t.executions[0]!.outcome).toBe('succeeded')
    expect(t.executions[0]!.endedAt).toBe(1_000)
  })

  it('framing carries the report handoff step and injects the DoD checklist (0.4.0)', async () => {
    const store = await storeWith(task({
      checklist: [
        { id: 'k1', text: '已复现并定位根因', checked: true, checkedBy: 'user', checkedAt: 1 },
        { id: 'k2', text: '回归测试通过', checked: false },
      ],
    }))
    const agents = fakeAgents()
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000 })
    const result = await svc.run('t-run', 'manual')
    if (!result.ok) throw new Error('run failed')

    const inject = agents.injects[0] as { content: Array<{ type: string; text: string }> }
    const text = inject.content[0]!.text
    // The handoff protocol now leads with the structured report step.
    expect(text).toContain('taskboard_execution_report')
    expect(text.indexOf('taskboard_execution_report')).toBeLessThan(text.indexOf('taskboard_comment_add'))
    // The DoD checklist rides along with per-item state and the discipline.
    expect(text).toContain('验收清单（DoD，1/2 已完成）')
    expect(text).toContain('☑ 1. 已复现并定位根因')
    expect(text).toContain('☐ 2. 回归测试通过')
    expect(text).toContain('taskboard_checklist')

    // Without a checklist the section is absent entirely.
    const plain = await storeWith(task())
    const plainAgents = fakeAgents()
    await new ExecutionService({ store: plain, agents: plainAgents, workspaces, events: fakeEvents(), now: () => 1_000 }).run('t-run', 'manual')
    const plainText = (plainAgents.injects[0] as { content: Array<{ type: string; text: string }> }).content[0]!.text
    expect(plainText).not.toContain('验收清单')
    expect(plainText).toContain('taskboard_execution_report')
  })

  it('fails the execution and reverts progress when creation fails', async () => {
    fakeAgentsState.failNext = true
    const store = await storeWith(task())
    const svc = new ExecutionService({ store, agents: fakeAgents(), workspaces, events: fakeEvents(), now: () => 1_000 })
    const result = await svc.run('t-run', 'manual')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('adapter')
    const t = store.get('t-run')!
    expect(t.status).toBe('todo')
    expect(t.executions[0]!.outcome).toBe('failed')
  })

  it('folds turn/end errors into a failed execution', async () => {
    const store = await storeWith(task())
    const agents = fakeAgents()
    const events = fakeEvents()
    const svc = new ExecutionService({ store, agents, workspaces, events, now: () => 1_000 })
    const result = await svc.run('t-run', 'scheduled')
    if (!result.ok) throw new Error('run failed')

    events.dispatch(result.sessionId, {
      type: 'turn/end',
      data: { turn: 1, reason: { kind: 'error', error: { message: 'boom: quota exceeded' } } },
    })
    await waitFor(() => store.get('t-run')!.executions[0]!.outcome === 'failed')
    const t = store.get('t-run')!
    expect(t.executions[0]!.outcome).toBe('failed')
    expect(t.executions[0]!.error).toContain('quota exceeded')
  })

  it('holds the task for the executing session and hands it back on turn failure', async () => {
    const store = await storeWith(task())
    const agents = fakeAgents()
    const events = fakeEvents()
    const svc = new ExecutionService({ store, agents, workspaces, events, now: () => 1_000 })
    const result = await svc.run('t-run', 'manual')
    if (!result.ok) throw new Error('run failed')

    // The executing session is the recorded holder for the whole run.
    let t = store.get('t-run')!
    expect(t.claimedBy).toBe(result.sessionId)
    expect(t.claimedAt).toBe(1_000)

    events.dispatch(result.sessionId, {
      type: 'turn/end',
      data: { reason: { kind: 'error', error: { message: 'quota exceeded' } } },
    })
    await waitFor(() => {
      const cur = store.get('t-run')!
      return cur.status === 'todo' && cur.executions[0]!.outcome === 'failed'
    })
    // Failure no longer strands the card in in_progress.
    t = store.get('t-run')!
    expect(t.status).toBe('todo')
    expect(t.claimedBy).toBeUndefined()
    expect(t.executions[0]!.outcome).toBe('failed')
  })

  it('settles and auto-hands-off to in_review with a system comment when the session did not', async () => {
    const store = await storeWith(task())
    const agents = fakeAgents()
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000 })
    const result = await svc.run('t-run', 'manual')
    if (!result.ok) throw new Error('run failed')
    agents.idle()
    await waitFor(() => store.get('t-run')!.executions[0]!.outcome === 'succeeded')
    const t = store.get('t-run')!
    expect(t.executions[0]!.outcome).toBe('succeeded')
    expect(t.claimedBy).toBeUndefined()
    // The session neither commented nor moved → system comment + auto in_review.
    expect(t.status).toBe('in_review')
    expect(t.comments).toHaveLength(1)
    expect(t.comments[0]!.body).toContain('[系统]')
    expect(t.comments[0]!.body).toContain('未按协议交接')
  })

  it('passes pinned model and reasoningEffort to agents.create', async () => {
    const store = await storeWith(task({
      model: { provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' },
    }))
    const agents = fakeAgents()
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000 })
    const result = await svc.run('t-run', 'manual')
    if (!result.ok) throw new Error('run failed')
    expect(agents.created).toHaveLength(1)
    expect(agents.created[0]!.agentOptions).toEqual({
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      reasoningEffort: 'high',
    })
    agents.idle()
  })

  it('notes a lighter system comment when the session commented but did not move', async () => {
    const commented = task({
      comments: [{ id: 'c-1', body: 'done, tests pass', version: 1, createdAt: 1, threadId: 'session-worker' }],
    })
    const store = await storeWith(commented)
    const agents = fakeAgents()
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000, mintSessionId: () => 'session-worker' })
    const result = await svc.run('t-run', 'manual')
    if (!result.ok) throw new Error('run failed')
    agents.idle('session-worker')
    await waitFor(() => store.get('t-run')!.status === 'in_review')
    const t = store.get('t-run')!
    expect(t.status).toBe('in_review')
    const sysComment = t.comments.find(c => c.body.includes('[系统]'))
    expect(sysComment?.body).toContain('留有评论')
  })

  it('notes failures with a system comment when handing the task back', async () => {
    const store = await storeWith(task())
    const agents = fakeAgents()
    const events = fakeEvents()
    const svc = new ExecutionService({ store, agents, workspaces, events, now: () => 1_000 })
    const result = await svc.run('t-run', 'manual')
    if (!result.ok) throw new Error('run failed')
    events.dispatch(result.sessionId, {
      type: 'turn/end',
      data: { reason: { kind: 'error', error: { message: 'quota exceeded' } } },
    })
    await waitFor(() => store.get('t-run')!.status === 'todo')
    const t = store.get('t-run')!
    expect(t.status).toBe('todo')
    const sysComment = t.comments.find(c => c.body.includes('[系统]'))
    expect(sysComment?.body).toContain('执行失败')
    expect(sysComment?.body).toContain('quota exceeded')
  })

  it('enforces the global concurrency cap across tasks', async () => {
    const store = await storeWith(task({ id: 't-1' }), task({ id: 't-2' }), task({ id: 't-3' }), task({ id: 't-4' }))
    const agents = fakeAgents()
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000 })
    expect((await svc.run('t-1', 'manual')).ok).toBe(true)
    expect((await svc.run('t-2', 'manual')).ok).toBe(true)
    expect((await svc.run('t-3', 'manual')).ok).toBe(true)
    // Cap (default 3) reached: the fourth task is rejected.
    const fourth = await svc.run('t-4', 'manual')
    expect(fourth.ok).toBe(false)
    if (!fourth.ok) expect(fourth.error).toContain('concurrency')
    expect(svc.inFlight()).toBe(3)
    // Settling one execution frees a slot.
    agents.idle(agents.created[0]!.sessionId)
    await waitFor(() => svc.inFlight() === 2)
    expect(svc.inFlight()).toBe(2)
    expect((await svc.run('t-4', 'manual')).ok).toBe(true)
  })

  it('renders {{lastExecution}} and {{lastComments}} template variables', async () => {
    const templated = task({
      prompt: '上次结果：{{lastExecution}}\n最近评论：{{lastComments}}',
      executions: [{ id: 'e-0', trigger: 'scheduled', startedAt: 5_000, endedAt: 6_000, outcome: 'failed', error: 'disk full' }],
      comments: [{ id: 'c-1', body: '巡检正常', version: 1, createdAt: 4_000 }],
    })
    const store = await storeWith(templated)
    const agents = fakeAgents()
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 10_000 })
    const result = await svc.run('t-run', 'manual')
    if (!result.ok) throw new Error('run failed')
    const message = agents.followups[0] as { content: Array<{ type: string; text: string }> }
    const text = message.content[0]!.text
    expect(text).not.toContain('{{lastExecution}}')
    expect(text).not.toContain('{{lastComments}}')
    expect(text).toContain('上次结果：scheduled · failed · disk full')
    expect(text).toContain('最近评论：[user] 巡检正常')
  })

  it('opens at most one execution for overlapping runs (atomic in-progress gate)', async () => {
    const store = await storeWith(task())
    const agents = fakeAgents()
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000 })
    const [a, b] = await Promise.all([svc.run('t-run', 'manual'), svc.run('t-run', 'manual')])
    expect([a, b].filter(r => r.ok)).toHaveLength(1)
    expect(agents.created).toHaveLength(1)
    const t = store.get('t-run')!
    expect(t.status).toBe('in_progress')
    expect(t.executions).toHaveLength(1)
    expect(t.claimedBy).toBe(agents.created[0]!.sessionId)
  })

  it('cancels the running execution: stops the session, marks cancelled, hands the task back', async () => {
    const store = await storeWith(task())
    const agents = fakeAgents()
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000 })
    const result = await svc.run('t-run', 'manual')
    if (!result.ok) throw new Error('run failed')

    const cancelled = await svc.cancel('t-run')
    expect(cancelled.ok).toBe(true)
    expect(agents.disposedSessions).toEqual([result.sessionId])
    const t = store.get('t-run')!
    expect(t.status).toBe('todo')
    expect(t.claimedBy).toBeUndefined()
    expect(t.executions[0]!.outcome).toBe('cancelled')
    expect(t.executions[0]!.endedAt).toBe(1_000)
    // Nothing left to cancel.
    expect((await svc.cancel('t-run')).ok).toBe(false)
    // A late settlement after cancel no-ops (the record is no longer running).
    // Deterministic drain: give the whenIdle microtask chain room to enqueue
    // the late settle mutation, then wait behind it on the store's serial
    // queue before asserting the outcome survived.
    agents.idle()
    await waitFor(async () => {
      await new Promise(r => setTimeout(r, 0))
      await store.read(() => undefined)
      return true
    })
    expect(store.get('t-run')!.executions[0]!.outcome).toBe('cancelled')
  })

  it('cancel after the execution settled reports failure instead of fake success', async () => {
    const store = await storeWith(task())
    const disposed: string[] = []
    // Gate the agent dispose so a cancel in flight parks there while the
    // run's success settlement commits first (the stale-read race that used
    // to report 取消成功 for an already-succeeded run).
    let releaseDispose: (() => void) | undefined
    const disposeGate = new Promise<void>(resolve => { releaseDispose = resolve })
    let idle: (() => void) | undefined
    const agents: AgentsFace = {
      async create(options: { sessionId: string }) {
        return {
          agent: {
            id: options.sessionId,
            followup: () => {},
            inject: () => {},
            whenIdle: () => new Promise<void>(resolve => { idle = resolve }),
          },
          dispose: async () => { disposed.push(options.sessionId); await disposeGate },
        }
      },
    } as never
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000 })
    const result = await svc.run('t-run', 'manual')
    if (!result.ok) throw new Error('run failed')

    // Settle the run (quiescence) and start the cancel BEFORE that settlement
    // commits: cancel's synchronous read still sees 'running', then parks on
    // the gated dispose while the success settlement wins the store queue.
    idle!()
    const cancelling = svc.cancel('t-run')
    await waitFor(() => store.get('t-run')!.executions[0]!.outcome === 'succeeded')
    releaseDispose!()
    const cancelled = await cancelling
    expect(cancelled.ok).toBe(false)
    if (!cancelled.ok) expect(cancelled.error).toContain('already settled')
    // The committed settlement survived intact — no fabricated cancel state.
    const t = store.get('t-run')!
    expect(t.executions[0]!.outcome).toBe('succeeded')
    expect(t.status).toBe('in_review')
    // The cancel really reached the dispose step (it was just too late).
    expect(disposed).toEqual([result.sessionId])
  })

  it('dispose() detaches the turn/end listener: late failures write nothing', async () => {
    // A live-looking execution gives an attached listener something to write.
    const store = await storeWith(task({
      status: 'in_progress',
      claimedBy: 'session-live',
      claimedAt: 1,
      executions: [{ id: 'e-live', sessionId: 'session-live', trigger: 'manual', startedAt: 1, outcome: 'running' }],
    }))
    const events = fakeEvents()
    const unsubCalls: string[] = []
    const innerOn = events.onSessionEvent
    // Recording events face: the unsubscribe spy ALSO removes the listener
    // (real bus semantics), so a post-dispose dispatch reaches nobody.
    const recording: EventsFace = {
      onSessionEvent: listener => {
        const off = innerOn(listener)
        return () => { unsubCalls.push('unsubscribe'); off() }
      },
    }
    const svc = new ExecutionService({ store, agents: fakeAgents(), workspaces, events: recording, now: () => 1_000 })

    svc.dispose()
    expect(unsubCalls).toEqual(['unsubscribe'])

    // A late turn/end error for the live session: no listener is attached,
    // so noteFailure never runs and the ledger is untouched.
    const revisionBefore = store.snapshot().revision
    events.dispatch('session-live', { type: 'turn/end', data: { reason: { kind: 'error', error: { message: 'late failure' } } } })
    // Deterministic drain: let any would-be settlement enqueue, then wait
    // behind the store's serial queue before asserting nothing happened.
    await new Promise(r => setTimeout(r, 0))
    await store.read(() => undefined)
    const t = store.get('t-run')!
    expect(t.executions[0]!.outcome).toBe('running')
    expect(t.status).toBe('in_progress')
    expect(t.comments).toHaveLength(0)
    expect(store.snapshot().revision).toBe(revisionBefore)
  })

  it('reconciles stale running executions after a host restart', async () => {
    const interrupted = task({
      id: 't-restart',
      status: 'in_progress',
      claimedBy: 'session-dead',
      claimedAt: 1,
      executions: [{ id: 'e-1', sessionId: 'session-dead', trigger: 'manual', startedAt: 1, outcome: 'running' }],
    })
    const settled = task({
      id: 't-review',
      status: 'in_review',
      executions: [{ id: 'e-2', sessionId: 'session-ok', trigger: 'manual', startedAt: 1, endedAt: 2, outcome: 'succeeded' }],
    })
    const store = await storeWith(interrupted, settled)
    const svc = new ExecutionService({ store, agents: fakeAgents(), workspaces, events: fakeEvents(), now: () => 9_000 })
    await svc.reconcile()

    const a = store.get('t-restart')!
    expect(a.executions[0]!.outcome).toBe('failed')
    expect(a.executions[0]!.error).toContain('restart')
    expect(a.executions[0]!.endedAt).toBe(9_000)
    expect(a.status).toBe('todo')
    expect(a.claimedBy).toBeUndefined()
    // Healthy records untouched.
    const b = store.get('t-review')!
    expect(b.status).toBe('in_review')
    expect(b.executions[0]!.outcome).toBe('succeeded')
  })

  it('rejects a run on a running or unknown task', async () => {
    const store = await storeWith(task({ status: 'in_progress' }))
    const svc = new ExecutionService({ store, agents: fakeAgents(), workspaces, events: fakeEvents(), now: () => 1_000 })
    expect((await svc.run('t-run', 'manual')).ok).toBe(false)
    expect((await svc.run('nope', 'manual')).ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 0.3.0 worktree isolation
// ---------------------------------------------------------------------------

/** Capturing git fake: every method records calls; behavior per-test. */
function fakeGit(behavior: {
  detect?: boolean
  binary?: boolean
  prepare?: { path: string; branch: string; baseCommit: string; reused?: boolean }
  collect?: import('../src/host/git.ts').SettlementFacts
}): import('../src/host/git.ts').GitFace & {
  detectCalls: string[]
  prepareCalls: Array<{ root: string; path: string; branch: string; mode?: string }>
  collectCalls: Array<{ path: string; base: string }>
} {
  const detectCalls: string[] = []
  const prepareCalls: Array<{ root: string; path: string; branch: string; mode?: string }> = []
  const collectCalls: Array<{ path: string; base: string }> = []
  return {
    detectCalls,
    prepareCalls,
    collectCalls,
    detect: async (root) => { detectCalls.push(root); return behavior.detect ?? false },
    binaryAvailable: async () => behavior.binary ?? true,
    prepareWorktree: async (root, path, branch, mode) => {
      prepareCalls.push({ root, path, branch, mode })
      return behavior.prepare
    },
    collect: async (path, base) => {
      collectCalls.push({ path, base })
      return behavior.collect ?? { commits: [], commitsTotal: 0, dirtyFiles: [], dirtyFilesTotal: 0, changedFiles: 0 }
    },
    isAncestor: async () => false,
    merge: async () => {},
    removeWorktree: async () => 'removed' as const,
    deleteBranch: async () => {},
    showCommit: async () => undefined,
    showPathDiff: async () => undefined,
  }
}

describe('ExecutionService worktree isolation', () => {
  it("explicit 'none': zero git calls, runs in the workspace directory", async () => {
    const store = await storeWith(task({ isolation: 'none' }))
    const agents = fakeAgents()
    const git = fakeGit({})
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000, git })

    const result = await svc.run('t-run', 'manual')
    expect(result.ok).toBe(true)

    expect(git.detectCalls).toEqual([])
    expect(git.prepareCalls).toEqual([])
    expect(agents.created[0]!.cwd).toBe('/proj/a')

    const t = store.get('t-run')!
    expect(t.executions[0]!.isolation).toBe('none')
    expect(t.executions[0]!.isolationNote).toBeUndefined()
    expect(t.executions[0]!.branch).toBeUndefined()
  })

  it("bare legacy record (no isolation) follows the 0.5.0 factory default: 原目录执行", async () => {
    const store = await storeWith(task({}))
    const agents = fakeAgents()
    const git = fakeGit({ detect: true })
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000, git })

    const result = await svc.run('t-run', 'manual')
    expect(result.ok).toBe(true)

    // Zero git interaction even though git is available.
    expect(git.detectCalls).toEqual([])
    expect(git.prepareCalls).toEqual([])
    expect(agents.created[0]!.cwd).toBe('/proj/a')
    const t = store.get('t-run')!
    expect(t.executions[0]!.isolation).toBe('none')
    expect(t.executions[0]!.isolationNote).toBeUndefined()
  })

  it("worktree success: session cwd is the worktree, facts recorded, branch pinned once", async () => {
    const store = await storeWith(task({ title: 'Fix the login page', isolation: 'worktree' }))
    const agents = fakeAgents()
    const git = fakeGit({
      detect: true,
      prepare: { path: '/proj/a/.dsh-worktrees/t-run', branch: 'task/Fix-the-login-page+t-run', baseCommit: 'abc000' },
      collect: {
        headCommit: 'fff111',
        commits: [{ hash: 'abc1234', subject: 'feat: done' }],
        commitsTotal: 1,
        dirtyFiles: [' M src/a.ts'],
        dirtyFilesTotal: 1,
        diffStat: '1 file changed',
        changedFiles: 1,
      },
    })
    const events = fakeEvents()
    const svc = new ExecutionService({ store, agents, workspaces, events, now: () => 1_000, git })

    const result = await svc.run('t-run', 'manual')
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // Session is created at the PROJECT ROOT (DSH: cwd === workspace path
    // exactly — grouping, attach, and the file sandbox all depend on it);
    // the worktree is delivered via the framing line instead.
    expect(git.prepareCalls).toEqual([{ root: '/proj/a', path: '/proj/a/.dsh-worktrees/t-run', branch: 'task/Fix-the-login-page+t-run', mode: 'fresh' }])
    expect(agents.created[0]!.cwd).toBe('/proj/a')

    // The branch name is pinned onto the task (renames never change it).
    expect(store.get('t-run')!.branch).toBe('task/Fix-the-login-page+t-run')

    // The framing line steers the session into its worktree + branch.
    const inject = agents.injects[0] as { content: Array<{ text: string }> }
    expect(inject.content[0]!.text).toContain('Git Worktree 隔离')
    expect(inject.content[0]!.text).toContain('task/Fix-the-login-page+t-run')
    expect(inject.content[0]!.text).toContain('/proj/a/.dsh-worktrees/t-run')
    expect(inject.content[0]!.text).toContain('workdir')

    // Settlement collects the worktree evidence into the ledger.
    agents.idle(result.sessionId)
    await waitFor(() => store.get('t-run')!.executions[0]!.outcome === 'succeeded')
    const settled = store.get('t-run')!
    const execution = settled.executions[0]!
    expect(execution.outcome).toBe('succeeded')
    expect(execution.isolation).toBe('worktree')
    expect(execution.branch).toBe('task/Fix-the-login-page+t-run')
    expect(execution.worktreePath).toBe('/proj/a/.dsh-worktrees/t-run')
    expect(execution.baseCommit).toBe('abc000')
    expect(execution.headCommit).toBe('fff111')
    expect(execution.commits).toEqual([{ hash: 'abc1234', subject: 'feat: done' }])
    expect(execution.dirtyFiles).toEqual([' M src/a.ts'])
    expect(execution.changedFiles).toBe(1)
    expect(settled.status).toBe('in_review')

    // A SECOND run (task renamed in between) reuses the pinned branch name.
    await store.mutate('task-updated', ledger => {
      const t = ledger.tasks.find(x => x.id === 't-run')!
      t.status = 'todo'
      t.title = 'Totally different title now'
      t.version += 1
      return [t]
    })
    const result2 = await svc.run('t-run', 'manual')
    expect(result2.ok).toBe(true)
    expect(git.prepareCalls[1]!.branch).toBe('task/Fix-the-login-page+t-run')
  })

  it('non-git workspace degrades to the original directory with a note', async () => {
    const store = await storeWith(task({ isolation: 'worktree' }))
    const agents = fakeAgents()
    const git = fakeGit({ detect: false })
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000, git })

    expect((await svc.run('t-run', 'manual')).ok).toBe(true)
    expect(git.prepareCalls).toEqual([])
    expect(agents.created[0]!.cwd).toBe('/proj/a')

    const execution = store.get('t-run')!.executions[0]!
    expect(execution.isolation).toBe('none')
    expect(execution.isolationNote).toContain('不是 git 仓库')
    expect(execution.branch).toBeUndefined()
    // No branch pinned onto the task (nothing was created).
    expect(store.get('t-run')!.branch).toBeUndefined()
  })

  it('prepare failure degrades with a note; absent git face degrades too', async () => {
    const store = await storeWith(task({ isolation: 'worktree' }))
    const git = fakeGit({ detect: true, prepare: undefined })
    const svc = new ExecutionService({ store, agents: fakeAgents(), workspaces, events: fakeEvents(), now: () => 1_000, git })
    expect((await svc.run('t-run', 'manual')).ok).toBe(true)
    const execution = store.get('t-run')!.executions[0]!
    expect(execution.isolation).toBe('none')
    expect(execution.isolationNote).toContain('worktree 准备失败')

    const store2 = await storeWith(task({ isolation: 'worktree' }))
    const svc2 = new ExecutionService({ store: store2, agents: fakeAgents(), workspaces, events: fakeEvents(), now: () => 1_000 })
    expect((await svc2.run('t-run', 'manual')).ok).toBe(true)
    expect(store2.get('t-run')!.executions[0]!.isolationNote).toContain('git 集成不可用')
  })

  it('collect failure never blocks settlement (fail-soft evidence)', async () => {
    const store = await storeWith(task({ isolation: 'worktree' }))
    const events = fakeEvents()
    const agents = fakeAgents()
    const git = fakeGit({ detect: true, prepare: { path: '/proj/a/.dsh-worktrees/t-run', branch: 'task/t-run', baseCommit: 'abc' } })
    git.collect = async () => { throw new Error('worktree vanished') }
    const svc = new ExecutionService({ store, agents, workspaces, events, now: () => 1_000, git })

    const result = await svc.run('t-run', 'manual')
    agents.idle(result.ok ? result.sessionId : '')
    await waitFor(() => store.get('t-run')!.executions[0]!.outcome === 'succeeded')
    const execution = store.get('t-run')!.executions[0]!
    expect(execution.outcome).toBe('succeeded')
    expect(execution.commits).toBeUndefined()
    expect(store.get('t-run')!.status).toBe('in_review')
  })

  it('续跑 (reuseWorktree): prepare receives reuse mode; framing says 续跑 and warns about existing work', async () => {
    const store = await storeWith(task({ branch: 'task/Fix+t-run', isolation: 'worktree' }))
    const agents = fakeAgents()
    const git = fakeGit({
      detect: true,
      prepare: { path: '/proj/a/.dsh-worktrees/t-run', branch: 'task/Fix+t-run', baseCommit: 'old555', reused: true },
    })
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000, git })

    const result = await svc.run('t-run', 'manual', { reuseWorktree: true })
    expect(result.ok).toBe(true)

    expect(git.prepareCalls[0]!.mode).toBe('reuse')
    // The pinned branch was reused, not re-derived from the title.
    expect(git.prepareCalls[0]!.branch).toBe('task/Fix+t-run')
    // The session still roots at the project; the worktree path is explicit.
    expect(agents.created[0]!.cwd).toBe('/proj/a')
    const inject = agents.injects[0] as { content: Array<{ text: string }> }
    expect(inject.content[0]!.text).toContain('续跑')
    expect(inject.content[0]!.text).toContain('上一次执行的改动与提交都保留在原处')
    expect(inject.content[0]!.text).toContain('/proj/a/.dsh-worktrees/t-run')

    // Baseline is the worktree's own HEAD (evidence = this run's new commits).
    const execution = store.get('t-run')!.executions[0]!
    expect(execution.baseCommit).toBe('old555')
  })

  it('turn failure on an isolated run still records the worktree evidence', async () => {
    const store = await storeWith(task({ isolation: 'worktree' }))
    const events = fakeEvents()
    const agents = fakeAgents()
    const git = fakeGit({
      detect: true,
      prepare: { path: '/proj/a/.dsh-worktrees/t-run', branch: 'task/t-run', baseCommit: 'abc' },
      collect: { headCommit: 'fff', commits: [{ hash: 'fff', subject: 'wip: half done' }], commitsTotal: 1, dirtyFiles: [' M x'], dirtyFilesTotal: 1, changedFiles: 1 },
    })
    const svc = new ExecutionService({ store, agents, workspaces, events, now: () => 1_000, git })

    const result = await svc.run('t-run', 'manual')
    expect(result.ok).toBe(true)
    // The turn errors out mid-flight.
    events.dispatch(result.ok ? result.sessionId : '', { type: 'turn/end', data: { reason: { kind: 'error', error: { message: 'quota exceeded' } } } })
    await waitFor(() => {
      const cur = store.get('t-run')!
      return cur.status === 'todo' && cur.executions[0]!.outcome === 'failed'
    })

    const t = store.get('t-run')!
    const execution = t.executions[0]!
    expect(execution.outcome).toBe('failed')
    expect(t.status).toBe('todo')
    // Evidence from the failed session survived (0.3.1).
    expect(execution.commits).toEqual([{ hash: 'fff', subject: 'wip: half done' }])
    expect(execution.dirtyFiles).toEqual([' M x'])
    expect(execution.headCommit).toBe('fff')
  })

  it('cancel on an isolated run still records the worktree evidence', async () => {
    const store = await storeWith(task({ isolation: 'worktree' }))
    const agents = fakeAgents()
    const git = fakeGit({
      detect: true,
      prepare: { path: '/proj/a/.dsh-worktrees/t-run', branch: 'task/t-run', baseCommit: 'abc' },
      collect: { headCommit: 'ggg', commits: [{ hash: 'ggg', subject: 'wip' }], commitsTotal: 1, dirtyFiles: [], dirtyFilesTotal: 0, changedFiles: 1 },
    })
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000, git })

    expect((await svc.run('t-run', 'manual')).ok).toBe(true)
    expect((await svc.cancel('t-run')).ok).toBe(true)
    await waitFor(() => store.get('t-run')!.executions[0]!.outcome === 'cancelled')

    const execution = store.get('t-run')!.executions[0]!
    expect(execution.outcome).toBe('cancelled')
    expect(execution.commits).toEqual([{ hash: 'ggg', subject: 'wip' }])
  })

  it('degrade note distinguishes missing git binary from non-git directory; degraded framing warns', async () => {
    // git binary missing → the note names git, not the repo.
    const store = await storeWith(task({ isolation: 'worktree' }))
    const agents = fakeAgents()
    const git = fakeGit({ detect: false, binary: false })
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000, git })
    expect((await svc.run('t-run', 'manual')).ok).toBe(true)
    let execution = store.get('t-run')!.executions[0]!
    expect(execution.isolationNote).toContain('git 不可用')
    const inject = agents.injects[0] as { content: Array<{ text: string }> }
    expect(inject.content[0]!.text).toContain('未能建立隔离')
    expect(inject.content[0]!.text).toContain('git status')

    // git present but the directory is not a repo → the note names the repo.
    const store2 = await storeWith(task({ isolation: 'worktree' }))
    const git2 = fakeGit({ detect: false, binary: true })
    const svc2 = new ExecutionService({ store: store2, agents: fakeAgents(), workspaces, events: fakeEvents(), now: () => 1_000, git: git2 })
    expect((await svc2.run('t-run', 'manual')).ok).toBe(true)
    execution = store2.get('t-run')!.executions[0]!
    expect(execution.isolationNote).toContain('不是 git 仓库')
  })
})

// ---------------------------------------------------------------------------
// 0.3.3 preset composition
// ---------------------------------------------------------------------------

describe('ExecutionService preset composition', () => {
  it('composes the session from the task preset: header records it, setup mounts it', async () => {
    const store = await storeWith(task({ presetId: 'liangshen' }))
    const agents = fakeAgents()
    const mounted: Array<{ ctx: unknown; preset: string }> = []
    const composeCalls: Array<string | undefined> = []
    const svc = new ExecutionService({
      store,
      agents,
      workspaces,
      events: fakeEvents(),
      now: () => 1_000,
      composeAgent: async (presetId) => {
        composeCalls.push(presetId)
        if (presetId === undefined) return undefined
        return {
          agentPreset: presetId,
          setup: async (ctx: unknown) => { mounted.push({ ctx, preset: presetId }) },
        }
      },
    })

    expect((await svc.run('t-run', 'manual')).ok).toBe(true)
    // The task's preset reached the composer.
    expect(composeCalls).toEqual(['liangshen'])
    // agents.create received the header marker AND the setup callback.
    expect(agents.created[0]!.agentPreset).toBe('liangshen')
    expect(typeof agents.created[0]!.setup).toBe('function')
    expect(agents.created[0]!.cwd).toBe('/proj/a')
  })

  it('undefined composeAgent or an undefined composition keeps the bare session (no header marker)', async () => {
    const store = await storeWith(task({}))
    const agents = fakeAgents()
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000 })
    expect((await svc.run('t-run', 'manual')).ok).toBe(true)
    expect(agents.created[0]!.agentPreset).toBeUndefined()
    expect(agents.created[0]!.setup).toBeUndefined()

    // composeAgent present but returning undefined (no roster) → same shape.
    const store2 = await storeWith(task({}))
    const agents2 = fakeAgents()
    const svc2 = new ExecutionService({ store: store2, agents: agents2, workspaces, events: fakeEvents(), now: () => 1_000, composeAgent: async () => undefined })
    expect((await svc2.run('t-run', 'manual')).ok).toBe(true)
    expect(agents2.created[0]!.agentPreset).toBeUndefined()
    expect(agents2.created[0]!.setup).toBeUndefined()
  })

  it('a broken preset fails the run through the existing failure path (no half-composed session)', async () => {
    const store = await storeWith(task({ presetId: 'ghost' }))
    const agents = fakeAgents()
    const svc = new ExecutionService({
      store,
      agents,
      workspaces,
      events: fakeEvents(),
      now: () => 1_000,
      composeAgent: async (presetId) => {
        // Missing preset: the presets service throws on resolve.
        if (presetId === 'ghost') throw new Error('no preset "ghost" in the roster')
        return undefined
      },
    })

    const result = await svc.run('t-run', 'manual')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('no preset "ghost"')

    // No session was created; the execution is failed and the task back to todo.
    expect(agents.created).toEqual([])
    const t = store.get('t-run')!
    expect(t.executions[0]!.outcome).toBe('failed')
    expect(t.executions[0]!.error).toContain('preset 组合失败')
    expect(t.status).toBe('todo')
  })
})

describe('SchedulerService', () => {
  it('advances and runs a due scheduled task, skips missed windows', async () => {    const now = Date.parse('2026-08-14T10:30:00Z') // arbitrary
    const scheduled = task({
      id: 't-cron',
      execution: normalizeExecution({ mode: 'scheduled', cron: '*/10 * * * *' }, now - 60_000), // due a minute ago
    })
    const store = await storeWith(scheduled)
    const runs: string[] = []
    const scheduler = new SchedulerService({
      store,
      execution: { run: async id => { runs.push(id); return { ok: true, executionId: 'e', sessionId: 's' } }, inFlight: () => 0 },
      now: () => now,
    })
    await scheduler.tick()
    expect(runs).toEqual(['t-cron'])
    const t = store.get('t-cron')!
    expect(t.execution.lastTriggeredAt).toBe(scheduled.execution.nextRunAt)
    expect(t.execution.nextRunAt).toBeGreaterThan(now)

    // A window missed by > 5 minutes advances without running.
    const stale = task({
      id: 't-missed',
      execution: normalizeExecution({ mode: 'scheduled', cron: '0 3 * * *' }, now - 8 * 60_000),
    })
    stale.execution.nextRunAt = now - 8 * 60_000
    const store2 = await storeWith(stale)
    const runs2: string[] = []
    const scheduler2 = new SchedulerService({
      store: store2,
      execution: { run: async id => { runs2.push(id); return { ok: true, executionId: 'e', sessionId: 's' } }, inFlight: () => 0 },
      now: () => now,
    })
    await scheduler2.tick()
    expect(runs2).toEqual([])
    expect(store2.get('t-missed')!.execution.nextRunAt).toBeGreaterThan(now)
  })

  it('leaves non-scheduled and running tasks alone', async () => {
    const now = 1_000_000
    const claimTask = task({ id: 't-claim' })
    const running = task({
      id: 't-busy',
      status: 'in_progress',
      execution: { mode: 'scheduled', cron: '* * * * *', nextRunAt: now - 1 },
    })
    const store = await storeWith(claimTask, running)
    const runs: string[] = []
    const scheduler = new SchedulerService({
      store,
      execution: { run: async id => { runs.push(id); return { ok: true, executionId: 'e', sessionId: 's' } }, inFlight: () => 0 },
      now: () => now,
    })
    await scheduler.tick()
    expect(runs).toEqual([])
  })

  it('holds due tasks (without burning their window) while at the concurrency cap', async () => {
    const now = 1_000_000
    const due = task({
      id: 't-due',
      execution: { mode: 'scheduled', cron: '* * * * *', nextRunAt: now - 1 },
    })
    const store = await storeWith(due)
    const runs: string[] = []
    let inflight = 3
    const scheduler = new SchedulerService({
      store,
      execution: {
        run: async id => { runs.push(id); return { ok: true, executionId: 'e', sessionId: 's' } },
        inFlight: () => inflight,
      },
      now: () => now,
    })
    // At capacity: the window is NOT advanced (nextRunAt stays in the past so
    // the next tick retries) and nothing runs.
    await scheduler.tick()
    expect(runs).toEqual([])
    expect(store.get('t-due')!.execution.nextRunAt).toBe(now - 1)
    // Capacity frees up → the same window fires.
    inflight = 0
    await scheduler.tick()
    expect(runs).toEqual(['t-due'])
    expect(store.get('t-due')!.execution.nextRunAt).toBeGreaterThan(now)
  })
})

describe('R2/R3 settlement race regressions', () => {
  it('R2: a whenIdle rejection settles the execution as failed — never succeeded/in_review', async () => {
    const store = await storeWith(task())
    const agents: AgentsFace = {
      async create(options: { sessionId: string }) {
        return {
          agent: {
            id: options.sessionId,
            followup: () => {},
            inject: () => {},
            whenIdle: () => Promise.reject(new Error('driver died')),
          },
          dispose: async () => {},
        }
      },
    } as never
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000 })

    const result = await svc.run('t-run', 'manual')
    expect(result.ok).toBe(true)
    // The old code raced noteFailure against settle() and could commit the
    // SUCCESS settlement first: outcome 'succeeded' + auto-move to in_review
    // for a run that never reached quiescence. Now only the failure path
    // writes. Let its evidence+mutation chain commit.
    await waitFor(() => {
      const cur = store.get('t-run')!
      return cur.executions[0]!.outcome === 'failed' && cur.executions[0]!.error?.includes('quiescence') === true
    })

    const t = store.get('t-run')!
    expect(t.executions[0]!.outcome).toBe('failed')
    expect(t.executions[0]!.error).toContain('quiescence')
    expect(t.status).toBe('todo') // handed back, not auto-moved to in_review
    expect(t.comments.some(c => c.body.includes('执行失败'))).toBe(true)
  })

  it('R3: cancel during the startup window disposes the fresh agent and submits no work', async () => {
    const store = await storeWith(task())
    const disposed: string[] = []
    const followups: unknown[] = []
    let releaseCreate: (() => void) | undefined
    const createGate = new Promise<void>(resolve => { releaseCreate = resolve })
    const agents: AgentsFace = {
      async create(options: { sessionId: string }) {
        await createGate
        return {
          agent: {
            id: options.sessionId,
            followup: (message: unknown) => { followups.push(message) },
            inject: () => {},
            whenIdle: () => new Promise<void>(() => { /* never settles */ }),
          },
          dispose: async () => { disposed.push(options.sessionId) },
        }
      },
    } as never
    const svc = new ExecutionService({ store, agents, workspaces, events: fakeEvents(), now: () => 1_000 })

    const running = svc.run('t-run', 'manual') // parks inside agents.create
    await waitFor(() => store.get('t-run')!.status === 'in_progress') // gate committed

    // A cancel inside the startup window: no runs entry exists yet, so the
    // old code had nothing to dispose — the soon-to-be-created agent became a
    // zombie working a cancelled card.
    const cancelResult = await svc.cancel('t-run')
    expect(cancelResult.ok).toBe(true)

    releaseCreate!()
    const result = await running
    expect(result.ok).toBe(false) // 'cancelled during startup'
    expect(disposed).toHaveLength(1) // the fresh agent WAS disposed
    expect(followups).toHaveLength(0) // no work was ever submitted
    const t = store.get('t-run')!
    expect(t.status).toBe('todo')
    expect(t.executions[0]!.outcome).toBe('cancelled')
  })
})

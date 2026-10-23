/**
 * Unit tests for ExternalSessionSyncService (0.5.4).
 *
 * @module dsh-taskboard/tests/session-sync
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { TaskStore } from '../src/host/store.ts'
import { ExternalSessionSyncService, extractSessionTitle } from '../src/host/session-sync.ts'
import type { EventsFace } from '../src/host/execution.ts'
import type { WorkspaceFace } from '../src/host/tools.ts'

describe('ExternalSessionSyncService (0.5.4)', () => {
  let dir: string
  beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'tb-session-sync-')) })
  afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

  function fakeWorkspaces(): WorkspaceFace {
    const byPath = new Map([['/proj/a', 'ws-a'], ['/proj/b', 'ws-b']])
    const byId = new Map([
      ['ws-a', { id: 'ws-a', path: '/proj/a', title: 'A' }],
      ['ws-b', { id: 'ws-b', path: '/proj/b', title: 'B' }],
    ])
    return {
      resolveByPath: async (path: string) => {
        const id = byPath.get(path)
        return id !== undefined ? { id } : undefined
      },
      get: id => byId.get(id),
      list: () => [...byId.values()],
    }
  }

  async function createHarness(settings?: { syncExternalSessions?: boolean }) {
    const store = new TaskStore({ file: join(dir, `led-${Math.random().toString(36).slice(2)}.json`) })
    if (settings !== undefined) {
      await store.mutate('settings-updated', (ledger) => {
        ledger.settings = settings
        return []
      })
    }

    type Listener = (sessionId: string, event: { type: string; data?: unknown }, sessionMeta?: { header?: { cwd?: string } }) => void | Promise<void>
    const listeners = new Set<Listener>()
    const events: EventsFace = {
      onSessionEvent: (listener) => {
        listeners.add(listener as Listener)
        return () => listeners.delete(listener as Listener)
      },
    }

    let currentTime = 1000
    const now = () => currentTime

    const service = new ExternalSessionSyncService({
      store,
      workspaces: fakeWorkspaces(),
      events,
      now,
    })

    const emit = async (sessionId: string, event: { type: string; data?: unknown }, sessionMeta?: { header?: { cwd?: string } }) => {
      await Promise.all([...listeners].map(listener => listener(sessionId, event, sessionMeta)))
    }

    return {
      store,
      service,
      emit,
      setTime: (t: number) => { currentTime = t },
      dispose: () => service.dispose(),
    }
  }

  it('does nothing when syncExternalSessions is disabled or not set', async () => {
    const h = await createHarness() // default false
    await h.emit('sess-ext-1', { type: 'turn/start', data: { turn: 1 } }, { header: { cwd: '/proj/a' } })
    await h.emit('sess-ext-1', { type: 'user/message', data: { content: 'Please fix the bug' } })
    await h.emit('sess-ext-1', { type: 'turn/end', data: { turn: 1, reason: 'stop' } })

    expect(h.store.snapshot().tasks).toHaveLength(0)
    h.dispose()
  })

  it('ignores internal taskboard execution sessions even when syncExternalSessions is enabled', async () => {
    const h = await createHarness({ syncExternalSessions: true })
    await h.emit('session-taskboard-t-123-abc', { type: 'turn/start', data: { turn: 1 } }, { header: { cwd: '/proj/a' } })
    await h.emit('session-taskboard-t-123-abc', { type: 'turn/end', data: { turn: 1, reason: 'stop' } })

    expect(h.store.snapshot().tasks).toHaveLength(0)
    h.dispose()
  })

  it('captures external session, enriches with user message & title, and settles to in_review on turn/end', async () => {
    const h = await createHarness({ syncExternalSessions: true })
    h.setTime(2000)

    // 1. External session starts turn
    await h.emit('sess-user-99', { type: 'turn/start', data: { turn: 1 } }, { header: { cwd: '/proj/a' } })

    let tasks = h.store.snapshot().tasks
    expect(tasks).toHaveLength(1)
    const task = tasks[0]!
    expect(task.status).toBe('in_progress')
    expect(task.claimedBy).toBe('sess-user-99')
    expect(task.workspaceId).toBe('ws-a')
    expect(task.executions).toHaveLength(1)
    expect(task.executions[0]!.outcome).toBe('running')
    expect(task.executions[0]!.sessionId).toBe('sess-user-99')

    // 2. User sends prompt
    await h.emit('sess-user-99', {
      type: 'user/message',
      data: {
        content: [
          { type: 'text', text: '优化数据库索引以提升查询速度\n详细说明：对 user_id 与 created_at 加联合索引' },
        ],
      },
    })

    tasks = h.store.snapshot().tasks
    expect(tasks[0]!.title).toBe('优化数据库索引以提升查询速度')
    expect(tasks[0]!.description).toContain('详细说明：对 user_id 与 created_at 加联合索引')

    // 3. Session title service generates title
    await h.emit('sess-user-99', {
      type: 'session/title',
      data: { title: '数据库索引优化' },
    })
    expect(h.store.snapshot().tasks[0]!.title).toBe('数据库索引优化')

    // 4. Turn finishes successfully
    h.setTime(5000)
    await h.emit('sess-user-99', {
      type: 'turn/end',
      data: { turn: 1, reason: { kind: 'stop' } },
    })

    const settled = h.store.snapshot().tasks[0]!
    expect(settled.status).toBe('in_review')
    expect(settled.claimedBy).toBeUndefined()
    expect(settled.executions[0]!.outcome).toBe('succeeded')
    expect(settled.executions[0]!.endedAt).toBe(5000)
    expect(settled.comments).toHaveLength(1)
    expect(settled.comments[0]!.body).toContain('[系统]')
    expect(settled.comments[0]!.body).toContain('已自动进入待验收')
    // The settlement system comment is attributed to the settling session.
    expect(settled.comments[0]!.threadId).toBe('sess-user-99')

    h.dispose()
  })

  it('handles continuation turn and failure settlement appropriately', async () => {
    const h = await createHarness({ syncExternalSessions: true })
    h.setTime(1000)

    // 1. Initial turn
    await h.emit('sess-user-88', { type: 'turn/start', data: { turn: 1 } }, { header: { cwd: '/proj/b' } })
    await h.emit('sess-user-88', { type: 'turn/end', data: { turn: 1, reason: 'stop' } })

    expect(h.store.snapshot().tasks[0]!.status).toBe('in_review')

    // 2. User continues the conversation in the same session (new turn)
    h.setTime(3000)
    await h.emit('sess-user-88', { type: 'turn/start', data: { turn: 2 } }, { header: { cwd: '/proj/b' } })

    let task = h.store.snapshot().tasks[0]!
    expect(task.status).toBe('in_progress')
    expect(task.claimedBy).toBe('sess-user-88')
    expect(task.executions).toHaveLength(2)
    expect(task.executions[1]!.outcome).toBe('running')

    // 3. Turn ends with an error
    h.setTime(4000)
    await h.emit('sess-user-88', {
      type: 'turn/end',
      data: { turn: 2, reason: { kind: 'error', error: 'quota limit exceeded' } },
    })

    task = h.store.snapshot().tasks[0]!
    expect(task.status).toBe('todo')
    expect(task.claimedBy).toBeUndefined()
    expect(task.executions[1]!.outcome).toBe('failed')
    expect(task.executions[1]!.error).toContain('quota limit exceeded')
    expect(task.comments).toHaveLength(2)
    expect(task.comments[1]!.body).toContain('会话执行异常')
    expect(task.comments[1]!.body).toContain('任务已退回待办')

    h.dispose()
  })

  it('ignores subagent sessions across all subagent identification signals (0.5.5)', async () => {
    const h = await createHarness({ syncExternalSessions: true })

    // 1. By sessionId prefix
    await h.emit('subagent-child-1', { type: 'turn/start', data: { turn: 1 } }, { header: { cwd: '/proj/a' } })
    await h.emit('subagent-child-1', { type: 'user/message', data: { content: 'Subagent prompt' } })
    await h.emit('subagent-child-1', { type: 'turn/end', data: { turn: 1, reason: 'stop' } })
    expect(h.store.snapshot().tasks).toHaveLength(0)

    // 2. By header origin & parentSession
    await h.emit(
      'sess-custom-sub-2',
      { type: 'turn/start', data: { turn: 1 } },
      { header: { cwd: '/proj/a', origin: 'subagent', parentSession: 'sess-parent-main' } as never },
    )
    await h.emit('sess-custom-sub-2', { type: 'user/message', data: { content: 'Do research' } })
    await h.emit('sess-custom-sub-2', { type: 'turn/end', data: { turn: 1, reason: 'stop' } })
    expect(h.store.snapshot().tasks).toHaveLength(0)

    // 3. By delegationDepth > 0
    await h.emit(
      'sess-custom-sub-3',
      { type: 'turn/start', data: { turn: 1 } },
      { header: { cwd: '/proj/a', delegationDepth: 1 } as never },
    )
    expect(h.store.snapshot().tasks).toHaveLength(0)

    // 4. By subagent/descriptor event
    await h.emit('sess-custom-sub-4', { type: 'subagent/descriptor', data: { mode: 'one-shot', provider: 'spawn' } })
    await h.emit('sess-custom-sub-4', { type: 'turn/start', data: { turn: 1 } }, { header: { cwd: '/proj/a' } })
    expect(h.store.snapshot().tasks).toHaveLength(0)

    h.dispose()
  })

  it('isSessionActiveWorking accurately detects various working indicators (0.5.5)', async () => {
    const { isSessionActiveWorking } = await import('../src/host/session-sync.ts')

    expect(isSessionActiveWorking(null)).toBe(false)
    expect(isSessionActiveWorking({})).toBe(false)
    expect(isSessionActiveWorking({ state: 'idle' })).toBe(false)

    expect(isSessionActiveWorking({ state: 'running' })).toBe(true)
    expect(isSessionActiveWorking({ status: 'busy' })).toBe(true)
    expect(isSessionActiveWorking({ running: true })).toBe(true)
    expect(isSessionActiveWorking({ isWorking: () => true })).toBe(true)
    expect(isSessionActiveWorking({ activeTurn: { id: 1 } })).toBe(true)
    expect(isSessionActiveWorking({ currentTurn: { status: 'running' } })).toBe(true)
    expect(isSessionActiveWorking({ turns: [{ status: 'running' }] })).toBe(true)
  })

  it('user/message or turn/step on in_review task immediately pulls it back to in_progress (0.5.5)', async () => {
    const h = await createHarness({ syncExternalSessions: true })
    h.setTime(1000)

    // Complete turn 1 -> in_review
    await h.emit('sess-user-resume', { type: 'turn/start', data: { turn: 1 } }, { header: { cwd: '/proj/a' } })
    await h.emit('sess-user-resume', { type: 'turn/end', data: { turn: 1, reason: 'stop' } })

    expect(h.store.snapshot().tasks[0]!.status).toBe('in_review')

    // User sends another prompt -> immediately transitions to in_progress
    h.setTime(2000)
    await h.emit('sess-user-resume', { type: 'user/message', data: { content: '还有个额外需求要补充' } })

    let task = h.store.snapshot().tasks[0]!
    expect(task.status).toBe('in_progress')
    expect(task.claimedBy).toBe('sess-user-resume')
    expect(task.executions).toHaveLength(2)
    expect(task.executions[1]!.outcome).toBe('running')

    // Settle again
    h.setTime(3000)
    await h.emit('sess-user-resume', { type: 'turn/end', data: { turn: 2, reason: 'stop' } })
    expect(h.store.snapshot().tasks[0]!.status).toBe('in_review')

    // Step event also pulls back to in_progress
    h.setTime(4000)
    await h.emit('sess-user-resume', { type: 'turn/step', data: { step: 1 } })
    task = h.store.snapshot().tasks[0]!
    expect(task.status).toBe('in_progress')
    expect(task.claimedBy).toBe('sess-user-resume')

    h.dispose()
  })

  it('scanActiveSessions scans active external sessions and pulls in_review tasks to in_progress (0.5.5)', async () => {
    const store = new TaskStore({ file: join(dir, `led-scan-${Math.random().toString(36).slice(2)}.json`) })
    await store.mutate('settings-updated', (ledger) => {
      ledger.settings = { syncExternalSessions: true }
      return []
    })

    const liveSessions = new Map<string, Record<string, unknown>>()
    const service = new ExternalSessionSyncService({
      store,
      workspaces: fakeWorkspaces(),
      events: { onSessionEvent: () => () => {} },
      sessions: {
        get: (id) => liveSessions.get(id),
        list: () => [...liveSessions.values()],
      },
      now: () => 5000,
      scanIntervalMs: 0, // manual scan in test
    })

    // Setup an existing task in in_review linked to sess-active-1
    await store.mutate('task-created', (ledger) => {
      ledger.tasks.push({
        id: 't-scan-1',
        title: '活跃会话任务',
        description: '',
        prompt: '',
        workspaceId: 'ws-a',
        urgency: 'normal',
        status: 'in_review',
        blocked: false,
        execution: { mode: 'claim' },
        isolation: 'none',
        version: 1,
        createdAt: 1000,
        updatedAt: 2000,
        createdBy: { kind: 'user' },
        updatedBy: { kind: 'user' },
        comments: [],
        executions: [
          {
            id: 'e-1',
            sessionId: 'sess-active-1',
            trigger: 'manual',
            startedAt: 1000,
            endedAt: 2000,
            outcome: 'succeeded',
          },
        ],
      })
      return ledger.tasks
    })

    // Initially, session is idle
    liveSessions.set('sess-active-1', { id: 'sess-active-1', state: 'idle' })
    await service.scanActiveSessions()
    expect(store.snapshot().tasks[0]!.status).toBe('in_review')

    // Session starts working (e.g. user typed prompt in workspace)
    liveSessions.set('sess-active-1', { id: 'sess-active-1', state: 'running' })
    await service.scanActiveSessions()

    const updated = store.snapshot().tasks[0]!
    expect(updated.status).toBe('in_progress')
    expect(updated.claimedBy).toBe('sess-active-1')
    expect(updated.executions).toHaveLength(2)
    expect(updated.executions[1]!.outcome).toBe('running')

    service.dispose()
  })

  it('extractSessionTitle extracts titles from various session shapes', () => {
    expect(extractSessionTitle(undefined)).toBeUndefined()
    expect(extractSessionTitle(null)).toBeUndefined()
    expect(extractSessionTitle({})).toBeUndefined()

    // Direct title or displayTitle
    expect(extractSessionTitle({ title: '直接标题' })).toBe('直接标题')
    expect(extractSessionTitle({ displayTitle: '展示标题' })).toBe('展示标题')

    // Projections
    expect(extractSessionTitle({ projections: { title: '投影标题' } })).toBe('投影标题')

    // Header or meta
    expect(extractSessionTitle({ header: { title: '头部标题' } })).toBe('头部标题')
    expect(extractSessionTitle({ meta: { title: '元数据标题' } })).toBe('元数据标题')

    // Event history in reverse
    expect(extractSessionTitle({
      events: [
        { type: 'session/title', data: { title: '第一轮旧标题' } },
        { type: 'user/message', data: { content: 'hello' } },
        { type: 'session/title', data: { title: '第二轮最新标题' } },
      ],
    })).toBe('第二轮最新标题')

    // snapshotEvents method
    expect(extractSessionTitle({
      snapshotEvents: () => [
        { type: 'session/title', data: { title: '快照方法标题' } },
      ],
    })).toBe('快照方法标题')
  })

  it('pre-populates real session title on turn/start when capturing existing session', async () => {
    const h = await createHarness({ syncExternalSessions: true })

    const sessionWithHistory = {
      id: 'session-bb30a25e-test',
      snapshotEvents: () => [
        { type: 'user/message', data: { content: '原始业务需求' } },
        { type: 'session/title', data: { title: '检查装备穿戴指引触发' } },
      ],
    }

    // Capture starts at Turn 2, passing the session with existing title
    await h.emit(
      'session-bb30a25e-test',
      { type: 'turn/start', data: { turn: 2 } },
      sessionWithHistory as never,
    )

    let tasks = h.store.snapshot().tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.title).toBe('检查装备穿戴指引触发')

    // Turn 2 user message arrives (e.g. slash command or short instruction)
    await h.emit(
      'session-bb30a25e-test',
      { type: 'user/message', data: { content: '/planning-and-task-breakdown 规划一下如何改动。' } },
    )

    // Title should NOT be overwritten by subsequent turn command
    tasks = h.store.snapshot().tasks
    expect(tasks[0]!.title).toBe('检查装备穿戴指引触发')

    h.dispose()
  })

  it('scanActiveSessions reconciles placeholder or auto-created title with live session title', async () => {
    const store = new TaskStore({ file: join(dir, `led-recon-${Math.random().toString(36).slice(2)}.json`) })
    await store.mutate('settings-updated', (ledger) => {
      ledger.settings = { syncExternalSessions: true }
      return []
    })

    const liveSessions = new Map<string, Record<string, unknown>>()
    const service = new ExternalSessionSyncService({
      store,
      workspaces: fakeWorkspaces(),
      events: { onSessionEvent: () => () => {} },
      sessions: {
        get: (id) => liveSessions.get(id),
        list: () => [...liveSessions.values()],
      },
      now: () => 5000,
      scanIntervalMs: 0,
    })

    // Setup an existing task with placeholder title "会话 bb30a25e" created by agent
    await store.mutate('task-created', (ledger) => {
      ledger.tasks.push({
        id: 't-recon-1',
        title: '会话 bb30a25e',
        description: '',
        prompt: '',
        workspaceId: 'ws-a',
        urgency: 'normal',
        status: 'in_progress',
        blocked: false,
        execution: { mode: 'claim' },
        isolation: 'none',
        claimedBy: 'sess-recon-1',
        version: 1,
        createdAt: 1000,
        updatedAt: 1000,
        createdBy: { kind: 'agent', sessionId: 'sess-recon-1' },
        updatedBy: { kind: 'agent', sessionId: 'sess-recon-1' },
        comments: [],
        executions: [
          {
            id: 'e-1',
            sessionId: 'sess-recon-1',
            trigger: 'manual',
            startedAt: 1000,
            outcome: 'running',
          },
        ],
      })
      return ledger.tasks
    })

    // Session has real title in its projections
    liveSessions.set('sess-recon-1', {
      id: 'sess-recon-1',
      state: 'running',
      projections: { title: '检查装备穿戴指引触发' },
    })

    await service.scanActiveSessions()

    const task = store.snapshot().tasks[0]!
    expect(task.title).toBe('检查装备穿戴指引触发')

    service.dispose()
  })
})

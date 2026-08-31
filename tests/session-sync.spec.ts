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
import { ExternalSessionSyncService } from '../src/host/session-sync.ts'
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

    type Listener = (sessionId: string, event: { type: string; data?: unknown }, sessionMeta?: { header?: { cwd?: string } }) => void
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
      for (const l of listeners) {
        l(sessionId, event, sessionMeta)
      }
      await new Promise(r => setTimeout(r, 20))
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
})

// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardController } from '../src/client/controller.ts'
import { TaskBoard } from '../src/client/board/TaskBoard.tsx'
import { TaskDetail } from '../src/client/board/TaskDetail.tsx'
import { TaskCard } from '../src/client/board/TaskCard.tsx'
import type { TaskRecord } from '../src/shared/protocol.ts'
import { disposeI18n } from '../src/client/i18n/runtime.ts'
import { waitFor } from './wait-for.ts'

const cleanup: Array<() => void> = []
beforeEach(() => { localStorage.clear(); document.documentElement.lang = 'zh-CN'; disposeI18n() })
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks(); localStorage.clear() })
function task(extra: Partial<TaskRecord> = {}): TaskRecord {
  return { id: 't-human', title: '等待用户确认部署', description: '', prompt: '', workspaceId: 'ws-a',
    urgency: 'normal', status: 'todo', blocked: true, execution: { mode: 'claim' }, version: 1,
    createdAt: 1, updatedAt: 1, createdBy: { kind: 'user' }, updatedBy: { kind: 'user' }, comments: [], executions: [], ...extra }
}
async function mount(tasks: TaskRecord[], view: 'board' | 'detail' | 'card') {
  const updates: Array<Record<string, unknown>> = []
  const controller = new BoardController({
    state: async () => ({ schemaVersion: 1, revision: 1, tasks }),
    workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
    stream: () => () => {},
    update: async (_id: string, body: Record<string, unknown>) => { updates.push(body); return { id: tasks[0]!.id } },
  } as never)
  controller.start()
  cleanup.push(() => controller.dispose())
  await waitFor(() => controller.getSnapshot().workspaces.length === 1)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  cleanup.push(() => { root.unmount(); host.remove() })
  root.render(view === 'board' ? <TaskBoard controller={controller} /> : view === 'detail'
    ? <TaskDetail task={tasks[0]!} controller={controller} /> : <TaskCard task={tasks[0]!} controller={controller} />)
  await waitFor(() => host.querySelector(view === 'board' ? '.dsh-atb-columns' : view === 'detail' ? '.dsh-atb-fieldcard' : '.dsh-atb-card') !== null)
  return { host, updates }
}

describe('human waiting and delivery review UI', () => {
  it('filters out ordinary and explicitly cleared cards while retaining suspected and explicit waits', async () => {
    const { host } = await mount([
      task(), task({ id: 't-explicit', title: 'Explicit', waitingForHuman: true, waitingReason: '确认目标' }),
      task({ id: 't-clear', waitingForHuman: false }), task({ id: 't-login', title: '修复登录页样式' }),
    ], 'board')
    const filter = host.querySelector<HTMLButtonElement>('[data-kind="needs-human-filter"]')!
    expect(filter.textContent).toContain('(2)')
    filter.click()
    await waitFor(() => host.querySelectorAll('.dsh-atb-card').length === 2)
    expect(host.textContent).not.toContain('修复登录页样式')
    expect(host.textContent).toContain('疑似等待人工')
    filter.click()
    await waitFor(() => host.querySelectorAll('.dsh-atb-card').length === 4)
  })

  it('sends explicit clear and automatic reset without touching blocked', async () => {
    const { host, updates } = await mount([task({ waitingForHuman: true, waitingReason: '确认环境' })], 'detail')
    host.querySelector<HTMLButtonElement>('[data-to="needs-human-clear"]')!.click()
    await waitFor(() => updates.length === 1)
    expect(updates[0]).toEqual({ ifVersion: 1, waitingForHuman: false, waitingReason: null })
    await waitFor(() => !host.querySelector<HTMLButtonElement>('[data-to="needs-human-auto"]')!.disabled)
    host.querySelector<HTMLButtonElement>('[data-to="needs-human-auto"]')!.click()
    await waitFor(() => updates.length === 2)
    expect(updates[1]).toEqual({ ifVersion: 1, waitingForHuman: null, waitingReason: null })
  })

  it('keeps earlier reports in history and does not present them as the latest delivery', async () => {
    const t = task({ status: 'in_review', executions: [
      { id: 'e-old', trigger: 'manual', startedAt: 1, endedAt: 2, outcome: 'succeeded', report: {
        summary: 'Previous delivery', changedFiles: ['old.ts'], checks: ['Tests failed'], artifacts: [], risk: '' } },
      { id: 'e-new', trigger: 'manual', startedAt: 3, endedAt: 4, outcome: 'succeeded' },
    ] })
    const card = await mount([t], 'card')
    expect(card.host.textContent).not.toContain('Previous delivery')
    const { host } = await mount([t], 'detail')
    expect(host.querySelector('[data-kind="report-missing"]')?.textContent).toContain('最新一轮')
    const history = host.querySelector('[data-kind="report-history"]')!
    expect(history.textContent).toContain('Previous delivery')
    expect(history.textContent).toContain('e-old')
    expect(history.querySelector('.dsh-atb-check-icon')).toBeNull()
    expect(history.textContent).toContain('Tests failed')
  })

  it('shows clipboard failure and allows selecting the path', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    const { host } = await mount([task({ status: 'done', executions: [{ id: 'e-new', trigger: 'manual', startedAt: 1, endedAt: 2, outcome: 'succeeded',
      report: { summary: 'Report', changedFiles: ['src/a.ts'], checks: ['Browser check not run'], artifacts: [], risk: '' } }] })], 'detail')
    host.querySelector<HTMLButtonElement>('.dsh-atb-file-copybtn')!.click()
    await waitFor(() => host.textContent!.includes('复制失败'))
    expect(host.querySelector('.dsh-atb-file-path')?.textContent).toBe('src/a.ts')
    expect(host.querySelector('.dsh-atb-check-icon')).toBeNull()
  })
})

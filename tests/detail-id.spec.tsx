// @vitest-environment jsdom
import React from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BoardController } from '../src/client/controller.ts'
import { TaskDetail } from '../src/client/board/TaskDetail.tsx'
import type { TaskRecord } from '../src/shared/protocol.ts'
import { disposeI18n } from '../src/client/i18n/runtime.ts'
import { waitFor } from './wait-for.ts'

const cleanup: Array<() => void> = []
beforeEach(() => { localStorage.clear(); document.documentElement.lang = 'en'; disposeI18n() })
afterEach(() => { cleanup.splice(0).reverse().forEach(fn => fn()); vi.restoreAllMocks(); localStorage.clear() })

function task(extra: Partial<TaskRecord> = {}): TaskRecord {
  return { id: 't-detail-id', title: 'Show the card id', description: '', prompt: '', workspaceId: 'ws-a',
    urgency: 'normal', status: 'todo', blocked: false, execution: { mode: 'claim' }, version: 3,
    createdAt: 1, updatedAt: 1, createdBy: { kind: 'user' }, updatedBy: { kind: 'user' }, comments: [], executions: [], ...extra }
}

async function mount(record: TaskRecord) {
  const controller = new BoardController({
    state: async () => ({ schemaVersion: 1, revision: 1, tasks: [record] }),
    workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
    stream: () => () => {},
  } as never)
  controller.start()
  cleanup.push(() => controller.dispose())
  await waitFor(() => controller.getSnapshot().workspaces.length === 1)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  cleanup.push(() => { root.unmount(); host.remove() })
  root.render(<TaskDetail task={record} controller={controller} />)
  await waitFor(() => host.querySelector('.dsh-atb-detail-id') !== null)
  return host
}

describe('task id in the detail header', () => {
  it('renders the id and copies it on click', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const host = await mount(task())
    const chip = host.querySelector<HTMLButtonElement>('.dsh-atb-detail-id')!
    expect(chip.textContent).toBe('t-detail-id')
    expect(chip.getAttribute('data-state')).toBe('idle')
    expect(chip.title).toBe('Click to copy the task ID')
    chip.click()
    await waitFor(() => chip.getAttribute('data-state') === 'copied')
    expect(writeText).toHaveBeenCalledWith('t-detail-id')
    expect(chip.textContent).toBe('Copied')
    // The acknowledgement is temporary: the id comes back on its own.
    await waitFor(() => chip.getAttribute('data-state') === 'idle')
    expect(chip.textContent).toBe('t-detail-id')
  })

  it('reports a denied copy and keeps the id readable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    const host = await mount(task({ id: 't-copy-denied' }))
    const chip = host.querySelector<HTMLButtonElement>('.dsh-atb-detail-id')!
    chip.click()
    await waitFor(() => chip.getAttribute('data-state') === 'failed')
    expect(chip.textContent).toBe('Copy failed')
    await waitFor(() => chip.getAttribute('data-state') === 'idle')
    expect(chip.textContent).toBe('t-copy-denied')
  })

  it.each([
    ['zh-CN', '点击复制任务 ID', '已复制', '复制失败'],
    ['ru-RU', 'Нажмите, чтобы скопировать ID задачи', 'Скопировано', 'Не удалось скопировать'],
  ])('localizes the id title and copy feedback in %s', async (locale, title, copied, failed) => {
    document.documentElement.lang = locale
    disposeI18n()
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const host = await mount(task({ id: 't-locale' }))
    const chip = host.querySelector<HTMLButtonElement>('.dsh-atb-detail-id')!
    expect(chip.textContent).toBe('t-locale')
    expect(chip.title).toBe(title)
    chip.click()
    await waitFor(() => chip.getAttribute('data-state') === 'copied')
    expect(chip.textContent).toBe(copied)
    expect(writeText).toHaveBeenCalledWith('t-locale')
    chip.click()
    await waitFor(() => chip.getAttribute('data-state') === 'failed')
    expect(chip.textContent).toBe(failed)
  })
})

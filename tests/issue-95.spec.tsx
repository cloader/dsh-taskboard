// @vitest-environment jsdom
// Issue #95: after a one-shot (定时一次) fires, its trigger is consumed but
// the mode used to stay 'scheduled' with no runAt/cron — the edit form then
// inferred mode 'once' with an empty datetime and a permanently disabled
// Save button. The form must treat a spent one-shot as a plain claim task
// (host-side settlement normalizes new data; this guard also heals legacy
// ledgers), while a card still queued for dispatch keeps editing as 定时一次.
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BoardController } from '../src/client/controller.ts'
import { TaskFormModal } from '../src/client/board/TaskFormModal.tsx'
import type { TaskRecord } from '../src/shared/protocol.ts'
import type { CreateTaskBody, UpdateTaskBody } from '../src/shared/api.ts'
import { disposeI18n } from '../src/client/i18n/runtime.ts'
import { waitFor } from './wait-for.ts'

const cleanups: Array<() => void> = []
beforeEach(() => { localStorage.clear(); document.documentElement.lang = 'zh-CN'; disposeI18n() })
afterEach(() => { cleanups.splice(0).reverse().forEach(dispose => dispose()); localStorage.clear() })

const workspaces = [
  { id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 },
]

// Mirrors the harness in issue-56.spec.tsx: a REAL BoardController over a
// faked transport — plain-object controller fakes do not receive React's
// change events.
async function setup(task: TaskRecord) {
  const updated: UpdateTaskBody[] = []
  const created: CreateTaskBody[] = []
  const controller = new BoardController({
    state: async () => ({ schemaVersion: 1, revision: 1, tasks: [task], settings: {} }),
    workspaces: async () => workspaces.map(w => ({ ...w })),
    stream: () => () => {},
    create: async (body: CreateTaskBody) => { created.push(body); return { id: 'new-task', version: 1 } },
    update: async (_id: string, body: UpdateTaskBody) => { updated.push(body); return { id: task.id, version: task.version + 1 } },
  } as never)
  controller.installModelCatalog(async () => [])
  controller.installPresetRoster(async () => ({ presets: [{ id: 'p1', name: 'P1' }], defaultId: 'p1' }))
  controller.start()
  cleanups.push(() => controller.dispose())
  await waitFor(() => controller.getSnapshot().workspaces.length === 1)
  const host = document.createElement('div')
  document.body.append(host)
  const root: Root = createRoot(host)
  cleanups.push(() => { root.unmount(); host.remove() })
  root.render(React.createElement(TaskFormModal, { controller, task }))
  const saveButton = (): HTMLButtonElement | null =>
    host.querySelector<HTMLButtonElement>('button[data-primary="true"]')
  const datetime = (): HTMLInputElement | null =>
    host.querySelector<HTMLInputElement>('input[type="datetime-local"]')
  return { controller, host, root, updated, created, saveButton, datetime }
}

function taskOf(execution: TaskRecord['execution'], status: TaskRecord['status'] = 'in_review'): TaskRecord {
  return {
    id: 't-95', title: 'Nightly patrol', description: '', prompt: '', workspaceId: 'ws-a',
    urgency: 'normal', status, blocked: false, execution,
    version: 2, createdAt: 1, updatedAt: 5,
    createdBy: { kind: 'user' }, updatedBy: { kind: 'system' },
    comments: [], executions: [],
  }
}

describe('TaskFormModal spent one-shot (#95)', () => {
  it('edits a fired one-shot as claim: Save enabled and submits mode claim', async () => {
    // The exact ghost state the host used to leave behind: scheduled, no
    // cron, no runAt (consumed at queue time), run already settled.
    const view = await setup(taskOf({ mode: 'scheduled', lastTriggeredAt: 5 }))
    await waitFor(() => view.saveButton() !== null)
    await waitFor(() => !view.saveButton()!.disabled)
    expect(view.datetime()).toBeNull() // claim form has no datetime field
    view.saveButton()!.click()
    await waitFor(() => view.updated.length === 1)
    expect(view.updated[0]).toMatchObject({ execution: { mode: 'claim' } })
  })

  it('a queued one-shot still edits as 定时一次 seeded with its dispatch window', async () => {
    const future = Date.now() + 10 * 60_000
    const view = await setup(taskOf({ mode: 'scheduled', queuedRunAt: future, queuedAt: Date.now() }, 'todo'))
    await waitFor(() => view.datetime() !== null && view.datetime()!.value !== '')
    await waitFor(() => !view.saveButton()!.disabled)
    view.saveButton()!.click()
    await waitFor(() => view.updated.length === 1)
    expect(view.updated[0]).toMatchObject({ execution: { mode: 'scheduled' } })
    expect((view.updated[0]!.execution as { runAt?: string }).runAt).toBeDefined()
  })
})

// @vitest-environment jsdom
// Issue #98: customizable worktree branch naming — the client surfaces.
// - The task form shows the optional branch-name field for worktree tasks,
//   prefilled with the pinned branch and LOCKED once execution history exists.
// - Create mode: a typed branch rides the create body; blank omits it.
// - The settings modal stages the naming preset (select + conditional prefix
//   input) and saves it through the controller.
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BoardController } from '../src/client/controller.ts'
import { TaskFormModal } from '../src/client/board/TaskFormModal.tsx'
import { SettingsModal } from '../src/client/board/SettingsModal.tsx'
import type { TaskRecord } from '../src/shared/protocol.ts'
import type { CreateTaskBody, UpdateTaskBody } from '../src/shared/api.ts'
import { disposeI18n } from '../src/client/i18n/runtime.ts'
import { waitFor } from './wait-for.ts'

const cleanups: Array<() => void> = []
beforeEach(() => { localStorage.clear(); document.documentElement.lang = 'zh-CN'; disposeI18n() })
afterEach(() => { cleanups.splice(0).reverse().forEach(dispose => dispose()); localStorage.clear() })

const workspaces = [
  { id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0, gitAvailable: true },
]

/** Harness mirroring issue-95.spec.tsx: a REAL controller over a fake transport. */
async function setupForm(task: TaskRecord | undefined, settings: Record<string, unknown> = {}) {
  const updated: UpdateTaskBody[] = []
  const created: CreateTaskBody[] = []
  const controller = new BoardController({
    state: async () => ({ schemaVersion: 1, revision: 1, tasks: task === undefined ? [] : [task], settings }),
    workspaces: async () => workspaces.map(w => ({ ...w })),
    stream: () => () => {},
    create: async (body: CreateTaskBody) => { created.push(body); return { id: 'new-task', version: 1 } },
    update: async (_id: string, body: UpdateTaskBody) => { updated.push(body); return { id: task?.id ?? 'x', version: (task?.version ?? 1) + 1 } },
  } as never)
  controller.installModelCatalog(async () => [])
  controller.installPresetRoster(async () => ({ presets: [], defaultId: undefined }))
  controller.start()
  cleanups.push(() => controller.dispose())
  await waitFor(() => controller.getSnapshot().workspaces.length === 1)
  const host = document.createElement('div')
  document.body.append(host)
  const root: Root = createRoot(host)
  cleanups.push(() => { root.unmount(); host.remove() })
  root.render(React.createElement(TaskFormModal, task === undefined ? { controller } : { controller, task }))
  const saveButton = (): HTMLButtonElement | null =>
    host.querySelector<HTMLButtonElement>('button[data-primary="true"]')
  const titleInput = (): HTMLInputElement | null =>
    host.querySelector<HTMLInputElement>('input[maxlength="200"]')
  const branchInput = (): HTMLInputElement | null =>
    Array.from(host.querySelectorAll<HTMLInputElement>('input')).find(i => i.maxLength === 60) ?? null
  const worktreeOpt = (): HTMLButtonElement | null =>
    Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-mode-opt')).find(b => b.textContent?.includes('Worktree 隔离')) ?? null
  const setValue = (el: HTMLInputElement, value: string): void => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
  return { controller, host, root, updated, created, saveButton, titleInput, branchInput, worktreeOpt, setValue }
}

function taskOf(overrides: Partial<TaskRecord>): TaskRecord {
  return {
    id: 't-98', title: '修复登录', description: '', prompt: '', workspaceId: 'ws-a',
    urgency: 'normal', status: 'todo', blocked: false, execution: { mode: 'claim' },
    isolation: 'worktree',
    version: 2, createdAt: 1, updatedAt: 5,
    createdBy: { kind: 'user' }, updatedBy: { kind: 'user' },
    comments: [], executions: [],
    ...overrides,
  }
}

describe('TaskFormModal branch override (#98)', () => {
  it('edit: branch defaults to the board preset derivation, follows title edits until touched', async () => {
    const view = await setupForm(taskOf({})) // no explicit branch
    await waitFor(() => view.branchInput() !== null)
    // title-id preset (factory default): derived from the task id + title.
    expect(view.branchInput()!.value).toBe('task/修复登录+t-98')

    // Editing the title keeps the derived branch in step …
    view.setValue(view.titleInput()!, '修复登录页')
    await waitFor(() => view.branchInput()!.value === 'task/修复登录页+t-98')

    // … until the user edits the branch by hand.
    view.setValue(view.branchInput()!, 'feat/login')
    view.setValue(view.titleInput()!, '再改一次')
    await waitFor(() => view.titleInput()!.value === '再改一次')
    await new Promise(r => setTimeout(r, 20))
    expect(view.branchInput()!.value).toBe('feat/login')

    // The submitted override is the hand-set value.
    await waitFor(() => view.saveButton() !== null && !view.saveButton()!.disabled)
    view.saveButton()!.click()
    await waitFor(() => view.updated.length === 1)
    expect(view.updated[0]).toMatchObject({ branch: 'feat/login' })
  })

  it('edit: shows the pinned branch, disabled once execution history exists', async () => {
    const view = await setupForm(taskOf({ branch: 'feat/login', executions: [{ id: 'e-1', trigger: 'manual' as const, startedAt: 1, endedAt: 2, outcome: 'succeeded' as const }] }))
    await waitFor(() => view.branchInput() !== null)
    const input = view.branchInput()!
    expect(input.value).toBe('feat/login')
    expect(input.disabled).toBe(true)
  })

  it('edit: editable before the first execution; blank clears (null) on save', async () => {
    const view = await setupForm(taskOf({ branch: 'feat/login' }))
    await waitFor(() => view.branchInput() !== null)
    await waitFor(() => view.saveButton() !== null && !view.saveButton()!.disabled)
    expect(view.branchInput()!.disabled).toBe(false)
    view.saveButton()!.click()
    await waitFor(() => view.updated.length === 1)
    expect(view.updated[0]).toMatchObject({ branch: 'feat/login' })
    // The write round-trip must settle before the next click (busy guard).
    await waitFor(() => view.saveButton() !== null && !view.saveButton()!.disabled)
    view.setValue(view.branchInput()!, '')
    // Cleared in edit mode: the placeholder reveals the board-rule derivation.
    expect(view.branchInput()!.placeholder).toBe('task/修复登录+t-98')
    view.saveButton()!.click()
    await waitFor(() => view.updated.length === 2)
    expect(view.updated[1]).toMatchObject({ branch: null })
  })

  it('create: worktree + typed branch rides the create body; blank omits it', async () => {
    const view = await setupForm(undefined)
    await waitFor(() => view.worktreeOpt() !== null)
    // The factory default isolation is 'none' — opt in first.
    view.worktreeOpt()!.click()
    await waitFor(() => view.branchInput() !== null)
    // Create-mode placeholder previews the board rule: the id is not minted
    // yet, so it shows as the literal ID placeholder (empty title → 标题).
    expect(view.branchInput()!.placeholder).toBe('task/标题+ID')
    view.setValue(view.titleInput()!, '修复登录')
    await waitFor(() => view.branchInput()!.placeholder === 'task/修复登录+ID')
    view.setValue(view.branchInput()!, '  feat/login ')
    await waitFor(() => view.saveButton() !== null && !view.saveButton()!.disabled)
    view.saveButton()!.click()
    await waitFor(() => view.created.length === 1)
    expect(view.created[0]).toMatchObject({ branch: 'feat/login', isolation: 'worktree' })
  })

  it('create: leaving the branch blank omits the field entirely (board preset decides)', async () => {
    const view = await setupForm(undefined)
    await waitFor(() => view.worktreeOpt() !== null)
    view.worktreeOpt()!.click()
    await waitFor(() => view.branchInput() !== null)
    view.setValue(view.titleInput()!, '修复登录')
    await waitFor(() => view.saveButton() !== null && !view.saveButton()!.disabled)
    view.saveButton()!.click()
    await waitFor(() => view.created.length === 1)
    expect(view.created[0]!.branch).toBeUndefined()
  })
})

describe('SettingsModal branch naming (#98)', () => {
  it('stages the preset select, shows the prefix input only for prefix-* modes, and saves', async () => {
    const saved: unknown[] = []
    const controller = new BoardController({
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [], settings: {} }),
      workspaces: async () => workspaces.map(w => ({ ...w })),
      stream: () => () => {},
      updateSettings: async (body: unknown) => { saved.push(body); return body },
      storage: async () => ({ currentDirectory: 'C:\\old', defaultDirectory: 'C:\\old', isDefault: true, configured: false, writable: true, assetCount: 0, assetBytes: 0 }),
    } as never)
    controller.start()
    cleanups.push(() => controller.dispose())
    controller.openSettings()
    await new Promise(r => setTimeout(r, 10))

    const host = document.createElement('div')
    document.body.append(host)
    const root: Root = createRoot(host)
    cleanups.push(() => { root.unmount(); host.remove() })
    root.render(React.createElement(SettingsModal, { controller }))
    await new Promise(r => setTimeout(r, 10))

    const section = Array.from(host.querySelectorAll('.dsh-atb-diag-sec'))
      .find(el => el.querySelector('h4')?.textContent === '分支命名')
    expect(section).toBeDefined()
    const select = section!.querySelector('select')!
    // Default draft: title-id, no prefix input.
    expect((select as HTMLSelectElement).value).toBe('title-id')
    expect(section!.querySelector('input')).toBeNull()
    expect(section!.textContent).toContain('task/修复登录+t-1a2b')

    // Switch to the pure-ASCII preset → still no prefix input.
    const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
    const pick = (value: string): void => {
      selectSetter.call(select, value)
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }
    pick('id')
    await new Promise(r => setTimeout(r, 10))
    expect(section!.querySelector('input')).toBeNull()

    // Switch to a prefix preset → the prefix input appears.
    pick('prefix-id')
    await new Promise(r => setTimeout(r, 10))
    const prefixInput = section!.querySelector<HTMLInputElement>('input')!
    expect(prefixInput.value).toBe('task')

    const saveBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-btn'))
      .find(b => b.textContent === '保存设置')!
    saveBtn.click()
    await new Promise(r => setTimeout(r, 20))
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ branchNameMode: 'prefix-id', branchNamePrefix: 'task' })
  })
})

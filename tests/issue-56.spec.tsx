// @vitest-environment jsdom
// Issue #56: the new-task form's project default is configurable via
// BoardSettings.defaultWorkspaceId instead of always falling back to the
// first registered workspace.
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BoardController } from '../src/client/controller.ts'
import { SettingsModal } from '../src/client/board/SettingsModal.tsx'
import { TaskFormModal } from '../src/client/board/TaskFormModal.tsx'
import { initialWorkspaceId } from '../src/client/board/format.ts'
import { asBoardSettings } from '../src/shared/protocol.ts'
import type { BoardSettings } from '../src/shared/protocol.ts'
import type { CreateTaskBody, UpdateSettingsBody, UpdateTaskBody } from '../src/shared/api.ts'
import { disposeI18n } from '../src/client/i18n/runtime.ts'
import { waitFor } from './wait-for.ts'

const cleanups: Array<() => void> = []
beforeEach(() => { localStorage.clear(); document.documentElement.lang = 'zh-CN'; disposeI18n() })
afterEach(() => { cleanups.splice(0).reverse().forEach(dispose => dispose()); localStorage.clear() })

const workspaces = [
  { id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 },
  { id: 'ws-b', path: '/p/b', title: 'B', sessionCount: 0 },
]

// Mirrors the proven harness in default-settings.spec.ts: a REAL BoardController
// over a faked transport — plain-object controller fakes do not receive React's
// change events (the two UI failures this file's first draft hit).
async function setup(initial: BoardSettings = {}) {
  let settings = initial
  const saved: UpdateSettingsBody[] = []
  const created: CreateTaskBody[] = []
  const updated: UpdateTaskBody[] = []
  const controller = new BoardController({
    state: async () => ({ schemaVersion: 1, revision: 1, tasks: [], settings }),
    workspaces: async () => workspaces.map(w => ({ ...w })),
    stream: () => () => {},
    updateSettings: async (body: UpdateSettingsBody) => { saved.push(body); settings = body as BoardSettings; return settings },
    create: async (body: CreateTaskBody) => { created.push(body); return { id: 'new-task', version: 1 } },
    update: async (_id: string, body: UpdateTaskBody) => { updated.push(body); return { id: 'old-task', version: 2 } },
  } as never)
  controller.installModelCatalog(async () => [])
  controller.installPresetRoster(async () => ({ presets: [{ id: 'p1', name: 'P1' }], defaultId: 'p1' }))
  controller.start()
  cleanups.push(() => controller.dispose())
  await waitFor(() => controller.getSnapshot().workspaces.length === 2)
  const host = document.createElement('div')
  document.body.append(host)
  const root: Root = createRoot(host)
  cleanups.push(() => { root.unmount(); host.remove() })
  const field = (label: string): HTMLSelectElement => {
    const found = Array.from(host.querySelectorAll('label'))
      .find(el => el.querySelector('.dsh-atb-field-label')?.textContent?.replace(/\*$/, '') === label)?.querySelector('select')
    expect(found).toBeTruthy()
    return found!
  }
  const change = (select: HTMLSelectElement, value: string) => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) }
  const button = (text: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(el => el.textContent === text)!
  return { controller, root, host, saved, field, change, button }
}

describe('initialWorkspaceId (#56)', () => {
  const wss = [{ id: 'ws-a' }, { id: 'ws-b' }]
  it('the task being edited always wins', () => {
    expect(initialWorkspaceId({ editing: 'ws-b', filter: 'ws-a', settings: { defaultWorkspaceId: 'ws-b' }, workspaces: wss })).toBe('ws-b')
  })
  it('a board project filter outranks the configured default', () => {
    expect(initialWorkspaceId({ filter: 'ws-a', settings: { defaultWorkspaceId: 'ws-b' }, workspaces: wss })).toBe('ws-a')
  })
  it('the configured default applies when still registered', () => {
    expect(initialWorkspaceId({ settings: { defaultWorkspaceId: 'ws-b' }, workspaces: wss })).toBe('ws-b')
  })
  it('a dangling default (workspace since deleted) is skipped', () => {
    expect(initialWorkspaceId({ settings: { defaultWorkspaceId: 'ws-gone' }, workspaces: wss })).toBe('ws-a')
  })
  it('falls back to the first registered workspace', () => {
    expect(initialWorkspaceId({ workspaces: wss })).toBe('ws-a')
  })
  it('an empty workspace list yields an empty selection', () => {
    expect(initialWorkspaceId({ workspaces: [] })).toBe('')
  })
})

describe('asBoardSettings defaultWorkspaceId (#56)', () => {
  it('accepts and trims a workspace id', () => {
    expect(asBoardSettings({ defaultWorkspaceId: ' ws-b ' })).toEqual({ defaultWorkspaceId: 'ws-b' })
  })
  it('treats a blank value as unset (whole-replace clearing)', () => {
    expect(asBoardSettings({ defaultWorkspaceId: '   ' })).toEqual({})
  })
  it('rejects non-string values', () => {
    expect(() => asBoardSettings({ defaultWorkspaceId: 42 })).toThrow('defaultWorkspaceId must be a string')
  })
  it('keeps dropping unknown fields', () => {
    expect(asBoardSettings({ nope: 1 })).toEqual({})
  })
})

describe('SettingsModal default project (#56)', () => {
  it('starts from the saved default project and saves an explicit choice', async () => {
    const view = await setup({ defaultWorkspaceId: 'ws-b' })
    view.root.render(React.createElement(SettingsModal, { controller: view.controller }))
    await waitFor(() => view.field('默认新建项目').value === 'ws-b')
    view.change(view.field('默认新建项目'), 'ws-a')
    await waitFor(() => !view.button('保存设置').disabled)
    view.button('保存设置').click()
    await waitFor(() => view.saved.length === 1)
    expect(view.saved[0]).toMatchObject({ defaultWorkspaceId: 'ws-a' })
  })

  it('a dangling saved default still renders as the current selection', async () => {
    const view = await setup({ defaultWorkspaceId: 'ws-gone' })
    view.root.render(React.createElement(SettingsModal, { controller: view.controller }))
    await waitFor(() => view.field('默认新建项目').value === 'ws-gone')
    expect([...view.field('默认新建项目').options].some(o => o.value === 'ws-gone')).toBe(true)
  })

  it('clearing the selection omits the field so whole-replace removes the default', async () => {
    const view = await setup({ defaultWorkspaceId: 'ws-a' })
    view.root.render(React.createElement(SettingsModal, { controller: view.controller }))
    await waitFor(() => view.field('默认新建项目').value === 'ws-a')
    view.change(view.field('默认新建项目'), '')
    await waitFor(() => !view.button('保存设置').disabled)
    view.button('保存设置').click()
    await waitFor(() => view.saved.length === 1)
    expect(view.saved[0]).not.toHaveProperty('defaultWorkspaceId')
  })
})

describe('TaskFormModal initial project (#56)', () => {
  it('new tasks start from the configured default project instead of the first registered', async () => {
    const view = await setup({ defaultWorkspaceId: 'ws-b' })
    view.root.render(React.createElement(TaskFormModal, { controller: view.controller }))
    await waitFor(() => view.field('项目').value === 'ws-b')
  })
  it('without a configured default the first registered workspace stays the fallback', async () => {
    const view = await setup()
    view.root.render(React.createElement(TaskFormModal, { controller: view.controller }))
    await waitFor(() => view.field('项目').value === 'ws-a')
  })
})

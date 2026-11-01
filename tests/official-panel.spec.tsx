// @vitest-environment jsdom
import React from 'react'
import { readFileSync } from 'node:fs'
import { inject } from '../src/client/index.ts'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { BoardController } from '../src/client/controller.ts'
import { mountBoardPanel, OFFICIAL_PANEL_ID } from '../src/client/official-panel.tsx'
import { disposeI18n, setLocalePreference } from '../src/client/i18n/runtime.ts'
import { injectStyles, STYLES } from '../src/client/styles.ts'
import type { TaskRecord } from '../src/shared/protocol.ts'
import { waitFor } from './wait-for.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  disposeI18n()
  localStorage.clear()
  document.body.replaceChildren()
  document.body.removeAttribute('data-dsh-desktop-platform')
})

function fixture(deferred = false, failOn?: string) {
  let tasks: TaskRecord[] = []
  const controller = new BoardController({
    state: async () => ({ schemaVersion: 1, revision: 1, tasks }),
    workspaces: async () => [], templates: async () => ({ templates: [] }),
    stream: () => () => {},
  } as never)
  cleanups.push(() => controller.dispose())
  const records = new Map<string, { options: Record<string, unknown>; component: React.ComponentType }>()
  const pending = new Map<string, () => unknown>()
  const removed: string[] = []
  const slots = {
    inject(key: string, callback: () => unknown) {
      if (!deferred) return callback() as () => void
      let dispose: (() => void) | undefined
      const run = () => { dispose = callback() as () => void }
      pending.set(key, run)
      return () => { pending.delete(key); dispose?.() }
    },
    register(options: Record<string, unknown>, component: React.ComponentType) {
      const key = options.name as string
      if (key === failOn) throw new Error('registration failed')
      records.set(key, { options, component })
      return () => { removed.push(key); records.delete(key) }
    },
  }
  const selectPanel = vi.fn()
  const ctx = { get: (key: string) => key === 'slots' ? slots : key === 'layout' ? { selectPanel } : undefined }
  return { controller, records, pending, removed, selectPanel, ctx,
    tasks: (next: TaskRecord[]) => { tasks = next },
    mount: () => {
      const dispose = mountBoardPanel(ctx, controller)
      cleanups.push(dispose)
      return dispose
    },
  }
}

it('registers one sidebar row and one main page, with host-owned closing and cleanup', () => {
  const f = fixture()
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
  expect(inject).toEqual(['slots'])
  expect(manifest.dsh.client.inject).toEqual(inject)
  const dispose = f.mount()
  expect(f.records.size).toBe(2)
  expect(f.records.get('main')!.options.key).toBe(OFFICIAL_PANEL_ID)
  expect(f.records.get('sidebar.panellist')!.options).toMatchObject({ id: OFFICIAL_PANEL_ID, label: expect.any(Function) })
  f.controller.closeBoard()
  expect(f.selectPanel).toHaveBeenCalledWith(null)
  expect(document.querySelector('[data-dsh-atb-entry], [data-dsh-atb-view]')).toBeNull()
  expect(document.documentElement.hasAttribute('data-dsh-atb-active')).toBe(false)
  dispose()
  expect(f.records.size).toBe(0)
  expect(f.removed).toEqual(['sidebar.panellist', 'main'])
  f.selectPanel.mockClear()
  f.controller.closeBoard()
  expect(f.selectPanel).not.toHaveBeenCalled()
})

it('uses the slot lifecycle for declarations that arrive later', () => {
  const f = fixture(true)
  f.mount()
  expect(f.records.size).toBe(0)
  expect(document.body.children).toHaveLength(0)
  for (const callback of f.pending.values()) callback()
  expect([...f.records.keys()]).toEqual(['main', 'sidebar.panellist'])
})

it('cancels pending registrations on unload', () => {
  const f = fixture(true)
  const dispose = f.mount()
  dispose()
  expect(f.pending.size).toBe(0)
  expect(f.records.size).toBe(0)
})

it('rolls back a partial registration and does not mount an alternate entry', () => {
  const f = fixture(false, 'sidebar.panellist')
  expect(() => f.mount()).toThrow('registration failed')
  expect(f.records.size).toBe(0)
  expect(f.removed).toEqual(['main'])
  f.controller.closeBoard()
  expect(f.selectPanel).not.toHaveBeenCalled()
  expect(document.body.children).toHaveLength(0)
})

it('reports a missing panel service without creating DOM seats or polling', () => {
  const f = fixture()
  const interval = vi.spyOn(globalThis, 'setInterval')
  expect(() => mountBoardPanel({}, f.controller)).toThrow('DSH panel service')
  expect(interval).not.toHaveBeenCalled()
  expect(document.body.children).toHaveLength(0)
})

it('updates sidebar counts, shows a collapsed badge, and releases its observer', async () => {
  document.documentElement.lang = 'zh-CN'
  setLocalePreference('zh')
  const observers: Array<{ update: () => void; disconnect: ReturnType<typeof vi.fn> }> = []
  vi.stubGlobal('ResizeObserver', class {
    disconnect = vi.fn()
    constructor(callback: () => void) { observers.push({ update: callback, disconnect: this.disconnect }) }
    observe() {}
  })
  const f = fixture()
  const makeTask = (status: TaskRecord['status'], trashed = false) => ({
    id: status + String(trashed), title: status, status, ...(trashed ? { trashedAt: 1 } : {}),
  }) as TaskRecord
  f.tasks([makeTask('todo'), makeTask('in_progress'), makeTask('in_review'), makeTask('done'), makeTask('todo', true)])
  await f.controller.refresh()
  f.mount()
  const host = document.createElement('button')
  let width = 160
  Object.defineProperty(host, 'clientWidth', { get: () => width })
  document.body.append(host)
  const root = createRoot(host)
  cleanups.push(() => { root.unmount(); host.remove() })
  root.render(React.createElement(f.records.get('sidebar.panellist')!.component))
  await waitFor(() => host.querySelector('.dsh-atb-pstats')?.textContent === '1|1|1')
  expect(host.querySelector('.dsh-atb-pstats')!.getAttribute('title')).toContain('待办 1')
  f.tasks([makeTask('todo'), { ...makeTask('todo'), id: 'another' }])
  await f.controller.refresh()
  await waitFor(() => host.querySelector('.dsh-atb-pstats')?.textContent === '2|0|0')
  width = 36
  observers[0]!.update()
  await waitFor(() => host.querySelector('.dsh-atb-pbadge')?.textContent === '2')
  expect(host.querySelector('.dsh-atb-pstats')).toBeNull()
  root.unmount()
  expect(observers[0]!.disconnect).toHaveBeenCalledOnce()
})

it('renders the board in the official page with Windows caption spacing and cleans up on unmount', async () => {
  document.body.setAttribute('data-dsh-desktop-platform', 'win32')
  injectStyles()
  const f = fixture()
  f.mount()
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  cleanups.push(() => { root.unmount(); host.remove() })
  const off = vi.spyOn(window, 'removeEventListener')
  root.render(React.createElement(f.records.get('main')!.component))
  await waitFor(() => host.querySelector('.dsh-atb-panel-root[data-dsh-atb-windows]') !== null)
  expect(host.querySelector('.dsh-atb-board')).not.toBeNull()
  expect(STYLES).toContain('.dsh-atb-panel-root[data-dsh-atb-windows] > .dsh-atb-board')
  root.unmount()
  expect(off.mock.calls.some(call => call[0] === 'resize')).toBe(true)
})

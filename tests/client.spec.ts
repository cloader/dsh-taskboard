// @vitest-environment jsdom
/**
 * Client-half smoke: apply() against a fake client context with stubbed
 * fetch (route responses) — proves the whole client half (styles, sidebar
 * entry, board mount, controller, SSE wiring) starts and renders into a
 * jsdom document without throwing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from './wait-for.ts'

/** Stub a route payload. */
function routeResponse(path: string): unknown {
  if (path === '/dsh-taskboard/state') {
    return { ok: true, value: { schemaVersion: 1, revision: 3, tasks: [] } }
  }
  if (path === '/dsh-taskboard/workspaces') {
    return { ok: true, value: [{ id: 'ws-a', path: '/proj/a', title: 'A', sessionCount: 0 }] }
  }
  throw new Error(`unexpected fetch ${path}`)
}

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const path = String(input)
  return new Response(JSON.stringify(routeResponse(path)), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
})

class EventSourceMock {
  static instances: EventSourceMock[] = []
  onerror: (() => void) | null = null
  closed = false
  private readonly listeners = new Map<string, Array<(event: { data: string }) => void>>()
  constructor(public url: string) { EventSourceMock.instances.push(this) }
  addEventListener(type: string, listener: (event: { data: string }) => void): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }
  /** Test-side frame dispatch — the payload is JSON.stringify'd like a real SSE data frame. */
  dispatch(type: string, payload: unknown): void {
    for (const listener of [...this.listeners.get(type) ?? []]) listener({ data: JSON.stringify(payload) })
  }
  close(): void { this.closed = true }
}

describe('client half', () => {
  const disposers: Array<() => void> = []

  afterEach(() => {
    for (const d of disposers.splice(0)) d()
    vi.unstubAllGlobals()
  })

  it('apply() mounts styles, waits for panes, and survives without panes', async () => {
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('EventSource', EventSourceMock as unknown as typeof EventSource)
    const { apply } = await import('../src/client/index.ts')

    // REAL cordis effect semantics: callback runs immediately, its return
    // value is the disposer (this fake caught nothing when the plugin passed
    // a single-layer arrow that cordis executed as immediate teardown).
    const disposers: unknown[] = []
    const ctx = { get: () => undefined, effect: (fn: () => unknown) => { disposers.push(fn()) } }
    expect(() => apply(ctx as never)).not.toThrow()

    // Styles injected exactly once, and ownership-tagged: the shell's
    // client-module system claims UN-tagged styles for whichever sibling
    // plugin materializes next, and HMR deletes them by this attribute on
    // that sibling's rebuild — the 0.4.3 random CSS-drop field report.
    const styleEl = document.getElementById('dsh-taskboard-styles')!
    expect(styleEl).not.toBeNull()
    expect(styleEl.getAttribute('data-plugin')).toBe('dsh-taskboard')
    expect(styleEl.getAttribute('data-plugin-css')).toBe('dsh-taskboard/styles')

    // No panes exist: mounts wait via observers without throwing. Give the
    // controller's initial refresh a tick.
    await new Promise(r => setTimeout(r, 10))
    expect(fetchMock).toHaveBeenCalled()

    // Nothing was torn down by the effect itself (the bug this guards: an
    // immediate teardown would have closed the SSE stream already).
    expect(EventSourceMock.instances.length).toBe(1)
    expect(EventSourceMock.instances[0]!.url).toBe('/dsh-taskboard/events')
    expect(disposers.every(d => typeof d === 'function')).toBe(true)

    // Explicit dispose through the captured disposers.
    for (const fn of disposers) (fn as () => void)()
  })

  it('stylesheet is ownership-tagged, idempotent, and re-attaches after removal', async () => {
    const { injectStyles } = await import('../src/client/styles.ts')
    document.getElementById('dsh-taskboard-styles')?.remove()

    injectStyles()
    const style = document.getElementById('dsh-taskboard-styles')!
    expect(style).not.toBeNull()
    // Ownership tag: untagged styles get claimed by whichever sibling plugin
    // materializes next and deleted on THAT plugin's HMR rebuild (observed
    // with lazily-materializing profile bundles) — data-plugin pins the
    // stylesheet to this plugin.
    expect(style.getAttribute('data-plugin')).toBe('dsh-taskboard')
    expect(style.getAttribute('data-plugin-css')).toBe('dsh-taskboard/styles')

    // DOM-idempotent: a second call neither duplicates nor recreates.
    injectStyles()
    expect(document.querySelectorAll('#dsh-taskboard-styles')).toHaveLength(1)

    // Re-attach on demand: a removal (e.g. this plugin's own HMR rebuild
    // cleanup) is undone by the next call — the old module-level flag once
    // blocked this until a full page refresh. (No polling watchdog since
    // 0.4.5: the ownership tag above is the root fix; re-apply re-injects.)
    style.remove()
    injectStyles()
    expect(document.getElementById('dsh-taskboard-styles')).not.toBeNull()

    // A leftover element mistagged by a pre-0.4.4 claim is adopted AND
    // re-tagged with correct ownership.
    const leftover = document.getElementById('dsh-taskboard-styles')!
    leftover.setAttribute('data-plugin', 'other-plugin')
    injectStyles()
    expect(leftover.getAttribute('data-plugin')).toBe('dsh-taskboard')
    leftover.remove()
  })

  it('sidebar entry places itself once a sidebar pane exists', async () => {
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('EventSource', EventSourceMock as unknown as typeof EventSource)
    const { createClient } = await import('../src/client/api.ts')
    const { BoardController } = await import('../src/client/controller.ts')
    const { mountSidebarEntry } = await import('../src/client/sidebar-entry.ts')

    // Build the REAL shell shape (reverse-engineered from the live GUI):
    // sidebarCol pane > wrapper > root > [logoRow(brand aria button)] +
    // direct-child newSession BUTTON (the family plugins' fallback target).
    const column = document.createElement('div')
    column.className = 'pI_x6G_sidebarCol'
    column.dataset.pane = 'sidebar'
    const root = document.createElement('div')
    root.className = 'hHd-Xa_root'
    const row = document.createElement('div')
    row.className = 'hHd-Xa_logoRow'
    const brand = document.createElement('button')
    brand.className = 'hHd-Xa_brand hHd-Xa_wide'
    brand.setAttribute('aria-label', '新建会话')
    brand.innerHTML = '<svg></svg>'
    row.append(brand)
    const newSession = document.createElement('button')
    newSession.textContent = '新会话'
    root.append(row, newSession)
    const wrapper = document.createElement('div')
    wrapper.append(root)
    column.append(wrapper)
    document.body.append(column)

    const controller = new BoardController(createClient())
    const dispose = mountSidebarEntry(controller)
    disposers.push(dispose)

    await new Promise(r => setTimeout(r, 20))
    const entry = document.querySelector('[data-dsh-atb-entry]')
    expect(entry).not.toBeNull()
    // Entry is a direct child of the root, right after the newSession button
    // (the direct-child fallback anchor — same landing spot as the family
    // plugins: after the button block, before the workspace browser).
    expect(entry!.parentElement).toBe(root)
    expect(entry!.previousElementSibling).toBe(newSession)

    controller.toggleBoard()
    expect((entry as HTMLElement).dataset.active).toBe('true')
  })

  it('sidebar entry shows todo|in_progress|in_review counts with tooltip', async () => {
    localStorage.clear()
    const { BoardController } = await import('../src/client/controller.ts')
    const { mountSidebarEntry } = await import('../src/client/sidebar-entry.ts')

    const mkTask = (id: string, status: string) => ({
      id, title: id, description: '', prompt: '', workspaceId: 'ws-a',
      urgency: 'normal' as const, status: status as never, blocked: false,
      execution: { mode: 'claim' as const }, version: 1, createdAt: 0, updatedAt: 0,
      createdBy: { kind: 'user' as const }, updatedBy: { kind: 'user' as const },
      comments: [], executions: [],
    })
    const tasks = [
      mkTask('t-1', 'todo'), mkTask('t-2', 'todo'),
      mkTask('t-3', 'in_progress'),
      mkTask('t-4', 'in_review'), mkTask('t-5', 'in_review'), mkTask('t-6', 'in_review'),
      mkTask('t-7', 'done'),            // not counted
      mkTask('t-8', 'backlog'),         // not counted
    ]
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks }),
      workspaces: async () => [],
      stream: () => () => {},
    }
    const controller = new BoardController(client as never)
    const dispose = mountSidebarEntry(controller)
    disposers.push(dispose)
    controller.start()
    // Initial mount renders 0|0|0; the refresh then rolls each slot to the
    // live counts. jsdom never fires transitionend, so each slot settles via
    // the 400ms fallback — poll the DOM until the strip reaches its final
    // text (no fixed sleep racing the animation constant).
    await waitFor(() => document.querySelector<HTMLElement>('.dsh-atb-entry-stats')?.textContent === '2|1|3', 3_000)

    const stats = document.querySelector<HTMLElement>('.dsh-atb-entry-stats')
    expect(stats).not.toBeNull()
    // Slots + separators render as "todo|in_progress|in_review".
    expect(stats!.textContent).toBe('2|1|3')
    // Each slot carries its status so the stylesheet colors the digits.
    const rolls = stats!.querySelectorAll<HTMLElement>('.dsh-atb-roll')
    expect(rolls.length).toBe(3)
    expect(rolls[0]!.dataset.stat).toBe('todo')
    expect(rolls[1]!.dataset.stat).toBe('in_progress')
    expect(rolls[2]!.dataset.stat).toBe('in_review')
    // The tooltip explains the meaning and carries the live numbers.
    expect(stats!.title).toContain('待办 2')
    expect(stats!.title).toContain('进行中 1')
    expect(stats!.title).toContain('待验收 3')
    controller.dispose()
    localStorage.clear()
  })

  it('board columns wear status dots before their labels', async () => {
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('EventSource', EventSourceMock as unknown as typeof EventSource)
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { TaskBoard } = await import('../src/client/board/TaskBoard.tsx')
    const { MAIN_STATUSES } = await import('../src/shared/protocol.ts')

    // One live task per lifecycle status; trashed takes precedence in the
    // secondary tab, so the trashed task's old status stays 'canceled'.
    const mkTask = (id: string, status: string, trashed = false) => ({
      id, title: id, description: '', prompt: '', workspaceId: 'ws-a',
      urgency: 'normal' as const, status: status as never, blocked: false,
      execution: { mode: 'claim' as const }, version: 1, createdAt: 0, updatedAt: 0,
      createdBy: { kind: 'user' as const }, updatedBy: { kind: 'user' as const },
      comments: [], executions: [],
      ...(trashed ? { trashedAt: 1 } : {}),
    })
    const tasks = [
      mkTask('t-1', 'backlog'), mkTask('t-2', 'todo'), mkTask('t-3', 'in_progress'),
      mkTask('t-4', 'in_review'), mkTask('t-5', 'done'),
      mkTask('t-6', 'canceled'), mkTask('t-7', 'archived'),
      mkTask('t-8', 'canceled', true),
    ]
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks }),
      workspaces: async () => [],
      stream: () => () => {},
    }
    const controller = new BoardController(client as never)
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(React.createElement(TaskBoard, { controller }))
    controller.start()
    // Let the refresh land and React commit outside act().
    await new Promise(r => setTimeout(r, 20))

    // Main view: one column head per main status, each starting with its
    // status dot placed before the label text.
    const heads = () => Array.from(host.querySelectorAll<HTMLElement>('.dsh-atb-colhead'))
    expect(heads().length).toBe(MAIN_STATUSES.length)
    for (const head of heads()) {
      const dot = head.querySelector<HTMLElement>('.dsh-atb-dot')
      expect(dot).not.toBeNull()
      expect(head.firstChild).toBe(dot)
    }
    const dotStatuses = heads().map(h => h.querySelector<HTMLElement>('.dsh-atb-dot')!.dataset.status)
    expect(dotStatuses).toEqual([...MAIN_STATUSES])

    // Secondary tab: canceled / archived / trashed groups wear their dots too.
    controller.toggleSecondary()
    await new Promise(r => setTimeout(r, 20))
    for (const key of ['canceled', 'archived', 'trashed']) {
      const dot = host.querySelector<HTMLElement>(`.dsh-atb-colhead .dsh-atb-dot[data-status="${key}"]`)
      expect(dot, `secondary dot for ${key}`).not.toBeNull()
    }

    root.unmount()
    host.remove()
    controller.dispose()
  })

  it('in_review cards carry quick ✓/✗ actions; other columns do not', async () => {
    localStorage.clear()
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { TaskBoard } = await import('../src/client/board/TaskBoard.tsx')

    const mkTask = (id: string, status: string) => ({
      id, title: id, description: '', prompt: '', workspaceId: 'ws-a',
      urgency: 'normal' as const, status: status as never, blocked: false,
      execution: { mode: 'claim' as const }, version: 1, createdAt: 0, updatedAt: 0,
      createdBy: { kind: 'user' as const }, updatedBy: { kind: 'user' as const },
      comments: [], executions: [],
    })
    const tasks = [mkTask('t-todo', 'todo'), mkTask('t-rev', 'in_review'), mkTask('t-done', 'done')]

    const calls: Array<{ op: string; id: string; body: unknown }> = []
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks }),
      workspaces: async () => [],
      stream: () => () => {},
      move: async (id: string, body: unknown) => { calls.push({ op: 'move', id, body }); return { id } },
      reject: async (id: string, body: unknown) => { calls.push({ op: 'reject', id, body }); return { id } },
    }
    const controller = new BoardController(client as never)
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(React.createElement(TaskBoard, { controller }))
    controller.start()
    await new Promise(r => setTimeout(r, 20))

    // Quick actions exist ONLY on the in_review card.
    const acts = () => Array.from(host.querySelectorAll<HTMLElement>('.dsh-atb-quickbtn'))
    expect(acts().length).toBe(2)
    const card = (id: string) => Array.from(host.querySelectorAll<HTMLElement>('.dsh-atb-card'))
      .find(el => el.querySelector('.dsh-atb-card-title')!.textContent === id)!
    expect(card('t-todo').querySelector('.dsh-atb-quick')).toBeNull()
    expect(card('t-done').querySelector('.dsh-atb-quick')).toBeNull()
    const quick = card('t-rev').querySelector('.dsh-atb-quick')!
    expect(quick.querySelector<HTMLElement>('[data-act="done"]')).not.toBeNull()
    expect(quick.querySelector<HTMLElement>('[data-act="reject"]')).not.toBeNull()

    // ✓ completes: one move call, ifVersion from the snapshot, target done.
    const doneBtn = quick.querySelector<HTMLButtonElement>('[data-act="done"]')!
    doneBtn.click()
    await new Promise(r => setTimeout(r, 10))
    expect(calls).toEqual([{ op: 'move', id: 't-rev', body: { ifVersion: 1, status: 'done' } }])
    // The click must NOT also open the detail pane (stopPropagation on the row).
    expect(controller.getSnapshot().selectedId).toBeUndefined()

    // ✗ opens the inline note form; submit with text → reject carries the note.
    const rejectBtn = card('t-rev').querySelector<HTMLButtonElement>('[data-act="reject"]')!
    rejectBtn.click()
    await new Promise(r => setTimeout(r, 10))
    const input = card('t-rev').querySelector<HTMLInputElement>('.dsh-atb-quick-note')!
    expect(input).not.toBeNull()
    // jsdom + React 18 onChange: use the native setter then dispatch.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, '按钮颜色不对')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    const confirmBtn = card('t-rev').querySelector<HTMLButtonElement>('[data-act="reject-confirm"]')!
    confirmBtn.click()
    await new Promise(r => setTimeout(r, 10))
    expect(calls[1]).toEqual({ op: 'reject', id: 't-rev', body: { ifVersion: 1, body: '按钮颜色不对' } })

    root.unmount()
    host.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('controller.reject: empty note sends no body; failure surfaces the error', async () => {
    localStorage.clear()
    const { BoardController } = await import('../src/client/controller.ts')

    const tasks = [{
      id: 't-1', title: 'T', description: '', prompt: '', workspaceId: 'ws-a',
      urgency: 'normal' as const, status: 'in_review' as const, blocked: false,
      execution: { mode: 'claim' as const }, version: 4, createdAt: 0, updatedAt: 0,
      createdBy: { kind: 'user' as const }, updatedBy: { kind: 'user' as const },
      comments: [], executions: [],
    }]
    const bodies: unknown[] = []
    let failNext = false
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks }),
      workspaces: async () => [],
      stream: () => () => {},
      reject: async (_id: string, body: unknown) => {
        if (failNext) throw new Error('taskboard: version_conflict: stale version 4 (current 5)')
        bodies.push(body)
        return { id: 't-1' }
      },
    }
    const controller = new BoardController(client as never)
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    // Whitespace-only note → plain reject, no body field.
    expect(await controller.reject('t-1', 4, '   ')).toBe(true)
    expect(bodies).toEqual([{ ifVersion: 4 }])

    // Failure: reports false, error surface explains, nothing else thrown.
    failNext = true
    expect(await controller.reject('t-1', 4, 'x')).toBe(false)
    expect(controller.getSnapshot().error).toContain('version_conflict')

    controller.dispose()
    localStorage.clear()
  })

  it('isolation toggle: create defaults follow the board setting, disables on non-git projects', async () => {
    localStorage.clear()
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { TaskFormModal } = await import('../src/client/board/TaskFormModal.tsx')

    const creates: unknown[] = []
    // The board setting (看板设置) pins the default to worktree (0.5.0).
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [], settings: { defaultIsolation: 'worktree' } }),
      // ws-git reports gitAvailable; ws-plain does not.
      workspaces: async () => [
        { id: 'ws-git', path: '/p/g', title: 'G', sessionCount: 0, gitAvailable: true },
        { id: 'ws-plain', path: '/p/n', title: 'N', sessionCount: 0, gitAvailable: false },
      ],
      stream: () => () => {},
      create: async (body: unknown) => { creates.push(body); return { id: 't-new' } },
    }
    const controller = new BoardController(client as never)
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    // Create mode: the initial toggle mirrors the board setting (worktree on).
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(React.createElement(TaskFormModal, { controller }))
    await new Promise(r => setTimeout(r, 10))

    const opts = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-mode-opt'))
    expect(opts().length).toBeGreaterThanOrEqual(2)
    // The isolation pair is the second mode-picker in the modal.
    const isoPicker = Array.from(host.querySelectorAll<HTMLElement>('.dsh-atb-mode-picker'))[1]!
    const isoOpts = () => Array.from(isoPicker.querySelectorAll<HTMLButtonElement>('.dsh-atb-mode-opt'))
    expect(isoOpts()[0]!.dataset.on).toBe('true') // board default worktree
    expect(isoOpts()[1]!.dataset.on).toBe('false')

    // Switch to 原目录执行, submit on the git workspace → explicit isolation sent.
    isoOpts()[1]!.click()
    await new Promise(r => setTimeout(r, 10))
    const title = host.querySelector<HTMLInputElement>('input[maxlength="200"]')!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(title, 'Iso task')
    title.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    ;(Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-modal-footbtns .dsh-atb-btn')).find(b => b.textContent === '创建任务'))!.click()
    await new Promise(r => setTimeout(r, 10))
    expect(creates[0]).toMatchObject({ title: 'Iso task', isolation: 'none' })

    // Non-git workspace: both options disabled, hint shown, isolation omitted.
    const wsSelect = host.querySelector<HTMLSelectElement>('select')!
    wsSelect.value = 'ws-plain'
    wsSelect.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    expect(isoOpts().every(o => o.disabled)).toBe(true)
    expect(host.querySelector('.dsh-atb-isolation-note')?.textContent).toContain('非 git 仓库')
    ;(Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-modal-footbtns .dsh-atb-btn')).find(b => b.textContent === '创建任务'))!.click()
    await new Promise(r => setTimeout(r, 10))
    expect(creates[1]).toMatchObject({ workspaceId: 'ws-plain' })
    expect((creates[1] as Record<string, unknown>).isolation).toBeUndefined()

    root.unmount()
    host.remove()
    controller.dispose()

    // A board WITHOUT the setting falls back to the factory default: 原目录执行.
    const client2 = {
      ...client,
      state: async () => ({ schemaVersion: 1, revision: 2, tasks: [] }),
    }
    const controller2 = new BoardController(client2 as never)
    controller2.start()
    await new Promise(r => setTimeout(r, 10))
    const host2 = document.createElement('div')
    document.body.append(host2)
    const root2 = createRoot(host2)
    root2.render(React.createElement(TaskFormModal, { controller: controller2 }))
    await new Promise(r => setTimeout(r, 10))
    const picker2 = Array.from(host2.querySelectorAll<HTMLElement>('.dsh-atb-mode-picker'))[1]!
    const opts2 = Array.from(picker2.querySelectorAll<HTMLButtonElement>('.dsh-atb-mode-opt'))
    expect(opts2[0]!.dataset.on).toBe('false')
    expect(opts2[1]!.dataset.on).toBe('true') // factory default 'none'

    root2.unmount()
    host2.remove()
    controller2.dispose()
    localStorage.clear()
  })

  it('settings modal stages a draft, enables save only when dirty, saves via the controller', async () => {
    localStorage.clear()
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { SettingsModal } = await import('../src/client/board/SettingsModal.tsx')

    const saved: unknown[] = []
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [], settings: { defaultIsolation: 'worktree' } }),
      workspaces: async () => [],
      stream: () => () => {},
      updateSettings: async (body: unknown) => { saved.push(body); return body },
    }
    const controller = new BoardController(client as never)
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(React.createElement(SettingsModal, { controller }))
    await new Promise(r => setTimeout(r, 10))

    const isoOpts = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-diag-sec:nth-child(1) .dsh-atb-mode-opt'))
    expect(isoOpts().length).toBe(2)
    expect(isoOpts()[0]!.textContent).toContain('原目录执行')
    // Current setting worktree is the selected draft.
    expect(isoOpts()[0]!.dataset.on).toBe('false')
    expect(isoOpts()[1]!.dataset.on).toBe('true')

    const syncOpts = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-diag-sec:nth-child(2) .dsh-atb-mode-opt'))
    expect(syncOpts().length).toBe(2)
    expect(syncOpts()[0]!.textContent).toContain('关闭同步')
    expect(syncOpts()[1]!.textContent).toContain('自动纳入会话')
    expect(syncOpts()[0]!.dataset.on).toBe('true') // default false
    expect(syncOpts()[1]!.dataset.on).toBe('false')

    const saveBtn = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-btn'))
      .find(b => b.textContent === '保存设置')!
    expect(saveBtn().disabled).toBe(true) // clean draft → save disabled

    // Pick 原目录执行 & 自动纳入会话 → dirty → save goes through the controller.
    isoOpts()[0]!.click()
    syncOpts()[1]!.click()
    await new Promise(r => setTimeout(r, 10))
    expect(saveBtn().disabled).toBe(false)
    saveBtn().click()
    await new Promise(r => setTimeout(r, 20))
    expect(saved).toEqual([{ defaultIsolation: 'none', syncExternalSessions: true, defaultPermission: 'workspace-write' }])

    root.unmount()
    host.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('detail renders the isolation block; merge/remove call the controller', async () => {
    localStorage.clear()
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { TaskDetail } = await import('../src/client/board/TaskDetail.tsx')

    const task = {
      id: 't-iso', title: 'Isolated work', description: '', prompt: '', workspaceId: 'ws-a',
      urgency: 'normal' as const, status: 'in_review' as const, blocked: false,
      execution: { mode: 'claim' as const }, version: 3, createdAt: 0, updatedAt: 0,
      createdBy: { kind: 'user' as const }, updatedBy: { kind: 'user' as const },
      branch: 'task/Isolated-work+t-iso',
      comments: [], executions: [{
        id: 'e-1', trigger: 'manual' as const, startedAt: 0, endedAt: 10, outcome: 'succeeded' as const,
        isolation: 'worktree' as const, branch: 'task/Isolated-work+t-iso',
        worktreePath: '/proj/a/.dsh-worktrees/t-iso', baseCommit: 'aaaa0000', headCommit: 'bbbb1111',
        commits: [{ hash: 'bbbb1111', subject: 'feat: the change' }],
        dirtyFiles: [' M src/a.ts'], diffStat: '1 file changed', changedFiles: 1,
      }],
    }
    const calls: Array<{ op: string; id: string; deleteBranch?: boolean }> = []
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [task] }),
      workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
      stream: () => () => {},
      mergeBranch: async (id: string) => { calls.push({ op: 'merge', id }); return { ok: true } },
      worktreeRemove: async (id: string, body: { deleteBranch?: boolean }) => { calls.push({ op: 'remove', id, deleteBranch: body.deleteBranch }); return { ok: true } },
    }
    const controller = new BoardController(client as never)
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(React.createElement(TaskDetail, { task: task as never, controller, now: 1_000 }))
    await new Promise(r => setTimeout(r, 10))

    // The isolation block shows branch, commits, stats, and the dirty warning.
    const block = host.querySelector<HTMLElement>('.dsh-atb-fieldcard[data-kind="isolation"]')!
    expect(block).not.toBeNull()
    expect(block.textContent).toContain('task/Isolated-work+t-iso')
    expect(block.textContent).toContain('feat: the change')
    expect(block.textContent).toContain('1 处未提交修改')

    // ⇥ 合并: confirm flow reaches controller.mergeBranch.
    const mergeBtn = Array.from(block.querySelectorAll<HTMLButtonElement>('.dsh-atb-btn')).find(b => b.textContent!.includes('合并到主工作区'))!
    mergeBtn.click()
    await new Promise(r => setTimeout(r, 10))
    const confirmBtn = Array.from(block.querySelectorAll<HTMLButtonElement>('.dsh-atb-btn')).find(b => b.textContent === '确认合并')!
    confirmBtn.click()
    await new Promise(r => setTimeout(r, 10))
    expect(calls).toEqual([{ op: 'merge', id: 't-iso' }])

    // 🗑 删 worktree + 分支: confirm reaches controller.removeWorktree(true).
    const removeBtn = Array.from(block.querySelectorAll<HTMLButtonElement>('.dsh-atb-btn')).find(b => b.textContent!.includes('worktree + 分支'))!
    removeBtn.click()
    await new Promise(r => setTimeout(r, 10))
    const confirmRemove = Array.from(block.querySelectorAll<HTMLButtonElement>('.dsh-atb-btn')).find(b => b.textContent === '确认删除')!
    confirmRemove.click()
    await new Promise(r => setTimeout(r, 10))
    expect(calls[1]).toEqual({ op: 'remove', id: 't-iso', deleteBranch: true })

    root.unmount()
    host.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('detail: 续跑 button only with a pinned branch; noop merge surfaces an info alert', async () => {
    localStorage.clear()
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { TaskDetail } = await import('../src/client/board/TaskDetail.tsx')

    const mkTask = (branch?: string) => ({
      id: 't-r', title: 'R', description: '', prompt: '', workspaceId: 'ws-a',
      urgency: 'normal' as const, status: 'todo' as const, blocked: false,
      execution: { mode: 'claim' as const }, version: 1, createdAt: 0, updatedAt: 0,
      ...(branch !== undefined ? { branch } : {}),
      createdBy: { kind: 'user' as const }, updatedBy: { kind: 'user' as const },
      comments: [], executions: [],
    })

    const runCalls: Array<[string, boolean]> = []
    let noopNext = false
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [mkTask('task/R+t-r')] }),
      workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
      stream: () => () => {},
      run: async (id: string, body?: { reuse?: boolean }) => { runCalls.push([id, body?.reuse === true]); return { executionId: 'e', sessionId: 's' } },
      mergeBranch: async (id: string) => (noopNext
        ? { merged: false, noop: true, branch: 'task/R+t-r' }
        : { merged: true, branch: 'task/R+t-r' }),
    }
    const controller = new BoardController(client as never)
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    // With a pinned branch: both 续跑 and 立即执行 appear; clicks carry reuse flag.
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(React.createElement(TaskDetail, { task: mkTask('task/R+t-r') as never, controller, now: 1_000 }))
    await new Promise(r => setTimeout(r, 10))
    const btns = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-detail-topbtns .dsh-atb-detail-run'))
    const resume = btns().find(b => b.textContent!.includes('续跑'))!
    const fresh = btns().find(b => b.textContent!.includes('立即执行'))!
    resume.click()
    fresh.click()
    await new Promise(r => setTimeout(r, 10))
    expect(runCalls).toEqual([['t-r', true], ['t-r', false]])

    // Noop merge: an info alert renders (task needs an isolated execution so
    // the isolation block with the merge button shows).
    noopNext = true
    root.unmount()
    const root2 = createRoot(host)
    const task2 = { ...mkTask('task/R+t-r'), status: 'in_review', executions: [{
      id: 'e-1', trigger: 'manual' as const, startedAt: 0, endedAt: 1, outcome: 'succeeded' as const,
      isolation: 'worktree' as const, branch: 'task/R+t-r', worktreePath: '/p/a/.dsh-worktrees/t-r',
      baseCommit: 'a0', headCommit: 'b1', commits: [{ hash: 'b1', subject: 'x' }], commitsTotal: 1,
      dirtyFiles: [], dirtyFilesTotal: 0, changedFiles: 1,
    }] }
    root2.render(React.createElement(TaskDetail, { task: task2 as never, controller, now: 1_000 }))
    await new Promise(r => setTimeout(r, 10))
    const mergeBtn2 = Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-iso-actions .dsh-atb-btn')).find(b => b.textContent!.includes('合并到主工作区'))!
    mergeBtn2.click()
    await new Promise(r => setTimeout(r, 10))
    const confirmBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-btn')).find(b => b.textContent === '确认合并')!
    confirmBtn.click()
    await new Promise(r => setTimeout(r, 10))
    expect(host.textContent).toContain('没有领先主工作区的新提交')

    root2.unmount()
    host.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('preset dropdown: pre-selects the deployment default on create, submits the choice', async () => {
    localStorage.clear()
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { TaskFormModal } = await import('../src/client/board/TaskFormModal.tsx')

    const creates: unknown[] = []
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [] }),
      workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
      stream: () => () => {},
      create: async (body: unknown) => { creates.push(body); return { id: 't-new' } },
    }
    const controller = new BoardController(client as never)
    // preset roster face (T13: formal installer): 标准 is the deployment default, 梁神 also available.
    controller.installPresetRoster(async () => ({
      presets: [{ id: 'standard', name: '标准模式' }, { id: 'liangshen', name: '梁神模式' }],
      defaultId: 'standard',
    }))
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(React.createElement(TaskFormModal, { controller }))
    await new Promise(r => setTimeout(r, 30))

    // The preset select exists and pre-selects the deployment default.
    const presetSelect = Array.from(host.querySelectorAll<HTMLSelectElement>('select'))
      .find(s => Array.from(s.options).some(o => o.value === 'standard'))!
    expect(presetSelect).toBeTruthy()
    expect(presetSelect.value).toBe('standard')

    // Fill the title, submit → the default preset id rides along.
    const title = host.querySelector<HTMLInputElement>('input[maxlength="200"]')!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(title, 'Preset task')
    title.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    ;(Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-modal-footbtns .dsh-atb-btn')).find(b => b.textContent === '创建任务'))!.click()
    await new Promise(r => setTimeout(r, 10))
    expect(creates[0]).toMatchObject({ title: 'Preset task', presetId: 'standard' })

    root.unmount()
    host.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('session jump opens live sessions and guards deleted/archived ones', async () => {    const { BoardController } = await import('../src/client/controller.ts')
    const { createSessionJumper } = await import('../src/client/session-jump.ts')

    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [] }),
      workspaces: async () => [],
      stream: () => () => {},
    }
    const controller = new BoardController(client as never)
    controller.openBoard()

    // Fake runtime services: list mirror + archive set + staging open.
    let byId: Record<string, unknown> = { 's-live': {}, 's-arch': {} }
    let lagging = false // when true, refresh() reveals the late-listed session
    const opened: string[] = []
    let refreshed = 0
    const sessions = {
      open: (id: string) => { opened.push(id) },
      refresh: async () => {
        refreshed++
        if (lagging) byId = { ...byId, 's-late': {} }
      },
      list: { getSnapshot: () => ({ byId }) },
    }
    const workspaces = { list: { getSnapshot: () => ({ archivedSessionIds: ['s-arch'] }) } }

    // LAZY resolution: services absent at first (jump degrades), then present.
    let provided = false
    controller.installSessionJumper(createSessionJumper({
      getSessions: () => (provided ? sessions : undefined) as never,
      getWorkspaces: () => (provided ? workspaces : undefined) as never,
    }))
    expect(await controller.openSession('s-live')).toBe('unavailable')
    expect(controller.getSnapshot().boardOpen).toBe(true)
    provided = true

    // Listed + not archived: opens, and the board closes over the session.
    expect(await controller.openSession('s-live')).toBe('opened')
    expect(opened).toEqual(['s-live'])
    expect(controller.getSnapshot().boardOpen).toBe(false)

    // Archived: a definitive verdict — no refresh, never opened.
    controller.openBoard()
    expect(await controller.openSession('s-arch')).toBe('archived')
    expect(refreshed).toBe(0)
    expect(opened).toEqual(['s-live'])
    expect(controller.getSnapshot().boardOpen).toBe(true)

    // Deleted (absent from the list): one refresh re-check, still missing.
    expect(await controller.openSession('s-gone')).toBe('missing')
    expect(refreshed).toBe(1)
    expect(opened).toEqual(['s-live'])

    // Lagging mirror: the refresh reveals the session and the jump opens it.
    lagging = true
    expect(await controller.openSession('s-late')).toBe('opened')
    expect(refreshed).toBe(2)
    expect(opened).toEqual(['s-live', 's-late'])

    controller.dispose()
  })

  it('controller: search filter, urgency sort, and persisted view state', async () => {
    localStorage.clear()
    const { BoardController } = await import('../src/client/controller.ts')
    const { filterTasks } = await import('../src/client/board/TaskBoard.tsx')

    const mkTask = (id: string, title: string, urgency: 'urgent' | 'normal' | 'relaxed', updatedAt: number) => ({
      id, title, description: '', prompt: '', workspaceId: 'ws-a', urgency,
      status: 'todo' as const, blocked: false, execution: { mode: 'claim' as const },
      version: 1, createdAt: updatedAt - 10, updatedAt,
      createdBy: { kind: 'user' as const }, updatedBy: { kind: 'user' as const },
      comments: [], executions: [],
    })
    const tasks = [
      mkTask('t-slow', '巡检服务器', 'relaxed', 100),
      mkTask('t-fix', '修复登录 BUG', 'urgent', 50),
      mkTask('t-doc', '补文档', 'normal', 200),
    ]
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks }),
      workspaces: async () => [],
      stream: () => () => {},
    }
    const controller = new BoardController(client as never)
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    // Search by title and by id (case-insensitive).
    let state = controller.getSnapshot()
    expect(filterTasks(state, tasks).map(t => t.id)).toEqual(['t-slow', 't-fix', 't-doc'])
    controller.setSearch('BUG')
    state = controller.getSnapshot()
    expect(filterTasks(state, tasks).map(t => t.id)).toEqual(['t-fix'])
    controller.setSearch('T-DOC')
    state = controller.getSnapshot()
    expect(filterTasks(state, tasks).map(t => t.id)).toEqual(['t-doc'])
    controller.setSearch('')

    // Sort by urgency (urgent → normal → relaxed), tie-break by updated desc.
    controller.setSortBy('urgency')
    state = controller.getSnapshot()
    expect(filterTasks(state, tasks).map(t => t.id)).toEqual(['t-fix', 't-doc', 't-slow'])
    // Sort by recent update.
    controller.setSortBy('updated')
    state = controller.getSnapshot()
    expect(filterTasks(state, tasks).map(t => t.id)).toEqual(['t-doc', 't-slow', 't-fix'])

    // Sort by title: numeric-aware comparison, so numeric prefixes order 01 < 02 < 10 < 90.
    controller.setSortBy('title')
    state = controller.getSnapshot()
    const numbered = [
      mkTask('t-10', '10 晚间巡检', 'normal', 400),
      mkTask('t-02', '02 上午修复', 'normal', 300),
      mkTask('t-01', '01 晨会', 'normal', 500),
      mkTask('t-90', '90 收尾', 'normal', 600),
    ]
    expect(filterTasks(state, numbered).map(t => t.id)).toEqual(['t-01', 't-02', 't-10', 't-90'])
    controller.setSortBy('updated')

    // Filters + sort persist to localStorage and hydrate a fresh controller.
    controller.setWorkspaceFilter('ws-a')
    const persisted = JSON.parse(localStorage.getItem('dsh-taskboard-view-v1')!) as { workspaceId?: string; sortBy?: string }
    expect(persisted.workspaceId).toBe('ws-a')
    expect(persisted.sortBy).toBe('updated')
    const second = new BoardController(client as never)
    expect(second.getSnapshot().sortBy).toBe('updated')
    expect(second.getSnapshot().filters.workspaceId).toBe('ws-a')
    // Search is transient — never persisted.
    expect(persisted).not.toHaveProperty('search')
    controller.dispose()
    second.dispose()
    localStorage.clear()
  })

  it('checklist editor: template prefill, add/remove rows, create submits texts, edit submits items', async () => {
    localStorage.clear()
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { TaskFormModal } = await import('../src/client/board/TaskFormModal.tsx')

    const creates: unknown[] = []
    const updates: unknown[] = []
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [] }),
      workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
      stream: () => () => {},
      create: async (body: unknown) => { creates.push(body); return { id: 't-new' } },
      update: async (_id: string, body: unknown) => { updates.push(body); return { id: 't' } },
    }
    const controller = new BoardController(client as never)
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    // Template prefill: open the create form from a template with a checklist.
    controller.newFromTemplate({ title: '模板任务', urgency: 'urgent', checklist: ['复现', '修复'] })
    let host = document.createElement('div')
    document.body.append(host)
    let root = createRoot(host)
    root.render(React.createElement(TaskFormModal, { controller }))
    await new Promise(r => setTimeout(r, 20))

    const titleInput = host.querySelector<HTMLInputElement>('input[maxlength="200"]')!
    expect(titleInput.value).toBe('模板任务')
    let rows = Array.from(host.querySelectorAll<HTMLInputElement>('.dsh-atb-cke-text'))
    expect(rows).toHaveLength(2)
    expect(rows[0]!.value).toBe('复现')

    // Add one blank row, fill it, then submit → texts ride along.
    const addBtn = host.querySelector<HTMLButtonElement>('.dsh-atb-cke-add')!
    addBtn.click()
    await new Promise(r => setTimeout(r, 10))
    rows = Array.from(host.querySelectorAll<HTMLInputElement>('.dsh-atb-cke-text'))
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(rows[2]!, '回归通过')
    rows[2]!.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    ;(Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-modal-footbtns .dsh-atb-btn')).find(b => b.textContent === '创建任务'))!.click()
    await new Promise(r => setTimeout(r, 10))
    expect(creates[0]).toMatchObject({ title: '模板任务', urgency: 'urgent', checklist: ['复现', '修复', '回归通过'] })

    root.unmount()
    host.remove()

    // Edit mode: existing items render with checkboxes; a toggle is submitted
    // as a full-list replace preserving ids and the checked state.
    const task = {
      id: 't-cl', title: '编辑我', description: '', prompt: '', workspaceId: 'ws-a',
      urgency: 'normal' as const, status: 'todo' as const, blocked: false,
      execution: { mode: 'claim' as const }, version: 4, createdAt: 0, updatedAt: 0,
      createdBy: { kind: 'user' as const }, updatedBy: { kind: 'user' as const },
      checklist: [
        { id: 'k1', text: '复现', checked: false },
        { id: 'k2', text: '修复', checked: false },
      ],
      comments: [], executions: [],
    }
    controller.openEditor('t-cl')
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(React.createElement(TaskFormModal, { controller, task: task as never }))
    await new Promise(r => setTimeout(r, 20))

    const boxes = Array.from(host.querySelectorAll<HTMLInputElement>('.dsh-atb-cke-box'))
    expect(boxes).toHaveLength(2)
    boxes[0]!.click()
    await new Promise(r => setTimeout(r, 10))
    ;(Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-modal-footbtns .dsh-atb-btn')).find(b => b.textContent === '保存修改'))!.click()
    await new Promise(r => setTimeout(r, 10))
    const body = updates[0] as { checklist: Array<{ id?: string; text: string; checked: boolean }> }
    expect(body.checklist).toHaveLength(2)
    expect(body.checklist[0]).toMatchObject({ id: 'k1', text: '复现', checked: true })
    expect(body.checklist[1]).toMatchObject({ id: 'k2', text: '修复', checked: false })

    root.unmount()
    host.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('detail: checklist block toggles as user; report block renders; done confirm counts unchecked', async () => {
    localStorage.clear()
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { TaskDetail } = await import('../src/client/board/TaskDetail.tsx')

    const task = {
      id: 't-cl2', title: '验收中', description: '', prompt: '', workspaceId: 'ws-a',
      urgency: 'normal' as const, status: 'in_review' as const, blocked: false,
      execution: { mode: 'claim' as const }, version: 7, createdAt: 0, updatedAt: 0,
      createdBy: { kind: 'user' as const }, updatedBy: { kind: 'user' as const },
      checklist: [
        { id: 'k1', text: '已复现', checked: true, checkedBy: 'agent', checkedAt: 1, note: '证据在评论' },
        { id: 'k2', text: '回归通过', checked: false },
      ],
      comments: [], executions: [{
        id: 'e-1', trigger: 'manual' as const, startedAt: 0, endedAt: 9, outcome: 'succeeded' as const,
        report: { summary: '修复了崩溃', changedFiles: ['src/a.ts'], checks: ['npm test 145 passed'], artifacts: [], risk: '低' },
      }],
    }
    const updates: Array<Record<string, unknown>> = []
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [task] }),
      workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
      stream: () => () => {},
      update: async (_id: string, body: Record<string, unknown>) => { updates.push(body); return { id: 't' } },
    }
    const controller = new BoardController(client as never)
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(React.createElement(TaskDetail, { task: task as never, controller, now: 1_000 }))
    await new Promise(r => setTimeout(r, 10))

    // Checklist block: progress label, alert highlight on the unchecked item,
    // the checked item shows checker + evidence note.
    const clBlock = host.querySelector<HTMLElement>('.dsh-atb-fieldcard[data-kind="checklist"]')!
    expect(clBlock).not.toBeNull()
    expect(clBlock.textContent).toContain('1/2')
    expect(clBlock.textContent).toContain('1 项未完成')
    expect(clBlock.querySelector('.dsh-atb-cl-item[data-alert="true"]')).not.toBeNull()
    expect(clBlock.textContent).toContain('证据：证据在评论')

    // Report block renders all sections.
    const rptBlock = host.querySelector<HTMLElement>('.dsh-atb-fieldcard[data-kind="report"]')!
    expect(rptBlock.textContent).toContain('修复了崩溃')
    expect(rptBlock.textContent).toContain('src/a.ts')
    expect(rptBlock.textContent).toContain('npm test 145 passed')
    expect(rptBlock.textContent).toContain('低')

    // Toggling the unchecked item as the USER → full-list update with
    // checkedBy 'user' on the flipped item.
    const item = clBlock.querySelectorAll<HTMLInputElement>('.dsh-atb-cl-item input')[1]!
    item.click()
    await new Promise(r => setTimeout(r, 10))
    const sent = updates[0]!.checklist as Array<{ id: string; checked: boolean; checkedBy?: string }>
    expect(sent[0]).toMatchObject({ id: 'k1', checked: true, checkedBy: 'agent' })
    expect(sent[1]).toMatchObject({ id: 'k2', checked: true, checkedBy: 'user' })

    // Done confirm warns about the unchecked item count.
    const doneBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-movebtn')).find(b => b.textContent!.includes('完成'))!
    doneBtn.click()
    await new Promise(r => setTimeout(r, 10))
    expect(host.querySelector('.dsh-atb-confirm-label')!.textContent).toContain('仍有 1 项清单未勾选')

    root.unmount()
    host.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('new-task menu lists templates and manages them; 存为模板 carries task fields', async () => {
    localStorage.clear()
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { TaskBoard } = await import('../src/client/board/TaskBoard.tsx')

    const templateList = [
      { id: 'tpl-1', name: 'Bug 修复', task: { urgency: 'urgent', checklist: ['复现'] }, builtin: true, createdAt: 0, updatedAt: 0 },
      { id: 'tpl-2', name: '我的模板', task: { title: '自定义' }, createdAt: 0, updatedAt: 0 },
    ]
    const upserts: unknown[] = []
    const deletes: string[] = []
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [] }),
      workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
      stream: () => () => {},
      templates: async () => ({ templates: templateList }),
      templateUpsert: async (body: unknown) => { upserts.push(body); return body as never },
      templateDelete: async (id: string) => { deletes.push(id); return { deleted: true } },
    }
    const controller = new BoardController(client as never)
    controller.start()
    await new Promise(r => setTimeout(r, 10))
    controller.openBoard()

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(React.createElement(TaskBoard, { controller }))
    await new Promise(r => setTimeout(r, 10))

    // Open the + 新建任务 ▼ dropdown: templates listed.
    const menuBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-newmenu > .dsh-atb-btn')).find(b => b.textContent!.includes('新建任务'))!
    menuBtn.click()
    await new Promise(r => setTimeout(r, 20))
    const options = Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-newmenu-opt')).map(b => b.textContent)
    expect(options).toContain('空白任务')
    expect(options).toContain('Bug 修复')
    expect(options).toContain('我的模板')
    expect(options.some(o => o!.includes('管理模板'))).toBe(true)

    // Picking a template opens the composer prefilled from it.
    ;(Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-newmenu-opt')).find(b => b.textContent === '我的模板'))!.click()
    await new Promise(r => setTimeout(r, 10))
    const snap = controller.getSnapshot()
    expect(snap.composerOpen).toBe(true)
    expect(snap.templatePrefill).toMatchObject({ title: '自定义' })
    controller.closeForm()

    // Manager modal: rename save + delete flow reach the client.
    controller.openTemplateManager()
    await new Promise(r => setTimeout(r, 20))
    const nameInput = host.querySelector<HTMLInputElement>('.dsh-atb-tplm-name')!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(nameInput, '改名模板')
    nameInput.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise(r => setTimeout(r, 10))
    ;(Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-tplm-btns .dsh-atb-btn')).find(b => b.textContent === '改名'))!.click()
    await new Promise(r => setTimeout(r, 10))
    expect(upserts[0]).toMatchObject({ id: 'tpl-1', name: '改名模板' })
    controller.closeTemplateManager()

    root.unmount()
    host.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('import modal: file → preview plan → merge commit; replace demands double confirmation', async () => {
    localStorage.clear()
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { ImportModal } = await import('../src/client/board/ImportModal.tsx')

    const file = {
      schemaVersion: 1,
      tasks: [
        { id: 't-new1', title: '导入新', workspaceId: 'ws-a', urgency: 'normal', comments: [], executions: [] },
        { id: 't-live', title: '覆盖', workspaceId: 'ws-a', urgency: 'normal', comments: [], executions: [] },
      ],
    }
    const previews: unknown[] = []
    const commits: Array<{ mode: string }> = []
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [] }),
      workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
      stream: () => () => {},
      importPreview: async (f: unknown) => {
        previews.push(f)
        return { plan: {
          create: [{ id: 't-new1', title: '导入新', status: 'todo' }],
          overwrite: [{ id: 't-live', title: '覆盖', status: 'todo' }],
          invalid: [],
        } }
      },
      importCommit: async (mode: 'merge' | 'replace') => {
        commits.push({ mode })
        return mode === 'replace'
          ? { mode, created: 1, overwritten: 0, replacedTotal: 5, backupFile: '/x/backup.json' }
          : { mode, created: 1, overwritten: 1 }
      },
    }
    const controller = new BoardController(client as never)
    controller.start()
    await new Promise(r => setTimeout(r, 10))
    controller.openImport()

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(React.createElement(ImportModal, { controller }))
    await new Promise(r => setTimeout(r, 10))

    // Pick the file through the input: jsdom lacks DataTransfer/FileList
    // constructors, so the FileList-shaped property is defined directly.
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    // jsdom's File lacks .text() in this version — patch it on the instance.
    const chosen = new File([JSON.stringify(file)], 'backup.json', { type: 'application/json' })
    Object.defineProperty(chosen, 'text', { value: async () => JSON.stringify(file) })
    Object.defineProperty(input, 'files', { value: [chosen], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await new Promise(r => setTimeout(r, 20))

    // The preview stats render.
    expect(host.querySelector('.dsh-atb-imp-stats')!.textContent).toContain('1')
    expect(host.querySelector('.dsh-atb-imp-sec h4')!.textContent).toContain('新增任务')

    // Merge: one click commits.
    ;(Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-modal-footbtns .dsh-atb-btn')).find(b => b.textContent === '执行导入'))!.click()
    await new Promise(r => setTimeout(r, 10))
    expect(commits).toEqual([{ mode: 'merge' }])
    expect(host.querySelector('.dsh-atb-imp-result')!.textContent).toContain('合并完成')

    // Replace mode: first click arms the double confirmation, second commits.
    const replaceOpt = Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-mode-opt')).find(b => b.textContent!.includes('整册替换'))!
    replaceOpt.click()
    await new Promise(r => setTimeout(r, 10))
    const commitBtn = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-modal-footbtns .dsh-atb-btn'))
      .find(b => b.textContent === '执行导入' || b.textContent === '确认整册替换')!
    commitBtn()!.click()
    await new Promise(r => setTimeout(r, 10))
    expect(commits).toHaveLength(1) // armed, not committed yet
    expect(host.querySelector('.dsh-atb-modal-hint')!.textContent).toContain('再次点击确认')
    commitBtn()!.click()
    await new Promise(r => setTimeout(r, 10))
    expect(commits[1]).toEqual({ mode: 'replace' })

    root.unmount()
    host.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('detail diff viewer: commit click lazy-loads the patch; dirty file click too', async () => {
    localStorage.clear()
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { TaskDetail } = await import('../src/client/board/TaskDetail.tsx')

    const task = {
      id: 't-diff', title: 'Diff', description: '', prompt: '', workspaceId: 'ws-a',
      urgency: 'normal' as const, status: 'in_review' as const, blocked: false,
      execution: { mode: 'claim' as const }, version: 2, createdAt: 0, updatedAt: 0,
      createdBy: { kind: 'user' as const }, updatedBy: { kind: 'user' as const },
      branch: 'task/Diff+t-diff',
      comments: [], executions: [{
        id: 'e-1', trigger: 'manual' as const, startedAt: 0, endedAt: 9, outcome: 'succeeded' as const,
        isolation: 'worktree' as const, branch: 'task/Diff+t-diff',
        worktreePath: '/p/a/.dsh-worktrees/t-diff', baseCommit: 'aaaa0000', headCommit: 'bbbb1111',
        commits: [{ hash: 'bbbb1111', subject: 'feat: change' }],
        dirtyFiles: [' M src/a.ts'],
      }],
    }
    const diffCalls: Array<{ execution: string; commit?: string; path?: string }> = []
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [task] }),
      workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
      stream: () => () => {},
      diff: async (_id: string, query: { execution: string; commit?: string; path?: string }) => {
        diffCalls.push(query)
        return { diff: `+patch for ${query.commit ?? query.path}`, truncated: false }
      },
    }
    const controller = new BoardController(client as never)
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    root.render(React.createElement(TaskDetail, { task: task as never, controller, now: 1_000 }))
    await new Promise(r => setTimeout(r, 10))

    // Click the commit row → the diff loads inline.
    const commitBtn = host.querySelector<HTMLButtonElement>('.dsh-atb-iso-commit-btn')!
    commitBtn.click()
    await new Promise(r => setTimeout(r, 20))
    expect(diffCalls[0]).toEqual({ execution: 'e-1', commit: 'bbbb1111' })
    expect(host.querySelector('.dsh-atb-diffview-pre')!.textContent).toContain('+patch for bbbb1111')

    // Dirty files: expand the list, click the file → path diff.
    const dirtyToggle = host.querySelector<HTMLButtonElement>('.dsh-atb-iso-dirty-toggle')!
    dirtyToggle.click()
    await new Promise(r => setTimeout(r, 10))
    const fileBtn = host.querySelector<HTMLButtonElement>('.dsh-atb-iso-dirty-file')!
    expect(fileBtn.textContent).toContain('src/a.ts')
    fileBtn.click()
    await new Promise(r => setTimeout(r, 20))
    expect(diffCalls[1]).toEqual({ execution: 'e-1', path: 'src/a.ts' })
    // The commit diff collapses; the path diff renders in its place.
    const pres = Array.from(host.querySelectorAll<HTMLElement>('.dsh-atb-diffview-pre'))
    expect(pres).toHaveLength(1)
    expect(pres[0]!.textContent).toContain('+patch for src/a.ts')

    root.unmount()
    host.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('0.4.1 竞态回归：入口嵌在 newSession 容器内时点击自己仍正常 toggle，点真 newSession 仍让位', async () => {
    localStorage.clear()
    const { BoardController } = await import('../src/client/controller.ts')
    const { mountSidebarEntry } = await import('../src/client/sidebar-entry.ts')
    const { mountBoard } = await import('../src/client/board-mount.tsx')
    const { createClient } = await import('../src/client/api.ts')
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [] }),
      workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
      stream: () => () => {},
      templates: async () => ({ templates: [] }),
    }
    const controller = new BoardController(client as never)
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    // The race-report shell shape: the sidebar root nests a NEW SESSION
    // button inside a [class*="newSession"] container row, and our entry
    // gets inserted as a SIBLING of that button — i.e. INSIDE the
    // newSession-classed container (closest() from the entry hits it).
    const column = document.createElement('div')
    column.className = 'pI_x6G_sidebarCol'
    column.dataset.pane = 'sidebar'
    const root = document.createElement('div')
    root.className = 'hHd-Xa_root'
    const newSessionRow = document.createElement('div')
    newSessionRow.className = 'hHd-Xa_newSession'
    const newSession = document.createElement('button')
    newSession.className = 'hHd-Xa_button'
    newSession.textContent = '新会话'
    newSessionRow.append(newSession)
    root.append(newSessionRow)
    const wrapper = document.createElement('div')
    wrapper.append(root)
    column.append(wrapper)
    // Center column the board mounts into.
    const conversation = document.createElement('div')
    conversation.dataset.pane = 'conversation'
    document.body.append(column, conversation)

    const disposeEntry = mountSidebarEntry(controller)
    const disposeBoard = mountBoard(controller)
    await new Promise(r => setTimeout(r, 20))

    // The entry landed next to the newSession row; force the exact racy
    // shape some shells produce: a sibling INSIDE the classed container
    // (closest() from the entry then matches [class*="newSession"]).
    const entry = document.querySelector<HTMLElement>('[data-dsh-atb-entry]')!
    expect(entry).not.toBeNull()
    if (entry.closest('[class*="newSession"]') === null) {
      newSessionRow.append(entry)
    }
    expect(entry.closest('[class*="newSession"]')).not.toBeNull()
    // Detach the entry's self-heal observers AFTER the move: they would
    // otherwise re-place the entry (fighting the racy position we forced)
    // on every mutation burst below.
    disposeEntry()

    // mountBoard already renders the board React tree into its container;
    // nothing extra to mount here.

    // 1) Clicking OUR entry while open must NOT close the board (the capture
    //    listener exempts the entry subtree) — toggle handles it: open→close.
    controller.openBoard()
    await new Promise(r => setTimeout(r, 10))
    entry.click()
    await new Promise(r => setTimeout(r, 10))
    expect(controller.getSnapshot().boardOpen).toBe(false)

    // open again; a second click on the entry closes it via toggle — no race.
    entry.click()
    await new Promise(r => setTimeout(r, 10))
    expect(controller.getSnapshot().boardOpen).toBe(true)
    entry.click()
    await new Promise(r => setTimeout(r, 10))
    expect(controller.getSnapshot().boardOpen).toBe(false)

    // 2) Clicking the REAL new-session button while open still closes the
    //    board (the yield-to-sidebar semantics survive the fix).
    controller.openBoard()
    await new Promise(r => setTimeout(r, 10))
    newSession.click()
    await new Promise(r => setTimeout(r, 10))
    expect(controller.getSnapshot().boardOpen).toBe(false)

    disposeBoard()
    column.remove()
    conversation.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('0.4.2 回归：无 data-pane 的 Desktop shell（哈希类名 centerCol）也能挂载看板；隐藏规则双选择器', async () => {
    localStorage.clear()
    const { BoardController } = await import('../src/client/controller.ts')
    const { mountBoard, BOARD_VIEW_SELECTOR } = await import('../src/client/board-mount.tsx')
    const { createClient } = await import('../src/client/api.ts')
    const { injectStyles } = await import('../src/client/styles.ts')
    injectStyles()

    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [] }),
      workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
      stream: () => () => {},
      templates: async () => ({ templates: [] }),
    }
    const controller = new BoardController(client as never)
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    // The DSH Desktop shell shape: NO data-pane anywhere; the center column
    // carries the CSS-Module hashed class (verified against
    // dsh-client-ui-layout: "centerCol": "pI_x6G_centerCol").
    const center = document.createElement('div')
    center.className = 'pI_x6G_centerCol'
    const conversationContent = document.createElement('div')
    conversationContent.textContent = '会话内容'
    center.append(conversationContent)
    document.body.append(center)

    const dispose = mountBoard(controller)
    await new Promise(r => setTimeout(r, 20))

    // The board container was created INSIDE the hashed-class column — on
    // 0.4.1 this stayed null forever (the board never rendered).
    const view = document.querySelector<HTMLElement>(BOARD_VIEW_SELECTOR)
    expect(view).not.toBeNull()
    expect(view!.parentElement).toBe(center)

    // Opening the board flips the html attribute the dual hide rule keys on.
    controller.openBoard()
    await new Promise(r => setTimeout(r, 10))
    expect(document.documentElement.hasAttribute('data-dsh-atb-active')).toBe(true)

    // The injected stylesheet carries BOTH hide selectors (old data-pane
    // pane + hashed centerCol), so conversation content hides on either shell.
    const styleEl = document.getElementById('dsh-taskboard-styles')!
    expect(styleEl).not.toBeNull()
    expect(styleEl.textContent).toContain('html[data-dsh-atb-active] [data-pane="conversation"] > *:not([data-dsh-atb-view])')
    expect(styleEl.textContent).toContain('html[data-dsh-atb-active] [class*="centerCol"] > *:not([data-dsh-atb-view])')

    dispose()
    controller.closeBoard()
    center.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('0.4.3 回归：折叠侧边栏时入口收成纯图标轨道（双信号选择器都在样式表里）', async () => {
    localStorage.clear()
    const { injectStyles } = await import('../src/client/styles.ts')
    injectStyles()

    // The collapse signals verified against the live shell packages:
    // dsh-client-ui-layout sets data-sidebar-collapsed on the frame;
    // dsh-client-ui-sidebar's root toggles its CSS-Module *_collapsed class
    // (e.g. hHd-Xa_collapsed). The rail rules must key on BOTH (0.4.2
    // dual-selector doctrine) and hide label + stats, with the native 36×36
    // rail geometry the shell gives its own collapsed buttons.
    const css = document.getElementById('dsh-taskboard-styles')!.textContent ?? ''
    for (const signal of ['[data-sidebar-collapsed]', '[class*="_collapsed"]']) {
      expect(css).toContain(`${signal} [data-dsh-atb-entry] .dsh-atb-entry-label,\n${signal} [data-dsh-atb-entry] .dsh-atb-entry-stats`)
    }
    expect(css).toContain('width: 36px; height: 36px; min-width: 36px;')
    expect(css).toContain('margin: 0 0 12px; padding: 0;')

    // DOM level: the entry markup keeps its label/stats spans (only the
    // stylesheet hides them in the rail), and the collapse class on the
    // sidebar root is exactly what the CSS keys on — verify the selector
    // string the shell really produces matches our pattern.
    const root = document.createElement('div')
    root.className = 'hHd-Xa_root hHd-Xa_collapsed'
    expect(root.matches('[class*="_collapsed"]')).toBe(true)
    const expanded = document.createElement('div')
    expanded.className = 'hHd-Xa_root'
    expect(expanded.matches('[class*="_collapsed"]')).toBe(false)
  })

  it('0.5.2 回归：DSH Desktop 非兼容模式（extended frame）下入口与看板都能挂载；隐藏规则第三选择器', async () => {
    localStorage.clear()
    // Earlier tests in this file leave their shell fixtures in the shared
    // jsdom document (they dispose the entry, not the columns) — clear
    // every prior column/entry/view so the selectors below see ONLY the
    // extended frame built in this test.
    for (const selector of [
      '[data-pane="sidebar"]', '[class*="sidebarCol"]',
      '[data-pane="conversation"]', '[class*="centerCol"]',
      '[data-dsh-atb-entry]', '[data-dsh-atb-view]',
    ]) {
      for (const el of document.querySelectorAll(selector)) el.remove()
    }
    const { BoardController } = await import('../src/client/controller.ts')
    const { mountSidebarEntry } = await import('../src/client/sidebar-entry.ts')
    const { mountBoard, BOARD_VIEW_SELECTOR } = await import('../src/client/board-mount.tsx')
    const { injectStyles } = await import('../src/client/styles.ts')
    injectStyles()

    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [] }),
      workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
      stream: () => () => {},
      templates: async () => ({ templates: [] }),
    }
    const controller = new BoardController(client as never)
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    // The DSH Desktop extended-mode frame shape (verified against
    // anywhere-labs/dsh-desktop ExtendedFrame.tsx and the installed
    // app.asar): the official ui-layout row is DISABLED — the desktop
    // package owns the columns. NO data-pane attributes, NO
    // sidebarCol/centerCol substrings; the official sidebar still renders
    // (unchanged) inside dshDesktopUpstreamSidebar with its Xa_ classes.
    const frame = document.createElement('div')
    frame.className = 'dshDesktopFrame'
    frame.dataset.desktopMode = 'extended'
    const surface = document.createElement('aside')
    surface.className = 'dshDesktopSidebarSurface'
    const upstream = document.createElement('div')
    upstream.className = 'dshDesktopUpstreamSidebar'
    const sidebarRoot = document.createElement('div')
    sidebarRoot.className = 'hHd-Xa_root'
    const logoRow = document.createElement('div')
    logoRow.className = 'hHd-Xa_logoRow'
    const newSession = document.createElement('button')
    newSession.className = 'hHd-Xa_newSession'
    newSession.textContent = '新会话'
    logoRow.append(newSession)
    sidebarRoot.append(logoRow)
    upstream.append(sidebarRoot)
    surface.append(upstream)
    const center = document.createElement('main')
    center.className = 'dshDesktopConversationSurface'
    const conversationContent = document.createElement('div')
    conversationContent.textContent = '会话内容'
    center.append(conversationContent)
    frame.append(surface, center)
    document.body.append(frame)

    const disposeEntry = mountSidebarEntry(controller)
    const disposeBoard = mountBoard(controller)
    await new Promise(r => setTimeout(r, 20))

    // On 0.5.1 both stayed null forever: sidebarRoot()'s column selector
    // matched nothing in the extended frame, so the entry never placed.
    const entry = document.querySelector<HTMLElement>('[data-dsh-atb-entry]')
    expect(entry).not.toBeNull()
    expect(upstream.contains(entry)).toBe(true)
    const view = document.querySelector<HTMLElement>(BOARD_VIEW_SELECTOR)
    expect(view).not.toBeNull()
    expect(view!.parentElement).toBe(center)

    // The hide rule knows the third column generation.
    const css = document.getElementById('dsh-taskboard-styles')!.textContent ?? ''
    expect(css).toContain('html[data-dsh-atb-active] .dshDesktopConversationSurface > *:not([data-dsh-atb-view])')

    // Collapse signal: the extended frame sets data-sidebar-collapsed on
    // ITSELF — the existing rail rules key on that attribute unchanged.
    frame.setAttribute('data-sidebar-collapsed', '')
    expect(frame.matches('[data-sidebar-collapsed]')).toBe(true)

    disposeEntry()
    disposeBoard()
    controller.closeBoard()
    frame.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('SSE 帧对账：hello/change 按 api.ts 的 revision 规则触发 onGap/onChange', async () => {
    localStorage.clear()
    vi.stubGlobal('EventSource', EventSourceMock as unknown as typeof EventSource)
    const { createClient } = await import('../src/client/api.ts')
    const onChange = vi.fn()
    const onGap = vi.fn()
    const stop = createClient().stream(onChange, onGap)
    const es = EventSourceMock.instances.at(-1)!

    // First hello establishes the baseline revision — never a gap.
    es.dispatch('hello', { revision: 5 })
    expect(onGap).not.toHaveBeenCalled()
    // In-order change (5 → 6): the normal path — onChange only, no onGap.
    es.dispatch('change', { revision: 6, kind: 'task-updated', tasks: [] })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onGap).not.toHaveBeenCalled()
    // Duplicate frame (6 again): revision did not advance by 1 → gap.
    es.dispatch('change', { revision: 6, kind: 'task-updated', tasks: [] })
    expect(onGap).toHaveBeenCalledTimes(1)
    // Regressed frame (6 → 4): gap again.
    es.dispatch('change', { revision: 4, kind: 'task-updated', tasks: [] })
    expect(onGap).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenCalledTimes(3)
    // Reconnect hello at the SAME revision: nothing missed → stays quiet.
    es.dispatch('hello', { revision: 4 })
    expect(onGap).toHaveBeenCalledTimes(2)
    // Reconnect hello after missed frames (4 → 9): gap → full refetch.
    es.dispatch('hello', { revision: 9 })
    expect(onGap).toHaveBeenCalledTimes(3)
    // Disposing the subscription closes the stream.
    stop()
    expect(es.closed).toBe(true)
  })

  it('SSE 帧驱动控制器：in-order change 恰好一次 state refetch；重复 hello 不再拉取', async () => {
    localStorage.clear()
    let revision = 3
    let stateFetches = 0
    const dynFetch = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input)
      if (path === '/dsh-taskboard/state') {
        stateFetches += 1
        return new Response(JSON.stringify({ ok: true, value: { schemaVersion: 1, revision, tasks: [] } }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (path === '/dsh-taskboard/workspaces') {
        return new Response(JSON.stringify({ ok: true, value: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      throw new Error(`unexpected fetch ${path}`)
    })
    vi.stubGlobal('fetch', dynFetch)
    vi.stubGlobal('EventSource', EventSourceMock as unknown as typeof EventSource)
    const { createClient } = await import('../src/client/api.ts')
    const { BoardController } = await import('../src/client/controller.ts')
    const controller = new BoardController(createClient())
    controller.start()
    const es = EventSourceMock.instances.at(-1)!
    await waitFor(() => stateFetches === 1)

    // Reconnect hello echoing the current revision: nothing was missed —
    // the controller does NOT refetch.
    es.dispatch('hello', { revision: 3 })
    await new Promise(r => setTimeout(r, 30))
    expect(stateFetches).toBe(1)

    // In-order change frame: exactly ONE refetch lands (no gap duplicate).
    revision = 4
    es.dispatch('change', { revision: 4, kind: 'task-updated', tasks: [] })
    await waitFor(() => stateFetches === 2)
    await new Promise(r => setTimeout(r, 30))
    expect(stateFetches).toBe(2)
    expect(controller.getSnapshot().ledger.revision).toBe(4)

    // Duplicate frame (revision did not advance): the gap path fires — one
    // deduped (in-flight) reconciliation refetch, not a storm.
    es.dispatch('change', { revision: 4, kind: 'task-updated', tasks: [] })
    await waitFor(() => stateFetches === 3)
    await new Promise(r => setTimeout(r, 30))
    expect(stateFetches).toBe(3)

    controller.dispose()
    expect(es.closed).toBe(true)
  })

  it('编辑模式不预选部署默认 preset：任务自身的 preset 选择不被改写', async () => {
    localStorage.clear()
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { TaskFormModal } = await import('../src/client/board/TaskFormModal.tsx')

    const updates: unknown[] = []
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [] }),
      workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
      stream: () => () => {},
      update: async (_id: string, body: unknown) => { updates.push(body); return { id: 't' } },
    }
    const controller = new BoardController(client as never)
    controller.installPresetRoster(async () => ({
      presets: [{ id: 'standard', name: '标准模式' }, { id: 'liangshen', name: '梁神模式' }],
      defaultId: 'standard',
    }))
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    const mkTask = (presetId?: string) => ({
      id: 't-edit', title: '编辑我', description: '', prompt: '', workspaceId: 'ws-a',
      urgency: 'normal' as const, status: 'todo' as const, blocked: false,
      execution: { mode: 'claim' as const }, version: 4, createdAt: 0, updatedAt: 0,
      ...(presetId !== undefined ? { presetId } : {}),
      createdBy: { kind: 'user' as const }, updatedBy: { kind: 'user' as const },
      comments: [], executions: [],
    })
    const presetSelectOf = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLSelectElement>('select'))
      .find(s => Array.from(s.options).some(o => o.value === 'standard'))!

    // Follow-default task (no presetId): the roster's deployment default must
    // NOT be pre-selected in edit mode — the select stays on 跟随部署默认.
    let host = document.createElement('div')
    document.body.append(host)
    let root = createRoot(host)
    root.render(React.createElement(TaskFormModal, { controller, task: mkTask() as never }))
    await new Promise(r => setTimeout(r, 30))
    expect(presetSelectOf(host).value).toBe('')
    // Saving keeps following the deployment default (presetId: null).
    ;(Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-modal-footbtns .dsh-atb-btn')).find(b => b.textContent === '保存修改'))!.click()
    await new Promise(r => setTimeout(r, 10))
    expect(updates[0]).toMatchObject({ presetId: null })
    root.unmount()
    host.remove()

    // Pinned task (presetId 'liangshen'): the pinned choice survives the
    // roster load instead of being flipped to the deployment default.
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    root.render(React.createElement(TaskFormModal, { controller, task: mkTask('liangshen') as never }))
    await new Promise(r => setTimeout(r, 30))
    expect(presetSelectOf(host).value).toBe('liangshen')
    root.unmount()
    host.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('duplicate()：200 字标题截断到 196 再加（副本），create payload 不超 200 字', async () => {
    localStorage.clear()
    const { BoardController } = await import('../src/client/controller.ts')
    const creates: unknown[] = []
    const task = {
      id: 't-dup', title: '标'.repeat(200), description: '跟随描述', prompt: '', workspaceId: 'ws-a',
      urgency: 'normal' as const, status: 'todo' as const, blocked: false,
      execution: { mode: 'claim' as const }, version: 1, createdAt: 0, updatedAt: 0,
      createdBy: { kind: 'user' as const }, updatedBy: { kind: 'user' as const },
      comments: [], executions: [],
    }
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [task] }),
      workspaces: async () => [],
      stream: () => () => {},
      create: async (body: unknown) => { creates.push(body); return { id: 't-new' } },
    }
    const controller = new BoardController(client as never)
    await controller.duplicate(task as never)
    expect(creates).toHaveLength(1)
    const payload = creates[0] as { title: string; workspaceId: string }
    // 196 chars + （副本）(4 chars) = exactly the host's 200-char cap.
    expect(payload.title.length).toBeLessThanOrEqual(200)
    expect(payload.title.endsWith('（副本）')).toBe(true)
    expect(payload.title.length).toBe(200)
    expect(payload.workspaceId).toBe('ws-a')
    controller.dispose()
    localStorage.clear()
  })

  it('TaskCard & TaskDetail: one-click session jump for executed/running tasks', async () => {
    localStorage.clear()
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { TaskCard } = await import('../src/client/board/TaskCard.tsx')
    const { TaskDetail } = await import('../src/client/board/TaskDetail.tsx')
    const { createSessionJumper } = await import('../src/client/session-jump.ts')

    const taskLive = {
      id: 't-live', title: 'Live task', description: 'desc', prompt: '', workspaceId: 'ws-a',
      urgency: 'normal' as const, status: 'in_progress' as const, blocked: false,
      claimedBy: 'session-taskboard-t-live-11112222',
      execution: { mode: 'claim' as const }, version: 2, createdAt: 0, updatedAt: 0,
      createdBy: { kind: 'user' as const }, updatedBy: { kind: 'user' as const },
      comments: [], executions: [{
        id: 'e-1', trigger: 'manual' as const, startedAt: 0, outcome: 'running' as const,
        sessionId: 'session-taskboard-t-live-11112222',
      }],
    }
    const taskArchived = {
      id: 't-arch', title: 'Archived task', description: '', prompt: '', workspaceId: 'ws-a',
      urgency: 'normal' as const, status: 'done' as const, blocked: false,
      execution: { mode: 'claim' as const }, version: 3, createdAt: 0, updatedAt: 0,
      createdBy: { kind: 'user' as const }, updatedBy: { kind: 'user' as const },
      comments: [], executions: [{
        id: 'e-2', trigger: 'manual' as const, startedAt: 0, endedAt: 10, outcome: 'succeeded' as const,
        sessionId: 'session-taskboard-t-arch-33334444',
      }],
    }
    const taskNoSession = {
      id: 't-none', title: 'No session task', description: '', prompt: '', workspaceId: 'ws-a',
      urgency: 'normal' as const, status: 'todo' as const, blocked: false,
      execution: { mode: 'claim' as const }, version: 1, createdAt: 0, updatedAt: 0,
      createdBy: { kind: 'user' as const }, updatedBy: { kind: 'user' as const },
      comments: [], executions: [],
    }

    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [taskLive, taskArchived, taskNoSession] }),
      workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
      stream: () => () => {},
    }
    const controller = new BoardController(client as never)

    const opened: string[] = []
    const sessions = {
      open: (id: string) => { opened.push(id) },
      refresh: async () => {},
      list: { getSnapshot: () => ({ byId: { 'session-taskboard-t-live-11112222': {}, 'session-taskboard-t-arch-33334444': {} } }) },
    }
    const workspaces = { list: { getSnapshot: () => ({ archivedSessionIds: ['session-taskboard-t-arch-33334444'] }) } }

    controller.installSessionJumper(createSessionJumper({
      getSessions: () => sessions as never,
      getWorkspaces: () => workspaces as never,
    }))
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    // 1. TaskCard without executions has NO session jump button
    let host = document.createElement('div')
    document.body.append(host)
    let root = createRoot(host)
    root.render(React.createElement(TaskCard, { task: taskNoSession as never, controller }))
    await new Promise(r => setTimeout(r, 10))
    expect(host.querySelector('.dsh-atb-card-session')).toBeNull()
    root.unmount()
    host.remove()

    // 2. TaskCard with live session has .dsh-atb-card-session button
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    controller.openBoard()
    const alerts: string[] = []
    root.render(React.createElement(TaskCard, {
      task: taskLive as never,
      controller,
      onAlert: (msg: string) => alerts.push(msg),
    }))
    await new Promise(r => setTimeout(r, 10))

    const sessionBtn = host.querySelector<HTMLButtonElement>('.dsh-atb-card-session')!
    expect(sessionBtn).not.toBeNull()
    expect(sessionBtn.textContent).toContain('t-live-1')
    expect(sessionBtn.textContent).toContain('↗')

    // Click on the session button: jumps to session, closes board, and does NOT select the card
    sessionBtn.click()
    await new Promise(r => setTimeout(r, 20))
    expect(opened).toEqual(['session-taskboard-t-live-11112222'])
    expect(controller.getSnapshot().boardOpen).toBe(false)
    expect(controller.getSnapshot().selectedId).toBeUndefined()
    root.unmount()
    host.remove()

    // 3. TaskCard with archived session alerts when clicked
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    controller.openBoard()
    root.render(React.createElement(TaskCard, {
      task: taskArchived as never,
      controller,
      onAlert: (msg: string) => alerts.push(msg),
    }))
    await new Promise(r => setTimeout(r, 10))
    const archBtn = host.querySelector<HTMLButtonElement>('.dsh-atb-card-session')!
    expect(archBtn).not.toBeNull()
    archBtn.click()
    await new Promise(r => setTimeout(r, 20))
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toContain('该会话已归档')
    expect(controller.getSnapshot().boardOpen).toBe(true) // board stays open on non-opened result
    root.unmount()
    host.remove()

    // 4. TaskDetail renders top session button and clickable holder chip
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    controller.openBoard()
    root.render(React.createElement(TaskDetail, {
      task: taskLive as never,
      controller,
      now: 1_000,
    }))
    await new Promise(r => setTimeout(r, 10))

    const topSessionBtn = host.querySelector<HTMLButtonElement>('.dsh-atb-detail-session')!
    expect(topSessionBtn).not.toBeNull()
    expect(topSessionBtn.textContent).toContain('跳转会话')

    const holderChipBtn = host.querySelector<HTMLButtonElement>('button.dsh-atb-chip-btn')!
    expect(holderChipBtn).not.toBeNull()
    expect(holderChipBtn.textContent).toContain('t-live-1')

    // Click top session button in TaskDetail
    topSessionBtn.click()
    await new Promise(r => setTimeout(r, 20))
    expect(opened).toEqual(['session-taskboard-t-live-11112222', 'session-taskboard-t-live-11112222'])
    expect(controller.getSnapshot().boardOpen).toBe(false)

    root.unmount()
    host.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('TaskFormModal: remembers last chosen model and supports reasoningEffort', async () => {
    localStorage.clear()
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { TaskFormModal, LAST_MODEL_KEY, saveLastModel } = await import('../src/client/board/TaskFormModal.tsx')

    // 1. Pre-seed localStorage with last model
    saveLastModel({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: 'high' })

    const createdPayloads: unknown[] = []
    const client = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [] }),
      workspaces: async () => [{ id: 'ws-a', path: '/p/a', title: 'A', sessionCount: 0 }],
      create: async (body: unknown) => {
        createdPayloads.push(body)
        return { id: 't-new', version: 1 }
      },
      stream: () => () => {},
    }
    const controller = new BoardController(client as never)
    controller.installModelCatalog(async () => [
      {
        provider: 'deepseek',
        model: 'deepseek-reasoner',
        name: 'DeepSeek Reasoner',
        reasoning: {
          efforts: [
            { id: 'low', name: '低 (Low)' },
            { id: 'medium', name: '中 (Medium)' },
            { id: 'high', name: '高 (High)' },
          ],
          defaultEffort: 'medium',
        },
      },
      {
        provider: 'openai',
        model: 'gpt-4o',
        name: 'GPT-4o',
      },
    ])
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    // 2. Open TaskFormModal in create mode
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    controller.setComposer(true)
    root.render(React.createElement(TaskFormModal, { controller }))
    await new Promise(r => setTimeout(r, 50))

    // Verify Title input and pre-filled Model & Reasoning select
    const titleInput = host.querySelector<HTMLInputElement>('input[placeholder="一句话说清要做什么"]')!
    expect(titleInput).not.toBeNull()
    const selects = host.querySelectorAll('select')
    // Select 0: Workspace, Select 1: Model, Select 2: Reasoning Effort
    const modelSelect = selects[1] as HTMLSelectElement
    expect(modelSelect.value).toBe(JSON.stringify({ provider: 'deepseek', model: 'deepseek-reasoner' }))

    const effortSelect = selects[2] as HTMLSelectElement
    expect(effortSelect).not.toBeNull()
    expect(effortSelect.value).toBe('high')

    // Change Title and Submit
    const titleSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    titleSetter?.call(titleInput, 'My new reasoning task')
    titleInput.dispatchEvent(new Event('input', { bubbles: true }))
    titleInput.dispatchEvent(new Event('change', { bubbles: true }))

    // Change effort to 'low'
    const selectSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    selectSetter?.call(effortSelect, 'low')
    effortSelect.dispatchEvent(new Event('change', { bubbles: true }))

    await new Promise(r => setTimeout(r, 20))

    // Click submit button (创建任务)
    const submitBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-modal-footbtns .dsh-atb-btn'))
      .find(b => b.textContent === '创建任务')!
    expect(submitBtn).not.toBeNull()
    expect(submitBtn.disabled).toBe(false)
    submitBtn.click()
    await new Promise(r => setTimeout(r, 30))

    expect(createdPayloads).toHaveLength(1)
    const payload = createdPayloads[0] as { title: string; model?: { provider: string; model: string; reasoningEffort?: string } }
    expect(payload.title).toBe('My new reasoning task')
    expect(payload.model).toEqual({
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      reasoningEffort: 'low',
    })

    // Verify localStorage was updated to the new choice
    expect(JSON.parse(localStorage.getItem(LAST_MODEL_KEY)!)).toEqual({
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      reasoningEffort: 'low',
    })

    root.unmount()
    host.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('TaskFormModal: supports permission tri-picker and SlashPromptInput (0.5.5)', async () => {
    localStorage.clear()
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { BoardController } = await import('../src/client/controller.ts')
    const { TaskFormModal } = await import('../src/client/board/TaskFormModal.tsx')

    const createdPayloads: unknown[] = []
    const clientFake = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [] }),
      workspaces: async () => [{ id: 'ws-a', path: '/proj/a', title: 'A', gitAvailable: true }],
      create: async (body: unknown) => {
        createdPayloads.push(body)
        return { id: 't-perm', title: 'Task with permission', workspaceId: 'ws-a', status: 'todo', version: 1, createdAt: 0, updatedAt: 0 }
      },
      update: async () => ({ ok: true }),
      stream: () => () => {},
      promptCompletions: async () => ({
        commands: [{ name: 'goal', kind: 'command' as const, description: '自主完成长期目标' }],
        skills: [{ name: 'frontend-ui-engineering', kind: 'skill' as const, description: '前端UI工程' }],
      }),
      modelCatalog: async () => ({ models: [], presets: [] }),
    }

    const controller = new BoardController(clientFake as never)
    controller.start()
    await new Promise(r => setTimeout(r, 10))

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    controller.setComposer(true)
    root.render(React.createElement(TaskFormModal, { controller }))
    await new Promise(r => setTimeout(r, 50))

    // Check title input
    const titleInput = host.querySelector<HTMLInputElement>('input[placeholder="一句话说清要做什么"]')!
    expect(titleInput).not.toBeNull()
    const titleSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    titleSetter?.call(titleInput, 'Task with read-only permission')
    titleInput.dispatchEvent(new Event('input', { bubbles: true }))
    titleInput.dispatchEvent(new Event('change', { bubbles: true }))

    // Check permission options: default is workspace-write
    const permOpts = Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-perm-opt'))
    expect(permOpts.length).toBe(3)
    expect(permOpts[0]!.textContent).toContain('可写入工作区')
    expect(permOpts[1]!.textContent).toContain('仅可查看')
    expect(permOpts[2]!.textContent).toContain('完全权限')
    expect(permOpts[0]!.dataset.on).toBe('true')

    // Click '仅可查看' (read-only)
    permOpts[1]!.click()
    await new Promise(r => setTimeout(r, 20))
    expect(permOpts[1]!.dataset.on).toBe('true')

    // Find description textarea (SlashPromptInput)
    const textareas = host.querySelectorAll('textarea')
    expect(textareas.length).toBe(2)
    const descTextarea = textareas[0] as HTMLTextAreaElement
    const textareaSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    textareaSetter?.call(descTextarea, '使用 /goal 完成任务并按规范交付')
    descTextarea.dispatchEvent(new Event('input', { bubbles: true }))
    descTextarea.dispatchEvent(new Event('change', { bubbles: true }))

    await new Promise(r => setTimeout(r, 20))

    // Submit
    const submitBtn = Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-modal-footbtns .dsh-atb-btn'))
      .find(b => b.textContent === '创建任务')!
    submitBtn.click()
    await new Promise(r => setTimeout(r, 30))

    expect(createdPayloads).toHaveLength(1)
    const payload = createdPayloads[0] as { title: string; permission?: string; description?: string }
    expect(payload.title).toBe('Task with read-only permission')
    expect(payload.permission).toBe('read-only')
    expect(payload.description).toBe('使用 /goal 完成任务并按规范交付')

    root.unmount()
    host.remove()
    controller.dispose()
    localStorage.clear()
  })

  it('controller.fetchModelCatalog & fetchPresetCatalog fallback to client endpoint (0.5.5)', async () => {
    const { BoardController } = await import('../src/client/controller.ts')
    const clientFake = {
      state: async () => ({ schemaVersion: 1, revision: 1, tasks: [] }),
      workspaces: async () => [],
      modelCatalog: async () => ({
        models: [{ provider: 'fallback-prov', model: 'fallback-model', name: 'Fallback Model' }],
        presets: [{ id: 'standard', name: '标准模式' }],
        defaultPresetId: 'standard',
      }),
      stream: () => () => {},
    }

    const controller = new BoardController(clientFake as never)
    const models = await controller.fetchModelCatalog()
    expect(models).toEqual([{ provider: 'fallback-prov', model: 'fallback-model', name: 'Fallback Model' }])

    const presets = await controller.fetchPresetCatalog()
    expect(presets).toEqual({
      presets: [{ id: 'standard', name: '标准模式' }],
      defaultId: 'standard',
    })
  })
})

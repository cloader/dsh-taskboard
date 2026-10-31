// @vitest-environment jsdom
/**
 * Sticky project headers inside each column's card scroller.
 *
 * The board used to lose its project label the moment a column scrolled: the
 * column head sits OUTSIDE the scroller (so it never moved), but the project
 * row rode up with its cards, leaving a long column unlabelled. The header is
 * now pinned with position: sticky.
 *
 * Two things can silently break that pinning, and both are asserted here:
 * 1. the sticky header's ancestor chain must actually contain the scrolling
 *    box (a sticky element whose ancestor has overflow: hidden / transform,
 *    or that is not a descendant of the scroller at all, simply stops
 *    sticking);
 * 2. the header fill must be OPAQUE — cards slide underneath it, so a
 *    transparent background would let their text bleed through the label.
 */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BoardController } from '../src/client/controller.ts'
import { TaskBoard } from '../src/client/board/TaskBoard.tsx'
import type { TaskRecord } from '../src/shared/protocol.ts'
import { waitFor } from './wait-for.ts'
import { disposeI18n } from '../src/client/i18n/runtime.ts'

const cleanups: Array<() => void> = []
beforeEach(() => {
  localStorage.clear()
  document.documentElement.lang = 'zh-CN'
  disposeI18n()
})
afterEach(() => {
  cleanups.splice(0).reverse().forEach(d => d())
  localStorage.clear()
})

/** One task per workspace so each column renders several project groups. */
function makeTask(id: string, workspaceId: string): TaskRecord {
  return {
    id,
    title: `Task ${id}`,
    description: '',
    prompt: '',
    workspaceId,
    urgency: 'normal',
    status: 'todo',
    blocked: false,
    execution: { mode: 'claim' },
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    createdBy: { kind: 'user' },
    updatedBy: { kind: 'user' },
    comments: [],
    executions: [],
  }
}

async function renderBoard(tasks: TaskRecord[], onController?: (controller: BoardController) => void): Promise<HTMLElement> {
  const controller = new BoardController({
    state: async () => ({ schemaVersion: 1, revision: 1, tasks }),
    workspaces: async () => [
      { id: 'ws-a', path: '/p/a', title: 'Alpha Repo', sessionCount: 0 },
      { id: 'ws-b', path: '/p/b', title: 'Beta Repo', sessionCount: 0 },
    ],
    stream: () => () => {},
  } as never)
  controller.start()
  onController?.(controller)
  cleanups.push(() => controller.dispose())
  await waitFor(() => controller.getSnapshot().workspaces.length === 2)

  const host = document.createElement('div')
  document.body.append(host)
  const root: Root = createRoot(host)
  cleanups.push(() => { root.unmount(); host.remove() })
  root.render(React.createElement(TaskBoard, { controller }))
  return host
}

describe('sticky project group headers', () => {
  it.each(['backlog', 'todo'] as const)('preserves project groups when the %s column collapses and reloads', async status => {
    let controller!: BoardController
    const tasks = [
      { ...makeTask('a-1', 'ws-a'), status },
      { ...makeTask('b-1', 'ws-b'), status },
    ]
    const host = await renderBoard(tasks, value => { controller = value })
    await waitFor(() => host.querySelectorAll('.dsh-atb-ws-group-head').length === 2)
    const alpha = host.querySelector<HTMLButtonElement>('.dsh-atb-ws-group-head')!
    alpha.click()
    await waitFor(() => alpha.getAttribute('aria-expanded') === 'false')
    const collapse = alpha.closest('.dsh-atb-column')!.querySelector<HTMLButtonElement>('.dsh-atb-colfoldbtn')!
    collapse.click()
    await waitFor(() => host.querySelector('.dsh-atb-column[data-collapsed="true"]') !== null)
    expect(controller.isWorkspaceGroupCollapsed(status, 'ws-a')).toBe(true)
    expect(host.querySelector('.dsh-atb-col-collapsed-bar .dsh-atb-colcount')?.textContent).toBe('2')

    let restored!: BoardController
    const reloaded = await renderBoard(tasks, value => { restored = value })
    await waitFor(() => reloaded.querySelector('.dsh-atb-col-collapsed-bar') !== null)
    expect(restored.isWorkspaceGroupCollapsed(status, 'ws-a')).toBe(true)
    reloaded.querySelector<HTMLButtonElement>('.dsh-atb-col-collapsed-bar button')!.click()
    await waitFor(() => reloaded.querySelectorAll('.dsh-atb-ws-group-head').length === 2)
    const heads = Array.from(reloaded.querySelectorAll<HTMLButtonElement>('.dsh-atb-ws-group-head'))
    expect(heads.find(head => head.title === 'Alpha Repo')?.getAttribute('aria-expanded')).toBe('false')
    expect(heads.find(head => head.title === 'Beta Repo')?.getAttribute('aria-expanded')).toBe('true')
    expect(restored.getSnapshot().ledger.tasks).toEqual(tasks)
  })

  it('collapses only the selected column/project, preserves counts, and restores after reload', async () => {
    const host = await renderBoard([
      makeTask('a-1', 'ws-a'), makeTask('b-1', 'ws-b'),
      { ...makeTask('a-2', 'ws-a'), status: 'in_progress' },
    ])
    await waitFor(() => host.querySelectorAll('.dsh-atb-ws-group-head').length === 3)
    const heads = Array.from(host.querySelectorAll<HTMLButtonElement>('.dsh-atb-ws-group-head'))
    const alpha = heads.find(head => head.title === 'Alpha Repo')!
    const cards = alpha.nextElementSibling as HTMLElement
    expect(alpha.tagName).toBe('BUTTON')
    expect(alpha.getAttribute('aria-expanded')).toBe('true')
    alpha.click()
    await waitFor(() => alpha.getAttribute('aria-expanded') === 'false')
    expect(cards.hidden).toBe(true)
    expect(alpha.querySelector('.dsh-atb-ws-group-count')?.textContent).toBe('1')
    for (const head of heads.filter(head => head !== alpha)) {
      expect(head.getAttribute('aria-expanded')).toBe('true')
      expect((head.nextElementSibling as HTMLElement).hidden).toBe(false)
    }
    const reloaded = await renderBoard([makeTask('a-1', 'ws-a')])
    await waitFor(() => reloaded.querySelector('.dsh-atb-ws-group-head') !== null)
    expect(reloaded.querySelector('.dsh-atb-ws-group-head')?.getAttribute('aria-expanded')).toBe('false')
    alpha.click()
    await waitFor(() => !cards.hidden)
    expect(alpha.getAttribute('aria-expanded')).toBe('true')
  })

  it('supports secondary columns and unassigned projects without changing task records', async () => {
    let controller!: BoardController
    const task = { ...makeTask('unassigned', ''), status: 'archived' as const }
    const host = await renderBoard([task], value => { controller = value })
    controller.toggleSecondary()
    await waitFor(() => host.querySelector('.dsh-atb-ws-group-head') !== null)
    const head = host.querySelector<HTMLButtonElement>('.dsh-atb-ws-group-head')!
    head.click()
    await waitFor(() => head.getAttribute('aria-expanded') === 'false')
    expect((head.nextElementSibling as HTMLElement).hidden).toBe(true)
    expect(controller.isWorkspaceGroupCollapsed('archived', '')).toBe(true)
    expect(controller.isWorkspaceGroupCollapsed('todo', '')).toBe(false)
    expect(controller.getSnapshot().ledger.tasks).toEqual([task])
    controller.toggleSecondary()
    controller.toggleSecondary()
    await waitFor(() => host.querySelector('.dsh-atb-ws-group-head')?.getAttribute('aria-expanded') === 'false')
    head.click()
    await waitFor(() => !controller.isWorkspaceGroupCollapsed('archived', ''))
  })

  it('pins .dsh-atb-ws-group-head to the top of its card scroller', async () => {
    const host = await renderBoard([makeTask('a-1', 'ws-a'), makeTask('a-2', 'ws-a'), makeTask('b-1', 'ws-b')])
    await waitFor(() => host.querySelectorAll('.dsh-atb-column').length === 5)

    const heads = Array.from(host.querySelectorAll<HTMLElement>('.dsh-atb-ws-group-head'))
    expect(heads.length).toBeGreaterThan(0)

    for (const head of heads) {
      // Structural precondition: the header must live INSIDE the element that
      // actually scrolls, otherwise position: sticky has no scrollport to
      // stick to and silently degrades to a normal row.
      const scroller = head.closest('.dsh-atb-cards')
      expect(scroller, 'group header must be a descendant of the card scroller').not.toBeNull()

      // No ancestor between the header and its scroller may clip or transform,
      // which would neuter sticky.
      for (let node = head.parentElement; node !== null && node !== scroller; node = node.parentElement) {
        expect(node.classList.contains('dsh-atb-column'), 'column must not sit between header and scroller').toBe(false)
      }
    }
  })

  it('stylesheet carries the sticky rule with an opaque fill', async () => {
    const { injectStyles } = await import('../src/client/styles.ts')
    document.getElementById('dsh-taskboard-styles')?.remove()
    injectStyles()
    const css = document.getElementById('dsh-taskboard-styles')!.textContent ?? ''

    // Isolate the group-header rule so an unrelated sticky elsewhere in the
    // sheet cannot satisfy the assertion.
    const rule = /\.dsh-atb-ws-group-head\s*\{([^}]*)\}/.exec(css)
    expect(rule, '.dsh-atb-ws-group-head rule must exist').not.toBeNull()
    const body = rule![1]!

    expect(body).toContain('position: sticky')
    expect(body).toContain('top: 0')
    // Stacked layer + opaque base: cards sliding under the label must not show
    // through. A bare rgba tint (what the row used to carry) would.
    expect(body).toContain('var(--dsw-alias-bg-base')
    expect(body).not.toMatch(/background:\s*(transparent|none)\s*;/)
  })
})

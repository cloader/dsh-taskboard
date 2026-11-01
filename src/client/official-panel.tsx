/**
 * Register the task board as a DSH sidebar panel through the official slots.
 * The host owns panel visibility, navigation, and the sidebar row.
 * @module dsh-taskboard/client/official-panel
 */
import * as React from 'react'
import type { BoardController } from './controller.ts'
import { TaskBoard } from './board/TaskBoard.tsx'
import { translate } from './i18n/runtime.ts'
import { installWindowInset } from './window-inset.ts'

/** Panel id shared by the sidebar row and the main-slot occupant. */
export const OFFICIAL_PANEL_ID = 'dsh-taskboard'

/** Narrow face of the ctx.slots service used here. */
interface SlotsServiceFace {
  inject(key: string, callback: () => unknown): () => void
  register(options: Record<string, unknown>, component: (props: never) => React.ReactNode): () => void
}

/** Narrow layout face (ctx.layout) for closing back to the Conversation. */
interface LayoutServiceFace {
  selectPanel(panelId: null): void
}

/** Effect-hook face the runner provides on the client context. */
export interface MountContextFace {
  get?(name: string): unknown
}

/** Row order among the global panel rows (插件 sits at 0; ours follows). */
const PANEL_ROW_ORDER = 10
// ------------------------------------------------------------------ page

/** Build the board page; the host renderer owns its React root. */
function makeBoardPage(controller: BoardController): (props: Record<string, unknown>) => React.ReactNode {
  return function BoardPage(): React.ReactNode {
    const ref = React.useRef<HTMLDivElement>(null)
    React.useLayoutEffect(() => {
      if (ref.current !== null) return installWindowInset(ref.current)
    }, [])
    return React.createElement(
      'div',
      { 'data-dsh-atb-panel-root': '', ref, className: 'dsh-atb-panel-root' },
      React.createElement(TaskBoard, { controller }),
    )
  }
}

// ------------------------------------------------------------------ icon

/**
 * The sidebar row glyph: the kanban icon plus live status counts from the
 * controller snapshot. Wide sidebar renders the tri-color digit strip
 * beside the icon; the collapsed rail renders a compact
 * todo-count corner badge. The full breakdown rides the tooltip.
 */
function makePanelIcon(controller: BoardController): (props: { size?: number } & Record<string, unknown>) => React.ReactNode {
  return function OfficialPanelIcon(props: { size?: number } & Record<string, unknown>): React.ReactNode {
    const size = typeof props.size === 'number' ? props.size : 16
    const subscribe = React.useCallback((listener: () => void) => controller.subscribe(listener), [controller])
    const getSnapshot = React.useCallback(() => controller.getSnapshot(), [controller])
    const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    const counts = React.useMemo(() => {
      let todo = 0
      let doing = 0
      let review = 0
      for (const task of state.ledger.tasks) {
        if (task.trashedAt !== undefined) continue
        if (task.status === 'todo') todo++
        else if (task.status === 'in_progress') doing++
        else if (task.status === 'in_review') review++
      }
      return { todo, doing, review }
    }, [state.ledger])
    // Wide/rail mode: the shell row button is 36×36 centered when collapsed —
    // measure it (ResizeObserver; falls back to wide when unavailable).
    const [wide, setWide] = React.useState(true)
    const glyphRef = React.useRef<HTMLSpanElement>(null)
    React.useLayoutEffect(() => {
      const row = glyphRef.current?.closest('button')
      if (row == null || typeof ResizeObserver === 'undefined') return
      const update = () => { setWide(row.clientWidth > 44) }
      update()
      const observer = new ResizeObserver(update)
      observer.observe(row)
      return () => observer.disconnect()
    }, [])
    const title = translate('shared.stats.title', { todo: counts.todo, doing: counts.doing, review: counts.review })
    return React.createElement(
      'span',
      { className: 'dsh-atb-pglyph', ref: glyphRef },
      // Icon + corner badge live in their own positioning layer: the badge
      // anchors to the ICON, while the stats strip (below, absolute) anchors
      // to the shell ROW through the stylesheet's :has() rule — the glyph
      // itself stays static so it never becomes the strip's containing block.
      React.createElement(
        'span',
        { className: 'dsh-atb-picon' },
        React.createElement(
          'svg',
          {
            width: size,
            height: size,
            viewBox: '0 0 16 16',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.3,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
          },
          React.createElement('rect', { x: 2, y: 2, width: 12, height: 12, rx: 2 }),
          React.createElement('path', { d: 'M6 2v12M10 2v12' }),
        ),
        !wide && counts.todo > 0
          ? React.createElement('span', { className: 'dsh-atb-pbadge', title, 'aria-hidden': true }, counts.todo)
          : null,
      ),
      // Place the counts at the row's right edge, separated by |.
      wide && (counts.todo > 0 || counts.doing > 0 || counts.review > 0)
        ? React.createElement(
          'span',
          { className: 'dsh-atb-pstats', title, 'aria-hidden': true },
          React.createElement('span', { 'data-stat': 'todo' }, counts.todo),
          React.createElement('span', { className: 'dsh-atb-psep' }, '|'),
          React.createElement('span', { 'data-stat': 'in_progress' }, counts.doing),
          React.createElement('span', { className: 'dsh-atb-psep' }, '|'),
          React.createElement('span', { 'data-stat': 'in_review' }, counts.review),
        )
        : null,
    )
  }
}

// ------------------------------------------------------------------ mount

/** Register both panel slots; their service handles declarations that arrive later. */
export function mountBoardPanel(ctx: MountContextFace, controller: BoardController): () => void {
  const slots = ctx.get?.('slots') as SlotsServiceFace | undefined
  if (slots === undefined) throw new Error('dsh-taskboard requires the DSH panel service (DSH 0.1.7+)')
  const disposers: Array<() => void> = []
  const dispose = () => { for (const cleanup of disposers.splice(0).reverse()) cleanup() }
  try {
    const layout = ctx.get?.('layout') as LayoutServiceFace | undefined
    controller.installCloseRequester(() => { layout?.selectPanel(null) })
    disposers.push(() => { controller.installCloseRequester(undefined) })
    const page = makeBoardPage(controller) as unknown as (props: never) => React.ReactNode
    disposers.push(slots.inject('main', () => slots.register(
      { name: 'main', key: OFFICIAL_PANEL_ID }, page,
    )))
    const icon = makePanelIcon(controller) as unknown as (props: never) => React.ReactNode
    disposers.push(slots.inject('sidebar.panellist', () => slots.register(
      { name: 'sidebar.panellist', id: OFFICIAL_PANEL_ID, order: PANEL_ROW_ORDER, label: () => translate('shared.entry.label') }, icon,
    )))
  } catch (error) {
    dispose()
    throw error
  }
  return dispose
}

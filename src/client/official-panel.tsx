/**
 * Official slot-API mounting (0.8.0, dsh 0.1.7+): when the host shell runs
 * the slot system, the board registers as a FIRST-CLASS sidebar panel —
 * 'sidebar.panellist' contributes the row (the shell owns the button, its
 * active state, and panel switching) and 'main' hosts the board view under
 * the same panel id. No DOM injection, no data-dsh-atb-active attribute, no
 * CSS hiding — the panel-switching residue class of bugs (issue #31) is
 * structurally absent on this path.
 *
 * Compatibility: shells without the slot system (or without those two
 * slots) fall back to the legacy forced-DOM injection (sidebar-entry.ts +
 * board-mount.tsx), byte-for-byte unchanged. The two paths are strictly
 * mutually exclusive; a mid-registration failure tears down the partial
 * official registration and degrades to legacy.
 *
 * @module dsh-taskboard/client/official-panel
 */
import * as React from 'react'
import type { BoardController } from './controller.ts'
import { TaskBoard } from './board/TaskBoard.tsx'
import { translate } from './i18n/runtime.ts'
import { installWindowInset } from './window-inset.ts'
import { mountSidebarEntry } from './sidebar-entry.ts'
import { mountBoard } from './board-mount.tsx'

/** Panel id shared by the sidebar row and the main-slot occupant. */
export const OFFICIAL_PANEL_ID = 'dsh-taskboard'

/** Narrow face of the ctx.slots service used here. */
interface SlotsServiceFace {
  inject(key: string, callback: () => unknown): () => void
  register(options: Record<string, unknown>, component: (props: never) => React.ReactNode): () => void
  spec(key: string): unknown
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
/** Late-slot grace: retries before a shell present-but-undeclared state is
 *  finally treated as legacy (base bundles load before profile plugins, so
 *  this only covers exotic load orders). */
const PROBE_ROUNDS = 3
const PROBE_INTERVAL_MS = 350

/**
 * The slots service with both required slots declared, or undefined.
 * @param ctx - the client context.
 * @returns the usable slots face.
 */
function officialSlots(ctx: MountContextFace): SlotsServiceFace | undefined {
  const slots = (ctx.get?.('slots') ?? (ctx as unknown as Record<string, unknown>).slots) as SlotsServiceFace | undefined
  if (slots === undefined || typeof slots.register !== 'function' || typeof slots.inject !== 'function' || typeof slots.spec !== 'function') return undefined
  try {
    if (slots.spec('main') === undefined) return undefined
    if (slots.spec('sidebar.panellist') === undefined) return undefined
  } catch {
    return undefined
  }
  return slots
}

// ------------------------------------------------------------------ page

/**
 * Build the main-panel occupant for one controller: fills the central column
 * and hosts the very same TaskBoard React tree the legacy path mounts (the
 * host renderer owns the React root; the window inset rides on our wrapper
 * element, exactly like it rode on the legacy mount container).
 */
function makeBoardPage(controller: BoardController): (props: Record<string, unknown>) => React.ReactNode {
  return function OfficialBoardPage(): React.ReactNode {
    const ref = React.useCallback((element: HTMLDivElement | null) => {
      if (element === null) return
      // One live inset per element instance; React re-invokes the ref with
      // null before a replacement node, but the observers inside observe
      // ancestors, so a detached subtree silences them naturally.
      const key = '__dshAtbInsetDispose'
      const bag = element as unknown as Record<string, unknown>
      if (bag[key] !== undefined) return
      bag[key] = installWindowInset(element)
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
 * beside the icon (legacy parity); the collapsed rail renders a compact
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
  const glyphRef = React.useCallback((element: HTMLSpanElement | null) => {
    if (element === null || typeof ResizeObserver === 'undefined') return
    const row = element.closest('button')
    if (row === null) return
    const observer = new ResizeObserver(() => { setWide(row.clientWidth > 44) })
    observer.observe(row)
    // Observer lives for the element's lifetime; rows are never rebound.
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
          'stroke-width': 1.3,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'aria-hidden': true,
        },
        React.createElement('rect', { x: 2, y: 2, width: 12, height: 12, rx: 2 }),
        React.createElement('path', { d: 'M6 2v12M10 2v12' }),
      ),
      !wide && counts.todo > 0
        ? React.createElement('span', { className: 'dsh-atb-pbadge', title, 'aria-hidden': true }, counts.todo)
        : null,
    ),
    // Stats at the ROW's right edge (legacy parity: margin-left:auto in the
    // injected entry), with the legacy | separators.
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

/**
 * Register the official panel through a probed slots face.
 * @returns the disposer, or undefined when registration failed (partial
 * registrations are torn down before returning).
 */
function tryRegister(slots: SlotsServiceFace, ctx: MountContextFace, controller: BoardController): (() => void) | undefined {
  const disposers: Array<() => void> = []
  try {
    const layout = (ctx.get?.('layout') ?? (ctx as unknown as Record<string, unknown>).layout) as LayoutServiceFace | undefined
    // Close bridge: the only programmatic close (successful session jump)
    // hands the panel back to the Conversation through the layout service.
    controller.installCloseRequester(() => { layout?.selectPanel(null) })
    disposers.push(() => { controller.installCloseRequester(undefined) })

    const page = makeBoardPage(controller) as unknown as (props: never) => React.ReactNode
    disposers.push(slots.inject('main', () => slots.register(
      { name: 'main', key: OFFICIAL_PANEL_ID },
      page,
    )))

    const icon = makePanelIcon(controller) as unknown as (props: never) => React.ReactNode
    disposers.push(slots.inject('sidebar.panellist', () => slots.register(
      { name: 'sidebar.panellist', id: OFFICIAL_PANEL_ID, order: PANEL_ROW_ORDER, label: () => translate('shared.entry.label') },
      icon,
    )))
    console.info('[dsh-taskboard] official panel mode: registered', OFFICIAL_PANEL_ID)
  } catch (error) {
    console.error('[dsh-taskboard] official panel registration failed — falling back to legacy mounting:', error)
    for (const dispose of disposers.splice(0)) dispose()
    return undefined
  }
  return () => { for (const dispose of disposers.splice(0)) dispose() }
}

/**
 * Compat mount: official slot-API panel when the shell supports it, legacy
 * forced-DOM injection otherwise. When the slots service is present but the
 * two slots are not yet declared, mounts legacy first and upgrades within a
 * bounded grace window (never leaving the user without a board).
 * @param ctx - the client context.
 * @param controller - the board controller.
 * @returns disposer for whichever path is live (and the pending probe).
 */
export function mountBoardCompat(ctx: MountContextFace, controller: BoardController): () => void {
  const slots = officialSlots(ctx)
  if (slots !== undefined) {
    const dispose = tryRegister(slots, ctx, controller)
    if (dispose !== undefined) return dispose
  }
  let legacyDisposers: Array<() => void> = []
  const mountLegacy = (): void => {
    legacyDisposers = [mountSidebarEntry(controller), mountBoard(controller)]
  }
  mountLegacy()
  // Bounded late-slot grace: upgrade to the official panel if the slots
  // appear shortly after activation (exotic load orders only).
  let round = 0
  let upgraded: (() => void) | undefined
  const timer = setInterval(() => {
    round++
    const probed = officialSlots(ctx)
    if (probed !== undefined) {
      const dispose = tryRegister(probed, ctx, controller)
      if (dispose !== undefined) {
        upgraded = dispose
        clearInterval(timer)
        for (const d of legacyDisposers.splice(0)) d()
        return
      }
    }
    if (round >= PROBE_ROUNDS) clearInterval(timer)
  }, PROBE_INTERVAL_MS)
  return () => {
    clearInterval(timer)
    for (const d of legacyDisposers.splice(0)) d()
    upgraded?.()
  }
}

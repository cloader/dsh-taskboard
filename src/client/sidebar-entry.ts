/**
 * Sidebar entry injection — structure ported from the working dsh-web-ui
 * family implementations (dsh-ssh / dsh-client-ui-task-board, verified live
 * in this shell): scope to the sidebar root (the logoRow's parent), find the
 * New Session button inside it (newSession class → first direct-child BUTTON
 * → aria-label/text fallbacks), and insert the entry as a direct child of
 * that root next to the logo row. A body-level MutationObserver waits for
 * the shell and self-heals React re-renders; a slow timer covers shells that
 * mount late without further mutations.
 *
 * The row is plain DOM (no React tree) so it can never disturb the shell's
 * reconciliation; the board view it toggles is a separate React root mounted
 * in the center column (see board-mount.tsx).
 *
 * @module dsh-taskboard/client/sidebar-entry
 */
import type { BoardController } from './controller.ts'

/** Stable data attribute identifying this entry row. */
export const ENTRY_SELECTOR = '[data-dsh-atb-entry]'

/** Inline icon (16px nav-icon look). */
const ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M6.5 6.5v7"/></svg>'

/**
 * Find the sidebar shell root element, or undefined while not yet mounted.
 * (Same as the working family plugins: sidebarCol pane → logoRow owner.)
 */
function sidebarRoot(): HTMLElement | undefined {
  const column = document.querySelector<HTMLElement>(
    '[data-pane="sidebar"], [class*="sidebarCol"], [class*="sidebarPane"], [class*="leftCol"]',
  )
  if (column !== null) {
    if (anchorMisses > 0) anchorMisses = 0
    const logoOwner = column.querySelector<HTMLElement>('[class*="logoRow"]')?.parentElement
    return logoOwner ?? (column.firstElementChild as HTMLElement | undefined)
  }
  const rescued = lastResortRoot()
  if (rescued === undefined) {
    anchorMisses += 1
    if (anchorMisses === 5 || anchorMisses === 30 || anchorMisses % 120 === 0) {
      console.warn(
        '[dsh-taskboard] sidebar anchor miss x' + anchorMisses +
        ': no data-pane=sidebar / sidebarCol / sidebarPane / leftCol / new-session button container. ' +
        'If persistent, report with a DevTools Elements screenshot of the left rail to cloader/dsh-taskboard#6',
      )
    }
  } else if (anchorMisses > 0) {
    console.info('[dsh-taskboard] placement recovered via new-session fallback root')
    anchorMisses = 0
  }
  return rescued
}

/**
 * The New Session button is the one sidebar element whose user-facing text is
 * shell-stable, so its container chain is the last-resort root when every
 * structural class hook is missing. Added after v3.68x desktop shells renamed
 * their hashed pane classes without leaving any data-pane hook (#6).
 */
function lastResortRoot(): HTMLElement | undefined {
  const candidate = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    button => !button.matches(ENTRY_SELECTOR) && /新会话|新建会话|new session/i.test(button.textContent ?? ''),
  )
  // Climb one level above the logo row so the placed entry survives sibling
  // re-renders of the rail.
  const parent = candidate?.parentElement as HTMLElement | undefined
  return (parent?.parentElement ?? parent) as HTMLElement | undefined
}

let anchorMisses = 0

/**
 * The New Session button: nested in the logo row on current shells, a direct
 * child BUTTON on the real shell (the family plugins' fallback), with
 * aria-label/text fallbacks for other shells. The direct-child scan skips
 * our own entry (0.4.1): on shells where the insertion anchor lands inside a
 * class-carrying container, a self-referential anchor would pin the entry
 * against that container's own geometry instead of the family block.
 */
function newSessionButton(root: HTMLElement): HTMLButtonElement | undefined {
  const nested = root.querySelector<HTMLButtonElement>('button[class*="newSession"]')
  if (nested !== null) return nested
  for (const child of root.children) {
    if (child instanceof HTMLButtonElement && !child.matches(ENTRY_SELECTOR)) return child
  }
  const byAria = root.querySelector<HTMLButtonElement>(
    'button[aria-label="新建会话"], button[aria-label="New Session"], button[aria-label*="新会话"], button[aria-label*="new session" i]',
  )
  if (byAria !== null) return byAria
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button'))
  return buttons.find(button => !button.matches(ENTRY_SELECTOR) && /新会话|新建会话|new session/i.test(button.textContent ?? ''))
}

/** Build the entry row (a detached button; insert once the shell is up). */
function createEntry(controller: BoardController): HTMLButtonElement {
  const entry = document.createElement('button')
  entry.type = 'button'
  entry.dataset.dshAtbEntry = ''
  entry.className = 'dsh-atb-entry'
  entry.setAttribute('aria-label', 'Agent 任务看板')
  entry.innerHTML = `<span class="dsh-atb-entry-icon">${ICON}</span><span class="dsh-atb-entry-label">任务看板</span><span class="dsh-atb-entry-stats"></span>`
  entry.addEventListener('click', () => { controller.toggleBoard() })
  return entry
}

/**
 * Live status counts shown at the right of the entry row:
 * `[todo, in_progress, in_review]` (trashed tasks excluded).
 */
function entryStats(controller: BoardController): [number, number, number] {
  let todo = 0
  let inProgress = 0
  let inReview = 0
  for (const task of controller.getSnapshot().ledger.tasks) {
    if (task.trashedAt !== undefined) continue
    if (task.status === 'todo') todo++
    else if (task.status === 'in_progress') inProgress++
    else if (task.status === 'in_review') inReview++
  }
  return [todo, inProgress, inReview]
}

/**
 * Set one rolling-number slot. Unchanged values no-op; changes animate the
 * old value out and the new value in with a vertical scroll (up when the
 * count grows, down when it shrinks). Plain DOM, no React.
 */
function setRollValue(slot: HTMLElement, value: number): void {
  const text = String(value)
  if (slot.dataset.value === text) return
  const previous = slot.dataset.value
  slot.dataset.value = text
  slot.style.minWidth = `${text.length}ch`
  // First render (no previous value): plain text, no animation.
  if (previous === undefined) {
    slot.textContent = text
    return
  }
  // Finalize any in-flight animation before starting the next one.
  if (slot.dataset.busy === '1') {
    slot.dataset.busy = ''
    slot.dataset.anim = ''
  }
  const oldEl = document.createElement('span')
  oldEl.className = 'dsh-atb-rn'
  oldEl.textContent = previous
  const newEl = document.createElement('span')
  newEl.className = 'dsh-atb-rn dsh-atb-rn-next'
  newEl.textContent = text
  slot.replaceChildren(oldEl, newEl)
  // Grow → the strip scrolls up (new enters from below); shrink → down.
  slot.dataset.dir = value > Number(previous) ? 'up' : 'down'
  slot.dataset.busy = '1'
  requestAnimationFrame(() => { slot.dataset.anim = '1' })
  const finish = (): void => {
    if (slot.dataset.busy !== '1') return
    slot.dataset.busy = ''
    slot.dataset.anim = ''
    slot.textContent = slot.dataset.value ?? ''
  }
  slot.addEventListener('transitionend', finish, { once: true })
  // Fallback when transitionend never fires (hidden tab, reduced motion).
  setTimeout(finish, 400)
}

/**
 * Wire the stats strip into the entry: builds the three slots and keeps them
 * (plus the tooltip) in sync with every controller emit.
 * @returns the update function (also called once immediately).
 */
function wireStats(entry: HTMLButtonElement, controller: BoardController): () => void {
  const stats = entry.querySelector<HTMLElement>('.dsh-atb-entry-stats')
  if (stats === null) return () => {}
  // Slot order = [todo, in_progress, in_review]; each slot carries its status
  // in data-stat so the stylesheet colors the digits (see .dsh-atb-roll).
  const statKeys = ['todo', 'in_progress', 'in_review'] as const
  const slots: HTMLElement[] = []
  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      const sep = document.createElement('span')
      sep.className = 'dsh-atb-entry-sep'
      sep.textContent = '|'
      stats.append(sep)
    }
    const slot = document.createElement('span')
    slot.className = 'dsh-atb-roll'
    slot.dataset.stat = statKeys[i]
    stats.append(slot)
    slots.push(slot)
  }
  const update = (): void => {
    const [todo, inProgress, inReview] = entryStats(controller)
    setRollValue(slots[0]!, todo)
    setRollValue(slots[1]!, inProgress)
    setRollValue(slots[2]!, inReview)
    stats.title = `待办 ${todo} ｜ 进行中 ${inProgress} ｜ 待验收 ${inReview}（待办|进行中|待验收）`
  }
  return update
}

/** Re-insert the entry after the New Session row (before the browser region). */
function placeEntry(root: HTMLElement, entry: HTMLButtonElement): boolean {
  const button = newSessionButton(root)
  if (button === undefined) return false
  if (entry.parentElement !== root) {
    // Position relative to the family block (entries injected by sibling
    // plugins), never relative to transient logoRow geometry: every family
    // plugin that self-heals during a re-render then lands in the same
    // relative order. No append-to-end fallback: appending at the end would
    // randomly reorder the block after a shell re-render.
    const row = button.closest('[class*="logoRow"]')
    const base = (row !== null && row.parentElement === root) ? row : button
    const family = Array.from(root.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el.matches('[data-dsh-atb-entry], [data-dsh-taskboard-entry], [data-dsh-ssh-entry]'),
    )
    // taskboard sits before the whole family block.
    const anchor = family.length > 0 ? (family[0] ?? null) : (base.nextElementSibling ?? null)
    root.insertBefore(entry, anchor)
  }
  return true
}

/** Debug counters (window.__atbDebug) — evidence if the entry fails to appear. */
interface AtbDebug { attempts: number; found: boolean; placed: boolean }

/**
 * Mount the sidebar entry, waiting for the shell to render and self-healing
 * on later React re-renders.
 * @param controller - the board controller the entry toggles.
 * @returns disposer removing the entry and its observers.
 */
export function mountSidebarEntry(controller: BoardController): () => void {
  const entry = createEntry(controller)
  const debug: AtbDebug = { attempts: 0, found: false, placed: false }
  // Debug handle only where the GUI runs locally; never on remote origins.
  const host = globalThis.location?.hostname
  if (host === 'localhost' || host === '127.0.0.1') {
    ;(window as unknown as { __atbDebug?: AtbDebug }).__atbDebug = debug
  }
  let root: HTMLElement | undefined
  let placed = false

  const tryPlace = (): void => {
    debug.attempts++
    if (root !== undefined && !root.isConnected) {
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    if (placed) {
      if (document.body.contains(entry)) return
      rootObserver.disconnect()
      root = undefined
      placed = false
    }
    root ??= sidebarRoot()
    if (root === undefined) return
    debug.found = newSessionButton(root) !== undefined
    placed = placeEntry(root, entry)
    debug.placed = placed
    if (placed) {
      rootObserver.observe(root, { childList: true, subtree: true })
    }
  }

  // Body-level watcher as the whole-rebuild fallback.
  const waitObserver = new MutationObserver(() => { tryPlace() })
  waitObserver.observe(document.body, { childList: true, subtree: true })

  // Self-heal: re-insert in the same frame when a re-render displaces the row.
  const rootObserver = new MutationObserver(() => {
    if (root === undefined || !root.isConnected) {
      placed = false
      tryPlace()
      return
    }
    if (!root.contains(entry)) {
      placed = placeEntry(root, entry)
    }
  })

  // Belt-and-braces: a late shell mount that triggers no further mutations
  // still gets periodic retries (the family plugins rely on mutation traffic
  // alone; the timer costs one cheap contains-check per tick once placed).
  const retry = setInterval(() => { tryPlace() }, 2_000)

  const syncStats = wireStats(entry, controller)
  const syncActive = () => {
    if (controller.getSnapshot().boardOpen) entry.dataset.active = 'true'
    else delete entry.dataset.active
    syncStats()
  }
  const unsubscribe = controller.subscribe(syncActive)
  syncActive()

  tryPlace()

  return () => {
    clearInterval(retry)
    waitObserver.disconnect()
    rootObserver.disconnect()
    unsubscribe()
    entry.remove()
  }
}

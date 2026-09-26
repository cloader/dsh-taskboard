/**
 * Session jump: resolve an execution's session against the runtime's live
 * session list and open it in the GUI.
 *
 * NAVIGATION OWNER (DSH 0.1.6+): the runtime's `sessions` service owns only
 * the list mirror (`list.getSnapshot().byId`) and the catalog; its `open()`
 * selector existed through 0.1.5 and was REMOVED in 0.1.6 — see the ISessions
 * contract, "Host catalog and local reference-source counts; navigation
 * belongs to view owners". The documented navigation entry is now
 * `uiWorkspace.openSession(target)`: "Select a Session and show its
 * Conversation as one UI navigation action". The workspace service carries the
 * registry-global archive set.
 *
 * Reading a service method the runtime no longer ships yields `undefined`, and
 * calling it throws — historically swallowed into a bare 'unavailable' notice,
 * which is how the `sessions.open` removal silently disabled this button on
 * every 0.1.7 runtime. Resolution is therefore structural: prefer the
 * navigation owner, fall back to the legacy selector only while it actually
 * exists, and report 'unavailable' only when neither is present.
 *
 * Outcomes are split so the UI can prompt precisely:
 * - `opened`     — staged and opened; the board closes over it.
 * - `archived`   — in the list but archived (hidden from the sidebar; its log
 *                  survives, so it is distinguishable from deletion).
 * - `missing`    — absent from the live list: deleted.
 * - `unavailable`— no navigation entry is present on this runtime.
 *
 * Service resolution is deliberately LAZY (per click): plugin apply may run
 * before the runtime provides these services, and a once-captured undefined
 * would permanently disable the jump. When the id misses, the list mirror may
 * also simply lag (reconnect re-pull, late mount): one `refresh()` is awaited
 * and the lookup retried before deciding.
 *
 * @module dsh-taskboard/client/session-jump
 */

/** Outcome of one jump attempt. */
export type SessionJumpResult =
  | 'opened'
  | 'archived'
  | 'missing'
  | 'unavailable'

/** Narrow face of the runtime `sessions` service this module needs. */
export interface SessionsServiceFace {
  /**
   * Legacy selector, present through DSH 0.1.5 and gone from 0.1.6 on.
   * Optional on purpose: a runtime without it must not turn the whole jump
   * into a type error, and an absent method is detected, not called.
   */
  open?(id: string): void
  /** Re-pull the session list baseline (mirror catch-up). */
  refresh(): Promise<void>
  /** Live session list snapshot. */
  list: {
    getSnapshot(): {
      byId: Record<string, unknown>
    }
  }
}

/** Narrow face of the runtime `workspaces` service this module needs. */
export interface WorkspacesServiceFace {
  /** Workspace list snapshot (carries the archive set). */
  list: {
    getSnapshot(): {
      archivedSessionIds: readonly string[]
    }
  }
}

/** Narrow face of the runtime `uiWorkspace` navigation service (0.1.6+). */
export interface UiWorkspaceFace {
  /** Select a Session and show its Conversation as one UI navigation action. */
  openSession(id: string): void
}

/** Lazy per-click service resolution (services may appear after apply). */
export interface SessionServiceAccess {
  /** The runtime sessions service, when currently provided. */
  getSessions(): SessionsServiceFace | undefined
  /** The runtime workspaces service, when currently provided (optional). */
  getWorkspaces(): WorkspacesServiceFace | undefined
  /** The runtime navigation owner, when currently provided (optional). */
  getUiWorkspace?(): UiWorkspaceFace | undefined
}

/**
 * Build the jump function the controller installs.
 * @param access - lazy service accessors, consulted on every jump.
 * @returns the jump function: `(sessionId) => Promise<SessionJumpResult>`.
 */
export function createSessionJumper(access: SessionServiceAccess): (sessionId: string) => Promise<SessionJumpResult> {
  const lookup = (sessions: SessionsServiceFace, workspaces: WorkspacesServiceFace | undefined, sessionId: string): 'openable' | 'archived' | 'absent' => {
    const list = sessions.list.getSnapshot()
    if (list.byId[sessionId] === undefined) return 'absent'
    const archived = workspaces?.list.getSnapshot().archivedSessionIds.includes(sessionId) ?? false
    return archived ? 'archived' : 'openable'
  }
  /**
   * Hand the id to whichever navigation entry this runtime actually ships.
   * Structural check first (a missing method must never be called), so an
   * absent entry becomes an outcome instead of a swallowed TypeError.
   * @param sessions - the resolved sessions service.
   * @param sessionId - the listed session to show.
   * @returns true when some entry took the navigation.
   */
  const navigate = (sessions: SessionsServiceFace, sessionId: string): boolean => {
    const nav = access.getUiWorkspace?.()
    if (typeof nav?.openSession === 'function') {
      nav.openSession(sessionId)
      return true
    }
    if (typeof sessions.open === 'function') {
      sessions.open(sessionId)
      return true
    }
    return false
  }
  return async (sessionId: string): Promise<SessionJumpResult> => {
    const sessions = access.getSessions()
    if (sessions === undefined) return 'unavailable'
    try {
      let state = lookup(sessions, access.getWorkspaces(), sessionId)
      if (state === 'absent') {
        // Only the absent case can be a lagging mirror (reconnect re-pull,
        // late mount); archived is a definitive verdict. One refresh, re-check.
        try { await sessions.refresh() } catch { /* keep the pre-refresh verdict */ }
        state = lookup(sessions, access.getWorkspaces(), sessionId)
      }
      if (state === 'archived') return 'archived'
      if (state === 'absent') return 'missing'
      return navigate(sessions, sessionId) ? 'opened' : 'unavailable'
    } catch {
      return 'unavailable'
    }
  }
}

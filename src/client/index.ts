/**
 * Browser half entry for dsh-taskboard: wires the route client and the
 * board controller, exposes the model catalog (via the runtime's llm.models
 * RPC when the connection service is present), mounts the sidebar entry and
 * the board view.
 *
 * Failure policy: DOM mounting problems are logged, never thrown — the web
 * shell fails the whole boot when a plugin apply throws.
 *
 * Export shape: `name` / `inject` / `apply`, no default.
 *
 * @module dsh-taskboard/client
 */
import { createClient } from './api.ts'
import { BoardController } from './controller.ts'
import { injectStyles } from './styles.ts'
import { mountSidebarEntry } from './sidebar-entry.ts'
import { mountBoard } from './board-mount.tsx'
import { createSessionJumper, type SessionsServiceFace, type WorkspacesServiceFace } from './session-jump.ts'

/** Client plugin name. */
export const name = 'dsh-taskboard/client'

/** Required client services (fiber inject waiting). */
export const inject = ['connection']

/** Narrow connection face for the model catalog + preset roster. */
interface ConnectionFace {
  api: {
    llm: {
      models(payload: Record<string, never>): Promise<{
        result: {
          ok: true
          value: {
            groups: Array<{
              id: string
              name: string
              models: Array<{
                id: string
                name?: string
                reasoning?: {
                  efforts: Array<{ id: string; name: string; description?: string }>
                  defaultEffort?: string
                }
              }>
            }>
          }
        } | { ok: false }
      }>
    }
    agentPresets?: {
      list(payload: Record<string, never>): Promise<{ result: { ok: true; value: { presets: Array<{ id: string; name?: string; isDefault: boolean }> } } | { ok: false } }>
    }
  }
}

/** Effect-hook face the runner provides on the client context. */
interface ClientContextFace {
  get?(name: string): unknown
  effect?(fn: () => unknown, label?: string): void
}

/**
 * Client entry: installs styles, starts the controller, mounts DOM seats.
 * @param ctx - the cordis client context.
 */
export function apply(ctx: ClientContextFace): void {
  try {
    injectStyles()
    const client = createClient()
    const controller = new BoardController(client)

    // Model catalog for the composer: llm.models over the connection RPC —
    // installed through the controller's formal installer (T13: no more
    // monkeypatched instance properties).
    const connection = ctx.get?.('connection') as ConnectionFace | undefined
    if (connection !== undefined) {
      type CatalogRow = {
        provider: string
        model: string
        name?: string
        reasoning?: {
          efforts: Array<{ id: string; name: string; description?: string }>
          defaultEffort?: string
        }
      }
      controller.installModelCatalog(async (): Promise<CatalogRow[]> => {
        const response = await connection.api.llm.models({})
        if (!response.result.ok) return []
        const out: CatalogRow[] = []
        for (const group of response.result.value.groups) {
          for (const model of group.models) {
            out.push({
              provider: group.id,
              model: model.id,
              name: model.name,
              ...(model.reasoning !== undefined ? { reasoning: model.reasoning } : {}),
            })
          }
        }
        return out
      })

      // Preset roster for the composer (0.3.3): agentPreset.list over the
      // connection RPC — [{id, name}] plus which one is the deployment
      // default (the form pre-selects it on create).
      type PresetRow = { id: string; name?: string }
      controller.installPresetRoster(async (): Promise<{ presets: PresetRow[]; defaultId?: string }> => {
        const list = connection.api.agentPresets
        if (list === undefined) return { presets: [] }
        const response = await list.list({})
        if (!response.result.ok) return { presets: [] }
        const presets = response.result.value.presets.map((p: { id: string; name?: string }) => ({ id: p.id, name: p.name }))
        const def = response.result.value.presets.find((p: { id: string; isDefault: boolean }) => p.isDefault)
        return { presets, ...(def !== undefined ? { defaultId: def.id } : {}) }
      })
    }

    // Session navigation for execution rows: resolved LAZILY on every jump —
    // apply may run before the runtime provides the services, and a captured
    // undefined would permanently disable the jump. On a platform without
    // them the jump degrades to an 'unavailable' notice instead of failing.
    controller.installSessionJumper(createSessionJumper({
      getSessions: () => ctx.get?.('sessions') as SessionsServiceFace | undefined,
      getWorkspaces: () => ctx.get?.('workspaces') as WorkspacesServiceFace | undefined,
    }))

    controller.start()
    const disposers: Array<() => void> = []
    try {
      disposers.push(mountSidebarEntry(controller))
      disposers.push(mountBoard(controller))
    } catch (error) {
      // DOM failures degrade the board, never the GUI.
      console.error('[dsh-taskboard] mount failed:', error)
    }
    // cordis effect semantics: the callback runs immediately and its RETURN
    // VALUE is the disposer (family-plugin precedent: () => () => {...}).
    // A single-layer arrow here executes the teardown immediately.
    // The stylesheet itself is NOT removed here: the HMR driver owns removal
    // of tagged styles on this plugin's rebuild (and a self-removal could
    // race a same-lifetime re-apply); its rules are dsh-atb-* scoped, so a
    // leftover tag after a full disable is inert.
    ctx.effect?.(() => () => {
      for (const d of disposers.splice(0)) d()
      controller.dispose()
    }, 'dsh-taskboard: client mount')
  } catch (error) {
    console.error('[dsh-taskboard] client half failed to start:', error)
  }
}

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

    // Model catalog for the composer (0.5.5): multi-tier discovery
    // 1. DSH ui-model-selection service: ctx.get('modelDirectories')?.catalog?.load()
    // 2. DSH Remote RPC: ctx.get('remote')?.session?.modelCatalog()
    // 3. Legacy connection.api face if present
    // 4. Taskboard host endpoint: /dsh-taskboard/model-catalog
    type CatalogRow = {
      provider: string
      model: string
      name?: string
      description?: string
      reasoning?: {
        efforts: Array<{ id: string; name: string; description?: string }>
        defaultEffort?: string
      }
    }
    controller.installModelCatalog(async (): Promise<CatalogRow[]> => {
      // 1. DSH ui-model-selection service
      try {
        const modelDirs = (ctx.get?.('modelDirectories') ?? (ctx as Record<string, unknown>).modelDirectories) as {
          catalog?: { load: () => Promise<{ groups: Array<{ id: string; name: string; models: Array<{ id: string; name?: string; description?: string; reasoning?: { efforts: Array<{ id: string; name: string; description?: string }>; defaultEffort?: string } }> }> }> }
        } | undefined
        if (modelDirs?.catalog?.load !== undefined) {
          const res = await modelDirs.catalog.load()
          if (res?.groups !== undefined && res.groups.length > 0) {
            const out: CatalogRow[] = []
            for (const group of res.groups) {
              for (const model of group.models) {
                out.push({
                  provider: group.id,
                  model: model.id,
                  name: model.name,
                  ...(model.description !== undefined ? { description: model.description } : {}),
                  ...(model.reasoning !== undefined ? { reasoning: model.reasoning } : {}),
                })
              }
            }
            if (out.length > 0) return out
          }
        }
      } catch { /* try next */ }

      // 2. DSH Remote RPC
      try {
        const remote = (ctx.get?.('remote') ?? (ctx as Record<string, unknown>).remote) as {
          session?: { modelCatalog: () => Promise<{ ok: boolean; value?: { groups: Array<{ id: string; name: string; models: Array<{ id: string; name?: string; description?: string; reasoning?: { efforts: Array<{ id: string; name: string; description?: string }>; defaultEffort?: string } }> }> } }> }
          llm?: { models: (payload: Record<string, never>) => Promise<{ result: { ok: true; value: { groups: Array<{ id: string; name: string; models: Array<{ id: string; name?: string; description?: string; reasoning?: { efforts: Array<{ id: string; name: string; description?: string }>; defaultEffort?: string } }> }> } } | { ok: false } }> }
        } | undefined

        if (remote?.session?.modelCatalog !== undefined) {
          const res = await remote.session.modelCatalog()
          if (res.ok && res.value?.groups !== undefined && res.value.groups.length > 0) {
            const out: CatalogRow[] = []
            for (const group of res.value.groups) {
              for (const model of group.models) {
                out.push({
                  provider: group.id,
                  model: model.id,
                  name: model.name,
                  ...(model.description !== undefined ? { description: model.description } : {}),
                  ...(model.reasoning !== undefined ? { reasoning: model.reasoning } : {}),
                })
              }
            }
            if (out.length > 0) return out
          }
        }

        if (remote?.llm?.models !== undefined) {
          const res = await remote.llm.models({})
          if (res.result.ok && res.result.value?.groups !== undefined && res.result.value.groups.length > 0) {
            const out: CatalogRow[] = []
            for (const group of res.result.value.groups) {
              for (const model of group.models) {
                out.push({
                  provider: group.id,
                  model: model.id,
                  name: model.name,
                  ...(model.description !== undefined ? { description: model.description } : {}),
                  ...(model.reasoning !== undefined ? { reasoning: model.reasoning } : {}),
                })
              }
            }
            if (out.length > 0) return out
          }
        }
      } catch { /* try next */ }

      // 3. Legacy connection.api
      try {
        const connection = (ctx.get?.('connection') ?? (ctx as Record<string, unknown>).connection) as {
          api?: {
            llm?: {
              models: (payload: Record<string, never>) => Promise<{ result: { ok: true; value: { groups: Array<{ id: string; name: string; models: Array<{ id: string; name?: string; description?: string; reasoning?: { efforts: Array<{ id: string; name: string; description?: string }>; defaultEffort?: string } }> }> } } | { ok: false } }>
            }
          }
        } | undefined
        if (connection?.api?.llm?.models !== undefined) {
          const res = await connection.api.llm.models({})
          if (res.result.ok && res.result.value?.groups !== undefined && res.result.value.groups.length > 0) {
            const out: CatalogRow[] = []
            for (const group of res.result.value.groups) {
              for (const model of group.models) {
                out.push({
                  provider: group.id,
                  model: model.id,
                  name: model.name,
                  ...(model.description !== undefined ? { description: model.description } : {}),
                  ...(model.reasoning !== undefined ? { reasoning: model.reasoning } : {}),
                })
              }
            }
            if (out.length > 0) return out
          }
        }
      } catch { /* try next */ }

      // 4. Taskboard host endpoint: /dsh-taskboard/model-catalog
      try {
        const res = await client.modelCatalog()
        if (res.models !== undefined && res.models.length > 0) {
          return res.models
        }
      } catch { /* none */ }

      return []
    })

    // Preset roster for the composer (0.3.3 / 0.5.5)
    type PresetRow = { id: string; name?: string }
    controller.installPresetRoster(async (): Promise<{ presets: PresetRow[]; defaultId?: string }> => {
      // 1. DSH Remote RPC: ctx.get('remote')?.agentPresets?.list()
      try {
        const remote = (ctx.get?.('remote') ?? (ctx as Record<string, unknown>).remote) as {
          agentPresets?: { list: () => Promise<{ ok: boolean; value?: { presets: Array<{ id: string; name?: string; isDefault?: boolean }> } } | { result: { ok: true; value: { presets: Array<{ id: string; name?: string; isDefault?: boolean }> } } }> }
        } | undefined
        if (remote?.agentPresets?.list !== undefined) {
          const res = await remote.agentPresets.list()
          const rawPresets = (res as { ok?: boolean; value?: { presets?: Array<{ id: string; name?: string; isDefault?: boolean }> } }).ok === true
            ? (res as { value: { presets: Array<{ id: string; name?: string; isDefault?: boolean }> } }).value.presets
            : (res as { result?: { ok?: boolean; value?: { presets?: Array<{ id: string; name?: string; isDefault?: boolean }> } } }).result?.ok === true
              ? (res as { result: { value: { presets: Array<{ id: string; name?: string; isDefault?: boolean }> } } }).result.value.presets
              : undefined
          if (rawPresets !== undefined && rawPresets.length > 0) {
            const presets = rawPresets.map(p => ({ id: p.id, name: p.name }))
            const def = rawPresets.find(p => p.isDefault)
            return { presets, ...(def !== undefined ? { defaultId: def.id } : {}) }
          }
        }
      } catch { /* try next */ }

      // 2. Legacy connection.api
      try {
        const connection = (ctx.get?.('connection') ?? (ctx as Record<string, unknown>).connection) as {
          api?: {
            agentPresets?: {
              list: (payload: Record<string, never>) => Promise<{ result: { ok: true; value: { presets: Array<{ id: string; name?: string; isDefault: boolean }> } } | { ok: false } }>
            }
          }
        } | undefined
        if (connection?.api?.agentPresets?.list !== undefined) {
          const res = await connection.api.agentPresets.list({})
          if (res.result.ok && res.result.value?.presets !== undefined && res.result.value.presets.length > 0) {
            const presets = res.result.value.presets.map(p => ({ id: p.id, name: p.name }))
            const def = res.result.value.presets.find(p => p.isDefault)
            return { presets, ...(def !== undefined ? { defaultId: def.id } : {}) }
          }
        }
      } catch { /* try next */ }

      // 3. Taskboard host endpoint: /dsh-taskboard/model-catalog
      try {
        const res = await client.modelCatalog()
        if (res.presets !== undefined && res.presets.length > 0) {
          return { presets: res.presets, ...(res.defaultPresetId !== undefined ? { defaultId: res.defaultPresetId } : {}) }
        }
      } catch { /* none */ }

      return { presets: [] }
    })

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

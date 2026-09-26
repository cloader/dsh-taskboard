/**
 * Host loader entry for dsh-taskboard.
 *
 * Wiring: the configurable local data stores, the ten
 * `taskboard_*` agent tools, the agent workflow-protocol system-prompt
 * section, the /taskboard JSON+SSE routes (when a webServer is served),
 * the host execution service (fresh in-project sessions, pinned models), and
 * the host-side cron scheduler for scheduled tasks.
 *
 * Export shape follows the dsh-tool-todo lesson: a function/namespace plugin —
 * `name` / `inject` / `apply`, NO default export.
 *
 * @module dsh-taskboard
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only module imports: they load the cordis Context augmentations
// (ctx.tools / ctx.systemPrompt / ctx.agents) and vanish at compile time —
// the built host half keeps ZERO runtime @deepseek-ai imports.
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-agent'
import { PROTOCOL_SECTION_NAME, PROTOCOL_SECTION_ORDER, TASKBOARD_PROTOCOL } from './host/protocol-text.ts'
import { ExecutionService, type EventsFace } from './host/execution.ts'
import { dispatchIntervalMsOf, DEFAULT_MAX_CONCURRENT, maxConcurrentOf, queueMaxAgeMinutesOf, scheduleMissedAfterMinutesOf } from './shared/protocol.ts'
import { scheduledSessionResumer, type ScheduledSessionDeps } from './host/scheduled-session.ts'
import { createGitFace } from './host/git.ts'
import { createRepoScanner } from './host/repos.ts'
import { registerTaskboardRoutes } from './host/routes.ts'
import { SchedulerService } from './host/scheduler.ts'
import { dshHomePath } from './host/sdk.ts'
import { TaskStore } from './host/store.ts'
import { TemplateStore } from './host/templates.ts'
import { ExternalSessionSyncService } from './host/session-sync.ts'
import { ERR, ToolError, registerTaskboardTools, workspaceFace, type WorkspaceFace } from './host/tools.ts'
import { AssetStore } from './host/assets.ts'
import { STORAGE_CONFIG_FILE, StorageCoordinator } from './host/storage.ts'

/** Ledger file name under the active taskboard data directory. */
export const LEDGER_FILE = 'dsh-taskboard.json'

/** Task-template side file name under the active data directory. */
export const TEMPLATES_FILE = 'dsh-taskboard-templates.json'

/** Content-addressed image attachment directory under the active data directory. */
export const ASSETS_DIR = 'dsh-taskboard-assets'

/** Cordis plugin name. */
export const name = 'dsh-taskboard'

/** Required host services (tool registry + prompt assembly). */
export const inject = ['tools', 'systemPrompt']

/**
 * Mount the host half.
 * @param ctx - the plugin context (tools + systemPrompt injected).
 */
export function apply(ctx: Context): void {
  const storage = new StorageCoordinator({
    defaultDirectory: dshHomePath(),
    configFile: dshHomePath(STORAGE_CONFIG_FILE),
    ledgerName: LEDGER_FILE,
    templatesName: TEMPLATES_FILE,
    assetsName: ASSETS_DIR,
  })
  const store = new TaskStore({ file: storage.ledgerPath(), queue: storage.queue })
  const templates = new TemplateStore(storage.templatesPath(), storage.queue)
  const assets = new AssetStore(storage.assetsPath(), () => Date.now(), storage.queue)
  storage.attach({ ledger: store, templates, assets })
  // Eager first load: the tools and most routes read snapshot()/get() without
  // triggering the lazy load, so a fresh boot used to serve an EMPTY board to
  // taskboard_list/get until the scheduler catchup tick or the first
  // GET /state happened to load the file (review P0). load() never throws —
  // a corrupt ledger is quarantined instead.
  const storeReady = storage.ready().then(() => store.load())
  void storeReady.then(() => assets.cleanup(JSON.stringify(store.snapshot())))
  const now = () => Date.now()
  // Global execution concurrency cap (DSH_TASKBOARD_MAX_CONCURRENT overrides).
  const deploymentMaxConcurrent = Math.max(1, Number.parseInt(process.env.DSH_TASKBOARD_MAX_CONCURRENT ?? '', 10) || DEFAULT_MAX_CONCURRENT)
  const maxConcurrent = () => maxConcurrentOf(store.snapshot().settings, deploymentMaxConcurrent)
  const skipAfterMs = () => scheduleMissedAfterMinutesOf(store.snapshot().settings) * 60_000
  const queueMaxAgeMs = () => queueMaxAgeMinutesOf(store.snapshot().settings) * 60_000
  const dispatchIntervalMs = () => dispatchIntervalMsOf(store.snapshot().settings)

  // Agent workflow protocol (claim discipline, retry rules, done-gate).
  const disposeSection = ctx.systemPrompt.section({
    name: PROTOCOL_SECTION_NAME,
    order: PROTOCOL_SECTION_ORDER,
    text: TASKBOARD_PROTOCOL,
  })
  ctx.effect(() => disposeSection, 'dsh-taskboard: protocol section')

  // Register the complete tool schema in the same synchronous mount as the
  // protocol. Keeping schemas stable from the first request preserves the
  // provider's prefix cache; calls use the live workspace service below.
  let activeWorkspaces: WorkspaceFace | undefined
  let activeWorkspaceContext: Context | undefined
  const requireWorkspaces = (): WorkspaceFace => {
    if (activeWorkspaces === undefined) {
      throw new ToolError(ERR.notReady, 'workspace service is not ready; retry after host startup completes')
    }
    return activeWorkspaces
  }
  const workspaces: WorkspaceFace = {
    resolveByPath: path => requireWorkspaces().resolveByPath(path),
    get: id => requireWorkspaces().get(id),
    list: () => requireWorkspaces().list(),
  }
  // Preserve the optional archive capability without replacing the stable
  // facade captured by the tool definitions.
  Object.defineProperty(workspaces, 'archiveSession', {
    enumerable: true,
    get: () => activeWorkspaces?.archiveSession === undefined
      ? undefined
      : (sessionId: string) => requireWorkspaces().archiveSession!(sessionId),
  })
  const modelProviders = (): string[] | undefined => {
    try {
      const llm = activeWorkspaceContext?.get('llm') as { listProviders?: () => Array<{ id: string }> } | undefined
      return llm === undefined || typeof llm.listProviders !== 'function'
        ? undefined
        : llm.listProviders().map(p => p.id)
    } catch { return undefined }
  }
  const disposeTools = registerTaskboardTools(ctx, {
    store,
    workspaces,
    now,
    modelProviders,
    ready: async () => {
      if (activeWorkspaces === undefined) {
        throw new ToolError(ERR.notReady, 'workspace service is not ready; retry after host startup completes')
      }
      await storeReady
    },
  })
  ctx.effect(() => () => {
    for (const dispose of disposeTools.splice(0)) dispose()
  }, 'dsh-taskboard: tools')

  // Runtime services come and go with the workspace registry. Tool schemas
  // remain mounted and resolve this current service only when called.
  ctx.inject(['workspaceRegistry'], (wsCtx: Context) => {
    const workspaceDisposers: Array<() => void> = []
    activeWorkspaces = workspaceFace(wsCtx.workspaceRegistry)
    activeWorkspaceContext = wsCtx

    // Settlement listener over the session event bus.
    const events: EventsFace = {
      onSessionEvent: (listener) => wsCtx.on('session/event', (session, event) => {
        listener(session.id, event as { type: string; data?: unknown }, session as never)
      }),
    }

    let agentSessions: { get?: (id: string) => unknown; list?: () => unknown[] } | undefined

    // External workspace sessions sync service (0.5.4).
    const sessionSync = new ExternalSessionSyncService({
      store,
      workspaces: workspaceFace(wsCtx.workspaceRegistry),
      events,
      sessions: {
        get: id => {
          try {
            const registry = (agentSessions ?? wsCtx.get('sessions') ?? wsCtx.get('sessionRegistry') ?? wsCtx.root?.get('sessions')) as { get?: (id: string) => unknown } | undefined
            return registry?.get?.(id)
          } catch { return undefined }
        },
        list: () => {
          try {
            const registry = (agentSessions ?? wsCtx.get('sessions') ?? wsCtx.get('sessionRegistry') ?? wsCtx.root?.get('sessions')) as { list?: () => unknown[] } | undefined
            return registry?.list?.() ?? []
          } catch { return [] }
        },
      },
      now,
    })
    workspaceDisposers.push(() => sessionSync.dispose())

    // The narrow git face shared by execution (worktree isolation) and the
    // routes (merge / remove / workspace detection), plus the shared
    // nested-repo scanner for multi-repo mirrors (0.6.3).
    const git = createGitFace()
    const scanner = createRepoScanner()

    wsCtx.inject(['agents'], (agentCtx: Context) => {
      const agentDisposers: Array<() => void> = []
      agentSessions = agentCtx.get('sessions') as { get?: (id: string) => unknown; list?: () => unknown[] } | undefined
      const execution = new ExecutionService({
        store,
        agents: {
          create: (options): Promise<never> => agentCtx.agents.create(options as never) as Promise<never>,
          resumeScheduled: scheduledSessionResumer({
            agents: {
              get: id => agentCtx.agents.get(id as never) as unknown as ReturnType<ScheduledSessionDeps['agents']['get']>,
              resume: options => agentCtx.agents.resume(options as never) as Promise<never>,
            },
            persistence: () => agentCtx.get('sessionPersistence') as ReturnType<ScheduledSessionDeps['persistence']>,
            isArchived: id => wsCtx.workspaceRegistry.archivedSessionIds.includes(id as never),
          }),
        },
        // A DSH plugin reload keeps the host process and its live agents. The
        // new execution service adopts these runs during reconciliation rather
        // than mistaking the reload for a host restart.
        liveAgent: sessionId => agentCtx.agents.get(sessionId as never) as never,
        workspaces: {
          get: id => workspaceFace(wsCtx.workspaceRegistry).get(id),
          attach: async (workspaceId, sessionId) => {
            const ws = wsCtx.workspaceRegistry.get(workspaceId as never)
            if (ws !== undefined) await ws.attachSession(sessionId as never)
          },
        },
        events,
        now,
        git,
        scanner,
        // Preset composition (0.3.3): mirror apiproxy's composeAgent — resolve
        // the id BEFORE creation (the session header snapshots meta), mount
        // inside the factory's setup callback. No roster service → undefined
        // (bare host composition, the pre-preset behavior).
        composeAgent: async (presetId) => {
          const presets = agentCtx.get('agentPresets') as {
            resolve(id?: string): Promise<{ id: string }>
            mount(agentCtx: unknown, id?: string): Promise<unknown>
          } | undefined
          if (presets === undefined) return undefined
          const resolved = await presets.resolve(presetId)
          return {
            agentPreset: resolved.id,
            setup: async (ctx: unknown) => { await presets.mount(ctx, resolved.id) },
          }
        },
        renameSession: (sessionId, title) => {
          // Best-effort: pin the execution session's title to the task title
          // through the log-backed session-title service (user-sourced rename).
          try {
            const sessions = agentCtx.get('sessions') as { get(id: string): unknown } | undefined
            const sessionTitle = agentCtx.get('sessionTitle') as { rename(session: unknown, title: string): unknown } | undefined
            const session = sessions?.get(sessionId)
            if (session !== undefined && sessionTitle !== undefined) sessionTitle.rename(session, title)
          } catch { /* cosmetic */ }
        },
        defaultModel: () => {
          try {
            const selection = agentCtx.get('agentDefaultModel') as { currentSelection?: () => { provider: string; model: string } | undefined } | undefined
            const read = selection?.currentSelection
            return read === undefined ? undefined : read.call(selection)
          } catch { return undefined }
        },
        setPermission: (sessionId, permission) => {
          try {
            const permService = agentCtx.get('permissionPresets') as { set(session: unknown, name: string): void } | undefined
            const sessions = agentCtx.get('sessions') as { get(id: string): unknown } | undefined
            const session = sessions?.get(sessionId)
            if (session !== undefined && permService !== undefined) {
              permService.set(session, permission)
            }
          } catch { /* cosmetic */ }
        },
        maxConcurrent,
      })

      // Host-side cron scheduler: due scheduled tasks execute even with no
      // browser open. It starts before the routes so queue clearing never
      // reports a successful no-op while the scheduler is unavailable.
      const scheduler = new SchedulerService({ store, execution, now, maxConcurrent, skipAfterMs, queueMaxAgeMs, dispatchIntervalMs })
      scheduler.start()
      agentDisposers.push(() => scheduler.dispose())

      // /dsh-taskboard routes (the run action reaches the execution service).
      let disposeRoutes: (() => void) | undefined
      agentCtx.inject(['webServer'], (webCtx: Context) => {
        disposeRoutes = registerTaskboardRoutes(webCtx, {
          store,
          workspaces: workspaceFace(wsCtx.workspaceRegistry),
          now,
          maxConcurrent,
          clearQueue: () => scheduler.clearQueue(),
          run: (taskId: string, runOptions?: { reuseWorktree?: boolean }) => execution.run(taskId, 'manual', runOptions),
          cancel: (taskId: string) => execution.cancel(taskId),
          modelProviders,
          git,
          scanner,
          templates,
          assets,
          storage,
          ready: async () => { await storeReady },
          promptCompletions: async () => {
            try {
              const skillsService = agentCtx.get('skills') as { list?(options?: unknown): Promise<Array<{ name: string; description?: string }>> } | undefined
              const commandsService = agentCtx.get('commands') as { list?(): Array<{ name: string; description?: string; input?: { hint?: string } }> } | undefined
              const rawSkills = skillsService?.list ? await skillsService.list().catch(() => []) : []
              const rawCommands = commandsService?.list ? commandsService.list() : []
              return {
                skills: Array.isArray(rawSkills) ? rawSkills.map(s => ({ name: s.name, description: s.description })) : [],
                commands: Array.isArray(rawCommands) ? rawCommands.map(c => ({ name: c.name, description: c.description, hint: c.input?.hint })) : [],
              }
            } catch {
              return { skills: [], commands: [] }
            }
          },
          modelCatalog: async () => {
            try {
              type ModelItem = {
                provider: string
                model: string
                name?: string
                description?: string
                reasoning?: {
                  efforts: Array<{ id: string; name: string; description?: string }>
                  defaultEffort?: string
                }
              }
              const models: ModelItem[] = []

              const llm = (agentCtx.get('llm') ?? wsCtx.get('llm')) as {
                listProviders?(): Array<{ id: string; name?: string }>
                listModels?(provider: string): Promise<Array<{ id: string; name?: string; description?: string }>>
                resolveModelInfo?(provider: string, model: string): Promise<{ reasoning?: { efforts: Array<{ id: string; name: string; description?: string }>; defaultEffort?: string } }>
                resolveModel?(provider: string, model: string): Promise<{ reasoning?: { efforts: Array<{ id: string; name: string; description?: string }>; defaultEffort?: string } }>
              } | undefined

              if (llm?.listProviders !== undefined && llm.listModels !== undefined) {
                const providers = llm.listProviders()
                for (const p of providers) {
                  try {
                    const list = await llm.listModels(p.id)
                    for (const m of list) {
                      let reasoning: { efforts: Array<{ id: string; name: string; description?: string }>; defaultEffort?: string } | undefined
                      try {
                        const meta = llm.resolveModelInfo !== undefined
                          ? await llm.resolveModelInfo(p.id, m.id)
                          : llm.resolveModel !== undefined ? await llm.resolveModel(p.id, m.id) : undefined
                        if (meta?.reasoning !== undefined) {
                          reasoning = meta.reasoning
                        }
                      } catch { /* ignore */ }

                      models.push({
                        provider: p.id,
                        model: m.id,
                        name: m.name,
                        ...(m.description ? { description: m.description } : {}),
                        ...(reasoning !== undefined ? { reasoning } : {}),
                      })
                    }
                  } catch { /* continue */ }
                }
              }

              const presetsService = agentCtx.get('agentPresets') as {
                list?(): Promise<{ ok: boolean; value?: { presets: Array<{ id: string; name?: string; isDefault?: boolean }> } } | Array<{ id: string; name?: string; isDefault?: boolean }>>
              } | undefined
              const presets: Array<{ id: string; name?: string }> = []
              let defaultPresetId: string | undefined

              if (presetsService?.list !== undefined) {
                try {
                  const raw = await presetsService.list()
                  const list = (raw as { ok?: boolean; value?: { presets?: unknown[] } }).ok === true
                    ? (raw as { value: { presets: Array<{ id: string; name?: string; isDefault?: boolean }> } }).value.presets
                    : Array.isArray(raw) ? raw : []
                  for (const p of list) {
                    presets.push({ id: p.id, name: p.name })
                    if (p.isDefault) defaultPresetId = p.id
                  }
                } catch { /* continue */ }
              }

              return { models, presets, ...(defaultPresetId !== undefined ? { defaultPresetId } : {}) }
            } catch {
              return { models: [], presets: [] }
            }
          },
        })
        return () => disposeRoutes?.()
      })

      // Startup reconciliation: executions left 'running' by a previous host
      // process are marked failed and their tasks handed back to todo (their
      // settlement watchers died with that process).
      void execution.reconcile()

      // Detach the settlement listener with the plugin — a hot reload must
      // not leave stale services reacting to turn/end errors (review P1).
      agentDisposers.push(() => execution.dispose())

      return () => {
        disposeRoutes?.()
        agentSessions = undefined
        for (const dispose of agentDisposers.splice(0)) dispose()
      }
    })

    return () => {
      if (activeWorkspaceContext === wsCtx) {
        activeWorkspaceContext = undefined
        activeWorkspaces = undefined
      }
      for (const dispose of workspaceDisposers.splice(0)) dispose()
    }
  })
}

/**
 * Host loader entry for dsh-taskboard.
 *
 * Wiring: the ledger store (one JSON file under the DSH home), the ten
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
import { DEFAULT_MAX_CONCURRENT, ExecutionService, type EventsFace } from './host/execution.ts'
import { createGitFace } from './host/git.ts'
import { registerTaskboardRoutes } from './host/routes.ts'
import { SchedulerService } from './host/scheduler.ts'
import { dshHomePath } from './host/sdk.ts'
import { TaskStore } from './host/store.ts'
import { TemplateStore } from './host/templates.ts'
import { ExternalSessionSyncService } from './host/session-sync.ts'
import { registerTaskboardTools, workspaceFace } from './host/tools.ts'

/** Ledger file name under the DSH home. */
export const LEDGER_FILE = 'dsh-taskboard.json'

/** Task-template side file name under the DSH home (0.4.0). */
export const TEMPLATES_FILE = 'dsh-taskboard-templates.json'

/** Cordis plugin name. */
export const name = 'dsh-taskboard'

/** Required host services (tool registry + prompt assembly). */
export const inject = ['tools', 'systemPrompt']

/**
 * Mount the host half.
 * @param ctx - the plugin context (tools + systemPrompt injected).
 */
export function apply(ctx: Context): void {
  const store = new TaskStore({ file: dshHomePath(LEDGER_FILE) })
  const templates = new TemplateStore(dshHomePath(TEMPLATES_FILE))
  // Eager first load: the tools and most routes read snapshot()/get() without
  // triggering the lazy load, so a fresh boot used to serve an EMPTY board to
  // taskboard_list/get until the scheduler catchup tick or the first
  // GET /state happened to load the file (review P0). load() never throws —
  // a corrupt ledger is quarantined instead.
  void store.load()
  const now = () => Date.now()
  // Global execution concurrency cap (DSH_TASKBOARD_MAX_CONCURRENT overrides).
  const maxConcurrent = Math.max(1, Number.parseInt(process.env.DSH_TASKBOARD_MAX_CONCURRENT ?? '', 10) || DEFAULT_MAX_CONCURRENT)

  // Agent workflow protocol (claim discipline, retry rules, done-gate).
  const disposeSection = ctx.systemPrompt.section({
    name: PROTOCOL_SECTION_NAME,
    order: PROTOCOL_SECTION_ORDER,
    text: TASKBOARD_PROTOCOL,
  })
  ctx.effect(() => disposeSection, 'dsh-taskboard: protocol section')

  // Tools, routes, execution, and the scheduler all come up with the
  // workspace registry (claim boundary + project execution need it).
  ctx.inject(['workspaceRegistry'], (wsCtx: Context) => {
    const disposers: Array<() => void> = []

    // Registered model provider routes (from the host llm runtime), read
    // lazily at call time so late availability still applies; undefined when
    // the runtime is absent → only structural model validation runs.
    const modelProviders = (): string[] | undefined => {
      try {
        const llm = wsCtx.get('llm') as { listProviders?: () => Array<{ id: string }> } | undefined
        return llm === undefined || typeof llm.listProviders !== 'function'
          ? undefined
          : llm.listProviders().map(p => p.id)
      } catch { return undefined }
    }

    disposers.push(...registerTaskboardTools(wsCtx, {
      store,
      workspaces: workspaceFace(wsCtx.workspaceRegistry),
      now,
      modelProviders,
    }))

    // Settlement listener over the session event bus.
    const events: EventsFace = {
      onSessionEvent: (listener) => wsCtx.on('session/event', (session, event) => {
        listener(session.id, event as { type: string; data?: unknown }, session as { header?: { cwd?: string } })
      }),
    }

    // External workspace sessions sync service (0.5.4).
    const sessionSync = new ExternalSessionSyncService({
      store,
      workspaces: workspaceFace(wsCtx.workspaceRegistry),
      events,
      now,
    })
    disposers.push(() => sessionSync.dispose())

    // The narrow git face shared by execution (worktree isolation) and the
    // routes (merge / remove / workspace detection).
    const git = createGitFace()

    wsCtx.inject(['agents'], (agentCtx: Context) => {
      const execution = new ExecutionService({
        store,
        agents: {
          create: (options): Promise<never> => agentCtx.agents.create(options as never) as Promise<never>,
        },
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

      // /dsh-taskboard routes (the run action reaches the execution service).
      let disposeRoutes: (() => void) | undefined
      agentCtx.inject(['webServer'], (webCtx: Context) => {
        disposeRoutes = registerTaskboardRoutes(webCtx, {
          store,
          workspaces: workspaceFace(wsCtx.workspaceRegistry),
          now,
          run: (taskId: string, runOptions?: { reuseWorktree?: boolean }) => execution.run(taskId, 'manual', runOptions),
          cancel: (taskId: string) => execution.cancel(taskId),
          modelProviders,
          git,
          templates,
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
        })
        return () => disposeRoutes?.()
      })

      // Startup reconciliation: executions left 'running' by a previous host
      // process are marked failed and their tasks handed back to todo (their
      // settlement watchers died with that process).
      void execution.reconcile()

      // Host-side cron scheduler: due scheduled tasks execute even with no
      // browser open. Shares the execution concurrency cap.
      const scheduler = new SchedulerService({ store, execution, now, maxConcurrent })
      scheduler.start()
      disposers.push(() => scheduler.dispose())
      // Detach the settlement listener with the plugin — a hot reload must
      // not leave stale services reacting to turn/end errors (review P1).
      disposers.push(() => execution.dispose())

      return () => {
        disposeRoutes?.()
        for (const dispose of disposers.splice(0)) dispose()
      }
    })

    return () => {
      for (const dispose of disposers.splice(0)) dispose()
    }
  })
}

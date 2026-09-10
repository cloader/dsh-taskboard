import { archiveTaskSessions } from './archive-sessions.ts'
/**
 * /dsh-taskboard routes on the shared DSH webserver: a JSON API for the
 * GUI's human operations (create/update/move/comment/delete — actor `user`,
 * the done move IS allowed here) plus an SSE stream mirroring every
 * committed ledger mutation.
 *
 * All domain validation goes through the shared protocol pure functions; the
 * route layer only maps transport to envelope.
 *
 * @module dsh-taskboard/host/routes
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readdir, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the webServer Context merge (ctx.webServer).
import type {} from '@deepseek-ai/dsh-host-webserver'
import {
  asBoardSettings,
  asIsolation,
  asPermission,
  asStatus,
  asUrgency,
  canTransition,
  checklistFromTexts,
  defaultIsolationOf,
  defaultPermissionOf,
  isValidRelRepoPath,
  newCommentId,
  newTaskId,
  normalizeBody,
  normalizeChecklist,
  normalizeExecution,
  normalizeModel,
  normalizePrompt,
  normalizeTitle,
  summarize,
  syncClaim,
  validateLedgerImport,
  type TaskLedger,
  type TaskModel,
  type TaskRecord,
  type SystemCommentRow,
} from '../shared/protocol.ts'
import { WORKTREE_DIR, worktreePathOf, type GitFace } from './git.ts'
import { removeMirror, repoMainPath } from './isolation.ts'
import { createRepoScanner, type RepoScanner } from './repos.ts'
import { activeHostLocale } from './locale.ts'
import type { CatalogModelItem, CatalogPresetItem, MergeRepoResult, TaskTemplate } from '../shared/api.ts'
import type { TemplateStore } from './templates.ts'
import { ROUTE_PREFIX, SSE_PATH, type ApiFail, type ApiResult } from '../shared/api.ts'
import type { TaskStore } from './store.ts'
import { ERR, ToolError } from './tools.ts'
import type { WorkspaceFace } from './tools.ts'

/** Heartbeat cadence for the SSE stream. */
const HEARTBEAT_MS = 20_000

/** Max accepted JSON body bytes (S8: unbounded buffering is a local OOM vector). */
const MAX_BODY_BYTES = 5 * 1024 * 1024

/** Route shapes (T2: compiled once at module load, not on every request). */
const TASK_DIFF_RE = new RegExp(`^${ROUTE_PREFIX}/tasks/([^/]+)/diff$`)
const TASK_RE = new RegExp(`^${ROUTE_PREFIX}/tasks/([^/]+)$`)
const TASK_ACTION_RE = new RegExp(`^${ROUTE_PREFIX}/tasks/([^/]+)/([\\w-]+)$`)

/** How long a workspace git-detection result stays cached (fail-soft). */
const GIT_DETECT_TTL_MS = 60_000

/** The workspaces face routes need (same narrow shape as tools). */
export type RoutesWorkspaceFace = WorkspaceFace

/** Options. */
export interface TaskboardRoutesOptions {
  store: TaskStore
  workspaces: RoutesWorkspaceFace
  now: () => number
  /** Manual-run hook (the execution service); absent → 501. Options carry `reuseWorktree` (续跑). */
  run?: (taskId: string, options?: { reuseWorktree?: boolean }) => Promise<{ ok: true; executionId: string; sessionId: string } | { ok: false; error: string }>
  /** Cancel hook (the execution service); absent → 501. */
  cancel?: (taskId: string) => Promise<{ ok: true; executionId: string } | { ok: false; error: string }>
  /**
   * Registered model provider routes (from the host llm runtime), for
   * advisory validation of pinned models; undefined = runtime unavailable.
   */
  modelProviders?: () => string[] | undefined
  /** Git face for worktree actions + workspace git detection; absent → 501 on git actions. */
  git?: GitFace
  /** Nested-repo scanner for mirror removal; absent → a default one is built on first use. */
  scanner?: RepoScanner
  /** Task-template store (0.4.0); absent → 501 on template actions. */
  templates?: TemplateStore
  /** Prompt completions face (0.5.5; dynamically discovers skills & commands). */
  promptCompletions?: () => Promise<{
    skills?: Array<{ name: string; description?: string }>
    commands?: Array<{ name: string; description?: string; hint?: string }>
  }>
  /** Model and preset catalog face (0.5.5; dynamically discovers models & presets). */
  modelCatalog?: () => Promise<{
    models?: CatalogModelItem[]
    presets?: CatalogPresetItem[]
    defaultPresetId?: string
  }>
}

/** Validate a template's task spec (routes-side, unknown → invalid_input). */
function normalizeTemplateSpec(raw: unknown, now: number): TaskTemplate['task'] {
  if (typeof raw !== 'object' || raw === null) throw new Error('Error: invalid_input: task must be an object')
  const e = raw as Record<string, unknown>
  const spec: TaskTemplate['task'] = {}
  const str = (key: string): string | undefined => {
    const v = e[key]
    if (v === undefined) return undefined
    if (typeof v !== 'string') throw new Error(`Error: invalid_input: task.${key} must be a string`)
    return v
  }
  const title = str('title')
  const description = str('description')
  const prompt = str('prompt')
  const urgency = str('urgency')
  const isolation = str('isolation')
  const presetId = str('presetId')
  const permission = str('permission')
  if (title !== undefined) spec.title = normalizeTitle(title)
  if (description !== undefined) spec.description = description
  if (prompt !== undefined) spec.prompt = normalizePrompt(prompt)
  if (urgency !== undefined) spec.urgency = asUrgency(urgency)
  if (isolation !== undefined) spec.isolation = asIsolation(isolation)
  if (presetId !== undefined && presetId.trim().length > 0) spec.presetId = presetId.trim()
  if (permission !== undefined && permission.trim().length > 0) spec.permission = asPermission(permission)
  if (e.execution !== undefined) {
    spec.execution = normalizeExecution(e.execution as { mode?: string; cron?: string }, now)
  }
  if (e.model !== undefined) spec.model = normalizeModel(e.model)
  if (e.checklist !== undefined) {
    if (!Array.isArray(e.checklist) || e.checklist.some(c => typeof c !== 'string')) {
      throw new Error('Error: invalid_input: task.checklist must be an array of strings')
    }
    checklistFromTexts(e.checklist as string[]) // validates count + texts
    spec.checklist = e.checklist as string[]
  }
  return spec
}

/** Validate a pinned model: structural check always, provider route when known. */
function checkModel(raw: unknown, modelProviders?: () => string[] | undefined): TaskModel {
  const model = normalizeModel(raw)
  const providers = modelProviders?.()
  if (providers !== undefined && !providers.includes(model.provider)) {
    throw new Error(`Error: invalid_input: model provider "${model.provider}" has no registered route (available: ${providers.join(', ')})`)
  }
  return model
}

/** JSON-envelope writer. */
function json(res: ServerResponse, payload: ApiResult<unknown>, status = 200): void {
  const body = JSON.stringify(payload)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

/** Domain failure → envelope + HTTP status. */
function fail(code: ApiFail['error']['code'], message: string): { res: ApiFail; status: number } {
  const status = code === 'invalid_input' || code === 'invalid_transition' ? 400
    : code === 'not_found' ? 404
      : code === 'version_conflict' ? 409
        : code === 'forbidden' ? 403
          : 500
  return { res: { ok: false, error: { code, message } }, status }
}

/**
 * Read one JSON body (null on parse failure). S8: rejects bodies over
 * MAX_BODY_BYTES by throwing — the local, unauthenticated HTTP surface must
 * not be an unbounded memory sink.
 */
async function readBody(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    total += (chunk as Buffer).length
    if (total > MAX_BODY_BYTES) throw new Error('body too large')
    chunks.push(chunk as Buffer)
  }
  if (chunks.length === 0) return {}
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

/** String field accessor (null when absent/not a string). */
function str(body: Record<string, unknown>, key: string): string | null {
  const v = body[key]
  return typeof v === 'string' ? v : null
}

/** Number field accessor (undefined when absent; null when present but not a number). */
function num(body: Record<string, unknown>, key: string): number | undefined | null {
  const v = body[key]
  if (v === undefined) return undefined
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Find a live task INSIDE a mutator (R1: guards run on the fresh draft). */
function liveTaskAt(ledger: TaskLedger, id: string): { index: number; task: TaskRecord } {
  const index = ledger.tasks.findIndex(t => t.id === id)
  if (index < 0 || ledger.tasks[index]!.trashedAt !== undefined) throw new Error('Error: not_found: no such task')
  return { index, task: ledger.tasks[index]! }
}

/** Normalize an agent preset id: trimmed, non-empty; empty string → undefined. */
function normalizePresetId(raw: string | null): string | undefined {
  const t = (raw ?? '').trim()
  return t.length === 0 ? undefined : t
}

/** Map a thrown domain error to the envelope. */
function toFail(error: unknown): { res: ApiFail; status: number } {
  const message = error instanceof Error ? error.message : String(error)
  // Structured path first (review P2): ToolError carries its code — no need
  // to parse the 'Error: <code>: …' prefix it also renders into the message.
  if (error instanceof ToolError) {
    const mapped = error.code === ERR.workspaceMismatch ? 'forbidden' : error.code
    const known: ApiFail['error']['code'][] = ['invalid_input', 'not_found', 'version_conflict', 'invalid_transition', 'forbidden', 'internal']
    if ((known as string[]).includes(mapped)) {
      return fail(mapped as ApiFail['error']['code'], message.slice(7 + error.code.length + 2))
    }
  }
  const code = message.startsWith('Error: ') ? message.slice(7).split(':')[0] : undefined
  const known2: ApiFail['error']['code'][] = ['invalid_input', 'not_found', 'version_conflict', 'invalid_transition', 'forbidden', 'internal']
  if (code !== undefined && (known2 as string[]).includes(code)) {
    return fail(code as ApiFail['error']['code'], message.slice(7 + code.length + 2))
  }
  if (code === 'workspace_mismatch') return fail('forbidden', message.slice(7 + code.length + 2))
  return fail('invalid_input', message)
}

/**
 * Register the taskboard routes.
 * @param ctx - context carrying the webServer service.
 * @param options - store + workspaces + clock.
 * @returns the disposer.
 */
export function registerTaskboardRoutes(ctx: Context, options: TaskboardRoutesOptions): () => void {
  const { store, workspaces } = options
  const subscribers = new Set<ServerResponse>()
  let heartbeat: NodeJS.Timeout | undefined

  /** R4③: a cleanup/purge target must resolve INSIDE <ws>/.dsh-worktrees — string joining alone is never trusted with an rm. */
  const insideWorktreeScope = (wsPath: string, target: string): boolean => {
    const scope = resolve(wsPath, WORKTREE_DIR)
    const resolved = resolve(target)
    return resolved === scope || resolved.startsWith(scope + sep)
  }

  const broadcast = (change: { revision: number; kind: string; tasks: readonly TaskRecord[] }): void => {
    const frame = `event: change\ndata: ${JSON.stringify({ revision: change.revision, kind: change.kind, tasks: change.tasks.map(summarize) })}\n\n`
    for (const res of subscribers) res.write(frame)
  }
  const unsubscribeBroadcast = store.subscribe(broadcast)

  // Workspace git detection, TTL-cached and fail-soft (false on any error):
  // feeds the create-form isolation toggle and the diagnostics panel.
  const gitCache = new Map<string, { value: boolean; at: number; repoCount?: number }>()
  const gitHinted = new Set<string>()

  /** Whether <root>/.gitignore (missing file counts as missing) ignores our worktree dir. */
  const gitignoreMissing = async (path: string): Promise<boolean> => {
    try {
      const { readFile } = await import('node:fs/promises')
      const ignore = await readFile(join(path, '.gitignore'), 'utf8')
      return !ignore.split('\n').some(l => {
        const t = l.trim().replace(/\/+$/, '')
        return t === WORKTREE_DIR || t === `/${WORKTREE_DIR}`
      })
    } catch {
      return true // no .gitignore at all (or unreadable) → suggest creating one
    }
  }

  // One scanner for every route-side discovery (the injected one or a
  // shared real-IO fallback whose TTL cache actually helps — 0.6.3).
  const sharedScanner: RepoScanner = options.scanner ?? createRepoScanner()

  /**
   * Whether the workspace root itself is a git repo (the .gitignore-suggestion
   * gate — a plain container has no repo that could ignore anything).
   */
  const rootIsRepo = async (path: string): Promise<boolean> => {
    try {
      return (await options.git?.detect(path)) === true
    } catch {
      return false // fail-soft
    }
  }

  /**
   * Workspace repo facts for the form (0.6.3): `gitAvailable` gates the
   * worktree option, `repoCount` feeds the mirror badge. Availability now
   * covers PARALLEL MULTI-REPO workspaces too: a root repo qualifies as
   * before, and a workspace whose root is NOT a repo still qualifies when
   * the scanner finds nested repos — prepareMirror isolates exactly that
   * container shape (mirror root = plain dir, one worktree per nested repo),
   * so the form must not lock the capability away.
   */
  const workspaceRepos = async (path: string): Promise<{ gitAvailable: boolean; repoCount: number }> => {
    if (options.git === undefined) return { gitAvailable: false, repoCount: 0 }
    const hit = gitCache.get(path)
    if (hit !== undefined && options.now() - hit.at < GIT_DETECT_TTL_MS) {
      return { gitAvailable: hit.value, repoCount: hit.repoCount ?? (hit.value ? 1 : 0) }
    }
    let rootRepo = false
    try {
      rootRepo = await options.git.detect(path)
    } catch { /* fail-soft → false */ }
    // gitignore 建议 (plan §3.2): suggest (never write) ignoring our
    // worktree directory, once per workspace per host run. Root repos only.
    // The line is localized from the DSH locale preference (see host/locale.ts).
    if (rootRepo && !gitHinted.has(path)) {
      gitHinted.add(path)
      if (await gitignoreMissing(path)) {
        const file = `${path}/.gitignore`
        const hint = activeHostLocale(ctx) === 'zh'
          ? `建议在 ${file} 加入一行 ${WORKTREE_DIR}/ 以隐藏任务 worktree 目录（不会自动修改）`
          : `suggests adding one line to ${file}: ${WORKTREE_DIR}/ to hide the task worktree directory (no automatic edits)`
        console.info(`[dsh-taskboard] ${hint}`)
      }
    }
    // The nested scan always runs: repoCount needs it even when the root
    // is a repo (root repo + nested repos = the mirror shape). The scanner's
    // own TTL cache keeps repeated workspace polls cheap.
    let nestedCount = 0
    try {
      nestedCount = (await sharedScanner.findNestedRepos(path)).length
    } catch { /* fail-soft → 0 */ }
    const value = rootRepo || nestedCount > 0
    const repoCount = (rootRepo ? 1 : 0) + nestedCount
    gitCache.set(path, { value, at: options.now(), repoCount })
    return { gitAvailable: value, repoCount }
  }

  /** List orphan worktree dirs: entries under <ws>/.dsh-worktrees owned by no ledger task. */
  const listOrphanWorktrees = async (): Promise<Array<{ workspaceId: string; workspacePath: string; taskId: string; path: string }>> => {
    const orphans: Array<{ workspaceId: string; workspacePath: string; taskId: string; path: string }> = []
    const known = new Set(store.snapshot().tasks.map(t => t.id))
    for (const ws of workspaces.list()) {
      let entries: string[] = []
      try {
        const dirents = await readdir(join(ws.path, WORKTREE_DIR), { withFileTypes: true })
        entries = dirents.filter(e => e.isDirectory()).map(e => e.name)
      } catch { /* no worktrees dir → nothing to do */ }
      for (const taskId of entries) {
        if (!known.has(taskId)) orphans.push({ workspaceId: ws.id, workspacePath: ws.path, taskId, path: worktreePathOf(ws.path, taskId) })
      }
    }
    return orphans
  }

  /** Git-enabled workspaces whose .gitignore does not cover the worktree dir. */
  const listGitignoreSuggestions = async (): Promise<Array<{ workspaceId: string; workspacePath: string }>> => {
    const suggestions: Array<{ workspaceId: string; workspacePath: string }> = []
    for (const ws of workspaces.list()) {
      // Root repos only: a plain container has no .gitignore any repo reads.
      if (!(await rootIsRepo(ws.path))) continue
      if (await gitignoreMissing(ws.path)) suggestions.push({ workspaceId: ws.id, workspacePath: ws.path })
    }
    return suggestions
  }

  const handler = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? '/', 'http://x')
      const pathname = url.pathname

      // ---------------------------------------------------------------- GET
      if (req.method === 'GET') {
        if (pathname === `${ROUTE_PREFIX}/state`) {
          await store.load()
          json(res, { ok: true, value: { ...store.snapshot(), capabilities: { archiveSessions: typeof workspaces.archiveSession === 'function' } } })
          return
        }
        if (pathname === `${ROUTE_PREFIX}/workspaces`) {
          const list = workspaces.list()
          const info = await Promise.all(list.map(ws => workspaceRepos(ws.path)))
          json(res, {
            ok: true,
            value: list.map((ws, i) => ({ ...ws, sessionCount: 0, gitAvailable: info[i]!.gitAvailable, repoCount: info[i]!.repoCount })),
          })
          return
        }
        if (pathname === `${ROUTE_PREFIX}/diagnostics`) {
          const ledger = store.snapshot()
          let staleRunning = 0
          for (const t of ledger.tasks) {
            for (const e of t.executions) if (e.outcome === 'running') staleRunning += 1
          }
          json(res, {
            ok: true,
            value: {
              revision: ledger.revision,
              tasks: ledger.tasks.length,
              staleRunning,
              orphanWorktrees: await listOrphanWorktrees(),
              gitIgnoreSuggestions: await listGitignoreSuggestions(),
            },
          })
          return
        }
        // Diff viewer (0.4.0): read-only git show/diff for one execution's
        // commit or changed path. Prefers the live worktree (uncommitted
        // view), falls back to the main repo.
        const diffMatch = pathname.match(TASK_DIFF_RE)
        if (diffMatch !== null) {
          try {
            if (options.git === undefined) {
              const f = fail('invalid_input', 'git integration unavailable')
              json(res, f.res, 501)
              return
            }
            const task = store.get(diffMatch[1]!)
            if (task === undefined) throw new Error('Error: not_found: no such task')
            const execution = task.executions.find(e => e.id === url.searchParams.get('execution'))
            if (execution === undefined) throw new Error('Error: not_found: no such execution')
            const commit = url.searchParams.get('commit')
            const filePath = url.searchParams.get('path')
            const ws = workspaces.get(task.workspaceId)
            if (ws === undefined) throw new Error('Error: not_found: unknown workspace')
            // 0.6.3: `?repo=` picks one repo of a multi-repo mirror ('' = the
            // root); without it the legacy flat fields decide, byte-identical.
            const repoParam = url.searchParams.get('repo')
            let cwd = execution.worktreePath ?? ws.path
            let mainRepo = ws.path
            let baseCommit = execution.baseCommit
            if (repoParam !== null) {
              const entry = execution.repos?.find(r => r.repo === repoParam)
              if (entry === undefined) throw new Error('Error: invalid_input: 该执行没有此仓库的镜像记录')
              cwd = entry.worktreePath
              mainRepo = repoMainPath(ws.path, entry.repo)
              baseCommit = entry.baseCommit
            }
            let result = commit !== null
              ? await options.git.showCommit(cwd, commit)
              : filePath !== null ? await options.git.showPathDiff(cwd, filePath, baseCommit) : undefined
            // Fallback: the worktree may be gone — commits and committed
            // ranges still resolve in the main repo.
            if (result === undefined && cwd !== mainRepo) {
              result = commit !== null
                ? await options.git.showCommit(mainRepo, commit)
                : filePath !== null && baseCommit !== undefined
                  ? await options.git.showPathDiff(mainRepo, filePath, baseCommit)
                  : undefined
            }
            if (result === undefined) {
              throw new Error('Error: invalid_input: 无法获取 diff（git 报错、对象不存在，或仅存于已删除的 worktree 且无基线）')
            }
            json(res, { ok: true, value: { diff: result.text, truncated: result.truncated } })
          } catch (error) {
            const f = toFail(error)
            json(res, f.res, f.status)
          }
          return
        }

        // Templates listing (0.4.0).
        if (pathname === `${ROUTE_PREFIX}/templates`) {
          if (options.templates === undefined) {
            const f = fail('invalid_input', 'template store unavailable')
            json(res, f.res, 501)
            return
          }
          json(res, { ok: true, value: { templates: await options.templates.list() } })
          return
        }

        // Board settings (0.5.0): absent fields follow factory defaults.
        if (pathname === `${ROUTE_PREFIX}/settings`) {
          await store.load()
          json(res, { ok: true, value: store.snapshot().settings ?? {} })
          return
        }

        // Prompt completions (0.5.5; dynamically discovers skills & commands).
        if (pathname === `${ROUTE_PREFIX}/prompt-completions`) {
          const completions = await options.promptCompletions?.().catch(() => undefined)
          json(res, {
            ok: true,
            value: {
              commands: completions?.commands ?? [],
              skills: completions?.skills ?? [],
            },
          })
          return
        }

        // Model catalog (0.5.5; dynamically discovers models & presets from runtime).
        if (pathname === `${ROUTE_PREFIX}/model-catalog`) {
          const catalog = await options.modelCatalog?.().catch(() => undefined)
          json(res, {
            ok: true,
            value: {
              models: catalog?.models ?? [],
              presets: catalog?.presets ?? [],
              ...(catalog?.defaultPresetId !== undefined ? { defaultPresetId: catalog.defaultPresetId } : {}),
            },
          })
          return
        }

        const taskMatch = pathname.match(TASK_RE)
        if (taskMatch !== null) {
          const task = store.get(taskMatch[1]!)
          if (task === undefined) { const f = fail('not_found', 'no such task'); json(res, f.res, f.status); return }
          json(res, { ok: true, value: task })
          return
        }
        res.writeHead(404)
        res.end()
        return
      }

      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'GET, POST' })
        res.end()
        return
      }
      // CSRF fence: cross-site simple requests cannot set application/json.
      const contentType = req.headers['content-type'] ?? ''
      if (!contentType.toLowerCase().startsWith('application/json')) {
        const f = fail('invalid_input', 'content-type must be application/json')
        json(res, f.res, 415)
        return
      }
      let body: Record<string, unknown> | null
      try {
        body = await readBody(req)
      } catch {
        const f = fail('invalid_input', `request body exceeds ${MAX_BODY_BYTES} bytes`)
        json(res, f.res, 413)
        return
      }
      if (body === null) {
        const f = fail('invalid_input', 'body is not a JSON object')
        json(res, f.res, 400)
        return
      }

      // ------------------------------------------------- POST /tasks (create)
      if (pathname === `${ROUTE_PREFIX}/tasks`) {
        try {
          const title = normalizeTitle(str(body, 'title') ?? '')
          const workspaceId = str(body, 'workspaceId') ?? ''
          if (workspaces.get(workspaceId) === undefined) throw new Error('Error: not_found: unknown workspace')
          const urgency = asUrgency(str(body, 'urgency') ?? '')
          const status = str(body, 'status') === null ? 'todo' as const : asStatus(str(body, 'status')!)
          if (status !== 'backlog' && status !== 'todo') {
            throw new Error('Error: invalid_transition: a new task must start as backlog or todo')
          }
          const execution = normalizeExecution((body.execution as { mode?: string; cron?: string } | undefined) ?? {}, options.now())
          const model = body.model === undefined ? undefined : checkModel(body.model, options.modelProviders)
          const isolationRaw = str(body, 'isolation')
          // 0.5.0: an omitted isolation is MATERIALIZED from the board
          // setting (看板设置) at creation, so later setting changes never
          // rewrite existing tasks.
          const isolation = isolationRaw === null ? defaultIsolationOf(store.snapshot().settings) : asIsolation(isolationRaw)
          const presetId = normalizePresetId(str(body, 'presetId'))
          const permissionRaw = str(body, 'permission')
          const permission = permissionRaw === null ? defaultPermissionOf(store.snapshot().settings) : asPermission(permissionRaw)
          let checklist: TaskRecord['checklist'] = undefined
          if (body.checklist !== undefined) {
            if (!Array.isArray(body.checklist) || body.checklist.some(c => typeof c !== 'string')) {
              throw new Error('Error: invalid_input: checklist must be an array of strings')
            }
            const texts = (body.checklist as string[]).map(c => c.trim()).filter(c => c.length > 0)
            if (texts.length > 0) checklist = checklistFromTexts(texts)
          }
          const now = options.now()
          const task: TaskRecord = {
            id: newTaskId(),
            title,
            description: (str(body, 'description') ?? '').trim(),
            prompt: normalizePrompt(str(body, 'prompt') ?? undefined),
            workspaceId,
            urgency,
            status,
            blocked: false,
            execution,
            model,
            isolation,
            ...(presetId !== undefined ? { presetId } : {}),
            permission,
            ...(checklist !== undefined ? { checklist } : {}),
            version: 1,
            createdAt: now,
            updatedAt: now,
            createdBy: { kind: 'user' },
            updatedBy: { kind: 'user' },
            comments: [],
            executions: [],
          }
          await store.mutate('task-created', ledger => {
            ledger.tasks.push(task)
            return [task]
          })
          json(res, { ok: true, value: summarize(task) }, 201)
        } catch (error) {
          const f = toFail(error)
          json(res, f.res, f.status)
        }
        return
      }

      // ------------------------------------------- POST /tasks/:id/{action}
      // (\w+ after the id would not match hyphenated actions like
      // worktree-remove, hence the explicit class in the hoisted pattern.)
      const actionMatch = pathname.match(TASK_ACTION_RE)
      if (actionMatch !== null) {
        const id = actionMatch[1]!
        const action = actionMatch[2]!
        try {
          const task = store.get(id)
          if (task === undefined) throw new Error('Error: not_found: no such task')
          if (action === 'archive-sessions') {
            if (task.trashedAt !== undefined || task.status !== 'archived') throw new Error('Error: invalid_transition: only archived live tasks can retry session archiving')
            const result = await archiveTaskSessions(task, workspaces.archiveSession)
            json(res, { ok: true, value: result })
            return
          }
          if (action === 'update') {
            const ifVersion = num(body, 'ifVersion')
            if (ifVersion === undefined || ifVersion === null) throw new Error('Error: version_conflict: ifVersion required')
            // R1: version guard + write inside the mutation, on the fresh draft.
            let next: TaskRecord | undefined
            await store.mutate('task-updated', ledger => {
              const { index, task } = liveTaskAt(ledger, id)
              if (ifVersion !== task.version) throw new Error(`Error: version_conflict: stale version ${ifVersion} (current ${task.version})`)
              if (task.status === 'archived') throw new Error('Error: invalid_transition: archived tasks are immutable')
              next = structuredClone(task)
              const title = str(body, 'title')
              if (title !== null) next.title = normalizeTitle(title)
              const description = str(body, 'description')
              if (description !== null) next.description = description.trim()
              const prompt = str(body, 'prompt')
              if (prompt !== null) next.prompt = normalizePrompt(prompt)
              const urgency = str(body, 'urgency')
              if (urgency !== null) next.urgency = asUrgency(urgency)
              // GUI-only rebind to another project; validated against the workspace registry.
              const workspaceId = str(body, 'workspaceId')
              if (workspaceId !== null) {
                if (workspaces.get(workspaceId) === undefined) throw new Error('Error: not_found: unknown workspace')
                next.workspaceId = workspaceId
              }
              if (typeof body.blocked === 'boolean') next.blocked = body.blocked
              // The GUI (task owner surface) may edit model/execution; null clears the model.
              if (body.execution !== undefined) next.execution = normalizeExecution(body.execution as { mode?: string; cron?: string }, options.now())
              if (body.model === null) next.model = undefined
              else if (body.model !== undefined) next.model = checkModel(body.model, options.modelProviders)
              // Isolation may change only before the first execution (分支与基线
              // 取决于该选择 — plan §3.1: 执行开始后锁定).
              const isolationRaw = str(body, 'isolation')
              if (isolationRaw !== null) {
                if (task.executions.length > 0 || task.status === 'in_progress') {
                  throw new Error('Error: invalid_input: isolation 已锁定（任务已有执行记录），不可修改')
                }
                next.isolation = asIsolation(isolationRaw)
              }
              // Preset may change any time: each run composes fresh.
              if (body.presetId === null) delete next.presetId
              else if (body.presetId !== undefined) next.presetId = normalizePresetId(str(body, 'presetId'))!
              // Permission (0.5.5): 'workspace-write' | 'read-only' | 'danger-full-access'
              if (body.permission === null) delete next.permission
              else if (body.permission !== undefined) next.permission = asPermission(body.permission)
              // Checklist (0.4.0): the GUI replaces the whole list; null clears.
              if (body.checklist === null) delete next.checklist
              else if (body.checklist !== undefined) {
                const items = normalizeChecklist(body.checklist)
                if (items.length > 0) next.checklist = items
                else delete next.checklist
              }
              next.version = task.version + 1
              next.updatedAt = options.now()
              next.updatedBy = { kind: 'user' }
              ledger.tasks[index] = next
              return [next]
            })
            json(res, { ok: true, value: summarize(next!) })
            return
          }
          if (action === 'move') {
            const ifVersion = num(body, 'ifVersion')
            const status = str(body, 'status') ?? ''
            const archiveSessions = body.archiveSessions === true
            if (ifVersion === undefined || ifVersion === null) throw new Error('Error: version_conflict: ifVersion required')
            const to = asStatus(status)
            let next: TaskRecord | undefined
            let beforeTask: TaskRecord | undefined
            await store.mutate('task-moved', ledger => {
              const { index, task } = liveTaskAt(ledger, id)
              if (ifVersion !== task.version) throw new Error(`Error: version_conflict: stale version ${ifVersion} (current ${task.version})`)
              if (!canTransition(task.status, to)) throw new Error(`Error: invalid_transition: illegal transition ${task.status} → ${to}`)
              beforeTask = task
              next = structuredClone(task)
              next.status = to
              next.version = task.version + 1
              next.updatedAt = options.now()
              next.updatedBy = { kind: 'user' }
              if (task.status === 'todo' && to === 'in_progress') next.blocked = false
              // A user move records no holder; leaving in_progress releases any hold.
              syncClaim(next, to, options.now())
              ledger.tasks[index] = next
              return [next]
            })
            const sessionArchive = to === 'archived' && archiveSessions
              ? await archiveTaskSessions(beforeTask ?? next!, workspaces.archiveSession)
              : undefined
            json(res, { ok: true, value: { ...summarize(next!), ...(sessionArchive !== undefined ? { sessionArchive } : {}) } })
            return
          }
          if (action === 'reject') {
            // Card quick-reject: back to todo + optional user comment in one
            // atomic mutation (a failed move never strands an orphan comment).
            const ifVersion = num(body, 'ifVersion')
            if (ifVersion === undefined || ifVersion === null) throw new Error('Error: version_conflict: ifVersion required')
            const commentText = str(body, 'body') ?? ''
            let next: TaskRecord | undefined
            await store.mutate('task-moved', ledger => {
              const { index, task } = liveTaskAt(ledger, id)
              if (ifVersion !== task.version) throw new Error(`Error: version_conflict: stale version ${ifVersion} (current ${task.version})`)
              if (!canTransition(task.status, 'todo')) throw new Error(`Error: invalid_transition: illegal transition ${task.status} → todo`)
              next = structuredClone(task)
              next.status = 'todo'
              next.version = task.version + 1
              next.updatedAt = options.now()
              next.updatedBy = { kind: 'user' }
              syncClaim(next, 'todo', options.now())
              if (commentText.trim().length > 0) {
                next.comments.push({ id: newCommentId(), body: normalizeBody(commentText), version: 1, createdAt: options.now() })
              }
              ledger.tasks[index] = next
              return [next]
            })
            json(res, { ok: true, value: summarize(next!) })
            return
          }
          if (action === 'comment') {
            const bodyText = str(body, 'body') ?? ''
            const comment = { id: newCommentId(), body: normalizeBody(bodyText), version: 1, createdAt: options.now() }
            await store.mutate('comment-added', ledger => {
              const { index, task } = liveTaskAt(ledger, id)
              if (task.status === 'archived') throw new Error('Error: invalid_transition: archived tasks are immutable')
              const next = structuredClone(task)
              next.comments.push(comment)
              next.version = task.version + 1
              next.updatedAt = options.now()
              ledger.tasks[index] = next
              return [next]
            })
            json(res, { ok: true, value: comment }, 201)
            return
          }
          if (action === 'delete') {
            const purge = body.purge === true
            if (purge) {
              if (task.trashedAt === undefined) throw new Error('Error: invalid_input: purge requires a trashed task (soft-delete first)')
              // Worktree safety before purge (plan §3.3, 0.3.1): refuse while
              // uncommitted work remains; otherwise clean the worktree and
              // the task branch along with the ledger entry.
              if (options.git !== undefined) {
                const ws = workspaces.get(task.workspaceId)
                if (ws !== undefined) {
                  const path = worktreePathOf(ws.path, id)
                  if (!insideWorktreeScope(ws.path, path)) {
                    throw new Error('Error: invalid_input: 非法的清除路径（不在任务工作目录范围内）')
                  }
                  try {
                    // 0.6.3: the whole mirror (every repo worktree) goes
                    // through the aggregated children-first removal — one
                    // dirty repo refuses BEFORE anything is deleted.
                    await removeMirror(
                      { git: options.git, scanner: options.scanner ?? createRepoScanner() },
                      { workspacePath: ws.path, taskId: id },
                    )
                    // Leftovers unknown to git ('unregistered' worktrees, or a
                    // plain mirror dir when the workspace root is no repo).
                    await rm(path, { recursive: true, force: true })
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error)
                    // Structured classification (review P2): git tags its dirty
                    // rejections with a code; the keyword stays as a fallback.
                    const dirty = (error as { code?: string }).code === 'dirty-worktree'
                      || (error as { code?: string }).code === 'dirty-mirror'
                      || message.includes('未提交修改')
                    if (dirty) {
                      throw new Error(`Error: invalid_input: ${message}；请先处理这些改动（提交、续跑或手动保存）再物理清除任务`)
                    }
                    throw new Error(`Error: invalid_input: ${message}`)
                  }
                  // Branches die with the task (best effort, per repo).
                  const branchTargets: Array<{ repo: string; branch: string }> = []
                  if (task.branches !== undefined) {
                    for (const [repo, branch] of Object.entries(task.branches)) branchTargets.push({ repo, branch })
                  }
                  if (task.branch !== undefined && !branchTargets.some(t => t.repo === '')) branchTargets.push({ repo: '', branch: task.branch })
                  for (const target of branchTargets) {
                    try {
                      await options.git.deleteBranch(repoMainPath(ws.path, target.repo), target.branch)
                    } catch { /* best effort: the branch may outlive the task */ }
                  }
                }
              }
              await store.mutate('task-deleted', ledger => {
                ledger.tasks = ledger.tasks.filter(t => t.id !== id)
                return []
              })
              json(res, { ok: true, value: { purged: true } })
              return
            }
            const ifVersion = num(body, 'ifVersion')
            if (ifVersion === undefined || ifVersion === null) throw new Error('Error: version_conflict: ifVersion required')
            await store.mutate('task-deleted', ledger => {
              const { index, task } = liveTaskAt(ledger, id)
              if (ifVersion !== task.version) throw new Error(`Error: version_conflict: stale version ${ifVersion} (current ${task.version})`)
              // S5: a running execution keeps writing to the task — refuse the
              // soft-delete until it is cancelled or settled. T8: clear residue.
              if (task.executions.some(e => e.outcome === 'running')) {
                throw new Error('Error: invalid_input: 任务有正在运行的执行，请先取消或等它结束再删除')
              }
              const next = structuredClone(task)
              next.trashedAt = options.now()
              next.version = task.version + 1
              delete next.claimedBy
              delete next.claimedAt
              next.blocked = false
              ledger.tasks[index] = next
              return [next]
            })
            json(res, { ok: true, value: { trashed: true } })
            return
          }
          if (action === 'run') {
            if (options.run === undefined) {
              const f = fail('invalid_input', 'execution service unavailable')
              json(res, f.res, 501)
              return
            }
            // `reuse: true` = 续跑: keep a live worktree/branch as-is instead
            // of resetting to a fresh baseline (0.3.1).
            const runOptions = body.reuse === true ? { reuseWorktree: true } : undefined
            const result = await options.run(id, runOptions)
            if (result.ok) json(res, { ok: true, value: result }, 202)
            else {
              const f = fail('invalid_input', result.error)
              json(res, f.res, f.status)
            }
            return
          }
          if (action === 'cancel') {
            if (options.cancel === undefined) {
              const f = fail('invalid_input', 'execution service unavailable')
              json(res, f.res, 501)
              return
            }
            const result = await options.cancel(id)
            if (result.ok) json(res, { ok: true, value: { cancelled: true, executionId: result.executionId } }, 202)
            else {
              const f = fail('invalid_input', result.error)
              json(res, f.res, f.status)
            }
            return
          }
          if (action === 'merge') {
            // ⇥ 合并 (detail page, user-only): merge the task branch(es) into
            // the main worktree(s) with --no-ff; conflicts are reported
            // verbatim. 0.6.3: multi-repo mirror tasks merge PER REPO —
            // sequentially, a failed repo never blocking the others.
            if (options.git === undefined) {
              const f = fail('invalid_input', 'git integration unavailable')
              json(res, f.res, 501)
              return
            }
            if (task.status === 'in_progress') throw new Error('Error: invalid_input: 任务执行中，不能合并')
            if (task.executions.some(e => e.outcome === 'running')) throw new Error('Error: invalid_input: 任务执行中，不能合并')
            const ws = workspaces.get(task.workspaceId)
            if (ws === undefined) throw new Error('Error: not_found: unknown workspace')
            const targets: Array<{ repo: string; branch: string }> = []
            if (task.branches !== undefined) {
              for (const [repo, branch] of Object.entries(task.branches)) targets.push({ repo, branch })
            }
            if (task.branch !== undefined && !targets.some(t => t.repo === '')) targets.unshift({ repo: '', branch: task.branch })
            if (targets.length === 0) throw new Error('Error: invalid_input: 该任务还没有 worktree 分支（未隔离执行过）')
            const multi = task.branches !== undefined
            const results: MergeRepoResult[] = []
            for (const target of targets) {
              if (!isValidRelRepoPath(target.repo)) throw new Error('Error: invalid_input: 非法的仓库路径')
              const repoRoot = repoMainPath(ws.path, target.repo)
              // No-op detection (0.3.1): a branch with no commits over HEAD
              // merges as "already up to date" — report that instead of landing
              // a bogus 已合并 comment.
              let noop = false
              try {
                noop = await options.git.isAncestor(repoRoot, target.branch)
              } catch { /* fail-soft: proceed to the real merge */ }
              if (noop) {
                results.push({ repo: target.repo, branch: target.branch, outcome: 'noop' })
                continue
              }
              try {
                // 0.6.3 review fix: parallel repos are self-governing — their
                // content AND their gitlink entries in the ROOT main checkout
                // (e.g. a container repo tracking `dsh-taskboard` as an embedded
                // repo) don't gate the root repo's merge. Child repos merge with
                // no extra exemption (their own .dsh-worktrees rule suffices).
                const exempt = target.repo === ''
                  ? await (options.scanner ?? createRepoScanner()).findNestedRepos(ws.path).then(rs => rs.map(r => r.relPath))
                  : undefined
                await options.git.merge(repoRoot, target.branch, exempt)
                results.push({ repo: target.repo, branch: target.branch, outcome: 'merged' })
              } catch (error) {
                results.push({
                  repo: target.repo,
                  branch: target.branch,
                  outcome: 'failed',
                  error: error instanceof Error ? error.message : String(error),
                })
              }
            }
            // R1: the git merges above are slow — re-find the FRESH task inside
            // the mutation so a concurrent comment is never overwritten.
            const pushComment = (body: string, system?: { key: string; params?: Record<string, string>; rows?: SystemCommentRow[] }): Promise<void> =>
              store.mutate('comment-added', ledger => {
                const { index, task: fresh } = liveTaskAt(ledger, id)
                const next = structuredClone(fresh)
                next.comments.push({
                  id: newCommentId(),
                  body: normalizeBody(body),
                  ...(system !== undefined ? {
                    systemKey: system.key,
                    ...(system.params !== undefined ? { systemParams: system.params } : {}),
                    ...(system.rows !== undefined ? { systemRows: system.rows } : {}),
                  } : {}),
                  version: 1,
                  createdAt: options.now(),
                })
                next.version = fresh.version + 1
                next.updatedAt = options.now()
                ledger.tasks[index] = next
                return [next]
              }).then(() => undefined)
            if (!multi) {
              // Legacy single-repo shape, byte-identical to 0.3.x–0.6.x.
              const root = results.find(r => r.repo === '')
              if (root === undefined) throw new Error('Error: invalid_input: 该任务还没有 worktree 分支（未隔离执行过）')
              if (root.outcome === 'noop') {
                json(res, { ok: true, value: { merged: false, noop: true, branch: root.branch } })
                return
              }
              if (root.outcome === 'failed') {
                throw new Error(`Error: invalid_input: ${root.error ?? '合并失败'}`)
              }
              await pushComment(`[系统] 分支 ${root.branch} 已合并到主工作区（--no-ff）。`, { key: 'sys.mergeSingle', params: { branch: root.branch } })
              json(res, { ok: true, value: { merged: true, branch: root.branch } })
              return
            }
            const labelOf = (repo: string): string => repo === '' ? '根仓库' : repo
            const mergedCount = results.filter(r => r.outcome === 'merged').length
            const failedCount = results.filter(r => r.outcome === 'failed').length
            const summary = results
              .map(r => r.outcome === 'merged'
                ? `${labelOf(r.repo)} ✓ 已合并`
                : r.outcome === 'noop' ? `${labelOf(r.repo)} ⟲ 无新提交` : `${labelOf(r.repo)} ✗ ${(r.error ?? '合并失败').slice(0, 150)}`)
              .join('；')
            await pushComment(`[系统] 分支已按仓库合并（--no-ff）：${summary}`, {
              key: 'sys.mergeMulti',
              rows: results.map(r => ({ repo: r.repo, outcome: r.outcome, ...(r.error !== undefined ? { error: r.error.slice(0, 150) } : {}) })),
            })
            json(res, {
              ok: true,
              value: {
                merged: mergedCount > 0,
                ...(mergedCount === 0 && failedCount === 0 ? { noop: true } : {}),
                results,
              },
            })
            return
          }
          if (action === 'worktree-remove') {
            // 🗑 删除 worktree (detail page): refuses uncommitted changes;
            // optionally deletes the task branch after the worktree is gone.
            if (options.git === undefined) {
              const f = fail('invalid_input', 'git integration unavailable')
              json(res, f.res, 501)
              return
            }
            if (task.executions.some(e => e.outcome === 'running')) throw new Error('Error: invalid_input: 任务执行中，不能删除 worktree')
            const ws = workspaces.get(task.workspaceId)
            if (ws === undefined) throw new Error('Error: not_found: unknown workspace')
            const path = worktreePathOf(ws.path, id)
            if (!insideWorktreeScope(ws.path, path)) {
              throw new Error('Error: invalid_input: 非法的清除路径（不在任务工作目录范围内）')
            }
            try {
              // 0.6.3: aggregated children-first mirror removal (see purge).
              await removeMirror(
                { git: options.git, scanner: options.scanner ?? createRepoScanner() },
                { workspacePath: ws.path, taskId: id },
              )
              await rm(path, { recursive: true, force: true })
            } catch (error) {
              throw new Error(`Error: invalid_input: ${error instanceof Error ? error.message : String(error)}`)
            }
            let branchDeleted = false
            let branchError: string | undefined
            if (body.deleteBranch === true) {
              const branchTargets: Array<{ repo: string; branch: string }> = []
              if (task.branches !== undefined) {
                for (const [repo, branch] of Object.entries(task.branches)) branchTargets.push({ repo, branch })
              }
              if (task.branch !== undefined && !branchTargets.some(t => t.repo === '')) branchTargets.push({ repo: '', branch: task.branch })
              let failures = 0
              for (const target of branchTargets) {
                try {
                  await options.git.deleteBranch(repoMainPath(ws.path, target.repo), target.branch)
                } catch (error) {
                  failures += 1
                  const label = target.repo === '' ? '根仓库' : target.repo
                  branchError = `${label}：${error instanceof Error ? error.message : String(error)}`
                }
              }
              branchDeleted = failures === 0
            }
            json(res, { ok: true, value: { removed: true, branchDeleted, ...(branchError !== undefined ? { branchError } : {}) } })
            return
          }
          const f = fail('not_found', `unknown action ${action}`)
          json(res, f.res, f.status)
        } catch (error) {
          const f = toFail(error)
          json(res, f.res, f.status)
        }
        return
      }

      // -------------------------------------- POST /worktree-cleanup (⚙ 诊断)
      if (pathname === `${ROUTE_PREFIX}/worktree-cleanup`) {
        try {
          if (options.git === undefined) {
            const f = fail('invalid_input', 'git integration unavailable')
            json(res, f.res, 501)
            return
          }
          const workspaceId = str(body, 'workspaceId') ?? ''
          const taskId = str(body, 'taskId') ?? ''
          const ws = workspaces.get(workspaceId)
          if (ws === undefined) throw new Error('Error: not_found: unknown workspace')
          // Only dirs owned by NO ledger task may be cleaned here; live tasks
          // remove their worktree from the detail page.
          if (store.get(taskId) !== undefined) throw new Error('Error: invalid_input: 任务仍在看板中，请从任务详情页删除其 worktree')
          // worktreePathOf throws on an illegal id charset (R4②); the resolved
          // target must additionally stay inside the plugin's own worktree
          // scope — the taskId is fully attacker-controlled body input (R4③).
          const path = worktreePathOf(ws.path, taskId)
          if (!insideWorktreeScope(ws.path, path)) {
            throw new Error('Error: invalid_input: 非法的清除路径（不在任务工作目录范围内）')
          }
          try {
            // 0.6.3: an orphan mirror may hold several repo worktrees —
            // aggregated children-first removal, then the leftover fs rm
            // (scope-verified above).
            await removeMirror(
              { git: options.git, scanner: options.scanner ?? createRepoScanner() },
              { workspacePath: ws.path, taskId },
            )
            await rm(path, { recursive: true, force: true })
          } catch (error) {
            throw new Error(`Error: invalid_input: ${error instanceof Error ? error.message : String(error)}`)
          }
          json(res, { ok: true, value: { cleaned: true, path } })
        } catch (error) {
          const f = toFail(error)
          json(res, f.res, f.status)
        }
        return
      }

      // ---------------------------------------------- POST /import/preview
      // (0.4.0) Dry-run: classify every task in the uploaded ledger file
      // against the live one; nothing is written.
      if (pathname === `${ROUTE_PREFIX}/import/preview`) {
        try {
          const known = new Set(store.snapshot().tasks.map(t => t.id))
          const plan = validateLedgerImport(body, known, options.now())
          json(res, {
            ok: true,
            value: {
              plan: {
                create: plan.create.map(t => ({ id: t.id, title: t.title, status: t.status })),
                overwrite: plan.overwrite.map(t => ({ id: t.id, title: t.title, status: t.status })),
                invalid: plan.invalid,
              },
            },
          })
        } catch (error) {
          const f = toFail(error)
          json(res, f.res, f.status)
        }
        return
      }

      // ------------------------------------------------------ POST /import
      // (0.4.0) Commit an import. mode=merge upserts (create + overwrite by
      // id); mode=replace swaps the WHOLE ledger (invalid entries dropped)
      // after writing a timestamped backup of the current one.
      if (pathname === `${ROUTE_PREFIX}/import`) {
        try {
          const mode = str(body, 'mode') === 'replace' ? 'replace' as const : 'merge' as const
          const raw = body.ledger
          const known = new Set(store.snapshot().tasks.map(t => t.id))
          const plan = validateLedgerImport(raw, known, options.now())
          const imported = [...plan.create, ...plan.overwrite]
          if (mode === 'replace' && imported.length === 0) {
            throw new Error('Error: invalid_input: 导入文件没有可导入的任务，已拒绝整册替换')
          }
          let backupFile: string | undefined
          if (mode === 'replace' && store.snapshot().tasks.length > 0) {
            backupFile = await store.backup()
          }
          let replacedTotal: number | undefined
          await store.mutate('ledger-replaced', ledger => {
            if (mode === 'replace') {
              // S6: a whole-ledger swap must not strand live executions — the
              // running sessions keep working with no task to settle into.
              if (ledger.tasks.some(t => t.executions.some(e => e.outcome === 'running'))) {
                throw new Error('Error: invalid_input: 有任务正在执行，不能整册替换（请先取消或等待结束）')
              }
              replacedTotal = ledger.tasks.length
              ledger.tasks = structuredClone(imported)
              // Replace is a whole-ledger swap (0.5.0): board settings ride
              // along when the file carries them; merge keeps the live ones.
              if (plan.settings !== undefined) ledger.settings = structuredClone(plan.settings)
              else delete ledger.settings
              return ledger.tasks
            }
            const byId = new Map(ledger.tasks.map(t => [t.id, t]))
            for (const task of imported) {
              // S6: merging over a task whose execution is live would orphan
              // that run the same way — refuse the overwrite.
              const existing = byId.get(task.id)
              if (existing !== undefined && existing.executions.some(e => e.outcome === 'running')) {
                throw new Error(`Error: invalid_input: 任务 ${task.id} 正在执行，不能被导入覆盖`)
              }
              byId.set(task.id, structuredClone(task))
            }
            ledger.tasks = [...byId.values()]
            return structuredClone(imported)
          })
          json(res, {
            ok: true,
            value: {
              mode,
              created: plan.create.length,
              overwritten: plan.overwrite.length,
              ...(mode === 'replace' ? { replacedTotal } : {}),
              ...(backupFile !== undefined ? { backupFile } : {}),
            },
          })
        } catch (error) {
          const f = toFail(error)
          json(res, f.res, f.status)
        }
        return
      }

      // ------------------------------------------- POST /templates (+delete)
      if (pathname === `${ROUTE_PREFIX}/templates` || pathname === `${ROUTE_PREFIX}/templates/delete`) {
        try {
          if (options.templates === undefined) {
            const f = fail('invalid_input', 'template store unavailable')
            json(res, f.res, 501)
            return
          }
          if (pathname.endsWith('/delete')) {
            const id = str(body, 'id') ?? ''
            if (id.length === 0) throw new Error('Error: invalid_input: id required')
            const deleted = await options.templates.remove(id)
            json(res, { ok: true, value: { deleted } })
            return
          }
          const name = str(body, 'name') ?? ''
          if (name.trim().length === 0) throw new Error('Error: invalid_input: name required')
          const template = await options.templates.upsert({
            id: str(body, 'id') ?? undefined,
            name,
            task: normalizeTemplateSpec(body.task, options.now()),
          })
          json(res, { ok: true, value: template }, 201)
        } catch (error) {
          const f = toFail(error)
          json(res, f.res, f.status)
        }
        return
      }

      // ------------------------------------------ POST /settings/update
      // (0.5.0) Whole-object replace semantics: omitted fields fall back to
      // their factory defaults. Affects only tasks created AFTER the change.
      if (pathname === `${ROUTE_PREFIX}/settings/update`) {
        try {
          const next = asBoardSettings(body)
          await store.mutate('settings-updated', ledger => {
            ledger.settings = next
            return []
          })
          json(res, { ok: true, value: next })
        } catch (error) {
          const f = toFail(error)
          json(res, f.res, f.status)
        }
        return
      }

      res.writeHead(404)
      res.end()
    } catch (error) {
      const f = fail('internal', error instanceof Error ? error.message : String(error))
      json(res, f.res, f.status)
    }
  }

  const sse = (req: IncomingMessage, res: ServerResponse): void => {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    res.write('retry: 2000\n\n')
    // Baseline frame: the client reconciles by revision and refetches state on gaps.
    res.write(`event: hello\ndata: ${JSON.stringify({ revision: store.snapshot().revision })}\n\n`)
    subscribers.add(res)
    // S2: a socket that dies between 'close' detection and the next write
    // would emit 'error' on the response — unhandled, that escalates to an
    // uncaughtException. Drop the subscriber instead.
    res.on('error', () => { subscribers.delete(res) })
    if (heartbeat === undefined) {
      heartbeat = setInterval(() => {
        for (const current of subscribers) current.write(': ping\n\n')
      }, HEARTBEAT_MS)
    }
    req.on('close', () => {
      subscribers.delete(res)
      if (subscribers.size === 0 && heartbeat !== undefined) {
        clearInterval(heartbeat)
        heartbeat = undefined
      }
    })
  }

  const disposers = [
    ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler }),
    ctx.webServer.register({ kind: 'exact', path: SSE_PATH, handler: sse }),
  ]
  return () => {
    unsubscribeBroadcast()
    for (const dispose of disposers) dispose()
    if (heartbeat !== undefined) clearInterval(heartbeat)
    for (const res of subscribers) res.end()
    subscribers.clear()
  }
}

/**
 * HTTP-level tests for the /dsh-taskboard routes: a real node:http server
 * wired to the real handler, driven with fetch — envelope shape, optimistic
 * versions, the user-only done move, purge semantics, and the SSE change
 * stream.
 *
 * Isolation model: the routes are registered ONCE (one server, one handler
 * set), but every test runs against a FRESH TaskStore/TemplateStore. The
 * registration is handed stable forwarding faces whose target is swapped in
 * beforeEach — so any test here can run alone, in any order, or sharded.
 */
import { createServer, type Server } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { registerTaskboardRoutes } from '../src/host/routes.ts'
import { TaskStore, type LedgerChange } from '../src/host/store.ts'
import { TemplateStore } from '../src/host/templates.ts'
import type { GitFace } from '../src/host/git.ts'
import type { WorkspaceFace } from '../src/host/tools.ts'
import type { TaskTemplate } from '../src/shared/api.ts'
import type { TaskLedger, TaskRecord } from '../src/shared/protocol.ts'

let server: Server
let base: string
let disposeRoutes: () => void
/** The live store behind the forwarding face; swapped fresh in beforeEach. */
let store: InstanceType<typeof TaskStore>
/** The live template store behind the forwarding face; swapped in beforeEach. */
let templates: InstanceType<typeof TemplateStore>
let cancelCalls: string[]
let runCalls: Array<{ id: string; runOptions?: { reuseWorktree?: boolean } }>
let dir: string
/** Per-test store file counter (unique names keep a fresh store from ever
 *  reading a previous test's ledger file). */
let storeSeq = 0

// Mutable workspace list + mutable git behavior (tests swap these).
const WS_BASE: Array<{ id: string; path: string; title: string }> = [
  { id: 'ws-a', path: '/proj/a', title: 'A' },
  { id: 'ws-b', path: '/proj/b', title: 'B' },
]
const wsList: Array<{ id: string; path: string; title: string }> = []
const workspaces: WorkspaceFace = {
  resolveByPath: async path => (path === '/proj/a' ? { id: 'ws-a' } : path === '/proj/b' ? { id: 'ws-b' } : undefined),
  get: id => wsList.find(w => w.id === id),
  list: () => wsList.slice(),
}

/** Factory defaults for the swappable git behavior (reset in beforeEach). */
function freshGitBehavior() {
  return {
    mergeError: undefined as string | undefined,
    removeError: undefined as undefined | ((path: string) => string | undefined),
    removeUnregistered: undefined as boolean | undefined,
    branchDeleteError: undefined as string | undefined,
    /** When true, isAncestor reports "branch already merged" (no-op merge). */
    noop: false,
    detect: async (_root: string) => false,
    merged: [] as Array<{ root: string; branch: string }>,
    removed: [] as string[],
    deletedBranches: [] as string[],
    /** Diff viewer: commit hash → patch text (undefined = fail-soft miss). */
    showCommit: undefined as string | undefined,
    /** Diff viewer: path → patch text (undefined = fail-soft miss). */
    showPath: undefined as string | undefined,
    showCommitCalls: [] as Array<{ cwd: string; hash: string }>,
    showPathCalls: [] as Array<{ cwd: string; path: string; base?: string }>,
  }
}

/** Swappable git behavior for the routes under test (fields reset per test). */
const gitBehavior = freshGitBehavior()
const gitFace: GitFace = {
  detect: root => gitBehavior.detect(root),
  binaryAvailable: async () => true,
  prepareWorktree: async () => undefined,
  collect: async () => ({ commits: [], commitsTotal: 0, dirtyFiles: [], dirtyFilesTotal: 0, changedFiles: 0 }),
  isAncestor: async () => gitBehavior.noop === true,
  merge: async (root, branch) => {
    gitBehavior.merged.push({ root, branch })
    if (gitBehavior.mergeError !== undefined) throw new Error(gitBehavior.mergeError)
  },
  removeWorktree: async (_root, path) => {
    gitBehavior.removed.push(path)
    const error = gitBehavior.removeError?.(path)
    if (error !== undefined) throw new Error(error)
    if (gitBehavior.removeUnregistered === true) return 'unregistered' as const
    return 'removed' as const
  },
  deleteBranch: async (_root, branch) => {
    gitBehavior.deletedBranches.push(branch)
    if (gitBehavior.branchDeleteError !== undefined) throw new Error(gitBehavior.branchDeleteError)
  },
  showCommit: async (cwd, hash) => {
    gitBehavior.showCommitCalls.push({ cwd, hash })
    return gitBehavior.showCommit === undefined ? undefined : { text: gitBehavior.showCommit, truncated: false }
  },
  showPathDiff: async (cwd, path, base) => {
    gitBehavior.showPathCalls.push({ cwd, path, base })
    return gitBehavior.showPath === undefined ? undefined : { text: gitBehavior.showPath, truncated: false }
  },
}

// ---------------------------------------------------------------------------
// Stable forwarding faces: routes are registered ONCE against these; each
// test swaps the live store behind them (mutating the SAME face objects, so
// the once-destructured references inside the routes keep working).
// ---------------------------------------------------------------------------

/** Subscribers registered through the face; re-hung on every store swap. */
const liveSubscribers = new Map<(change: LedgerChange) => void, () => void>()

/** Make `next` the live store: drop the old broadcast subscription and
 *  re-register every live subscriber on the new instance. */
function installLiveStores(next: InstanceType<typeof TaskStore>, nextTemplates: InstanceType<typeof TemplateStore>): void {
  for (const unsub of liveSubscribers.values()) unsub()
  store = next
  templates = nextTemplates
  for (const fn of liveSubscribers.keys()) liveSubscribers.set(fn, store.subscribe(fn))
}

const storeFace = {
  load: () => store.load(),
  snapshot: () => store.snapshot(),
  get: (id: string) => store.get(id),
  subscribe: (fn: (change: LedgerChange) => void) => {
    const unsub = store.subscribe(fn)
    liveSubscribers.set(fn, unsub)
    return () => {
      liveSubscribers.delete(fn)
      unsub()
    }
  },
  backup: () => store.backup(),
  mutate: (kind: LedgerChange['kind'], mutator: (ledger: TaskLedger) => TaskRecord[] | undefined) => store.mutate(kind, mutator),
  read: <T>(fn: (ledger: TaskLedger) => T) => store.read<T>(fn),
}

const templatesFace = {
  list: () => templates.list(),
  upsert: (input: { id?: string; name: string; task: TaskTemplate['task'] }) => templates.upsert(input),
  remove: (id: string) => templates.remove(id),
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tb-routes-'))
  installLiveStores(
    new TaskStore({ file: join(dir, 'ledger-0.json') }),
    new TemplateStore(join(dir, 'templates-0.json')),
  )
  cancelCalls = []
  runCalls = []
  server = createServer()
  const routes: Array<{ kind: string; path: string; handler: (req: never, res: never) => void }> = []
  const ctxFace = {
    webServer: {
      register: (route: { kind: string; path: string; handler: (req: never, res: never) => void }) => {
        routes.push(route)
        return () => {}
      },
    },
  }
  disposeRoutes = registerTaskboardRoutes(ctxFace as never, {
    store: storeFace as unknown as InstanceType<typeof TaskStore>,
    workspaces,
    now: () => 5_000,
    run: async (id, runOptions) => { runCalls.push({ id, runOptions }); return { ok: true, executionId: 'e-x', sessionId: 's-x' } },
    cancel: async id => { cancelCalls.push(id); return { ok: true, executionId: 'e-x' } },
    modelProviders: () => ['prov-a'],
    git: gitFace,
    templates: templatesFace as unknown as InstanceType<typeof TemplateStore>,
    modelCatalog: async () => ({
      models: [{ provider: 'prov-a', model: 'model-a', name: 'Model A' }],
      presets: [{ id: 'standard', name: '标准模式' }],
      defaultPresetId: 'standard',
    }),
  })
  server.on('request', (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    // Mirror the real webserver's longest-prefix-wins: exact routes shadow prefixes.
    const hit = routes.find(r => r.kind === 'exact' && url.pathname === r.path)
      ?? routes.find(r => r.kind === 'prefix' && url.pathname.startsWith(r.path))
    if (hit !== undefined) hit.handler(req as never, res as never)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
})

beforeEach(async () => {
  // Fresh ledger + template file per test: nothing leaks in from a previous
  // test's writes, and no test needs to "restore state for later tests".
  storeSeq += 1
  installLiveStores(
    new TaskStore({ file: join(dir, `ledger-${storeSeq}.json`) }),
    new TemplateStore(join(dir, `templates-${storeSeq}.json`)),
  )
  cancelCalls.length = 0
  runCalls.length = 0
  Object.assign(gitBehavior, freshGitBehavior())
  wsList.length = 0
  wsList.push(...WS_BASE.map(w => ({ ...w })))
})

afterAll(async () => {
  disposeRoutes()
  await new Promise<void>(resolve => server.close(() => resolve()))
  await rm(dir, { recursive: true, force: true })
})

/** POST helper. */
async function post(path: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

describe('taskboard routes', () => {
  it('serves an empty state baseline', async () => {
    const res = await fetch(`${base}/dsh-taskboard/state`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.value.tasks).toEqual([])
  })

  it('lists workspaces for the picker (with git availability)', async () => {
    const res = await fetch(`${base}/dsh-taskboard/workspaces`)
    const body = await res.json()
    expect(body.value).toEqual([
      { id: 'ws-a', path: '/proj/a', title: 'A', sessionCount: 0, gitAvailable: false },
      { id: 'ws-b', path: '/proj/b', title: 'B', sessionCount: 0, gitAvailable: false },
    ])
  })

  it('creates a task and rejects bad payloads', async () => {
    const ok = await post('/dsh-taskboard/tasks', { title: 'Route task', workspaceId: 'ws-a', urgency: 'urgent' })
    expect(ok.status).toBe(201)
    expect(ok.json.value.status).toBe('todo')
    expect(ok.json.value.urgency).toBe('urgent')
    const bad = await post('/dsh-taskboard/tasks', { title: '', workspaceId: 'ws-a', urgency: 'urgent' })
    expect(bad.status).toBe(400)
    expect(bad.json.error.code).toBe('invalid_input')
    const unknownWs = await post('/dsh-taskboard/tasks', { title: 'x', workspaceId: 'nope', urgency: 'normal' })
    expect(unknownWs.status).toBe(404)
  })

  it('moves through the lifecycle; the USER may complete (done)', async () => {
    const created = await post('/dsh-taskboard/tasks', { title: 'Lifecycle', workspaceId: 'ws-a', urgency: 'normal' })
    const id = created.json.value.id as string
    const claim = await post(`/dsh-taskboard/tasks/${id}/move`, { ifVersion: 1, status: 'in_progress' })
    expect(claim.json.value.status).toBe('in_progress')
    const review = await post(`/dsh-taskboard/tasks/${id}/move`, { ifVersion: 2, status: 'in_review' })
    expect(review.json.value.status).toBe('in_review')
    const done = await post(`/dsh-taskboard/tasks/${id}/move`, { ifVersion: 3, status: 'done' })
    expect(done.json.value.status).toBe('done')
  })

  it('rejects stale versions with 409', async () => {
    const created = await post('/dsh-taskboard/tasks', { title: 'Stale', workspaceId: 'ws-a', urgency: 'relaxed' })
    const id = created.json.value.id as string
    const stale = await post(`/dsh-taskboard/tasks/${id}/move`, { ifVersion: 99, status: 'in_progress' })
    expect(stale.status).toBe(409)
    expect(stale.json.error.code).toBe('version_conflict')
  })

  it('quick-reject: in_review → todo with optional note, atomically', async () => {
    const created = await post('/dsh-taskboard/tasks', { title: 'QuickReject', workspaceId: 'ws-a', urgency: 'normal' })
    const id = created.json.value.id as string
    await post(`/dsh-taskboard/tasks/${id}/move`, { ifVersion: 1, status: 'in_progress' })
    await post(`/dsh-taskboard/tasks/${id}/move`, { ifVersion: 2, status: 'in_review' })

    // With a note: one call moves back AND appends the user comment.
    const withNote = await post(`/dsh-taskboard/tasks/${id}/reject`, { ifVersion: 3, body: '  样式不对，改下按钮颜色  ' })
    expect(withNote.status).toBe(200)
    expect(withNote.json.value.status).toBe('todo')
    const full1 = await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()
    expect(full1.value.version).toBe(4)
    expect(full1.value.comments.length).toBe(1)
    expect(full1.value.comments[0].body).toBe('样式不对，改下按钮颜色')

    // Without a note: plain move, no comment.
    const bare = await post(`/dsh-taskboard/tasks/${id}/move`, { ifVersion: 4, status: 'in_progress' })
    expect(bare.json.value.status).toBe('in_progress')
    await post(`/dsh-taskboard/tasks/${id}/move`, { ifVersion: 5, status: 'in_review' })
    const noNote = await post(`/dsh-taskboard/tasks/${id}/reject`, { ifVersion: 6, body: '   ' })
    expect(noNote.status).toBe(200)
    expect(noNote.json.value.status).toBe('todo')
    const full2 = await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()
    expect(full2.value.comments.length).toBe(1) // whitespace-only note → skipped

    // Stale version: the move fails and NO orphan comment appears.
    await post(`/dsh-taskboard/tasks/${id}/move`, { ifVersion: 7, status: 'in_progress' })
    await post(`/dsh-taskboard/tasks/${id}/move`, { ifVersion: 8, status: 'in_review' })
    const stale = await post(`/dsh-taskboard/tasks/${id}/reject`, { ifVersion: 99, body: 'should not land' })
    expect(stale.status).toBe(409)
    const full3 = await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()
    expect(full3.value.status).toBe('in_review')
    expect(full3.value.comments.length).toBe(1)

    // Illegal source (done → todo is not in the state machine): 400.
    await post(`/dsh-taskboard/tasks/${id}/move`, { ifVersion: 9, status: 'done' })
    const illegal = await post(`/dsh-taskboard/tasks/${id}/reject`, { ifVersion: 10 })
    expect(illegal.status).toBe(400)
    expect(illegal.json.error.code).toBe('invalid_transition')
  })

  it('comments then soft-deletes then purges', async () => {
    const created = await post('/dsh-taskboard/tasks', { title: 'CDP', workspaceId: 'ws-a', urgency: 'normal' })
    const id = created.json.value.id as string
    const comment = await post(`/dsh-taskboard/tasks/${id}/comment`, { body: 'user note' })
    expect(comment.status).toBe(201)
    const soft = await post(`/dsh-taskboard/tasks/${id}/delete`, { ifVersion: 2 })
    expect(soft.json.value.trashed).toBe(true)
    const state = await (await fetch(`${base}/dsh-taskboard/state`)).json()
    const trashed = state.value.tasks.find((t: { id: string }) => t.id === id)
    expect(trashed.trashedAt).toBeGreaterThan(0)
    const purge = await post(`/dsh-taskboard/tasks/${id}/delete`, { purge: true })
    expect(purge.json.value.purged).toBe(true)
    const after = await (await fetch(`${base}/dsh-taskboard/state`)).json()
    expect(after.value.tasks.find((t: { id: string }) => t.id === id)).toBeUndefined()
  })

  it('updates fields including project rebind; unknown workspace 404', async () => {
    const created = await post('/dsh-taskboard/tasks', { title: 'Editable', workspaceId: 'ws-a', urgency: 'normal' })
    const id = created.json.value.id as string
    const upd = await post(`/dsh-taskboard/tasks/${id}/update`, { ifVersion: 1, title: 'Edited', urgency: 'urgent', workspaceId: 'ws-b' })
    expect(upd.status).toBe(200)
    expect(upd.json.value.version).toBe(2)
    const full = await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()
    expect(full.value.title).toBe('Edited')
    expect(full.value.urgency).toBe('urgent')
    expect(full.value.workspaceId).toBe('ws-b')
    const bad = await post(`/dsh-taskboard/tasks/${id}/update`, { ifVersion: 2, workspaceId: 'nope' })
    expect(bad.status).toBe(404)
  })

  it('archived tasks are immutable: update and comment both refuse with 400 invalid_transition', async () => {
    const created = await post('/dsh-taskboard/tasks', { title: '已归档', workspaceId: 'ws-a', urgency: 'normal' })
    const id = created.json.value.id as string
    await store.mutate('task-updated', ledger => {
      const target = ledger.tasks.find(t => t.id === id)!
      target.status = 'archived'
      target.version += 1
      return [target]
    })
    const full = await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()

    const upd = await post(`/dsh-taskboard/tasks/${id}/update`, { ifVersion: full.value.version, title: '不该改' })
    expect(upd.status).toBe(400)
    expect(upd.json.error.code).toBe('invalid_transition')
    expect(upd.json.error.message).toContain('archived tasks are immutable')

    const comment = await post(`/dsh-taskboard/tasks/${id}/comment`, { body: '迟到的评论' })
    expect(comment.status).toBe(400)
    expect(comment.json.error.code).toBe('invalid_transition')

    // Nothing slipped through: title/version/comments all frozen.
    const after = await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()
    expect(after.value.title).toBe('已归档')
    expect(after.value.version).toBe(full.value.version)
    expect(after.value.comments).toEqual([])
  })

  it('POST /tasks rejects non-initial statuses (backlog/todo only)', async () => {
    const bad = await post('/dsh-taskboard/tasks', { title: '不能直接进行中', workspaceId: 'ws-a', urgency: 'normal', status: 'in_progress' })
    expect(bad.status).toBe(400)
    expect(bad.json.error.code).toBe('invalid_transition')
    expect(bad.json.error.message).toContain('a new task must start as backlog or todo')
    expect(store.snapshot().tasks).toHaveLength(0) // nothing was created

    // backlog is a legal starting status (未授权 backlog column).
    const backlog = await post('/dsh-taskboard/tasks', { title: '储备', workspaceId: 'ws-a', urgency: 'relaxed', status: 'backlog' })
    expect(backlog.status).toBe(201)
    expect(backlog.json.value.status).toBe('backlog')
  })

  it('keeps an agent claim alive across user edits; a user move releases it', async () => {
    const created = await post('/dsh-taskboard/tasks', { title: 'Held', workspaceId: 'ws-a', urgency: 'normal' })
    const id = created.json.value.id as string
    // An agent claims it (tool semantics): explicit claimedBy fields.
    await store.mutate('task-moved', ledger => {
      const target = ledger.tasks.find(t => t.id === id)!
      target.status = 'in_progress'
      target.claimedBy = 'session-holder'
      target.claimedAt = 5_000
      target.version += 1
      target.updatedBy = { kind: 'agent', sessionId: 'session-holder' }
      return [target]
    })
    // The user edits the task in the GUI — the claim must survive (updatedBy
    // is audit-only; the pre-claim-field inference lost the holder here).
    const full1 = await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()
    const upd = await post(`/dsh-taskboard/tasks/${id}/update`, { ifVersion: full1.value.version, title: 'Held (edited)' })
    expect(upd.status).toBe(200)
    const full2 = await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()
    expect(full2.value.title).toBe('Held (edited)')
    expect(full2.value.claimedBy).toBe('session-holder')
    // A user move out of in_progress releases the hold.
    const back = await post(`/dsh-taskboard/tasks/${id}/move`, { ifVersion: full2.value.version, status: 'todo' })
    expect(back.json.value.status).toBe('todo')
    const full3 = await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()
    expect(full3.value.claimedBy).toBeUndefined()
  })

  it('rejects unknown model providers and malformed models with 400', async () => {
    const ghost = await post('/dsh-taskboard/tasks', { title: 'Model ghost', workspaceId: 'ws-a', urgency: 'normal', model: { provider: 'ghost', model: 'x' } })
    expect(ghost.status).toBe(400)
    expect(ghost.json.error.message).toContain('no registered route')
    const malformed = await post('/dsh-taskboard/tasks', { title: 'Model bad', workspaceId: 'ws-a', urgency: 'normal', model: { provider: 5 } })
    expect(malformed.status).toBe(400)
    const ok = await post('/dsh-taskboard/tasks', { title: 'Model ok', workspaceId: 'ws-a', urgency: 'normal', model: { provider: 'prov-a', model: 'm-1' } })
    expect(ok.status).toBe(201)
    // update path validates too
    const updBad = await post(`/dsh-taskboard/tasks/${ok.json.value.id}/update`, { ifVersion: 1, model: { provider: 'ghost', model: 'x' } })
    expect(updBad.status).toBe(400)
  })

  it('cancels a running execution via the cancel action', async () => {
    const created = await post('/dsh-taskboard/tasks', { title: 'Cancel me', workspaceId: 'ws-a', urgency: 'normal' })
    const id = created.json.value.id as string
    const res = await post(`/dsh-taskboard/tasks/${id}/cancel`, {})
    expect(res.status).toBe(202)
    expect(res.json.value.cancelled).toBe(true)
    expect(cancelCalls).toContain(id)
  })

  it('streams SSE change events', async () => {
    const controller = new AbortController()
    const res = await fetch(`${base}/dsh-taskboard/events`, { signal: controller.signal })
    expect(res.status).toBe(200)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const createP = post('/dsh-taskboard/tasks', { title: 'SSE task', workspaceId: 'ws-a', urgency: 'urgent' })
    // read frames until a change event arrives
    let sawChange = false
    while (!sawChange) {
      const { value } = await reader.read()
      buffer += decoder.decode(value, { stream: true })
      if (buffer.includes('event: change')) sawChange = true
    }
    expect(sawChange).toBe(true)
    expect(buffer).toContain('SSE task')
    const created = await createP
    expect(created.status).toBe(201)
    controller.abort()
  })

  // ------------------------------------------------------------- 0.3.0 worktree
  it('create accepts isolation; update locks it once executions exist', async () => {
    const created = await post('/dsh-taskboard/tasks', { title: 'Iso task', workspaceId: 'ws-a', urgency: 'normal', isolation: 'none' })
    expect(created.status).toBe(201)
    expect(created.json.value.id).toBeTruthy()
    const id = created.json.value.id as string
    const full = await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()
    expect(full.value.isolation).toBe('none')

    const badIso = await post('/dsh-taskboard/tasks', { title: 'Iso bad', workspaceId: 'ws-a', urgency: 'normal', isolation: 'docker' })
    expect(badIso.status).toBe(400)

    // Before any execution: switching is allowed.
    const switchOk = await post(`/dsh-taskboard/tasks/${id}/update`, { ifVersion: full.value.version, isolation: 'worktree' })
    expect(switchOk.status).toBe(200)
    const full2 = await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()
    expect(full2.value.isolation).toBe('worktree')

    // After an execution record exists: locked.
    await store.mutate('execution-recorded', ledger => {
      const target = ledger.tasks.find(t => t.id === id)!
      target.executions.push({ id: 'e-1', trigger: 'manual', startedAt: 5_000, outcome: 'succeeded', endedAt: 5_100 })
      target.version += 1
      return [target]
    })
    const full3 = await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()
    const locked = await post(`/dsh-taskboard/tasks/${id}/update`, { ifVersion: full3.value.version, isolation: 'none' })
    expect(locked.status).toBe(400)
    expect(locked.json.error.message).toContain('已锁定')
  })

  it('presetId: create stores it (trimmed), update swaps it any time, null clears it', async () => {
    // Create with a preset; empty string = omitted.
    const a = await post('/dsh-taskboard/tasks', { title: 'Preset A', workspaceId: 'ws-a', urgency: 'normal', presetId: '  liangshen  ' })
    expect(a.status).toBe(201)
    const idA = a.json.value.id as string
    const fullA = await (await fetch(`${base}/dsh-taskboard/tasks/${idA}`)).json()
    expect(fullA.value.presetId).toBe('liangshen')

    const b = await post('/dsh-taskboard/tasks', { title: 'Preset B', workspaceId: 'ws-a', urgency: 'normal', presetId: '' })
    const idB = b.json.value.id as string
    const fullB = await (await fetch(`${base}/dsh-taskboard/tasks/${idB}`)).json()
    expect(fullB.value.presetId).toBeUndefined()

    // Update swaps the preset even AFTER executions exist (each run composes fresh).
    await store.mutate('execution-recorded', ledger => {
      const target = ledger.tasks.find(t => t.id === idA)!
      target.executions.push({ id: 'e-9', trigger: 'manual', startedAt: 5_000, outcome: 'succeeded', endedAt: 5_100 })
      target.version += 1
      return [target]
    })
    const fullA2 = await (await fetch(`${base}/dsh-taskboard/tasks/${idA}`)).json()
    const swapped = await post(`/dsh-taskboard/tasks/${idA}/update`, { ifVersion: fullA2.value.version, presetId: 'standard' })
    expect(swapped.status).toBe(200)
    const fullA3 = await (await fetch(`${base}/dsh-taskboard/tasks/${idA}`)).json()
    expect(fullA3.value.presetId).toBe('standard')

    // null clears it back to "follow the deployment default".
    const cleared = await post(`/dsh-taskboard/tasks/${idA}/update`, { ifVersion: fullA3.value.version, presetId: null })
    expect(cleared.status).toBe(200)
    const fullA4 = await (await fetch(`${base}/dsh-taskboard/tasks/${idA}`)).json()
    expect(fullA4.value.presetId).toBeUndefined()
  })

  it('merge: needs a branch; merges --no-ff and leaves a system comment; git failures map to 400', async () => {
    const created = await post('/dsh-taskboard/tasks', { title: 'Merge me', workspaceId: 'ws-a', urgency: 'normal' })
    const id = created.json.value.id as string

    // No branch yet → 400.
    const noBranch = await post(`/dsh-taskboard/tasks/${id}/merge`, {})
    expect(noBranch.status).toBe(400)
    expect(noBranch.json.error.message).toContain('worktree 分支')

    // Give the task a pinned branch (as a successful isolated run would).
    await store.mutate('task-updated', ledger => {
      const target = ledger.tasks.find(t => t.id === id)!
      target.branch = 'task/Merge-me+t-x'
      target.version += 1
      return [target]
    })

    gitBehavior.mergeError = '主工作区有 3 处未提交修改，请先提交或暂存后再合并'
    const dirty = await post(`/dsh-taskboard/tasks/${id}/merge`, {})
    expect(dirty.status).toBe(400)
    expect(dirty.json.error.message).toContain('未提交修改')

    gitBehavior.mergeError = undefined
    gitBehavior.merged = []
    const okMerge = await post(`/dsh-taskboard/tasks/${id}/merge`, {})
    expect(okMerge.status).toBe(200)
    expect(okMerge.json.value).toEqual({ merged: true, branch: 'task/Merge-me+t-x' })
    expect(gitBehavior.merged).toEqual([{ root: '/proj/a', branch: 'task/Merge-me+t-x' }])

    // A system comment landed on the task.
    const full = await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()
    const mergeComment = (full.value.comments as Array<{ body: string }>).find(c => c.body.includes('已合并到主工作区'))
    expect(mergeComment).toBeTruthy()
  })

  it('worktree-remove: refuses dirty worktrees with 400; deleteBranch failures surface as branchError', async () => {
    const created = await post('/dsh-taskboard/tasks', { title: 'Clean me', workspaceId: 'ws-a', urgency: 'normal' })
    const id = created.json.value.id as string
    await store.mutate('task-updated', ledger => {
      const target = ledger.tasks.find(t => t.id === id)!
      target.branch = 'task/Clean-me+t-y'
      return [target]
    })

    gitBehavior.removeError = () => 'worktree 有 2 处未提交修改，拒绝删除：\n M a\n M b'
    const dirty = await post(`/dsh-taskboard/tasks/${id}/worktree-remove`, {})
    expect(dirty.status).toBe(400)
    expect(dirty.json.error.message).toContain('未提交修改')

    gitBehavior.removeError = undefined
    gitBehavior.removed = []
    gitBehavior.branchDeleteError = "error: Cannot delete branch 'task/Clean-me+t-y' checked out at '/x'"
    const res = await post(`/dsh-taskboard/tasks/${id}/worktree-remove`, { deleteBranch: true })
    expect(res.status).toBe(200)
    expect(res.json.value.removed).toBe(true)
    expect(res.json.value.branchDeleted).toBe(false)
    expect(res.json.value.branchError).toContain('checked out')
    expect(gitBehavior.removed).toEqual([`/proj/a/.dsh-worktrees/${id}`])

    gitBehavior.branchDeleteError = undefined
    const res2 = await post(`/dsh-taskboard/tasks/${id}/worktree-remove`, { deleteBranch: true })
    expect(res2.json.value.branchDeleted).toBe(true)
  })

  it('diagnostics lists orphan worktrees and cleanup removes them (fs fallback)', async () => {
    // A real directory on disk owned by NO ledger task = orphan.
    const ghostPath = join(dir, '.dsh-worktrees', 't-ghost')
    await mkdir(ghostPath, { recursive: true })
    wsList.push({ id: 'ws-tmp', path: dir, title: 'TMP' })
    try {
      let diag = await (await fetch(`${base}/dsh-taskboard/diagnostics`)).json()
      const orphan = diag.value.orphanWorktrees.find((o: { taskId: string }) => o.taskId === 't-ghost')
      expect(orphan).toEqual({ workspaceId: 'ws-tmp', workspacePath: dir, taskId: 't-ghost', path: ghostPath.replaceAll('\\', '/') })

      // Cleanup with git reporting an unregistered leftover → fs fallback
      // (S3: structured outcome from the face, not a parsed stderr message).
      gitBehavior.removeUnregistered = true
      const clean = await post('/dsh-taskboard/worktree-cleanup', { workspaceId: 'ws-tmp', taskId: 't-ghost' })
      expect(clean.status).toBe(200)
      expect(clean.json.value.cleaned).toBe(true)

      diag = await (await fetch(`${base}/dsh-taskboard/diagnostics`)).json()
      expect(diag.value.orphanWorktrees.find((o: { taskId: string }) => o.taskId === 't-ghost')).toBeUndefined()

      // R4: cleanup with traversal-shaped taskIds must never reach the fs
      // layer (the old flow rm -rf'd whatever worktreePathOf joined).
      const victim = join(dir, 'victim-project')
      await mkdir(victim, { recursive: true })
      await writeFile(join(victim, 'important.txt'), 'keep me')
      try {
        for (const taskId of ['../victim-project', '..\\victim-project', '../../elsewhere', 'a/b', '.dsh-worktrees-evil']) {
          const attack = await post('/dsh-taskboard/worktree-cleanup', { workspaceId: 'ws-tmp', taskId })
          expect(attack.status).toBe(400)
          expect(attack.json.error.code).toBe('invalid_input')
        }
        expect(await readFile(join(victim, 'important.txt'), 'utf8')).toBe('keep me')
      } finally {
        await rm(victim, { recursive: true, force: true })
      }

      // Cleanup refuses a task that still exists in the ledger.
      const created = await post('/dsh-taskboard/tasks', { title: 'Live', workspaceId: 'ws-a', urgency: 'normal' })
      const liveId = created.json.value.id as string
      const refuse = await post('/dsh-taskboard/worktree-cleanup', { workspaceId: 'ws-tmp', taskId: liveId })
      expect(refuse.status).toBe(400)
      expect(refuse.json.error.message).toContain('详情页')

      // gitignore suggestions: a git-enabled dir without .gitignore is
      // suggested; once the entry exists it disappears from the list.
      const gitDir = join(dir, 'gi-probe')
      await mkdir(gitDir, { recursive: true })
      wsList.push({ id: 'ws-gi', path: gitDir, title: 'GI' })
      const prevDetect = gitBehavior.detect
      gitBehavior.detect = async (root: string) => root.replaceAll('\\', '/') === gitDir.replaceAll('\\', '/')
      try {
        let diag2 = await (await fetch(`${base}/dsh-taskboard/diagnostics`)).json()
        expect(diag2.value.gitIgnoreSuggestions).toEqual([{ workspaceId: 'ws-gi', workspacePath: gitDir }])

        await writeFile(join(gitDir, '.gitignore'), 'node_modules\n.dsh-worktrees/\n', 'utf8')
        diag2 = await (await fetch(`${base}/dsh-taskboard/diagnostics`)).json()
        expect(diag2.value.gitIgnoreSuggestions.find((s: { workspaceId: string }) => s.workspaceId === 'ws-gi')).toBeUndefined()
      } finally {
        gitBehavior.detect = prevDetect
        wsList.splice(wsList.findIndex(w => w.id === 'ws-gi'), 1)
      }
    } finally {
      wsList.splice(wsList.findIndex(w => w.id === 'ws-tmp'), 1)
      gitBehavior.removeError = undefined
    }
  })

  it('run action passes reuse through to the execution service (续跑)', async () => {
    const created = await post('/dsh-taskboard/tasks', { title: 'Reuse me', workspaceId: 'ws-a', urgency: 'normal' })
    const id = created.json.value.id as string

    const plain = await post(`/dsh-taskboard/tasks/${id}/run`, {})
    expect(plain.status).toBe(202)
    expect(runCalls.at(-1)).toEqual({ id, runOptions: undefined })

    const reuse = await post(`/dsh-taskboard/tasks/${id}/run`, { reuse: true })
    expect(reuse.status).toBe(202)
    expect(runCalls.at(-1)).toEqual({ id, runOptions: { reuseWorktree: true } })
  })

  it('merge: a branch with no new commits is a no-op (no merge, no comment)', async () => {
    const created = await post('/dsh-taskboard/tasks', { title: 'Noop merge', workspaceId: 'ws-a', urgency: 'normal' })
    const id = created.json.value.id as string
    await store.mutate('task-updated', ledger => {
      const target = ledger.tasks.find(t => t.id === id)!
      target.branch = 'task/Noop-merge+t-n'
      return [target]
    })

    gitBehavior.noop = true
    try {
      const res = await post(`/dsh-taskboard/tasks/${id}/merge`, {})
      expect(res.status).toBe(200)
      expect(res.json.value).toEqual({ merged: false, noop: true, branch: 'task/Noop-merge+t-n' })
      // No git merge ran and no 已合并 comment landed.
      expect(gitBehavior.merged.filter(m => m.branch === 'task/Noop-merge+t-n')).toEqual([])
      const full = await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()
      expect((full.value.comments as Array<{ body: string }>).some(c => c.body.includes('已合并'))).toBe(false)
    } finally {
      gitBehavior.noop = false
    }
  })

  it('purge refuses uncommitted worktree changes, then cleans worktree + branch on success', async () => {
    const created = await post('/dsh-taskboard/tasks', { title: 'Purge me', workspaceId: 'ws-a', urgency: 'normal' })
    const id = created.json.value.id as string
    await store.mutate('task-updated', ledger => {
      const target = ledger.tasks.find(t => t.id === id)!
      target.branch = 'task/Purge-me+t-p'
      return [target]
    })
    // Soft-delete first (purge requires trashed).
    await post(`/dsh-taskboard/tasks/${id}/delete`, { ifVersion: 1 })

    // Dirty worktree → purge refused with the file list; ledger entry stays.
    gitBehavior.removeError = path => path.endsWith(id) ? 'worktree 有 1 处未提交修改，拒绝删除：\n M keep.ts' : undefined
    const dirty = await post(`/dsh-taskboard/tasks/${id}/delete`, { purge: true })
    expect(dirty.status).toBe(400)
    expect(dirty.json.error.message).toContain('未提交修改')
    expect(store.get(id)).toBeDefined()

    // Clean → worktree removed, branch deleted, ledger entry gone.
    gitBehavior.removeError = undefined
    gitBehavior.removed = []
    gitBehavior.deletedBranches = []
    const ok = await post(`/dsh-taskboard/tasks/${id}/delete`, { purge: true })
    expect(ok.status).toBe(200)
    expect(ok.json.value.purged).toBe(true)
    expect(gitBehavior.removed).toEqual([`/proj/a/.dsh-worktrees/${id}`])
    expect(gitBehavior.deletedBranches).toEqual(['task/Purge-me+t-p'])
    expect(store.get(id)).toBeUndefined()
  })
})

describe('taskboard routes 0.4.0 (checklist / templates / import / diff)', () => {
  // ------------------------------------------------------------- checklist
  it('create accepts checklist texts; update replaces the whole list or clears it', async () => {
    const created = await post('/dsh-taskboard/tasks', {
      title: '带清单任务', workspaceId: 'ws-a', urgency: 'normal', checklist: ['复现', '修复', '回归通过'],
    })
    expect(created.status).toBe(201)
    const id = created.json.value.id as string
    const task = await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()
    expect(task.value.checklist).toHaveLength(3)
    expect(task.value.checklist[0]).toMatchObject({ text: '复现', checked: false })

    // Full replace: check one item, drop another (ids preserved where kept).
    const items = (task.value.checklist as Array<{ id: string; text: string }>)
    const replaced = await post(`/dsh-taskboard/tasks/${id}/update`, {
      ifVersion: 1,
      checklist: [
        { id: items[0]!.id, text: '复现', checked: true, checkedBy: 'user', checkedAt: 5 },
        { text: '新增项' },
      ],
    })
    expect(replaced.status).toBe(200)
    const after = (await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()).value
    expect(after.checklist).toHaveLength(2)
    expect(after.checklist[0]).toMatchObject({ checked: true, checkedBy: 'user' })
    expect(after.checklist[1]!.id).not.toBe(items[1]!.id) // minted for the new row

    // null clears.
    const cleared = await post(`/dsh-taskboard/tasks/${id}/update`, { ifVersion: 2, checklist: null })
    expect(cleared.status).toBe(200)
    const done = (await (await fetch(`${base}/dsh-taskboard/tasks/${id}`)).json()).value
    expect(done.checklist).toBeUndefined()

    // Bad payload rejected.
    const bad = await post('/dsh-taskboard/tasks', { title: 'x', workspaceId: 'ws-a', urgency: 'normal', checklist: [1] })
    expect(bad.status).toBe(400)
  })

  // ------------------------------------------------------------- templates
  it('templates: seeds built-ins, upserts, renames, deletes', async () => {
    const list = await (await fetch(`${base}/dsh-taskboard/templates`)).json()
    const names = (list.value.templates as Array<{ name: string; builtin?: boolean }>).map(t => t.name)
    expect(names).toContain('Bug 修复')
    expect(names).toContain('发布检查')
    expect(names).toContain('例行巡检')

    const created = await post('/dsh-taskboard/templates', {
      name: '我的模板',
      task: { title: '从模板开始', urgency: 'urgent', checklist: ['a', 'b'], execution: { mode: 'scheduled', cron: '0 9 * * 1' } },
    })
    expect(created.status).toBe(201)
    const id = created.json.value.id as string
    expect(created.json.value.task.checklist).toEqual(['a', 'b'])

    const renamed = await post('/dsh-taskboard/templates', { id, name: '改名后', task: { urgency: 'relaxed' } })
    expect(renamed.status).toBe(201)

    // Bad spec rejected.
    const bad = await post('/dsh-taskboard/templates', { name: 'x', task: { urgency: 'hot' } })
    expect(bad.status).toBe(400)

    const deleted = await post('/dsh-taskboard/templates/delete', { id })
    expect(deleted.json.value.deleted).toBe(true)
    const after = await (await fetch(`${base}/dsh-taskboard/templates`)).json()
    expect((after.value.templates as Array<{ id: string }>).some(t => t.id === id)).toBe(false)
  })

  // ---------------------------------------------------------------- import
  it('import: preview classifies; merge upserts by id; replace swaps with backup; running → failed', async () => {
    // A live task to overwrite.
    const live = await post('/dsh-taskboard/tasks', { title: '将被覆盖', workspaceId: 'ws-a', urgency: 'normal' })
    const liveId = live.json.value.id as string

    const file = {
      schemaVersion: 1,
      tasks: [
        {
          id: liveId, title: '覆盖后的标题', workspaceId: 'ws-a', urgency: 'relaxed',
          comments: [], executions: [{ trigger: 'manual', outcome: 'running', sessionId: 's-old' }],
        },
        { id: 't-imported', title: '新导入', workspaceId: 'ws-b', urgency: 'urgent', comments: [], executions: [] },
        { id: 't-broken', title: '', workspaceId: 'ws-a', urgency: 'normal', comments: [], executions: [] },
      ],
    }

    // Dry-run: nothing written yet.
    const preview = await post('/dsh-taskboard/import/preview', file)
    expect(preview.status).toBe(200)
    expect(preview.json.value.plan.create).toEqual([{ id: 't-imported', title: '新导入', status: 'todo' }])
    expect(preview.json.value.plan.overwrite).toHaveLength(1)
    expect(preview.json.value.plan.overwrite[0].title).toBe('覆盖后的标题')
    expect(preview.json.value.plan.invalid).toEqual([{ id: 't-broken', reason: expect.any(String) }])
    expect(store.get('t-imported')).toBeUndefined()

    // Bad schema refused outright.
    const badSchema = await post('/dsh-taskboard/import/preview', { schemaVersion: 99, tasks: [] })
    expect(badSchema.status).toBe(400)
    expect(badSchema.json.error.message).toContain('schemaVersion')

    // Merge commit: overwrite + create; the running execution lands as failed.
    const merged = await post('/dsh-taskboard/import', { mode: 'merge', ledger: file })
    expect(merged.status).toBe(200)
    expect(merged.json.value).toMatchObject({ mode: 'merge', created: 1, overwritten: 1 })
    const overwritten = store.get(liveId)!
    expect(overwritten.title).toBe('覆盖后的标题')
    expect(overwritten.executions[0]!.outcome).toBe('failed')
    expect(store.get('t-imported')!.title).toBe('新导入')

    // Replace: whole-ledger swap with an automatic backup file written.
    const tinyFile = { schemaVersion: 1, tasks: [{ id: 't-only', title: '唯一', workspaceId: 'ws-a', urgency: 'normal', comments: [], executions: [] }] }
    const replaced = await post('/dsh-taskboard/import', { mode: 'replace', ledger: tinyFile })
    expect(replaced.status).toBe(200)
    expect(replaced.json.value.mode).toBe('replace')
    expect(replaced.json.value.backupFile).toContain('backup-')
    expect(store.snapshot().tasks.map(t => t.id)).toEqual(['t-only'])

    // Replace with zero importable tasks is refused (would wipe for nothing).
    const refused = await post('/dsh-taskboard/import', { mode: 'replace', ledger: { schemaVersion: 1, tasks: [{ id: 'z', title: '', workspaceId: 'x', urgency: 'normal', comments: [], executions: [] }] } })
    expect(refused.status).toBe(400)
  })

  // ------------------------------------------------------------------ diff
  it('diff endpoint: serves commits and paths from the live worktree, falls back to the main repo', async () => {
    const created = await post('/dsh-taskboard/tasks', { title: 'Diff 任务', workspaceId: 'ws-a', urgency: 'normal' })
    const id = created.json.value.id as string
    await store.mutate('execution-recorded', ledger => {
      const target = ledger.tasks.find(t => t.id === id)!
      target.branch = 'task/diff+t-d'
      target.executions.push({
        id: 'e-diff', trigger: 'manual', startedAt: 1, outcome: 'succeeded',
        isolation: 'worktree', branch: 'task/diff+t-d', worktreePath: '/proj/a/.dsh-worktrees/wt1', baseCommit: 'abc123',
      })
      return [target]
    })

    // Commit view: worktree first.
    gitBehavior.showCommit = 'commit patch here'
    const commit = await (await fetch(`${base}/dsh-taskboard/tasks/${id}/diff?execution=e-diff&commit=abc123`)).json()
    expect(commit.value).toEqual({ diff: 'commit patch here', truncated: false })
    expect(gitBehavior.showCommitCalls.at(-1)).toEqual({ cwd: '/proj/a/.dsh-worktrees/wt1', hash: 'abc123' })

    // Commit miss in the worktree → retried in the main repo.
    gitBehavior.showCommit = undefined
    gitBehavior.showCommitCalls = []
    const miss = await (await fetch(`${base}/dsh-taskboard/tasks/${id}/diff?execution=e-diff&commit=abc123`)).json()
    expect(miss.ok).toBe(false)
    expect(gitBehavior.showCommitCalls.map(c => c.cwd)).toEqual(['/proj/a/.dsh-worktrees/wt1', '/proj/a'])

    // Path view: working-tree diff in the worktree.
    gitBehavior.showPath = 'path patch'
    const path = await (await fetch(`${base}/dsh-taskboard/tasks/${id}/diff?execution=e-diff&path=${encodeURIComponent('src/a.ts')}`)).json()
    expect(path.value.diff).toBe('path patch')
    expect(gitBehavior.showPathCalls.at(-1)).toMatchObject({ cwd: '/proj/a/.dsh-worktrees/wt1', path: 'src/a.ts' })

    // Unknown execution / task → envelope failures.
    const noExec = await (await fetch(`${base}/dsh-taskboard/tasks/${id}/diff?execution=nope&commit=abc123`)).json()
    expect(noExec.ok).toBe(false)
    expect(noExec.error.code).toBe('not_found')
    const noTask = await fetch(`${base}/dsh-taskboard/tasks/ghost/diff?execution=e&commit=abc123`)
    expect(noTask.status).toBe(404)

    // No worktree on the execution: the main repo is used directly.
    await store.mutate('execution-recorded', ledger => {
      const target = ledger.tasks.find(t => t.id === id)!
      target.executions.push({ id: 'e-diff2', trigger: 'manual', startedAt: 2, outcome: 'succeeded', baseCommit: 'abc123' })
      return [target]
    })
    gitBehavior.showPathCalls = []
    await fetch(`${base}/dsh-taskboard/tasks/${id}/diff?execution=e-diff2&path=${encodeURIComponent('src/b.ts')}`)
    expect(gitBehavior.showPathCalls.at(-1)).toMatchObject({ cwd: '/proj/a', path: 'src/b.ts', base: 'abc123' })
  })
})

// ---------------------------------------------------------------- 0.5.0
describe('taskboard routes 0.5.0 (board settings → default isolation)', () => {
  it('GET /settings starts empty; update validates, persists, and shows in state', async () => {
    const initial = await fetch(`${base}/dsh-taskboard/settings`)
    expect(initial.status).toBe(200)
    expect((await initial.json()).value).toEqual({})

    const badValue = await post('/dsh-taskboard/settings/update', { defaultIsolation: 'docker' })
    expect(badValue.status).toBe(400)
    expect(badValue.json.error.code).toBe('invalid_input')
    const badType = await post('/dsh-taskboard/settings/update', { defaultIsolation: 42 })
    expect(badType.status).toBe(400)

    const ok = await post('/dsh-taskboard/settings/update', { defaultIsolation: 'worktree' })
    expect(ok.status).toBe(200)
    expect(ok.json.value).toEqual({ defaultIsolation: 'worktree' })

    const after = await (await fetch(`${base}/dsh-taskboard/settings`)).json()
    expect(after.value).toEqual({ defaultIsolation: 'worktree' })
    const state = await (await fetch(`${base}/dsh-taskboard/state`)).json()
    expect(state.value.settings).toEqual({ defaultIsolation: 'worktree' })
  })

  it('create materializes the board default on omitted isolation; explicit wins; earlier tasks unaffected', async () => {
    // Self-contained precondition: pin the board default to worktree here.
    const pinned = await post('/dsh-taskboard/settings/update', { defaultIsolation: 'worktree' })
    expect(pinned.status).toBe(200)
    // Create responses are SUMMARIES (no isolation field) — assertions read
    // the full record.
    const wt = await post('/dsh-taskboard/tasks', { title: 'Settings default wt', workspaceId: 'ws-a', urgency: 'normal' })
    expect(wt.status).toBe(201)
    const wtId = wt.json.value.id as string
    const wtFull = await (await fetch(`${base}/dsh-taskboard/tasks/${wtId}`)).json()
    expect(wtFull.value.isolation).toBe('worktree')

    // Back to factory defaults ({}): new tasks materialize 'none'.
    const reset = await post('/dsh-taskboard/settings/update', {})
    expect(reset.status).toBe(200)
    const none = await post('/dsh-taskboard/tasks', { title: 'Settings default none', workspaceId: 'ws-a', urgency: 'normal' })
    const noneFull = await (await fetch(`${base}/dsh-taskboard/tasks/${none.json.value.id}`)).json()
    expect(noneFull.value.isolation).toBe('none')

    // Explicit choice still wins over the board default.
    const explicit = await post('/dsh-taskboard/tasks', { title: 'Explicit iso', workspaceId: 'ws-a', urgency: 'normal', isolation: 'worktree' })
    const explicitFull = await (await fetch(`${base}/dsh-taskboard/tasks/${explicit.json.value.id}`)).json()
    expect(explicitFull.value.isolation).toBe('worktree')

    // The earlier task keeps its creation-time value after the switch.
    const reread = await (await fetch(`${base}/dsh-taskboard/tasks/${wtId}`)).json()
    expect(reread.value.isolation).toBe('worktree')
  })

  it('import replace swaps board settings; merge keeps the live ones; invalid settings refuse the file', async () => {
    await post('/dsh-taskboard/settings/update', { defaultIsolation: 'none' })
    const ledgerFile = {
      schemaVersion: 1,
      tasks: [{ id: 't-imp-set', title: '导入设置', workspaceId: 'ws-a', urgency: 'normal', comments: [], executions: [] }],
      settings: { defaultIsolation: 'worktree' },
    }

    // Merge: task lands, live settings untouched.
    const merged = await post('/dsh-taskboard/import', { mode: 'merge', ledger: ledgerFile })
    expect(merged.status).toBe(200)
    let settings = await (await fetch(`${base}/dsh-taskboard/settings`)).json()
    expect(settings.value).toEqual({ defaultIsolation: 'none' })

    // Replace: whole-ledger swap carries the file's settings.
    const replaced = await post('/dsh-taskboard/import', { mode: 'replace', ledger: ledgerFile })
    expect(replaced.status).toBe(200)
    settings = await (await fetch(`${base}/dsh-taskboard/settings`)).json()
    expect(settings.value).toEqual({ defaultIsolation: 'worktree' })

    // Invalid settings reject the import outright.
    const badFile = { ...ledgerFile, settings: { defaultIsolation: 'docker' } }
    const refused = await post('/dsh-taskboard/import/preview', badFile)
    expect(refused.status).toBe(400)
  })

  it('GET /model-catalog: returns models, presets, and default preset id (0.5.5)', async () => {
    const res = await (await fetch(`${base}/dsh-taskboard/model-catalog`)).json()
    expect(res.ok).toBe(true)
    expect(res.value.models).toEqual([{ provider: 'prov-a', model: 'model-a', name: 'Model A' }])
    expect(res.value.presets).toEqual([{ id: 'standard', name: '标准模式' }])
    expect(res.value.defaultPresetId).toBe('standard')
  })
})

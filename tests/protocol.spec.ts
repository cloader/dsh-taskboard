/**
 * P1 core tests: state machine, cron math, normalization, protocol-text
 * discipline sentences, ledger store, and the tool-level code gates
 * (done-gate, claim boundary, version conflict, model/execution read-only).
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ALL_PERMISSIONS,
  ALL_STATUSES,
  DEFAULT_ISOLATION,
  DEFAULT_PERMISSION,
  MAIN_STATUSES,
  asBoardSettings,
  asPermission,
  canTransition,
  checklistFromTexts,
  checklistProgress,
  defaultIsolationOf,
  defaultPermissionOf,
  defaultSyncExternalSessionsOf,
  effectiveIsolation,
  emptyLedger,
  isClaim,
  nextCronTime,
  normalizeChecklist,
  normalizeExecution,
  normalizeExecutionReport,
  normalizeModel,
  parseCron,
  summarize,
  validateImportedTask,
  validateLedgerImport,
  isValidTaskId,
  type TaskRecord,
} from '../src/shared/protocol.ts'
import { TASKBOARD_PROTOCOL } from '../src/host/protocol-text.ts'
import { PLUGIN_VERSION } from '../src/shared/version.ts'
import { TaskStore } from '../src/host/store.ts'
import { ERR, registerTaskboardTools, type ToolDeps, type WorkspaceFace } from '../src/host/tools.ts'

// ---------------------------------------------------------------------------
// state machine
// ---------------------------------------------------------------------------

describe('state machine', () => {
  it('allows the happy path backlog → done', () => {
    expect(canTransition('backlog', 'todo')).toBe(true)
    expect(canTransition('todo', 'in_progress')).toBe(true)
    expect(canTransition('in_progress', 'in_review')).toBe(true)
    expect(canTransition('in_review', 'done')).toBe(true)
  })

  it('rejects skipping the review gate', () => {
    expect(canTransition('in_progress', 'done')).toBe(false)
    expect(canTransition('todo', 'done')).toBe(false)
    expect(canTransition('backlog', 'in_progress')).toBe(false)
  })

  it('cancels from any live state and archives terminal ones', () => {
    for (const from of ['backlog', 'todo', 'in_progress', 'in_review'] as const) {
      expect(canTransition(from, 'canceled')).toBe(true)
    }
    expect(canTransition('done', 'archived')).toBe(true)
    expect(canTransition('canceled', 'archived')).toBe(true)
    expect(canTransition('archived', 'todo')).toBe(false)
  })

  it('flags exactly todo→in_progress as the claim move', () => {
    expect(isClaim('todo', 'in_progress')).toBe(true)
    expect(isClaim('backlog', 'in_progress')).toBe(false)
    expect(isClaim('in_progress', 'in_review')).toBe(false)
  })

  it('covers every status in the column vocabulary', () => {
    expect(MAIN_STATUSES).toHaveLength(5)
    expect(ALL_STATUSES).toHaveLength(7)
  })
})

// ---------------------------------------------------------------------------
// cron
// ---------------------------------------------------------------------------

describe('cron', () => {
  it('parses *, */n, ranges, and lists', () => {
    expect(parseCron('* * * * *')).not.toBeNull()
    expect(parseCron('*/10 * * * *')).not.toBeNull()
    expect(parseCron('0 9-17 * * 1-5')).not.toBeNull()
    expect(parseCron('0 9 1,15 * *')).not.toBeNull()
    expect(parseCron('0 9 * * 7')).not.toBeNull() // 7 = Sunday, normalized
    expect(parseCron('61 * * * *')).toBeNull()
    expect(parseCron('* * * *')).toBeNull()
    expect(parseCron('a * * * *')).toBeNull()
  })

  it('computes the next match for everyday schedules', () => {
    // 2026-08-14 10:30 local (arbitrary anchor; assertions in local time)
    const from = new Date(2026, 7, 14, 10, 30, 0).getTime()
    const hourly = nextCronTime(parseCron('0 * * * *')!, from)
    expect(new Date(hourly!).getMinutes()).toBe(0)
    expect(new Date(hourly!).getHours()).toBe(11)
    const daily9 = nextCronTime(parseCron('0 9 * * *')!, from)
    expect(new Date(daily9!).getDate()).toBe(15)
    expect(new Date(daily9!).getHours()).toBe(9)
    const every10 = nextCronTime(parseCron('*/10 * * * *')!, from)
    expect(new Date(every10!).getMinutes()).toBe(40)
  })

  it('normalizes execution configs', () => {
    expect(normalizeExecution({}, 0)).toEqual({ mode: 'claim' })
    expect(normalizeExecution({ mode: 'claim' }, 0)).toEqual({ mode: 'claim' })
    const scheduled = normalizeExecution({ mode: 'scheduled', cron: '*/10 * * * *' }, 0)
    expect(scheduled.mode).toBe('scheduled')
    expect(scheduled.nextRunAt).toBeGreaterThan(0)
    expect(() => normalizeExecution({ mode: 'scheduled' }, 0)).toThrow()
    expect(() => normalizeExecution({ mode: 'bogus' }, 0)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// version constant (UI badge drift guard)
// ---------------------------------------------------------------------------

describe('plugin version', () => {
  it('PLUGIN_VERSION equals package.json version', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(PLUGIN_VERSION).toBe(pkg.version)
  })
})

// ---------------------------------------------------------------------------
// protocol text regression (dashi-style: lock the discipline sentences)
// ---------------------------------------------------------------------------

describe('protocol text', () => {
  it('locks the claim/retry/review/done-gate discipline', () => {
    expect(TASKBOARD_PROTOCOL).toMatch(/开工先查板/)
    expect(TASKBOARD_PROTOCOL).toMatch(/先读后动/)
    expect(TASKBOARD_PROTOCOL).toMatch(/先认领再干活/)
    expect(TASKBOARD_PROTOCOL).toMatch(/绝不循环重试或接管他人任务/)
    expect(TASKBOARD_PROTOCOL).toMatch(/版本冲突只重试一次/)
    expect(TASKBOARD_PROTOCOL).toMatch(/验收交接/)
    expect(TASKBOARD_PROTOCOL).toMatch(/你永远不能把任务移到 done/)
    expect(TASKBOARD_PROTOCOL).toMatch(/backlog=未授权/)
    expect(TASKBOARD_PROTOCOL).toMatch(/模型与定时只读/)
    expect(TASKBOARD_PROTOCOL).toMatch(/项目边界/)
  })

  it('locks the 0.4.0 report/checklist handoff discipline', () => {
    expect(TASKBOARD_PROTOCOL).toMatch(/taskboard_execution_report 提交结构化报告/)
    expect(TASKBOARD_PROTOCOL).toMatch(/taskboard_checklist 逐项勾选/)
    expect(TASKBOARD_PROTOCOL).toMatch(/清单全勾也不等于完成/)
  })
})

// ---------------------------------------------------------------------------
// checklist (0.4.0)
// ---------------------------------------------------------------------------

describe('checklist', () => {
  it('normalizes texts: trim, 1..200, cap 30 items', () => {
    expect(() => checklistFromTexts(['  '])).toThrow('1..200')
    expect(() => checklistFromTexts([`x`.repeat(201)])).toThrow('1..200')
    expect(() => checklistFromTexts(Array.from({ length: 31 }, (_, i) => `item ${i}`))).toThrow('at most 30')
    const items = checklistFromTexts(['  复现并定位根因  ', '回归测试通过'])
    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({ text: '复现并定位根因', checked: false })
    expect(typeof items[0]!.id).toBe('string')
  })

  it('normalizeChecklist mints missing ids, keeps evidence on checked, drops it on unchecked', () => {
    const items = normalizeChecklist([
      { text: 'a', checked: true, checkedBy: 'sess-9', checkedAt: 5, note: ' 测试通过 ' },
      { text: 'b', checked: false, checkedBy: 'sess-9', checkedAt: 5, note: 'x' },
    ])
    expect(items[0]).toMatchObject({ text: 'a', checked: true, checkedBy: 'sess-9', checkedAt: 5, note: '测试通过' })
    expect(items[1]).toEqual({ id: items[1]!.id, text: 'b', checked: false })
    expect(() => normalizeChecklist('nope')).toThrow('array')
    expect(() => normalizeChecklist([{ text: 'a' }, { text: 'b' }])).not.toThrow()
  })

  it('checklistProgress + summarize carry the progress', () => {
    const task = makeTask('t-cl', { checklist: [
      { id: 'k1', text: 'a', checked: true, checkedBy: 'user', checkedAt: 1 },
      { id: 'k2', text: 'b', checked: false },
    ] })
    expect(checklistProgress(task)).toEqual({ done: 1, total: 2 })
    expect(summarize(task).checklist).toEqual({ done: 1, total: 2 })
    expect(summarize(makeTask('t-nocl')).checklist).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// execution report (0.4.0)
// ---------------------------------------------------------------------------

describe('execution report', () => {
  it('normalizes a full report and defaults the optional lists', () => {
    const report = normalizeExecutionReport({
      summary: ' 修复了登录重定向 ',
      changedFiles: [' src/a.ts ', 'src/b.ts'],
      checks: ['npm test → 120 passed'],
      artifacts: [],
      risk: '',
    })
    expect(report).toEqual({
      summary: '修复了登录重定向',
      changedFiles: ['src/a.ts', 'src/b.ts'],
      checks: ['npm test → 120 passed'],
      artifacts: [],
      risk: '',
    })
  })

  it('rejects a missing summary and non-string list entries', () => {
    expect(() => normalizeExecutionReport({})).toThrow('summary')
    expect(() => normalizeExecutionReport({ summary: 'x', changedFiles: [42] })).toThrow('array of strings')
    expect(() => normalizeExecutionReport({ summary: 'x', checks: Array.from({ length: 51 }, (_, i) => `c${i}`) })).toThrow('at most 50')
    expect(() => normalizeExecutionReport({ summary: 'x', risk: 'r'.repeat(3000) })).not.toThrow() // risk is sliced, not thrown
    expect(normalizeExecutionReport({ summary: 'x', risk: 'r'.repeat(3000) }).risk).toHaveLength(2000)
  })
})

describe('model normalization (reasoning effort support)', () => {
  it('normalizes provider and model, and preserves reasoningEffort when present', () => {
    expect(normalizeModel({ provider: ' deepseek ', model: ' deepseek-reasoner ' })).toEqual({
      provider: 'deepseek',
      model: 'deepseek-reasoner',
    })
    expect(normalizeModel({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: ' high ' })).toEqual({
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      reasoningEffort: 'high',
    })
    expect(normalizeModel({ provider: 'deepseek', model: 'deepseek-reasoner', reasoningEffort: '   ' })).toEqual({
      provider: 'deepseek',
      model: 'deepseek-reasoner',
    })
  })

  it('rejects non-object or empty provider/model', () => {
    expect(() => normalizeModel(null)).toThrow('model must be')
    expect(() => normalizeModel({ provider: '', model: 'gpt-4o' })).toThrow('non-empty')
    expect(() => normalizeModel({ provider: 'openai', model: '' })).toThrow('non-empty')
  })
})

// ---------------------------------------------------------------------------
// ledger import validation (0.4.0)
// ---------------------------------------------------------------------------

describe('board settings & default isolation (0.5.0)', () => {
  it('factory default is 原目录执行 (none); explicit task values always win', () => {
    expect(DEFAULT_ISOLATION).toBe('none')
    expect(effectiveIsolation({ isolation: undefined })).toBe('none')
    expect(effectiveIsolation({ isolation: 'worktree' })).toBe('worktree')
    expect(effectiveIsolation({ isolation: 'none' })).toBe('none')
  })

  it('asBoardSettings sanitizes; defaultIsolationOf, defaultSyncExternalSessionsOf, and defaultPermissionOf resolve setting → factory', () => {
    expect(asBoardSettings({ defaultIsolation: 'worktree', syncExternalSessions: true, defaultPermission: 'read-only', junk: 1 })).toEqual({ defaultIsolation: 'worktree', syncExternalSessions: true, defaultPermission: 'read-only' })
    expect(asBoardSettings({ syncExternalSessions: false })).toEqual({ syncExternalSessions: false })
    expect(asBoardSettings({ defaultPermission: 'fullAccess' })).toEqual({ defaultPermission: 'danger-full-access' })
    expect(asBoardSettings({})).toEqual({})
    expect(() => asBoardSettings({ defaultIsolation: 'docker' })).toThrow("isolation must be")
    expect(() => asBoardSettings({ defaultIsolation: 42 })).toThrow("defaultIsolation must be")
    expect(() => asBoardSettings({ syncExternalSessions: 'yes' })).toThrow("syncExternalSessions must be a boolean")
    expect(() => asBoardSettings({ defaultPermission: 'super-user' })).toThrow("permission must be")
    expect(() => asBoardSettings(null)).toThrow('object')
    expect(defaultIsolationOf(undefined)).toBe('none')
    expect(defaultIsolationOf({})).toBe('none')
    expect(defaultIsolationOf({ defaultIsolation: 'worktree' })).toBe('worktree')
    expect(defaultSyncExternalSessionsOf(undefined)).toBe(false)
    expect(defaultSyncExternalSessionsOf({})).toBe(false)
    expect(defaultSyncExternalSessionsOf({ syncExternalSessions: true })).toBe(true)
    expect(defaultSyncExternalSessionsOf({ syncExternalSessions: false })).toBe(false)
    expect(DEFAULT_PERMISSION).toBe('workspace-write')
    expect(ALL_PERMISSIONS).toEqual(['workspace-write', 'read-only', 'danger-full-access'])
    expect(defaultPermissionOf(undefined)).toBe('workspace-write')
    expect(defaultPermissionOf({})).toBe('workspace-write')
    expect(defaultPermissionOf({ defaultPermission: 'read-only' })).toBe('read-only')
  })

  it('asPermission normalizes camelCase and kebab-case aliases', () => {
    expect(asPermission('workspace-write')).toBe('workspace-write')
    expect(asPermission('workspaceWrite')).toBe('workspace-write')
    expect(asPermission('read-only')).toBe('read-only')
    expect(asPermission('readOnly')).toBe('read-only')
    expect(asPermission('danger-full-access')).toBe('danger-full-access')
    expect(asPermission('fullAccess')).toBe('danger-full-access')
    expect(asPermission(undefined)).toBe('workspace-write')
    expect(() => asPermission('root')).toThrow("permission must be")
  })

  it('validateLedgerImport carries sanitized board settings; rejects broken ones', () => {
    const NOW = 10_000
    const plan = validateLedgerImport({
      schemaVersion: 1,
      tasks: [],
      settings: { defaultIsolation: 'worktree', stray: true },
    }, new Set(), NOW)
    expect(plan.settings).toEqual({ defaultIsolation: 'worktree' })
    const clean = validateLedgerImport({ schemaVersion: 1, tasks: [] }, new Set(), NOW)
    expect(clean.settings).toBeUndefined()
    expect(() => validateLedgerImport({ schemaVersion: 1, tasks: [], settings: { defaultIsolation: 'vm' } }, new Set(), NOW))
      .toThrow('isolation must be')
  })
})

describe('ledger import validation', () => {
  const NOW = 10_000

  it('classifies create / overwrite / invalid against the live ledger', () => {
    const plan = validateLedgerImport({ schemaVersion: 1, tasks: [
      { id: 't-live', title: '已存在', workspaceId: 'ws-a', urgency: 'normal', comments: [], executions: [] },
      { id: 't-new', title: '新任务', workspaceId: 'ws-a', urgency: 'urgent', comments: [], executions: [] },
      { id: '', title: '无 id', workspaceId: 'ws-a', urgency: 'normal', comments: [], executions: [] },
      { id: 't-bad', title: '', workspaceId: 'ws-a', urgency: 'normal', comments: [], executions: [] },
    ] }, new Set(['t-live']), NOW)
    expect(plan.create.map(t => t.id)).toEqual(['t-new'])
    expect(plan.overwrite.map(t => t.id)).toEqual(['t-live'])
    expect(plan.invalid).toHaveLength(2)
    expect(plan.invalid[1]).toMatchObject({ id: 't-bad', reason: expect.stringContaining('title') })
  })

  it('rejects unsupported schemaVersion, non-ledgers, and in-file duplicate ids', () => {
    expect(() => validateLedgerImport({ schemaVersion: 2, tasks: [] }, new Set(), NOW)).toThrow('schemaVersion')
    expect(() => validateLedgerImport('junk', new Set(), NOW)).toThrow('JSON')
    const plan = validateLedgerImport({ schemaVersion: 1, tasks: [
      { id: 't-x', title: '一', workspaceId: 'ws-a', urgency: 'normal', comments: [], executions: [] },
      { id: 't-x', title: '二', workspaceId: 'ws-a', urgency: 'normal', comments: [], executions: [] },
    ] }, new Set(), NOW)
    expect(plan.create).toHaveLength(1)
    expect(plan.invalid).toEqual([{ id: 't-x', reason: '文件内重复 id' }])
  })

  it('rebuilds records field by field: cron re-armed, running executions failed, defaults minted', () => {
    const plan = validateLedgerImport({ schemaVersion: 1, tasks: [{
      id: 't-imp',
      title: '导入任务',
      workspaceId: 'ws-a',
      urgency: 'relaxed',
      status: 'in_progress',
      claimedBy: 'sess-x',
      execution: { mode: 'scheduled', cron: '0 9 * * *' },
      comments: [{ body: '早', threadId: 'sess-x' }],
      executions: [{ trigger: 'manual', outcome: 'running', sessionId: 'sess-x' }],
      checklist: [{ text: '验收项', checked: true, checkedBy: 'user' }],
      presetId: ' standard ',
    }] }, new Set(), NOW)
    expect(plan.create).toHaveLength(1)
    const task = plan.create[0]!
    expect(task.execution.nextRunAt).toBeGreaterThan(NOW)
    expect(task.comments[0]!.id).toMatch(/^c-/)
    expect(task.executions[0]!.outcome).toBe('failed')
    expect(task.executions[0]!.error).toContain('running')
    expect(task.checklist![0]).toMatchObject({ text: '验收项', checked: true, checkedBy: 'user' })
    expect(task.presetId).toBe('standard')
    expect(task.claimedBy).toBe('sess-x')
    expect(task.createdBy).toEqual({ kind: 'user' })
  })
})

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

describe('TaskStore', () => {
  let dir: string
  beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'taskboard-')) })
  afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

  it('persists atomically and bumps the revision per mutation', async () => {
    const file = join(dir, 'ledger.json')
    const store = new TaskStore({ file })
    const events: number[] = []
    store.subscribe(c => events.push(c.revision))
    const task = makeTask('t-1')
    await store.mutate('task-created', ledger => {
      ledger.tasks.push(task)
      return [task]
    })
    await store.mutate('task-updated', ledger => {
      ledger.tasks[0]!.title = 'changed'
      return [ledger.tasks[0]!]
    })
    const onDisk = JSON.parse(await readFile(file, 'utf8'))
    expect(onDisk.revision).toBe(2)
    expect(onDisk.tasks[0].title).toBe('changed')
    expect(events).toEqual([1, 2])
    // reload from disk in a fresh store
    const second = new TaskStore({ file })
    await second.load()
    expect(second.get('t-1')?.title).toBe('changed')
    expect(second.snapshot().revision).toBe(2)
  })

  it('quarantines a corrupt ledger instead of throwing', async () => {
    const file = join(dir, 'corrupt.json')
    await writeFile(file, '{not json', 'utf8')
    const store = new TaskStore({ file })
    await expect(store.load()).resolves.toBeUndefined()
    expect(store.snapshot()).toEqual(emptyLedger())
  })

  it('hands out frozen clones — mutations cannot bypass the revision', async () => {
    const file = join(dir, 'frozen.json')
    const store = new TaskStore({ file })
    await store.mutate('task-created', ledger => {
      ledger.tasks.push(makeTask('t-f'))
      return [ledger.tasks[0]!]
    })
    const snap = store.snapshot()
    expect(Object.isFrozen(snap)).toBe(true)
    expect(Object.isFrozen(snap.tasks[0])).toBe(true)
    expect(Object.isFrozen(store.get('t-f'))).toBe(true)
    // The sanctioned mutate path still works (it clones internally).
    await store.mutate('task-updated', ledger => {
      ledger.tasks[0]!.title = 'ok'
      return [ledger.tasks[0]!]
    })
    expect(store.get('t-f')!.title).toBe('ok')
  })

  it('a no-op mutate returns a frozen clone of the ledger, never the live one (S9)', async () => {
    const file = join(dir, 'noop.json')
    const store = new TaskStore({ file })
    await store.mutate('task-created', ledger => {
      ledger.tasks.push(makeTask('t-noop'))
      return ledger.tasks
    })
    const revisionBefore = store.snapshot().revision
    const result = await store.mutate('task-updated', () => undefined)
    // Aborted write: nothing changed, nothing persisted.
    expect(result.changed).toHaveLength(0)
    expect(store.snapshot().revision).toBe(revisionBefore)
    // S9 parity: even the no-op path hands out a deep-frozen clone — writing
    // through it throws instead of touching internal state.
    expect(Object.isFrozen(result.ledger)).toBe(true)
    expect(Object.isFrozen(result.ledger.tasks[0])).toBe(true)
    expect(() => { result.ledger.tasks.push(makeTask('t-nope')) }).toThrow()
    // And it is never the same object a fresh snapshot/get hands out.
    expect(result.ledger).not.toBe(store.snapshot())
    expect(result.ledger.tasks[0]).not.toBe(store.get('t-noop'))
    expect(result.ledger).toEqual(store.snapshot())
  })

  it('prunes execution records to the retention cap on every mutation', async () => {
    const file = join(dir, 'prune.json')
    const store = new TaskStore({ file })
    await store.mutate('task-created', ledger => {
      const big = makeTask('t-big', {
        executions: Array.from({ length: 25 }, (_, i) => ({
          id: `e-${i}`,
          trigger: 'scheduled' as const,
          startedAt: i,
          endedAt: i + 1,
          outcome: 'succeeded' as const,
        })),
      })
      ledger.tasks.push(big)
      return [big]
    })
    const task = store.get('t-big')!
    expect(task.executions).toHaveLength(20)
    expect(task.executionsPruned).toBe(5)
    // The NEWEST records survive.
    expect(task.executions[0]!.id).toBe('e-5')
    expect(task.executions[19]!.id).toBe('e-24')
  })

  it('migrates legacy agent-held in_progress tasks to explicit claim fields', async () => {
    const file = join(dir, 'legacy.json')
    await writeFile(file, JSON.stringify({
      schemaVersion: 1,
      revision: 5,
      tasks: [{
        id: 't-old',
        title: 'Legacy',
        description: '',
        prompt: '',
        workspaceId: 'ws-a',
        urgency: 'normal',
        status: 'in_progress',
        blocked: false,
        execution: { mode: 'claim' },
        version: 3,
        createdAt: 0,
        updatedAt: 42,
        createdBy: { kind: 'user' },
        updatedBy: { kind: 'agent', sessionId: 'sess-legacy' },
        comments: [],
        executions: [],
      }],
    }), 'utf8')
    const store = new TaskStore({ file })
    await store.load()
    const task = store.get('t-old')!
    expect(task.claimedBy).toBe('sess-legacy')
    expect(task.claimedAt).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// tools (code-level gates)
// ---------------------------------------------------------------------------

/** A task fixture. */
function makeTask(id: string, overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id,
    title: `Task ${id}`,
    description: '',
    prompt: '',
    workspaceId: 'ws-a',
    urgency: 'normal',
    status: 'todo',
    blocked: false,
    execution: { mode: 'claim' },
    version: 1,
    createdAt: 0,
    updatedAt: 0,
    createdBy: { kind: 'user' },
    updatedBy: { kind: 'user' },
    comments: [],
    executions: [],
    ...overrides,
  }
}

/** Fake workspace face: ws-a owns /proj/a, ws-b owns /proj/b. */
function fakeWorkspaces(): WorkspaceFace {
  const byPath = new Map([['/proj/a', 'ws-a'], ['/proj/b', 'ws-b']])
  const byId = new Map([['ws-a', { id: 'ws-a', path: '/proj/a', title: 'A' }], ['ws-b', { id: 'ws-b', path: '/proj/b', title: 'B' }]])
  return {
    resolveByPath: async path => ({ id: byPath.get(path)! }),
    get: id => byId.get(id),
    list: () => [...byId.values()],
  }
}

/** The exec face for a calling agent session in cwd. */
const agentExec = (cwd: string) => ({ agent: { id: 'sess-1', session: { header: { cwd } } } })

describe('taskboard tools', () => {
  // One shared temp dir for the whole describe (removed in afterAll); each
  // toolSet() call stores its ledger in a uniquely named file inside it —
  // same discipline as the TaskStore describe above (no per-call dirs leak).
  let dir: string
  beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'taskboard-tools-')) })
  afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

  /** Build a registered tool set over the shared dir; returns name → tool. */
  async function toolSet(cwd: string): Promise<Map<string, { execute(args: unknown, exec: unknown): Promise<unknown> }>> {
    const store = new TaskStore({ file: join(dir, `led-${Math.random().toString(36).slice(2)}.json`) })
    await store.mutate('task-created', ledger => {
      ledger.tasks.push(makeTask('t-1'), makeTask('t-2', { workspaceId: 'ws-b' }))
      return ledger.tasks
    })
    const deps: ToolDeps = { store, workspaces: fakeWorkspaces(), now: () => 1_000 }
    const tools = new Map<string, { execute(args: unknown, exec: unknown): Promise<unknown> }>()
    const ctx = {
      tools: {
        register(tool: { name: string; execute(args: unknown, exec: unknown): Promise<unknown> }) {
          tools.set(tool.name, tool)
          return () => tools.delete(tool.name)
        },
      },
    }
    registerTaskboardTools(ctx as never, deps)
    ;(tools as { __store?: typeof store }).__store = store
    return tools
  }

  it('list returns compact summaries with filters', async () => {
    const tools = await toolSet('/proj/a')
    const result = await tools.get('taskboard_list')!.execute({ workspaceId: 'ws-a' }, agentExec('/proj/a'))
    const list = result as { tasks: ReturnType<typeof summarize>[] }
    expect(list.tasks).toHaveLength(1)
    expect(list.tasks[0]!.id).toBe('t-1')
  })

  it('rejects tool calls without an owning agent session', async () => {
    const tools = await toolSet('/proj/a')
    await expect(tools.get('taskboard_create')!.execute(
      { title: 'x', workspaceId: 'ws-a', urgency: 'normal' }, {},
    )).rejects.toThrow(ERR.requiresAgent)
  })

  it('create validates workspace/urgency/status', async () => {
    const tools = await toolSet('/proj/a')
    const exec = agentExec('/proj/a')
    await expect(tools.get('taskboard_create')!.execute(
      { title: 'x', workspaceId: 'nope', urgency: 'normal' }, exec,
    )).rejects.toThrow(ERR.notFound)
    await expect(tools.get('taskboard_create')!.execute(
      { title: 'x', workspaceId: 'ws-a', urgency: 'hot' }, exec,
    )).rejects.toThrow('invalid_input')
    const ok = await tools.get('taskboard_create')!.execute(
      { title: '  New task  ', workspaceId: 'ws-a', urgency: 'urgent' }, exec,
    ) as { task: { title: string; status: string } }
    expect(ok.task.title).toBe('New task')
    expect(ok.task.status).toBe('todo')
  })

  it('blocks the agent done-gate in code', async () => {
    const tools = await toolSet('/proj/a')
    // put t-1 into in_review first
    const move = tools.get('taskboard_move')!
    await move.execute({ id: 't-1', status: 'in_progress', ifVersion: 1 }, agentExec('/proj/a'))
    const after = await tools.get('taskboard_get')!.execute({ id: 't-1' }, agentExec('/proj/a')) as { task: { version: number } }
    await move.execute({ id: 't-1', status: 'in_review', ifVersion: after.task.version }, agentExec('/proj/a'))
    const review = await tools.get('taskboard_get')!.execute({ id: 't-1' }, agentExec('/proj/a')) as { task: { version: number } }
    await expect(move.execute({ id: 't-1', status: 'done', ifVersion: review.task.version }, agentExec('/proj/a')))
      .rejects.toThrow(ERR.forbidden)
  })

  it('enforces the claim project boundary', async () => {
    const tools = await toolSet('/proj/a')
    // t-2 belongs to ws-b; a session in /proj/a must NOT claim it
    await expect(tools.get('taskboard_move')!.execute(
      { id: 't-2', status: 'in_progress', ifVersion: 1 }, agentExec('/proj/a'),
    )).rejects.toThrow(ERR.workspaceMismatch)
    // the same task claims fine from inside its own project
    await expect(tools.get('taskboard_move')!.execute(
      { id: 't-2', status: 'in_progress', ifVersion: 1 }, agentExec('/proj/b'),
    )).resolves.toBeTruthy()
  })

  it('refuses taking over another session\'s claim', async () => {
    const tools = await toolSet('/proj/a')
    const move = tools.get('taskboard_move')!
    await move.execute({ id: 't-1', status: 'in_progress', ifVersion: 1 }, agentExec('/proj/a'))
    // t-1 now held by sess-1; a different session in the same project is rejected
    const other = { agent: { id: 'sess-2', session: { header: { cwd: '/proj/a' } } } }
    const current = await tools.get('taskboard_get')!.execute({ id: 't-1' }, agentExec('/proj/a')) as { task: { version: number } }
    await expect(move.execute({ id: 't-1', status: 'in_review', ifVersion: current.task.version }, other))
      .rejects.toThrow(ERR.forbidden)
  })

  it('rejects stale ifVersion writes (missing/stale alike)', async () => {
    const tools = await toolSet('/proj/a')
    // Missing ifVersion is caught by the parameter schema first (required).
    await expect(tools.get('taskboard_move')!.execute(
      { id: 't-1', status: 'in_progress' }, agentExec('/proj/a'),
    )).rejects.toThrow('invalid arguments')
    await expect(tools.get('taskboard_move')!.execute(
      { id: 't-1', status: 'in_progress', ifVersion: 99 }, agentExec('/proj/a'),
    )).rejects.toThrow(ERR.versionConflict)
  })

  it('rejects illegal transitions', async () => {
    const tools = await toolSet('/proj/a')
    await expect(tools.get('taskboard_move')!.execute(
      { id: 't-1', status: 'in_review', ifVersion: 1 }, agentExec('/proj/a'),
    )).rejects.toThrow(ERR.invalidTransition)
  })

  it('comment add/list round-trips with thread attribution', async () => {
    const tools = await toolSet('/proj/a')
    const added = await tools.get('taskboard_comment_add')!.execute(
      { id: 't-1', body: ' implemented; verified by tests ' }, agentExec('/proj/a'),
    ) as { comment: { body: string; threadId: string } }
    expect(added.comment.body).toBe('implemented; verified by tests')
    expect(added.comment.threadId).toBe('sess-1')
    const list = await tools.get('taskboard_comments')!.execute({ id: 't-1' }, agentExec('/proj/a')) as { comments: unknown[] }
    expect(list.comments).toHaveLength(1)
  })

  it('delete soft-marks and hides the task', async () => {
    const tools = await toolSet('/proj/a')
    await tools.get('taskboard_delete')!.execute({ id: 't-1', ifVersion: 1 }, agentExec('/proj/a'))
    await expect(tools.get('taskboard_get')!.execute({ id: 't-1' }, agentExec('/proj/a')))
      .rejects.toThrow(ERR.notFound)
    const list = await tools.get('taskboard_list')!.execute({}, agentExec('/proj/a')) as { tasks: unknown[] }
    expect(list.tasks).toHaveLength(1) // only t-2 remains visible
  })

  it('create carries a checklist from texts', async () => {
    const tools = await toolSet('/proj/a')
    const created = await tools.get('taskboard_create')!.execute(
      { title: '带清单', workspaceId: 'ws-a', urgency: 'normal', checklist: ['复现', '修复'] },
      agentExec('/proj/a'),
    ) as { task: { id: string } }
    const got = await tools.get('taskboard_get')!.execute({ id: created.task.id }, agentExec('/proj/a')) as { task: TaskRecord }
    expect(got.task.checklist).toHaveLength(2)
    expect(got.task.checklist![0]).toMatchObject({ text: '复现', checked: false })
    await expect(tools.get('taskboard_create')!.execute(
      { title: 'x', workspaceId: 'ws-a', urgency: 'normal', checklist: [42] }, agentExec('/proj/a'),
    )).rejects.toThrow('invalid arguments')
  })

  it('taskboard_checklist: add / check (with evidence) / uncheck, version-gated', async () => {
    const tools = await toolSet('/proj/a')
    const exec = agentExec('/proj/a')
    const tool = tools.get('taskboard_checklist')!

    // add
    const added = await tool.execute({ id: 't-1', action: 'add', ifVersion: 1, items: ['定位根因', '补回归测试'] }, exec) as {
      task: { version: number }
      checklist: Array<{ id: string; text: string; checked: boolean }>
      done: number
      total: number
    }
    expect(added.total).toBe(2)
    expect(added.done).toBe(0)

    // check with evidence note
    const itemId = added.checklist[0]!.id
    const checked = await tool.execute({ id: 't-1', action: 'check', ifVersion: added.task.version, itemId, note: '已写复现测试' }, exec) as {
      task: { version: number }
      checklist: Array<{ id: string; checked: boolean; checkedBy?: string; note?: string }>
      done: number
    }
    expect(checked.done).toBe(1)
    expect(checked.checklist[0]).toMatchObject({ checked: true, checkedBy: 'sess-1', note: '已写复现测试' })

    // uncheck clears the attribution + note
    const unchecked = await tool.execute({ id: 't-1', action: 'uncheck', ifVersion: checked.task.version, itemId }, exec) as {
      task: { version: number }
      checklist: Array<{ id: string; checked: boolean; checkedBy?: string; note?: string }>
    }
    expect(unchecked.checklist[0]).toEqual({ id: itemId, text: '定位根因', checked: false })

    // gates: stale version, unknown item, bad action, empty add, per-call cap, total cap
    await expect(tool.execute({ id: 't-1', action: 'add', ifVersion: 1, items: ['x'] }, exec)).rejects.toThrow(ERR.versionConflict)
    const current = unchecked.task.version ?? 0
    await expect(tool.execute({ id: 't-1', action: 'check', ifVersion: current, itemId: 'nope' }, exec)).rejects.toThrow(ERR.notFound)
    await expect(tool.execute({ id: 't-1', action: 'nuke', ifVersion: current, items: [] }, exec)).rejects.toThrow('add | check | uncheck')
    await expect(tool.execute({ id: 't-1', action: 'add', ifVersion: current, items: [] }, exec)).rejects.toThrow('1..10')
    await expect(tool.execute({ id: 't-1', action: 'add', ifVersion: current, items: Array.from({ length: 11 }, (_, i) => `i${i}`) }, exec)).rejects.toThrow('1..10')
    // total cap 30: climb to 22 then one more 10-pack must fail
    let version = current
    for (let round = 0; round < 2; round++) {
      const step = await tool.execute({ id: 't-1', action: 'add', ifVersion: version, items: Array.from({ length: 10 }, (_, i) => `bulk${round}-${i}`) }, exec) as { task: { version: number } }
      version = step.task.version
    }
    await expect(tool.execute({ id: 't-1', action: 'add', ifVersion: version, items: Array.from({ length: 10 }, (_, i) => `over-${i}`) }, exec)).rejects.toThrow('at most 30')
  })

  it('taskboard_execution_report: attaches to the session\'s running execution; overwrites; rejects without one', async () => {
    const tools = await toolSet('/proj/a')
    const exec = agentExec('/proj/a')
    // No execution exists yet → forbidden with guidance.
    await expect(tools.get('taskboard_execution_report')!.execute(
      { summary: 'x' }, exec,
    )).rejects.toThrow(ERR.forbidden)

    // Give t-1 a running execution owned by sess-1 (same store the tools use).
    const store = (tools as { __store?: TaskStore }).__store!
    await store.mutate('execution-recorded', ledger => {
      const task = ledger.tasks.find(t => t.id === 't-1')!
      task.executions.push({ id: 'e-1', trigger: 'manual', startedAt: 1, outcome: 'running', sessionId: 'sess-1' })
      return [task]
    })

    const report = await tools.get('taskboard_execution_report')!.execute({
      summary: '修复完成', changedFiles: ['src/a.ts'], checks: ['npm test 通过'], risk: '无',
    }, exec) as { taskId: string; executionId: string }
    expect(report).toMatchObject({ taskId: 't-1', executionId: 'e-1' })

    // Overwrite with a second submission.
    await tools.get('taskboard_execution_report')!.execute({ summary: '更新后的报告' }, exec)
    const got = await store.get('t-1')!
    expect(got.executions[0]!.report!.summary).toBe('更新后的报告')

    // Another session's running execution is not attachable.
    await expect(tools.get('taskboard_execution_report')!.execute(
      { summary: 'x' }, { agent: { id: 'sess-2', session: { header: { cwd: '/proj/a' } } } },
    )).rejects.toThrow(ERR.forbidden)

    // Invalid payload shape.
    await expect(tools.get('taskboard_execution_report')!.execute({ changedFiles: ['a'] }, exec)).rejects.toThrow('summary')
  })

  it('create only accepts backlog/todo as the initial status', async () => {
    const tools = await toolSet('/proj/a')
    const exec = agentExec('/proj/a')
    for (const status of ['in_progress', 'in_review', 'done', 'canceled', 'archived']) {
      await expect(tools.get('taskboard_create')!.execute(
        { title: 'x', workspaceId: 'ws-a', urgency: 'normal', status }, exec,
      )).rejects.toThrow('a new task must start as backlog or todo')
    }
    // backlog IS a legal starting status (未授权 backlog column).
    const backlog = await tools.get('taskboard_create')!.execute(
      { title: '储备事项', workspaceId: 'ws-a', urgency: 'relaxed', status: 'backlog' }, exec,
    ) as { task: { status: string } }
    expect(backlog.task.status).toBe('backlog')
    // The rejected calls created nothing: seeded t-1/t-2 plus the backlog one.
    const list = await tools.get('taskboard_list')!.execute({}, exec) as { tasks: unknown[] }
    expect(list.tasks).toHaveLength(3)
  })

  it('comment_add refuses archived tasks: archived tasks are immutable', async () => {
    const tools = await toolSet('/proj/a')
    const store = (tools as { __store?: TaskStore }).__store!
    await store.mutate('task-updated', ledger => {
      const target = ledger.tasks.find(t => t.id === 't-1')!
      target.status = 'archived'
      return [target]
    })
    await expect(tools.get('taskboard_comment_add')!.execute(
      { id: 't-1', body: '不应落下的评论' }, agentExec('/proj/a'),
    )).rejects.toThrow('archived tasks are immutable')
    await expect(tools.get('taskboard_comment_add')!.execute(
      { id: 't-1', body: 'x' }, agentExec('/proj/a'),
    )).rejects.toThrow(ERR.invalidTransition)
    // Nothing landed on the archived card.
    expect(store.get('t-1')!.comments).toHaveLength(0)
  })

  it("execution_report back-submits onto the session's latest succeeded execution (review follow-up)", async () => {
    const tools = await toolSet('/proj/a')
    const exec = agentExec('/proj/a') // sess-1
    const store = (tools as { __store?: TaskStore }).__store!
    // A settled review handoff: the run succeeded but no report was filed.
    await store.mutate('task-updated', ledger => {
      const target = ledger.tasks.find(t => t.id === 't-1')!
      target.status = 'in_review'
      target.executions.push({ id: 'e-x', trigger: 'manual', startedAt: 1, endedAt: 2, outcome: 'succeeded', sessionId: 'sess-1' })
      return [target]
    })

    // (a) The owning session back-submits: the report lands on e-x.
    const back = await tools.get('taskboard_execution_report')!.execute(
      { summary: '补交：修复完成', checks: ['npm test 通过'] }, exec,
    ) as { taskId: string; executionId: string }
    expect(back.taskId).toBe('t-1')
    expect(back.executionId).toBe('e-x')
    expect(store.get('t-1')!.executions[0]!.report!.summary).toBe('补交：修复完成')

    // (b) A later submission overwrites the previous report.
    await tools.get('taskboard_execution_report')!.execute({ summary: '补交：覆盖后的报告' }, exec)
    expect(store.get('t-1')!.executions[0]!.report!.summary).toBe('补交：覆盖后的报告')

    // (c) An unrelated session may not back-submit onto someone else's run.
    await expect(tools.get('taskboard_execution_report')!.execute(
      { summary: 'x' }, { agent: { id: 'sess-9', session: { header: { cwd: '/proj/a' } } } },
    )).rejects.toThrow('back-submit onto your latest succeeded one while you hold the task')

    // A running execution of the SAME session still wins (path-1 precedence):
    // the report attaches to the live run, not the settled one.
    await store.mutate('execution-recorded', ledger => {
      const target = ledger.tasks.find(t => t.id === 't-1')!
      target.executions.push({ id: 'e-run', trigger: 'manual', startedAt: 3, outcome: 'running', sessionId: 'sess-1' })
      return [target]
    })
    const live = await tools.get('taskboard_execution_report')!.execute({ summary: '运行中提交' }, exec) as { executionId: string }
    expect(live.executionId).toBe('e-run')
    expect(store.get('t-1')!.executions.find(e => e.id === 'e-x')!.report!.summary).toBe('补交：覆盖后的报告')

    // Archived tasks (with nothing running) sit outside the back-submit path.
    await store.mutate('execution-recorded', ledger => {
      const target = ledger.tasks.find(t => t.id === 't-1')!
      target.status = 'archived'
      const running = target.executions.find(e => e.id === 'e-run')!
      running.outcome = 'failed'
      return [target]
    })
    await expect(tools.get('taskboard_execution_report')!.execute({ summary: 'x' }, exec)).rejects.toThrow(ERR.forbidden)
  })
})

describe('R4: task id charset gate (import + path building)', () => {
  it('isValidTaskId accepts minted ids and rejects traversal-shaped ones', () => {
    expect(isValidTaskId('t-mfx9-ab12cd')).toBe(true)
    expect(isValidTaskId('T_long-1')).toBe(true)
    for (const bad of ['../../x', '..\\..\\x', 'a/b', 'a b', '.hidden', 'x'.repeat(101), '', 'a$b']) {
      expect(isValidTaskId(bad)).toBe(false)
    }
  })

  it('validateImportedTask rejects traversal-shaped ids at the protocol boundary', () => {
    const base = { title: 'T', workspaceId: 'ws-a', status: 'todo', comments: [], executions: [] }
    // Length alone (the old check) let these into the ledger — they ride
    // straight into join(ws, '.dsh-worktrees', id) downstream.
    for (const id of ['../../victim', '..\\..\\victim', 'a/b', '.ssh']) {
      expect(validateImportedTask({ ...base, id }, 0)).toMatchObject({ ok: false })
    }
    expect(validateImportedTask({ ...base, id: 't-abc-def' }, 0)).toMatchObject({ ok: true })
  })
})

/**
 * Claim boundary across linked multi-root workspace roots.
 *
 * Historical rule: a session may claim a task ONLY when its own workspace root
 * is the task's project. With a multi-root session (one primary root plus
 * linked roots) that rule blocks a legitimate claim: the agent sits in
 * D:\LLM\Nord while the card belongs to the linked D:\DEV\mqtt_hm project.
 *
 * New opt-in board setting `allowClaimFromLinkedRoots` (default false) keeps
 * the old behaviour unless the operator turns it on. These tests pin both
 * sides: default = rejected, enabled = accepted, and a host without the
 * `linkedRoots` dependency = rejected even when enabled.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { registerTaskboardTools, type WorkspaceFace } from '../src/host/tools.ts'
import { TaskStore } from '../src/host/store.ts'
import { asBoardSettings } from '../src/shared/protocol.ts'

let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'tb-multiroot-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

const PATHS: Record<string, { id: string; path: string; title: string }> = {
  '/proj/target': { id: 'ws-target', path: '/proj/target', title: 'Target' },
  '/proj/primary': { id: 'ws-primary', path: '/proj/primary', title: 'Primary' },
  '/proj/linked': { id: 'ws-linked', path: '/proj/linked', title: 'Linked' },
}

const workspaces: WorkspaceFace = {
  resolveByPath: async path => PATHS[path],
  get: id => Object.values(PATHS).find(ws => ws.id === id),
  list: () => Object.values(PATHS),
}

/** Build the tool set; `linked` stands for the host's multiRootScope bridge. */
async function setup(options: { linked?: (cwd: string) => readonly string[]; cwd?: string } = {}) {
  const store = new TaskStore({ file: join(dir, `ledger-${Math.random().toString(36).slice(2)}.json`) })
  const registered: Array<Record<string, unknown>> = []
  registerTaskboardTools(
    { tools: { register: tool => { registered.push(tool); return () => {} } } },
    {
      store,
      workspaces,
      now: () => 7_000,
      ...(options.linked === undefined ? {} : { linkedRoots: options.linked }),
    },
  )
  const tool = (name: string) => registered.find(entry => entry.name === name) as {
    execute(args: unknown, exec: unknown): Promise<unknown>
  }
  const exec = { agent: { id: 'session-1', session: { header: { cwd: options.cwd ?? '/proj/linked' } } } }
  const enableLinkedClaims = async (on: boolean): Promise<void> => {
    await store.mutate('settings-updated', ledger => {
      ledger.settings = { ...ledger.settings, allowClaimFromLinkedRoots: on }
      return []
    })
  }
  const createTask = async (): Promise<string> => {
    const created = await tool('taskboard_create')
      .execute({ title: 'Linked claim', workspaceId: 'ws-target', urgency: 'normal' }, exec) as { task: { id: string } }
    return created.task.id
  }
  return { store, tool, exec, enableLinkedClaims, createTask }
}

/** Assert a rejected claim leaves the task in todo at its old version. */
async function expectStillTodo(store: TaskStore, id: string): Promise<void> {
  const task = store.get(id)
  expect(task?.status).toBe('todo')
  expect(task?.version).toBe(1)
  expect(task?.claimedBy).toBeUndefined()
}

describe('claim across linked workspace roots', () => {
  it('rejects a linked-root claim while the setting is off (historical rule)', async () => {
    const { tool, exec, createTask, store } = await setup({ linked: () => ['/proj/target'] })
    const id = await createTask()
    await expect(tool('taskboard_move').execute({ id, status: 'in_progress', ifVersion: 1 }, exec))
      .rejects.toMatchObject({ code: 'workspace_mismatch' })
    await expectStillTodo(store, id)
  })

  it('accepts the claim from a linked root once the setting is on', async () => {
    const seen: string[] = []
    const { tool, exec, createTask, store, enableLinkedClaims } = await setup({
      linked: cwd => { seen.push(cwd); return ['/proj/target'] },
    })
    const id = await createTask()
    await enableLinkedClaims(true)
    const moved = await tool('taskboard_move').execute({ id, status: 'in_progress', ifVersion: 1 }, exec) as { task: { status: string; claimedBy?: string } }
    expect(moved.task.status).toBe('in_progress')
    // The claim records the holder on the stored record.
    expect(store.get(id)).toMatchObject({ status: 'in_progress', claimedBy: 'session-1', version: 2 })
    // The bridge is asked about the caller's own root, never the task project.
    expect(seen).toEqual(['/proj/linked'])
  })

  it('still rejects the claim when the linked roots do not reach the project', async () => {
    const { tool, exec, createTask, store, enableLinkedClaims } = await setup({ linked: () => ['/proj/primary'] })
    const id = await createTask()
    await enableLinkedClaims(true)
    await expect(tool('taskboard_move').execute({ id, status: 'in_progress', ifVersion: 1 }, exec))
      .rejects.toMatchObject({ code: 'workspace_mismatch' })
    await expectStillTodo(store, id)
  })

  it('rejects the claim when the host has no linked-roots bridge even if enabled', async () => {
    const { tool, exec, createTask, store, enableLinkedClaims } = await setup()
    const id = await createTask()
    await enableLinkedClaims(true)
    await expect(tool('taskboard_move').execute({ id, status: 'in_progress', ifVersion: 1 }, exec))
      .rejects.toMatchObject({ code: 'workspace_mismatch' })
    await expectStillTodo(store, id)
  })

  it('keeps the plain primary-root claim working regardless of the setting', async () => {
    const { tool, exec, createTask, enableLinkedClaims } = await setup({ cwd: '/proj/target', linked: () => [] })
    const id = await createTask()
    await enableLinkedClaims(false)
    const moved = await tool('taskboard_move').execute({ id, status: 'in_progress', ifVersion: 1 }, exec) as { task: { status: string } }
    expect(moved.task.status).toBe('in_progress')
  })

  it('treats a throwing bridge as "no linked roots" instead of crashing the move', async () => {
    const { tool, exec, createTask, store, enableLinkedClaims } = await setup({
      linked: () => { throw new Error('multiRootScope unavailable') },
    })
    const id = await createTask()
    await enableLinkedClaims(true)
    await expect(tool('taskboard_move').execute({ id, status: 'in_progress', ifVersion: 1 }, exec))
      .rejects.toMatchObject({ code: 'workspace_mismatch' })
    await expectStillTodo(store, id)
  })

  it('mentions linked roots in rejection details only while enabled', async () => {
    const { tool, exec, createTask, enableLinkedClaims } = await setup()
    const id = await createTask()
    const move = () => tool('taskboard_move').execute({ id, status: 'in_progress', ifVersion: 1 }, exec)
    await expect(move()).rejects.toMatchObject({ message: expect.not.stringContaining('linked workspace roots') })
    await enableLinkedClaims(true)
    await expect(move()).rejects.toMatchObject({ message: expect.stringContaining('linked workspace roots') })
  })

  it('allows creation in another registered project by id or directory without enabling linked claims', async () => {
    const { tool, exec, store } = await setup()
    for (const workspaceId of ['ws-target', '/proj/target']) {
      const created = await tool('taskboard_create').execute({ title: 'Cross-project creation', workspaceId, urgency: 'normal' }, exec) as { task: { id: string } }
      expect(store.get(created.task.id)).toMatchObject({ workspaceId: 'ws-target', status: 'todo' })
    }
  })

  it('normalizes the setting and defaults it to false', () => {
    expect(asBoardSettings({ allowClaimFromLinkedRoots: true }).allowClaimFromLinkedRoots).toBe(true)
    expect(asBoardSettings({}).allowClaimFromLinkedRoots).toBeUndefined()
    expect(() => asBoardSettings({ allowClaimFromLinkedRoots: 'yes' })).toThrow(/allowClaimFromLinkedRoots/)
  })
})

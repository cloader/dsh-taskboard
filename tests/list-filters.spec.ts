/**
 * taskboard_list filter contract.
 *
 * An unknown `workspaceId` and an invalid `status`/`urgency` used to be plain
 * string comparisons: the call silently returned "任务 0 条：无匹配任务",
 * indistinguishable from a genuinely empty project. That false negative breaks
 * the "check the board before starting work" discipline — the caller gets no
 * correction signal and keeps working on a wrong conclusion.
 *
 * These cases pin the loud-failure contract, and the refusals must stay
 * read-only (no task-ledger write, no revision bump).
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { registerTaskboardTools, type WorkspaceFace } from '../src/host/tools.ts'
import { TaskStore } from '../src/host/store.ts'

let dir: string
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), 'tb-list-')) })
afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

const projects = [
  { id: 'ws-a', path: '/proj/a', title: 'A' },
  { id: 'ws-b', path: '/proj/b', title: 'B' },
  { id: 'ws-c', path: '/proj/c', title: 'C' }, // registered on purpose, holds no task
]
const workspaces: WorkspaceFace = {
  resolveByPath: async path => projects.find(p => p.path === path),
  get: id => projects.find(p => p.id === id),
  list: () => projects,
}

type Tool = { execute(args: unknown, exec: unknown): Promise<unknown> }

/** Fresh store per test: ws-a owns two tasks, ws-b one, ws-c none. */
async function setup() {
  const store = new TaskStore({ file: join(dir, `led-${Math.random().toString(36).slice(2)}.json`) })
  const registered: Array<Record<string, unknown>> = []
  registerTaskboardTools(
    { tools: { register: tool => { registered.push(tool); return () => {} } } },
    { store, workspaces, now: () => 7_000 },
  )
  const tool = (name: string) => registered.find(t => t.name === name) as Tool
  const exec = { agent: { id: 'session-1', session: { header: { cwd: '/proj/a' } } } }
  await tool('taskboard_create').execute({ title: 'A1', workspaceId: 'ws-a', urgency: 'urgent' }, exec)
  await tool('taskboard_create').execute({ title: 'A2', workspaceId: 'ws-a', urgency: 'normal' }, exec)
  await tool('taskboard_create').execute({ title: 'B1', workspaceId: 'ws-b', urgency: 'normal' }, exec)
  return { store, list: tool('taskboard_list'), exec }
}

const rowCount = (result: unknown) => (result as { tasks: unknown[] }).tasks.length

describe('taskboard_list filter validation', () => {
  it('R1: an unregistered workspaceId fails with not_found instead of zero rows', async () => {
    const { list, exec } = await setup()
    await expect(list.execute({ workspaceId: 'deadbeef-0000-0000-0000-000000000000' }, exec))
      .rejects.toMatchObject({ code: 'not_found' })
  })

  it('R2: a filesystem path passed as workspaceId fails with not_found', async () => {
    const { list, exec } = await setup()
    await expect(list.execute({ workspaceId: '/proj/a' }, exec)).rejects.toMatchObject({ code: 'not_found' })
    await expect(list.execute({ workspaceId: 'G:\\workarea\\proj' }, exec)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('R3: an invalid status fails with invalid_input and spells out the legal values', async () => {
    const { list, exec } = await setup()
    const error = await list.execute({ status: 'bogus_status' }, exec).catch((e: unknown) => e) as { code: string; message: string }
    expect(error.code).toBe('invalid_input')
    expect(error.message).toMatch(/status must be one of:/)
    expect(error.message).toContain('backlog')
    expect(error.message).toContain('archived')
  })

  it('R4: an invalid urgency fails with invalid_input and spells out the legal values', async () => {
    const { list, exec } = await setup()
    const error = await list.execute({ urgency: 'bogus_urgency' }, exec).catch((e: unknown) => e) as { code: string; message: string }
    expect(error.code).toBe('invalid_input')
    expect(error.message).toMatch(/urgency must be one of: urgent, normal, relaxed/)
  })

  it('R5: omitted filters still list every task', async () => {
    const { list, exec } = await setup()
    expect(rowCount(await list.execute({}, exec))).toBe(3)
  })

  it('R6: valid filters keep their original narrowing', async () => {
    const { list, exec } = await setup()
    expect(rowCount(await list.execute({ workspaceId: 'ws-a' }, exec))).toBe(2)
    expect(rowCount(await list.execute({ workspaceId: 'ws-b' }, exec))).toBe(1)
    expect(rowCount(await list.execute({ status: 'todo' }, exec))).toBe(3)
    expect(rowCount(await list.execute({ urgency: 'normal' }, exec))).toBe(2)
  })

  it('R6b: a registered project without tasks is still a legitimate zero, not an error', async () => {
    const { list, exec } = await setup()
    expect(rowCount(await list.execute({ workspaceId: 'ws-c' }, exec))).toBe(0)
    expect(rowCount(await list.execute({ status: 'backlog' }, exec))).toBe(0)
  })

  it('R7: rejected filter input never writes to the ledger', async () => {
    const { store, list, exec } = await setup()
    const before = store.snapshot().revision
    await expect(list.execute({ workspaceId: 'nope' }, exec)).rejects.toBeDefined()
    await expect(list.execute({ status: 'bogus_status' }, exec)).rejects.toBeDefined()
    await expect(list.execute({ urgency: 'bogus_urgency' }, exec)).rejects.toBeDefined()
    expect(store.snapshot().revision).toBe(before)
  })
})

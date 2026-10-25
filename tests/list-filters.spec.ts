/**
 * taskboard_list filter contract.
 *
 * An unknown `workspaceId` and an invalid `status`/`urgency` used to be plain
 * string comparisons: the call silently returned "任务 0 条：无匹配任务",
 * indistinguishable from a genuinely empty project. That false negative breaks
 * the "check the board before starting work" discipline — the caller gets no
 * correction signal and keeps working on a wrong conclusion.
 *
 * These cases pin the loud-failure contract, the correction signal attached to a
 * failure, the path-alias resolution (a model knows its cwd but not the uuid),
 * and the fact that every refusal stays read-only (no ledger write, no revision
 * bump).
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
async function setup(face: WorkspaceFace = workspaces) {
  const store = new TaskStore({ file: join(dir, `led-${Math.random().toString(36).slice(2)}.json`) })
  const registered: Array<Record<string, unknown>> = []
  registerTaskboardTools(
    { tools: { register: tool => { registered.push(tool); return () => {} } } },
    { store, workspaces: face, now: () => 7_000 },
  )
  const tool = (name: string) => registered.find(t => t.name === name) as Tool
  const exec = { agent: { id: 'session-1', session: { header: { cwd: '/proj/a' } } } }
  await tool('taskboard_create').execute({ title: 'A1', workspaceId: 'ws-a', urgency: 'urgent' }, exec)
  await tool('taskboard_create').execute({ title: 'A2', workspaceId: 'ws-a', urgency: 'normal' }, exec)
  await tool('taskboard_create').execute({ title: 'B1', workspaceId: 'ws-b', urgency: 'normal' }, exec)
  return { store, list: tool('taskboard_list'), create: tool('taskboard_create'), exec }
}

const rowCount = (result: unknown) => (result as { tasks: unknown[] }).tasks.length

describe('taskboard_list filter validation', () => {
  it('R1: an unregistered workspaceId fails with not_found instead of zero rows', async () => {
    const { list, exec } = await setup()
    await expect(list.execute({ workspaceId: 'deadbeef-0000-0000-0000-000000000000' }, exec))
      .rejects.toMatchObject({ code: 'not_found' })
  })

  it('R2: a registered project path resolves to its id and filters normally', async () => {
    const { list, exec } = await setup()
    expect(rowCount(await list.execute({ workspaceId: '/proj/a' }, exec))).toBe(2)
    expect(rowCount(await list.execute({ workspaceId: '/proj/b' }, exec))).toBe(1)
  })

  it('R2b: an unregistered path still fails with not_found, never zero rows', async () => {
    const { list, exec } = await setup()
    await expect(list.execute({ workspaceId: '/proj/nope' }, exec)).rejects.toMatchObject({ code: 'not_found' })
    await expect(list.execute({ workspaceId: 'G:\\workarea\\proj' }, exec)).rejects.toMatchObject({ code: 'not_found' })
  })

  it('R2c: a path-shaped id whose realpath rejects is a plain miss, not a crash', async () => {
    const throwing: WorkspaceFace = { ...workspaces, resolveByPath: async () => { throw new Error('ENOENT') } }
    const { list, exec } = await setup(throwing)
    await expect(list.execute({ workspaceId: 'G:\\gone' }, exec)).rejects.toMatchObject({ code: 'not_found' })
    // A real id still wins without touching the resolver.
    expect(rowCount(await list.execute({ workspaceId: 'ws-a' }, exec))).toBe(2)
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

/**
 * A loud failure alone still strands the caller: the registry keys projects by
 * uuid and no tool answers "which project am I in", so a bare
 * `unknown workspaceId <x>` leaves nothing to act on. These cases pin the
 * correction signal carried by the failure detail.
 */
describe('unknown workspaceId detail', () => {
  const detailOf = async (promise: Promise<unknown>) => await promise.catch((e: unknown) => e) as { code: string; message: string }

  it('R8: hands back the caller\'s own id as a usable value', async () => {
    const { list, exec } = await setup()
    const error = await detailOf(list.execute({ workspaceId: 'G:\\workarea\\proj' }, exec))
    expect(error.code).toBe('not_found')
    expect(error.message).toMatch(/expected a project id or its directory path/)
    expect(error.message).toContain('this session\'s project is "A"')
    expect(error.message).toContain('retry with workspaceId=ws-a')
    // The registered project list is a fallback for unaffiliated callers only.
    expect(error.message).not.toContain('known projects')
    // own.path is not echoed: it is the caller's own cwd, and the id is the one
    // value the caller could not derive by itself.
    expect(error.message).not.toContain('/proj/a')
  })

  it('R8b: a user-editable title stays single-line and clipped in the detail', async () => {
    const noisy = 'A'.repeat(80) + '\nsecond line'
    const face: WorkspaceFace = {
      ...workspaces,
      get: id => (id === 'ws-a' ? { id: 'ws-a', path: '/proj/a', title: noisy } : projects.find(p => p.id === id)),
    }
    const { list, exec } = await setup(face)
    const error = await detailOf(list.execute({ workspaceId: 'nope' }, exec))
    expect(error.code).toBe('not_found')
    expect(error.message).not.toContain('\n')
    expect(error.message).toMatch(/A{59}…/)
    // Clipping the title must not disturb the value next to it.
    expect(error.message).toContain('retry with workspaceId=ws-a')
  })

  it('R8c: the id carried by the detail is itself accepted as workspaceId', async () => {
    const { list, exec } = await setup()
    const error = await detailOf(list.execute({ workspaceId: 'ws-a (A)' }, exec))
    expect(error.code).toBe('not_found')
    const reusable = /workspaceId=(\S+)/.exec(error.message)?.[1] as string
    expect(reusable).toBe('ws-a')
    // A detail is only a correction signal if the round trip actually works.
    expect(rowCount(await list.execute({ workspaceId: reusable }, exec))).toBe(2)
  })

  it('R9: an unaffiliated caller still gets the registered projects', async () => {
    const { list } = await setup()
    const error = await detailOf(list.execute({ workspaceId: 'nope' }, {}))
    expect(error.code).toBe('not_found')
    expect(error.message).not.toContain('this session\'s project')
    expect(error.message).toContain('known projects: ws-a, ws-b, ws-c')
  })

  it('R10: create carries the same detail', async () => {
    const { create, exec } = await setup()
    const error = await detailOf(create.execute({ title: 'X', workspaceId: '/proj/nope', urgency: 'normal' }, exec))
    expect(error.code).toBe('not_found')
    expect(error.message).toContain('expected a project id or its directory path')
    expect(error.message).toContain('retry with workspaceId=ws-a')
  })

  it('R11: create resolves a project path and stores the id', async () => {
    const { list, create, exec } = await setup()
    const created = await create.execute({ title: 'C1', workspaceId: '/proj/c', urgency: 'relaxed' }, exec) as { task: { workspaceId: string } }
    expect(created.task.workspaceId).toBe('ws-c')
    expect(rowCount(await list.execute({ workspaceId: '/proj/c' }, exec))).toBe(1)
  })
})

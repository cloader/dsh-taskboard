/**
 * Template store (0.4.0): side-file persistence, built-in seeding, upsert /
 * rename / delete, and the ledger store's import-backup method.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BUILTIN_TEMPLATES, TemplateStore } from '../src/host/templates.ts'
import { BUILTIN_TEMPLATE_CONTENT, BUILTIN_TEMPLATE_IDS } from '../src/shared/builtin-templates.ts'
import { TaskStore } from '../src/host/store.ts'

let dir: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tb-templates-'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('TemplateStore', () => {
  it('built-in content ships both locales with matching ids (host seeds the zh copy)', () => {
    expect(BUILTIN_TEMPLATES.map(t => t.id)).toEqual([...BUILTIN_TEMPLATE_IDS])
    expect(BUILTIN_TEMPLATES.map(t => t.name)).toEqual(BUILTIN_TEMPLATE_IDS.map(id => BUILTIN_TEMPLATE_CONTENT.zh[id].name))
    for (const id of BUILTIN_TEMPLATE_IDS) {
      const zhT = BUILTIN_TEMPLATE_CONTENT.zh[id]
      const enT = BUILTIN_TEMPLATE_CONTENT.en[id]
      expect(zhT.name.length).toBeGreaterThan(0)
      expect(enT.name.length).toBeGreaterThan(0)
      expect(enT.task.checklist?.length ?? 0).toBe(zhT.task.checklist?.length ?? 0)
      expect(enT.task.urgency).toBe(zhT.task.urgency)
    }
  })

  it('seeds the built-ins when the side file is missing', async () => {
    const store = new TemplateStore(join(dir, 'a-templates.json'))
    const list = await store.list()
    expect(list.map(t => t.name)).toEqual(BUILTIN_TEMPLATES.map(t => t.name))
    expect(list.every(t => t.builtin === true)).toBe(true)
    // Seeded on disk: a second store over the same file reads the same list.
    const again = await new TemplateStore(join(dir, 'a-templates.json')).list()
    expect(again.map(t => t.id)).toEqual(list.map(t => t.id))
  })

  it('upserts: create without id, rename with id, validates the name', async () => {
    const store = new TemplateStore(join(dir, 'b-templates.json'))
    const created = await store.upsert({ name: '我的模板', task: { urgency: 'urgent', checklist: ['a'] } })
    expect(created.id).toMatch(/^tpl-/)
    expect(created.task.checklist).toEqual(['a'])

    const renamed = await store.upsert({ id: created.id, name: '改名后', task: created.task })
    expect(renamed.name).toBe('改名后')
    expect((await store.list()).find(t => t.id === created.id)!.name).toBe('改名后')
    expect(renamed.createdAt).toBe(created.createdAt) // replace, not recreate

    await expect(store.upsert({ name: '  ', task: {} })).rejects.toThrow('1..60')
    await expect(store.upsert({ name: 'x'.repeat(61), task: {} })).rejects.toThrow('1..60')
  })

  it('deletes by id and reports a miss as false', async () => {
    const store = new TemplateStore(join(dir, 'c-templates.json'))
    const all = await store.list()
    const victim = all[0]!
    expect(await store.remove(victim.id)).toBe(true)
    expect((await store.list()).some(t => t.id === victim.id)).toBe(false)
    expect(await store.remove(victim.id)).toBe(false)
  })

  it('recovers from a corrupt side file by re-seeding', async () => {
    const { writeFile } = await import('node:fs/promises')
    const file = join(dir, 'd-templates.json')
    await writeFile(file, '{corrupt json', 'utf8')
    const list = await new TemplateStore(file).list()
    expect(list.length).toBe(BUILTIN_TEMPLATES.length)
  })
})

describe('TaskStore.backup (import-replace safety)', () => {
  it('writes a timestamped copy next to the ledger', async () => {
    const { mkdtemp: mk } = await import('node:fs/promises')
    const sub = await mk(join(dir, 'bk-'))
    const store = new TaskStore({ file: join(sub, 'ledger.json') })
    await store.mutate('task-created', ledger => {
      ledger.tasks.push({
        id: 't-bk', title: '备份我', description: '', prompt: '', workspaceId: 'ws-a',
        urgency: 'normal', status: 'todo', blocked: false, execution: { mode: 'claim' },
        version: 1, createdAt: 0, updatedAt: 0, createdBy: { kind: 'user' }, updatedBy: { kind: 'user' },
        comments: [], executions: [],
      })
      return ledger.tasks
    })
    const backupFile = await store.backup()
    expect(backupFile).toContain('backup-')
    const raw = JSON.parse(await readFile(backupFile, 'utf8')) as { tasks: Array<{ id: string }> }
    expect(raw.tasks.map(t => t.id)).toEqual(['t-bk'])
    await rm(sub, { recursive: true, force: true })
  })
})

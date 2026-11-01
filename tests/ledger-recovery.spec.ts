import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssetStore, ORPHAN_GRACE_MS } from '../src/host/assets.ts'
import { StorageCoordinator, STORAGE_CONFIG_FILE } from '../src/host/storage.ts'
import { TaskStore } from '../src/host/store.ts'
import { TemplateStore } from '../src/host/templates.ts'
import { emptyLedger, type TaskRecord } from '../src/shared/protocol.ts'

vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof fs>()
  return { ...actual, readFile: vi.fn(actual.readFile) }
})

const dirs: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.mocked(fs.readFile).mockClear()
  for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true })
})

function task(): TaskRecord {
  return {
    id: 't-recovery', title: 'Keep my image', description: '', prompt: '', workspaceId: 'ws-a',
    status: 'todo', urgency: 'normal', blocked: false, isolation: 'none', execution: { mode: 'claim' },
    version: 1, createdAt: 1, updatedAt: 1, createdBy: { kind: 'user' }, updatedBy: { kind: 'user' },
    comments: [], executions: [],
  }
}

async function fixture() {
  const dir = await fs.mkdtemp(join(tmpdir(), 'taskboard-recovery-'))
  dirs.push(dir)
  const storage = new StorageCoordinator({
    defaultDirectory: dir, configFile: join(dir, STORAGE_CONFIG_FILE), ledgerName: 'dsh-taskboard.json',
    templatesName: 'templates.json', assetsName: 'assets',
  })
  const store = new TaskStore({ file: storage.ledgerPath(), queue: storage.queue })
  const assets = new AssetStore(storage.assetsPath(), Date.now, storage.queue)
  const templates = new TemplateStore(storage.templatesPath(), storage.queue)
  storage.attach({ ledger: store, assets, templates })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  return { dir, file: store.location(), store, assets, storage, warn }
}

describe('ledger recovery protection (#84)', () => {
  it('keeps damaged bytes and old attachments across writes, migration, and repeated restarts', async () => {
    const f = await fixture()
    const asset = await f.assets.put(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]))
    const old = new Date(Date.now() - ORPHAN_GRACE_MS - 10_000)
    await fs.utimes(join(f.assets.location(), asset.name), old, old)
    const original = JSON.stringify({ ...emptyLedger(), tasks: [{ ...task(), description: asset.url }] }).slice(0, -2)
    await fs.writeFile(f.file, original)
    const cleanup = vi.spyOn(f.assets, 'cleanup')
    const ready = f.storage.ready().then(() => f.store.load())
    await expect(ready.then(() => f.assets.cleanup(f.store.assetReferences()))).rejects.toThrow('taskboard_ledger_unavailable')
    expect(cleanup).not.toHaveBeenCalled()
    expect(f.warn.mock.calls.flat().join(' ')).toContain(f.file)
    expect(f.warn.mock.calls.flat().join(' ')).toContain('Repair or restore')
    expect(await f.storage.status()).toMatchObject({ writable: false, error: expect.stringContaining(f.file) })
    const mutation = vi.fn(() => [])
    await expect(f.store.mutate('task-created', mutation)).rejects.toThrow('taskboard_ledger_unavailable')
    expect(mutation).not.toHaveBeenCalled()
    await expect(f.store.backup()).rejects.toThrow('taskboard_ledger_unavailable')
    await expect(f.store.writeCopy(join(f.dir, 'empty-copy.json'))).rejects.toThrow('taskboard_ledger_unavailable')
    await expect(f.storage.migrate(join(f.dir, 'new-location'))).rejects.toThrow('taskboard_ledger_unavailable')
    expect(f.storage.directory()).toBe(f.dir)
    for (let boot = 0; boot < 2; boot++) {
      const restarted = new TaskStore({ file: f.file })
      await expect(restarted.load()).rejects.toThrow('taskboard_ledger_unavailable')
      expect(() => restarted.snapshot()).toThrow('taskboard_ledger_unavailable')
      expect(() => restarted.get(task().id)).toThrow('taskboard_ledger_unavailable')
      expect(() => restarted.assetReferences()).toThrow('taskboard_ledger_unavailable')
    }
    expect(await fs.readFile(f.file, 'utf8')).toBe(original)
    expect(await f.assets.read(asset.name)).toBeDefined()
    expect((await fs.readdir(f.dir)).sort()).toEqual(['assets', 'dsh-taskboard.json'])
  })

  it.each([
    null, [], {}, { revision: 0, tasks: 'wrong' }, { revision: -1, tasks: [] },
    { revision: 1.5, tasks: [] }, { revision: 1, tasks: [task(), { id: '../unsafe' }] },
    { revision: 1, tasks: [task(), task()] }, { schemaVersion: 999, revision: 1, tasks: [] },
  ])('refuses an untrustworthy JSON ledger without overwriting it: %j', async document => {
    const f = await fixture()
    const original = JSON.stringify(document)
    await fs.writeFile(f.file, original)
    await expect(f.store.load()).rejects.toThrow('taskboard_ledger_unavailable')
    await expect(f.store.mutate('settings-updated', () => [])).rejects.toThrow('taskboard_ledger_unavailable')
    expect(await fs.readFile(f.file, 'utf8')).toBe(original)
  })

  it.each(['EACCES', 'EBUSY', 'EIO'])('retains the file on a %s read failure', async code => {
    const f = await fixture()
    const original = JSON.stringify({ ...emptyLedger(), revision: 7, tasks: [task()] })
    await fs.writeFile(f.file, original)
    const failure = Object.assign(new Error(`read failed: ${code}`), { code })
    vi.mocked(fs.readFile).mockRejectedValueOnce(failure)
    await expect(f.store.load()).rejects.toMatchObject({ cause: failure })
    expect(f.store.loadError()).toContain(code)
    await expect(f.store.mutate('task-created', () => [])).rejects.toThrow(code)
    expect(await fs.readFile(f.file, 'utf8')).toBe(original)
    expect(await fs.readdir(f.dir)).toEqual(['dsh-taskboard.json'])
  })

  it('blocks an old quarantine-only directory until the ledger is restored', async () => {
    const f = await fixture()
    const quarantine = `${f.file}.corrupt-1234`
    await fs.writeFile(quarantine, '{damaged')
    for (let boot = 0; boot < 2; boot++) {
      const store = new TaskStore({ file: f.file })
      await expect(store.load()).rejects.toThrow(quarantine)
      await expect(store.mutate('task-created', () => [])).rejects.toThrow('taskboard_ledger_unavailable')
    }
    expect(await fs.readdir(f.dir)).toEqual(['dsh-taskboard.json.corrupt-1234'])
    const recovered = { ...emptyLedger(), revision: 7, tasks: [task()] }
    await fs.writeFile(f.file, JSON.stringify(recovered))
    const restarted = new TaskStore({ file: f.file })
    await restarted.load()
    expect(restarted.snapshot()).toEqual(recovered)
    expect(restarted.assetReferences()).toContain(task().id)
    await restarted.mutate('settings-updated', () => [])
    expect(JSON.parse(await fs.readFile(f.file, 'utf8')).revision).toBe(8)
    expect(await fs.readFile(quarantine, 'utf8')).toBe('{damaged')
  })

  it('allows a new board, but refuses a missing or damaged ledger after a successful load', async () => {
    const f = await fixture()
    expect(() => f.store.assetReferences()).toThrow('load the ledger')
    await f.store.load()
    expect(f.store.assetReferences()).toBe(JSON.stringify(emptyLedger()))
    await f.store.mutate('task-created', ledger => { ledger.tasks.push(task()); return [task()] })
    await fs.rm(f.file)
    await expect(f.store.mutate('settings-updated', () => [])).rejects.toThrow('previously loaded ledger is now missing')
    await expect(fs.readFile(f.file)).rejects.toMatchObject({ code: 'ENOENT' })

    const valid = JSON.stringify({ ...emptyLedger(), tasks: [task()] })
    await fs.writeFile(f.file, valid)
    const restarted = new TaskStore({ file: f.file })
    await restarted.load()
    await fs.writeFile(f.file, '{truncated')
    await expect(restarted.mutate('settings-updated', () => [])).rejects.toThrow('taskboard_ledger_unavailable')
    expect(await fs.readFile(f.file, 'utf8')).toBe('{truncated')
    expect(() => restarted.assetReferences()).toThrow('taskboard_ledger_unavailable')
  })
})

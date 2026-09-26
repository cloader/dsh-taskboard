import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TaskStore } from '../src/host/store.ts'
import type { TaskRecord } from '../src/shared/protocol.ts'

/**
 * The ledger file is shared state: two store instances can point at the same
 * file (a plugin hot reload leaves the previous generation's long-lived
 * callbacks running). Because a store caches its snapshot forever and
 * `mutate` persists the whole document, a stale instance used to roll a newer
 * commit back silently — same revision, no error, invisible to subscribers.
 * These tests pin the guard that prevents exactly that.
 */

/** A minimal task that satisfies the ledger's plausibility rules. */
function task(id: string): TaskRecord {
  return {
    id, title: 'shared-ledger fixture', description: '', prompt: 'Do the thing',
    workspaceId: 'project', urgency: 'normal', status: 'todo', blocked: false,
    isolation: 'none', execution: { mode: 'claim' },
    version: 1, createdAt: 1, updatedAt: 1, createdBy: { kind: 'user' }, updatedBy: { kind: 'user' },
    comments: [], executions: [],
  }
}

/** Create a store backed by a real file that already contains one task. */
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'taskboard-store-'))
  const file = join(root, 'dsh-taskboard.json')
  const seed = new TaskStore({ file })
  await seed.load()
  const first = task('t-shared-1')
  await seed.mutate('task-created', ledger => { ledger.tasks.push(first); return [first] })
  return { file }
}

/** Read the ledger straight from disk (bypassing any instance's cache). */
async function onDisk(file: string) {
  return JSON.parse(await readFile(file, 'utf8')) as {
    revision: number
    tasks: Array<{ comments: Array<{ id: string }>; version: number }>
  }
}

/** Append a marker comment to the first task. */
function appendMarker(store: TaskStore, id: string) {
  return store.mutate('comment-added', ledger => {
    const first = ledger.tasks[0]
    if (first === undefined) return undefined
    first.comments.push({ id } as (typeof first.comments)[number])
    return [first]
  })
}

describe('TaskStore shared-file staleness', () => {
  it('does not roll back a commit made by another instance since we loaded', async () => {
    const { file } = await fixture()
    const older = new TaskStore({ file })
    const newer = new TaskStore({ file })
    await older.load()
    await newer.load()

    // The newer instance commits a marker…
    await appendMarker(newer, 'c-newer')
    expect((await onDisk(file)).tasks[0]!.comments.map(c => c.id)).toContain('c-newer')

    // …then the STALE instance writes. It must re-read first, not clobber.
    await appendMarker(older, 'c-older')

    const ids = (await onDisk(file)).tasks[0]!.comments.map(c => c.id)
    expect(ids).toContain('c-newer')
    expect(ids).toContain('c-older')
  })

  it('keeps the revision monotonic across interleaved writers', async () => {
    const { file } = await fixture()
    const a = new TaskStore({ file })
    const b = new TaskStore({ file })
    await a.load()
    await b.load()

    const revisions: number[] = []
    for (let i = 0; i < 4; i++) {
      // Alternate writers; neither re-loads from scratch in between.
      const store = i % 2 === 0 ? a : b
      const result = await store.mutate('task-updated', ledger => {
        const first = ledger.tasks[0]
        if (first === undefined) return undefined
        first.version += 1
        return [first]
      })
      revisions.push(result.ledger.revision)
    }

    // Strictly increasing ⇒ no writer reused a stale counter.
    for (let i = 1; i < revisions.length; i++) {
      expect(revisions[i]!).toBeGreaterThan(revisions[i - 1]!)
    }
  })

  it('preserves both updates when stale stores mutate concurrently', async () => {
    const { file } = await fixture()
    const a = new TaskStore({ file })
    const b = new TaskStore({ file })
    await Promise.all([a.load(), b.load()])

    // Both stores start from the same revision. A write-before-refresh guard
    // loses one marker here because both reads can finish before either write.
    await Promise.all([appendMarker(a, 'c-a'), appendMarker(b, 'c-b')])

    const disk = await onDisk(file)
    expect(disk.revision).toBe(3)
    expect(disk.tasks[0]!.comments.map(c => c.id)).toEqual(expect.arrayContaining(['c-a', 'c-b']))
  })
})

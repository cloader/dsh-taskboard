/**
 * Host-side task ledger: one JSON file under the DSH home, mutated through a
 * serial write queue, published as immutable snapshots with a global
 * monotonic revision. Change subscribers (P2: SSE route) observe every
 * committed mutation.
 *
 * @module dsh-taskboard/host/store
 */
import { mkdir, open, readFile, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  LEDGER_SCHEMA_VERSION,
  asBoardSettings,
  emptyLedger,
  isPlausibleTaskRecord,
  pruneExecutions,
  type TaskLedger,
  type TaskRecord,
} from '../shared/protocol.ts'

/** One committed ledger mutation, handed to change subscribers. */
export interface LedgerChange {
  /** Revision after the mutation. */
  revision: number
  /** The mutated tasks, if any (a comment purge may touch none). */
  tasks: readonly TaskRecord[]
  /** What kind of mutation this was (for SSE event naming later). */
  kind: 'task-created' | 'task-updated' | 'task-moved' | 'task-deleted' | 'comment-added' | 'execution-recorded' | 'settings-updated' | 'ledger-replaced'
}

/** Options for {@link TaskStore}. */
export interface TaskStoreOptions {
  /** Absolute ledger file path. */
  file: string
}

/**
 * The durable ledger. All mutations run through {@link mutate}, which:
 * validates the resulting document, bumps the global revision, persists
 * atomically (temp file + rename), and only then notifies subscribers.
 */
export class TaskStore {
  private readonly file: string
  private ledger: TaskLedger = emptyLedger()
  private readonly subscribers = new Set<(change: LedgerChange) => void>()
  private queue: Promise<unknown> = Promise.resolve()
  private loaded = false

  /** @param options - file location. */
  constructor(options: TaskStoreOptions) {
    this.file = options.file
  }

  /** Load (once) from disk; a missing file starts empty; a corrupt file is quarantined, not thrown. */
  async load(): Promise<void> {
    if (this.loaded) return
    try {
      const raw = await readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw) as TaskLedger
      if (typeof parsed.revision === 'number' && Array.isArray(parsed.tasks)) {
        // S11: trust no record wholesale — drop structurally broken entries
        // (including R4's traversal-shaped ids from a hand-edited file) with
        // a notice instead of letting them reach the path-building layers.
        const plausible: TaskRecord[] = []
        for (const entry of parsed.tasks as unknown[]) {
          if (!isPlausibleTaskRecord(entry)) {
            const rawId = (entry as { id?: unknown })?.id
            const id = typeof rawId === 'string' ? rawId.slice(0, 60) : String(rawId)
            console.warn('[dsh-taskboard] dropping implausible ledger entry on load:', id)
            continue
          }
          plausible.push(entry as TaskRecord)
        }
        const tasks = plausible
        // Migration from pre-claim-field ledgers: an agent-held in_progress
        // task carried its holder in updatedBy — backfill the explicit claim
        // fields so the hold survives user edits (updatedBy is audit-only).
        for (const task of tasks) {
          if (task.status === 'in_progress' && task.claimedBy === undefined
            && task.updatedBy?.kind === 'agent' && typeof task.updatedBy.sessionId === 'string') {
            task.claimedBy = task.updatedBy.sessionId
            task.claimedAt = task.updatedAt
          }
        }
        let settings = undefined
        if (parsed.settings !== undefined) {
          try {
            settings = asBoardSettings(parsed.settings)
          } catch {
            console.warn('[dsh-taskboard] dropping invalid board settings on load')
          }
        }
        this.ledger = {
          schemaVersion: LEDGER_SCHEMA_VERSION,
          revision: parsed.revision,
          tasks,
          ...(settings !== undefined ? { settings } : {}),
        }
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        // Quarantine a corrupt ledger: rename it aside, start fresh. Never
        // take the host down over ledger damage.
        try {
          await rename(this.file, `${this.file}.corrupt-${Date.now()}`)
        } catch { /* best effort */ }
      }
    }
    this.loaded = true
  }

  /**
   * The current snapshot — a deep-frozen clone. Mutating the returned value
   * throws (strict mode) instead of silently bypassing the revision/persist
   * path; internal state is never handed out.
   */
  snapshot(): TaskLedger {
    return deepFreeze(structuredClone(this.ledger))
  }

  /** Find a task by id (frozen clone; internal state is never handed out). */
  get(id: string): TaskRecord | undefined {
    const task = this.ledger.tasks.find(t => t.id === id)
    return task === undefined ? undefined : deepFreeze(structuredClone(task))
  }

  /** Subscribe to committed changes; returns the unsubscribe. */
  subscribe(fn: (change: LedgerChange) => void): () => void {
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }

  /**
   * Write a timestamped backup copy of the current ledger next to the live
   * file (import-replace safety, 0.4.0). Never throws the caller's flow —
   * a backup failure fails the import itself.
   * @returns the backup file path.
   */
  async backup(): Promise<string> {
    await this.load()
    const target = `${this.file}.backup-${Date.now()}`
    await persistAtomic(target, JSON.stringify(this.ledger, null, 2))
    return target
  }

  /**
   * Run one mutation inside the serial queue. The mutator works on a
   * structured clone; returning `undefined` aborts with no write.
   * @param kind - change kind for subscribers.
   * @param mutator - receives the cloned ledger; mutate tasks in place; return the touched tasks.
   */
  async mutate(
    kind: LedgerChange['kind'],
    mutator: (ledger: TaskLedger) => TaskRecord[] | undefined,
  ): Promise<{ ledger: TaskLedger; changed: readonly TaskRecord[] }> {
    const run = async (): Promise<{ ledger: TaskLedger; changed: readonly TaskRecord[] }> => {
      await this.load()
      const draft: TaskLedger = structuredClone(this.ledger)
      const changed = mutator(draft)
      if (changed === undefined) {
        // S9 parity: even a no-op mutation hands out a frozen clone — never
        // the live internal ledger.
        return { ledger: deepFreeze(structuredClone(this.ledger)), changed: [] }
      }
      // Retention cap: every committed mutation re-checks the touched tasks,
      // so execution history can never grow unbounded (SSE state payload).
      for (const task of changed) pruneExecutions(task)
      draft.revision += 1
      const json = JSON.stringify(draft)
      await persistAtomic(this.file, json)
      this.ledger = draft
      const change: LedgerChange = { revision: draft.revision, tasks: changed, kind }
      for (const fn of this.subscribers) {
        try {
          fn(change)
        } catch { /* subscriber errors never abort the write */ }
      }
      // S9: hand out frozen clones — the return value used to BE the new
      // internal ledger; callers must never mutate internal state in place.
      return {
        ledger: deepFreeze(structuredClone(draft)),
        changed: changed.map(t => deepFreeze(structuredClone(t))),
      }
    }
    const result = (this.queue = this.queue.then(run, run)) as ReturnType<typeof run>
    return result
  }

  /**
   * Run a read INSIDE the serial queue (R3): observes exactly the ledger
   * state after all previously enqueued mutations — immune to the
   * write-then-publish window around `mutate`'s persistence. Read-only: the
   * callback receives a frozen deep clone and nothing is written.
   */
  async read<T>(fn: (ledger: TaskLedger) => T): Promise<T> {
    const run = async (): Promise<T> => {
      await this.load()
      return fn(deepFreeze(structuredClone(this.ledger)))
    }
    const result = (this.queue = this.queue.then(run, run)) as Promise<T>
    return result
  }
}

/** Recursively freeze a plain-data value (defense in depth for handed-out snapshots). */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    if (!Object.isFrozen(value)) Object.freeze(value)
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}

/**
 * Atomic file persist: write temp, fsync, then rename over the target (S10:
 * without the sync, a power loss after rename can leave a zero-length file —
 * the next load would quarantine the ledger and start empty).
 */
async function persistAtomic(file: string, contents: string): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temp = join(dirname(file), `.${Math.random().toString(36).slice(2)}.tmp`)
  const fh = await open(temp, 'w')
  try {
    await fh.writeFile(contents, 'utf8')
    await fh.sync()
  } finally {
    await fh.close()
  }
  await rename(temp, file)
}

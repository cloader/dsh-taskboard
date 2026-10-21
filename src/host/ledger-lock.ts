/** Cross-process ledger ownership, including recovery after a killed host. */
import { mkdir, open, readFile, unlink } from 'node:fs/promises'
import { readFileSync, statSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'

const STALE_LOCK_MS = 5 * 60_000
const LOCK_TIMEOUT_MS = STALE_LOCK_MS + 60_000

export interface LedgerLockOptions {
  timeoutMs?: number
  retryMs?: number
}

/** Only ESRCH establishes that a process is dead; EPERM is not evidence. */
function ownerState(token: string): 'alive' | 'dead' | 'unknown' | 'legacy' {
  const match = /^([1-9]\d*):\d+:[a-z0-9]+$/.exec(token)
  const pid = match === null ? NaN : Number(match[1])
  if (!Number.isSafeInteger(pid) || pid <= 0 || pid > 0x7fffffff) return 'legacy'
  try { process.kill(pid, 0); return 'alive' } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH' ? 'dead' : 'unknown'
  }
}

/**
 * Recheck identity immediately before removing a recoverable lock. Keep this
 * small section synchronous so concurrent callers in this host cannot resume
 * between the identity check and removal. Never reclaim a known live owner.
 */
function recoverLock(lock: string): boolean {
  try {
    const before = statSync(lock)
    const token = readFileSync(lock, 'utf8')
    const state = ownerState(token)
    if (state === 'alive' || state === 'unknown') return false
    if (state === 'legacy' && Date.now() - before.mtimeMs <= STALE_LOCK_MS) return false
    const after = statSync(lock)
    if (before.dev !== after.dev || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs
      || readFileSync(lock, 'utf8') !== token) return false
    unlinkSync(lock)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    throw error
  }
}

/** Exclusive sidecar lock around the complete ledger read/modify/write. */
export async function withLedgerWriteLock<T>(file: string, run: () => Promise<T>, options: LedgerLockOptions = {}): Promise<T> {
  const lock = `${file}.lock`
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`
  const deadline = Date.now() + (options.timeoutMs ?? LOCK_TIMEOUT_MS)
  await mkdir(dirname(file), { recursive: true })
  for (;;) {
    let handle
    try {
      handle = await open(lock, 'wx')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (recoverLock(lock)) continue
      if (Date.now() >= deadline) throw new Error(`timed out waiting for task ledger lock: ${file}`)
      await new Promise<void>(resolve => setTimeout(resolve, options.retryMs ?? 25))
      continue
    }
    try {
      try { await handle.writeFile(token, 'utf8') } finally { await handle.close() }
      // Errors from the protected operation must not be mistaken for a
      // failed lock acquisition (in particular an operation's EEXIST).
      return await run()
    } finally {
      const held = await readFile(lock, 'utf8').catch(() => undefined)
      if (held === token) await unlink(lock).catch(() => { /* best effort */ })
    }
  }
}

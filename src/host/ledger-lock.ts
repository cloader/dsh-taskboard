/** Cross-process ledger ownership, including recovery after a killed host. */
import { mkdir } from 'node:fs/promises'
import { mkdirSync, readdirSync, readFileSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

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
 * Recover unique owner entries, then remove ONLY an empty lock directory.
 * A second reclaimer cannot remove a replacement owner's different entry;
 * rmdir refuses a nonempty directory, closing the stat/unlink replacement race.
 * Legacy file locks are accepted during upgrade but never created here.
 */
function recoverLock(lock: string): boolean {
  try {
    const before = statSync(lock)
    if (before.isDirectory()) {
      const entries = readdirSync(lock)
      if (entries.length === 0 && Date.now() - before.mtimeMs <= STALE_LOCK_MS) return false
      for (const entry of entries) {
        const match = /^owner-([1-9]\d*)-(\d+)-([a-z0-9]+)$/.exec(entry)
        if (match === null || ownerState(match.slice(1).join(':')) !== 'dead') return false
        // Unique per acquisition: this path can never name a new owner's record.
        try { unlinkSync(join(lock, entry)) } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      try { rmdirSync(lock); return true } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOTEMPTY' || code === 'EEXIST') return false
        if (code === 'ENOENT') return true
        throw error
      }
    }
    const token = readFileSync(lock, 'utf8')
    const state = ownerState(token)
    if (state === 'alive' || state === 'unknown') return false
    if (state === 'legacy' && Date.now() - before.mtimeMs <= STALE_LOCK_MS) return false
    const after = statSync(lock)
    if (!after.isFile() || before.dev !== after.dev || before.ino !== after.ino
      || before.mtimeMs !== after.mtimeMs || readFileSync(lock, 'utf8') !== token) return false
    try { unlinkSync(lock); return true } catch (error) {
      // A racing new writer may already have replaced the legacy file with a
      // directory. unlink cannot remove that directory or its owner record.
      if (statSync(lock).isDirectory()) return false
      throw error
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return true
    if (code === 'EISDIR' || code === 'ENOTDIR') return false
    throw error
  }
}

function release(lock: string, owner: string): void {
  try { unlinkSync(owner) } catch { /* another recovery may have removed it */ }
  try { rmdirSync(lock) } catch { /* never remove another owner's nonempty directory */ }
}

/** Exclusive sidecar directory around the complete ledger read/modify/write. */
export async function withLedgerWriteLock<T>(file: string, run: () => Promise<T>, options: LedgerLockOptions = {}): Promise<T> {
  const lock = file + '.lock'
  const token = process.pid + ':' + Date.now() + ':' + Math.random().toString(36).slice(2)
  const owner = join(lock, 'owner-' + token.replaceAll(':', '-'))
  const deadline = Date.now() + (options.timeoutMs ?? LOCK_TIMEOUT_MS)
  await mkdir(dirname(file), { recursive: true })
  for (;;) {
    let acquired = false
    try { mkdirSync(lock); acquired = true } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      if (recoverLock(lock)) continue
    }
    if (acquired) {
      let ready = false
      try {
        writeFileSync(owner, token, { flag: 'wx' })
        const entries = readdirSync(lock)
        ready = entries.length === 1 && entries[0] === owner.slice(lock.length + 1)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') { release(lock, owner); throw error }
      }
      if (ready) {
        // Callback EEXIST must propagate once, never restart the operation.
        try { return await run() } finally { release(lock, owner) }
      }
      // An acquisition suspended while its empty directory was recovered must
      // not enter a replacement owner's critical section.
      release(lock, owner)
    }
    if (Date.now() >= deadline) throw new Error('timed out waiting for task ledger lock: ' + file)
    await new Promise<void>(resolve => setTimeout(resolve, options.retryMs ?? 25))
  }
}

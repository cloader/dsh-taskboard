import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withLedgerWriteLock } from '../src/host/ledger-lock.ts'

const dirs: string[] = []
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ledger-lock-'))
  dirs.push(dir)
  return join(dir, 'ledger.json')
}
afterEach(async () => { await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))) })

describe('ledger crash recovery (#53)', () => {
  it('recovers a fresh lock from an exited process without waiting five minutes', async () => {
    const file = await fixture()
    const child = spawn(process.execPath, ['-e', 'process.exit(0)'])
    const pid = child.pid!
    await once(child, 'exit')
    await writeFile(`${file}.lock`, `${pid}:${Date.now()}:orphan`)
    expect(await withLedgerWriteLock(file, async () => 'recovered', { timeoutMs: 100 })).toBe('recovered')
    await expect(readFile(`${file}.lock`)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('never reclaims a live owner even when its lock is older than five minutes', async () => {
    const file = await fixture()
    const token = `${process.pid}:1:live`
    await writeFile(`${file}.lock`, token)
    await utimes(`${file}.lock`, new Date(0), new Date(0))
    await expect(withLedgerWriteLock(file, async () => 'wrong', { timeoutMs: 30, retryMs: 5 })).rejects.toThrow('timed out')
    expect(await readFile(`${file}.lock`, 'utf8')).toBe(token)
  })

  it('preserves fresh incomplete locks and recovers aged legacy locks', async () => {
    const file = await fixture()
    await writeFile(`${file}.lock`, '')
    await expect(withLedgerWriteLock(file, async () => {}, { timeoutMs: 20, retryMs: 5 })).rejects.toThrow('timed out')
    await utimes(`${file}.lock`, new Date(0), new Date(0))
    await withLedgerWriteLock(file, async () => {})
  })

  it('does not mistake a process permission error for a dead owner', async () => {
    const file = await fixture()
    const token = `${process.pid}:1:protected`
    await writeFile(`${file}.lock`, token)
    await utimes(`${file}.lock`, new Date(0), new Date(0))
    const probe = vi.spyOn(process, 'kill').mockImplementation(() => { throw Object.assign(new Error('denied'), { code: 'EPERM' }) })
    try {
      await expect(withLedgerWriteLock(file, async () => {}, { timeoutMs: 20, retryMs: 5 })).rejects.toThrow('timed out')
      expect(await readFile(`${file}.lock`, 'utf8')).toBe(token)
    } finally { probe.mockRestore() }
  })

  it('serializes competing writers after orphan recovery', async () => {
    const file = await fixture()
    const child = spawn(process.execPath, ['-e', 'process.exit(0)'])
    const pid = child.pid!
    await once(child, 'exit')
    await writeFile(`${file}.lock`, `${pid}:1:orphan`)
    let active = 0
    let maximum = 0
    await Promise.all(Array.from({ length: 8 }, () => withLedgerWriteLock(file, async () => {
      maximum = Math.max(maximum, ++active)
      await new Promise(resolve => setTimeout(resolve, 5))
      --active
    })))
    expect(maximum).toBe(1)
  })

  it('releases on failure and propagates callback EEXIST once', async () => {
    const file = await fixture()
    let calls = 0
    const error = Object.assign(new Error('operation failed'), { code: 'EEXIST' })
    await expect(withLedgerWriteLock(file, async () => { calls++; throw error })).rejects.toBe(error)
    expect(calls).toBe(1)
    await withLedgerWriteLock(file, async () => {})
  })
})

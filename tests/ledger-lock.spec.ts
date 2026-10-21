import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
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
  it('recovers a newly killed host using the directory lock format', async () => {
    const file = await fixture()
    const module = pathToFileURL(join(process.cwd(), 'src/host/ledger-lock.ts')).href
    const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', `
      import { withLedgerWriteLock } from ${JSON.stringify(module)};
      await withLedgerWriteLock(process.argv[1], async () => {
        console.log('holding');
        await new Promise(() => setInterval(() => {}, 1000));
      });`, file], { stdio: ['ignore', 'pipe', 'pipe'] })
    try {
      await once(child.stdout, 'data')
      expect(await readdir(`${file}.lock`)).toHaveLength(1)
      // Even an old lock belonging to a living process must stay exclusive.
      await utimes(`${file}.lock`, new Date(0), new Date(0))
      await expect(withLedgerWriteLock(file, async () => {}, { timeoutMs: 25, retryMs: 5 })).rejects.toThrow('timed out')
    } finally {
      const exited = once(child, 'exit')
      child.kill()
      await exited
    }
    expect(await withLedgerWriteLock(file, async () => 'recovered', { timeoutMs: 100 })).toBe('recovered')
  })

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

  it('preserves updates from independent host processes recovering the same orphan', async () => {
    const file = await fixture()
    await writeFile(file, '0')
    const owner = spawn(process.execPath, ['-e', 'process.exit(0)'])
    const pid = owner.pid!
    await once(owner, 'exit')
    await writeFile(`${file}.lock`, `${pid}:1:orphan`)
    const lockModule = pathToFileURL(join(process.cwd(), 'src/host/ledger-lock.ts')).href
    const source = `
      import { withLedgerWriteLock } from ${JSON.stringify(lockModule)};
      import { readFile, writeFile } from 'node:fs/promises';
      const file = process.argv[1];
      for (let i = 0; i < 5; i++) await withLedgerWriteLock(file, async () => {
        const n = Number(await readFile(file, 'utf8'));
        await new Promise(resolve => setTimeout(resolve, 5));
        await writeFile(file, String(n + 1));
      });`
    await Promise.all(Array.from({ length: 4 }, async () => {
      const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', source, file], { stdio: ['ignore', 'ignore', 'pipe'] })
      let errors = ''
      child.stderr.on('data', chunk => { errors += String(chunk) })
      const [code] = await once(child, 'exit')
      expect(code, errors).toBe(0)
    }))
    expect(await readFile(file, 'utf8')).toBe('20')
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

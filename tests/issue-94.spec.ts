/** Real-git execution/settlement/continuation/merge coverage for branch collisions. */
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ExecutionService, type AgentsFace } from '../src/host/execution.ts'
import { createGitFace } from '../src/host/git.ts'
import { TaskStore } from '../src/host/store.ts'
import type { TaskRecord } from '../src/shared/protocol.ts'
import { waitFor } from './wait-for.ts'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

const gitAvailable = (() => {
  try { execFileSync('git', ['--version'], { stdio: 'ignore' }); return true } catch { return false }
})()

describe.skipIf(!gitAvailable)('periodic branch fallback (#94)', () => {
  it.each([
    { name: 'single repo', root: true, children: [] },
    { name: 'root and nested repos', root: true, children: ['child'] },
    { name: 'container with nested repos', root: false, children: ['first', 'second'] },
  ])('keeps actual branches, evidence and work through continuation and merge: $name', async layout => {
    const base = await mkdtemp(join(tmpdir(), 'tb-issue94-'))
    const ws = join(base, 'workspace')
    let service: ExecutionService | undefined
    try {
      await mkdir(ws)
      const repos = [...(layout.root ? [''] : []), ...layout.children]
      const face = createGitFace()
      const oldBranch = 'task/patrol+previous'
      for (const repo of repos) {
        const root = join(ws, repo)
        await mkdir(root, { recursive: true })
        git(root, 'init', '-q')
        git(root, 'config', 'user.name', 'Taskboard test')
        git(root, 'config', 'user.email', 'taskboard@example.test')
        git(root, 'config', 'core.autocrlf', 'false')
        await writeFile(join(root, '.gitignore'), '.dsh-worktrees/\n' + (repo === '' ? layout.children.map(c => `/${c}/\n`).join('') : ''))
        await writeFile(join(root, 'base.txt'), 'base\n')
        git(root, 'add', '.')
        git(root, 'commit', '-qm', 'base')
        // Previous cycle is still awaiting acceptance and holds the old branch.
        expect(await face.prepareWorktree(root, join(root, '.dsh-worktrees', 'previous'), oldBranch)).toBeDefined()
      }
      const task: TaskRecord = {
        id: 'cycle2', title: 'Patrol', description: '', prompt: '', workspaceId: 'ws',
        urgency: 'normal', status: 'todo', blocked: false, isolation: 'worktree',
        ...(layout.root ? { branch: oldBranch } : {}),
        ...(layout.children.length > 0 ? { branches: Object.fromEntries(layout.children.map(c => [c, oldBranch])) } : {}),
        execution: { mode: 'scheduled', cron: '* * * * *' },
        version: 1, createdAt: 0, updatedAt: 0, createdBy: { kind: 'user' }, updatedBy: { kind: 'user' },
        comments: [], executions: [],
      }
      const store = new TaskStore({ file: join(base, 'ledger.json') })
      await store.mutate('task-created', ledger => { ledger.tasks.push(task); return [task] })
      const idle = new Map<string, () => void>()
      const agents: AgentsFace = {
        create: async ({ sessionId }) => ({
          agent: {
            id: sessionId, inject: () => {}, followup: () => {},
            whenIdle: () => new Promise<void>(resolve => { idle.set(sessionId, resolve) }),
          },
          dispose: async () => {},
        }),
      }
      service = new ExecutionService({
        store, agents, git: face,
        workspaces: { get: () => ({ id: 'ws', path: ws }), attach: async () => {} },
        events: { onSessionEvent: () => () => {} }, now: Date.now,
      })
      const started = await service.run(task.id, 'scheduled')
      if (!started.ok) throw new Error(started.error)
      const branches = new Map<string, string>()
      const paths = new Map<string, string>()
      for (const repo of repos) {
        const path = join(ws, '.dsh-worktrees', task.id, repo)
        const branch = git(path, 'branch', '--show-current')
        expect(branch).toMatch(/^task\/patrol\+previous\+r[0-9a-f]{8}$/)
        paths.set(repo, path)
        branches.set(repo, branch)
        await writeFile(join(path, 'cycle.txt'), 'cycle two\n')
        git(path, 'add', 'cycle.txt')
        git(path, 'commit', '-qm', 'cycle two work')
      }
      idle.get(started.sessionId)!()
      await waitFor(() => store.get(task.id)!.executions[0]!.outcome === 'succeeded')
      await waitFor(() => service!.inFlight() === 0)
      const settled = store.get(task.id)!
      const execution = settled.executions[0]!
      expect(execution.isolation).toBe('worktree')
      expect(execution.branch).toBe(branches.get(repos[0]!))
      for (const repo of repos) {
        expect(repo === '' ? settled.branch : settled.branches?.[repo]).toBe(branches.get(repo))
        const evidence = execution.repos?.find(r => r.repo === repo) ?? execution
        expect(evidence.branch).toBe(branches.get(repo))
        expect(evidence.commits?.map(c => c.subject)).toContain('cycle two work')
        // Uncommitted work must also survive the next continuation.
        await writeFile(join(paths.get(repo)!, 'draft.txt'), 'keep this draft\n')
      }
      const successor = store.snapshot().tasks.find(t => t.spawnedFrom === task.id)!
      expect(successor).toBeDefined()
      expect(successor.branch).toBeUndefined()
      expect(successor.branches).toBeUndefined()

      const continued = await service.run(task.id, 'manual', { reuseWorktree: true })
      if (!continued.ok) throw new Error(continued.error)
      for (const repo of repos) {
        const path = paths.get(repo)!
        expect(git(path, 'branch', '--show-current')).toBe(branches.get(repo))
        expect(await readFile(join(path, 'cycle.txt'), 'utf8')).toBe('cycle two\n')
        expect(await readFile(join(path, 'draft.txt'), 'utf8')).toBe('keep this draft\n')
        await unlink(join(path, 'draft.txt'))
      }
      idle.get(continued.sessionId)!()
      await waitFor(() => store.get(task.id)!.executions[1]!.outcome === 'succeeded')
      await waitFor(() => service!.inFlight() === 0)
      // Merge targets come from the persisted task, as in the HTTP route.
      const final = store.get(task.id)!
      for (const repo of repos) {
        const branch = repo === '' ? final.branch! : final.branches![repo]!
        await expect(face.merge(join(ws, repo), branch, repo === '' ? layout.children : undefined)).resolves.toBeUndefined()
        expect(await readFile(join(ws, repo, 'cycle.txt'), 'utf8')).toBe('cycle two\n')
        // The predecessor's checkout has remained untouched throughout.
        expect(git(join(ws, repo, '.dsh-worktrees', 'previous'), 'branch', '--show-current')).toBe(oldBranch)
      }
    } finally {
      service?.dispose()
      await rm(base, { recursive: true, force: true, maxRetries: 3 })
    }
  }, 30_000)
})

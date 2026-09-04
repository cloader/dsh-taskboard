/**
 * 0.6.3 multi-repo mirror: REAL-git integration (skipped when no git binary
 * answers). Every other spec scripts the git face, so the behavior this whole
 * feature hinges on — a root worktree's status lists its nested child
 * worktrees as untracked noise (`?? sub/`) — is invisible to them. This spec
 * builds an actual root+parallel-repo workspace in the OS temp dir and runs
 * the orchestration end to end: prepare → commit in the mirror → collect
 * evidence → whole-mirror removal.
 *
 * @module dsh-taskboard/host/mirror-real-git.spec
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createGitFace } from '../src/host/git.ts'
import { prepareMirror, removeMirror } from '../src/host/isolation.ts'
import { createRepoScanner } from '../src/host/repos.ts'

/** Run git in `cwd`; identity flags keep commits reproducible everywhere. */
function git(cwd: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.email=agent@dsh.test', '-c', 'user.name=agent', ...args], { cwd, stdio: 'ignore' })
}

/** Persist identity in the repo's local config so bare-git calls made by the
 * git face (e.g. merge creating a merge commit) also have a committer on CI,
 * where no global user.name/user.email exists. */
function withIdentity(cwd: string): void {
  git(cwd, 'config', 'user.email', 'agent@dsh.test')
  git(cwd, 'config', 'user.name', 'agent')
}

const gitAvailable = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

const d = gitAvailable ? describe : describe.skip

d('mirror orchestration on real git (0.6.3)', () => {
  it('prepares a root+parallel mirror, keeps evidence clean, removes children-first', async () => {
    const base = mkdtempSync(join(tmpdir(), 'dsh-atb-mirror-'))
    try {
      // Workspace: a root repo with one commit, plus a PARALLEL nested repo
      // (own .git) the root repo does not track.
      const ws = join(base, 'ws')
      const sub = join(ws, 'sub-repo')
      mkdirSync(ws, { recursive: true })
      git(ws, 'init', '-q')
      withIdentity(ws)
      writeFileSync(join(ws, 'README.md'), 'root\n')
      git(ws, 'add', '.')
      git(ws, 'commit', '-qm', 'root init')
      mkdirSync(sub, { recursive: true })
      git(sub, 'init', '-q')
      withIdentity(sub)
      writeFileSync(join(sub, 'lib.txt'), 'sub\n')
      git(sub, 'add', '.')
      git(sub, 'commit', '-qm', 'sub init')

      const face = createGitFace()
      const scanner = createRepoScanner()
      const outcome = await prepareMirror(
        { git: face, scanner },
        { workspacePath: ws, taskId: 't-real', branch: 'task/mirror+t-real', reuse: false },
      )
      if (!('mirror' in outcome)) throw new Error('expected a mirror, got note: ' + outcome.note)
      const mirror = outcome.mirror
      expect(mirror.repos.map(r => r.repo)).toEqual(['', 'sub-repo'])
      expect(mirror.repos[0]!.branch).toBe('task/mirror+t-real')
      expect(mirror.repos[1]!.branch).toBe('task/mirror+t-real')

      const rootMirror = mirror.repos[0]!.worktreePath
      const subMirror = mirror.repos[1]!.worktreePath
      // The nested repo's worktree sits INSIDE the root's — the noise source.
      expect(subMirror.startsWith(rootMirror)).toBe(true)

      // Both mirrors get real work committed on their task branches.
      writeFileSync(join(rootMirror, 'root.txt'), 'work\n')
      git(rootMirror, 'add', '.')
      git(rootMirror, 'commit', '-qm', 'root work')
      writeFileSync(join(subMirror, 'sub.txt'), 'work\n')
      git(subMirror, 'add', '.')
      git(subMirror, 'commit', '-qm', 'sub work')

      // Root evidence must NOT report the nested child worktree as dirty —
      // and must carry the root work's commit (review-fix behavior).
      const facts = await face.collect(rootMirror, mirror.repos[0]!.baseCommit, ['sub-repo'])
      expect(facts.dirtyFiles).toEqual([])
      expect(facts.commits.map(c => c.subject)).toEqual(['root work'])
      // And for contrast: WITHOUT the exclusion the nested repo IS there
      // (untracked `?? sub-repo/` or gitlink drift `M sub-repo` — exactly what
      // the removal pre-check and the old evidence code saw).
      const raw = await face.collect(rootMirror, mirror.repos[0]!.baseCommit)
      expect(raw.dirtyFiles.some(l => l.includes('sub-repo'))).toBe(true)

      // Whole-mirror removal: the aggregated dirty pre-check must survive the
      // nested-worktree noise (a fully committed mirror is NOT dirty) and the
      // order must be children first — root last.
      await expect(removeMirror({ git: face, scanner }, { workspacePath: ws, taskId: 't-real' }))
        .resolves.toBeUndefined()
      expect(existsSync(rootMirror)).toBe(false)
      expect(existsSync(subMirror)).toBe(false)
    } finally {
      rmSync(base, { recursive: true, force: true, maxRetries: 3 })
    }
  }, 30_000)

  it('gitlink-tracked nested repo: drift M <sub> stays exempt (evidence / merge / removal)', async () => {
    const base = mkdtempSync(join(tmpdir(), 'dsh-atb-mirror-'))
    try {
      // Workspace: root repo + parallel nested repo, where the root TRACKS
      // the nested one as a gitlink (mode 160000 — a container repo embedding
      // sub-repos, like the plugin's own development workspace).
      const ws = join(base, 'ws')
      const sub = join(ws, 'sub-repo')
      mkdirSync(ws, { recursive: true })
      git(ws, 'init', '-q')
      withIdentity(ws)
      writeFileSync(join(ws, 'README.md'), 'root\n')
      git(ws, 'add', '.')
      git(ws, 'commit', '-qm', 'root init')
      mkdirSync(sub, { recursive: true })
      git(sub, 'init', '-q')
      withIdentity(sub)
      writeFileSync(join(sub, 'lib.txt'), 'sub\n')
      git(sub, 'add', '.')
      git(sub, 'commit', '-qm', 'sub init')
      const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sub, encoding: 'utf8' }).trim()
      git(ws, 'update-index', '--add', '--cacheinfo', '160000', sha, 'sub-repo')
      git(ws, 'commit', '-qm', 'track sub as gitlink')

      const face = createGitFace()
      const scanner = createRepoScanner()
      const outcome = await prepareMirror(
        { git: face, scanner },
        { workspacePath: ws, taskId: 't-gitlink', branch: 'task/gitlink+t-gitlink', reuse: false },
      )
      if (!('mirror' in outcome)) throw new Error('expected a mirror, got note: ' + outcome.note)
      const root = outcome.mirror.repos[0]!
      const child = outcome.mirror.repos[1]!
      expect(child.worktreePath.startsWith(root.worktreePath)).toBe(true)

      // Agent work on the CHILD task branch first: the root mirror's gitlink
      // drifts (` M sub-repo`) BEFORE the root commits anything of its own.
      writeFileSync(join(child.worktreePath, 'work.txt'), 'w\n')
      git(child.worktreePath, 'add', '.')
      git(child.worktreePath, 'commit', '-qm', 'sub work')
      const dirty = await face.dirtyLines(root.worktreePath)
      expect(dirty?.some(l => l.includes('sub-repo'))).toBe(true) // the drift is REAL

      // Evidence with the exclusion: no phantom dirty (review-fix behavior).
      const facts = await face.collect(root.worktreePath, root.baseCommit, ['sub-repo'])
      expect(facts.dirtyFiles).toEqual([])
      expect(facts.commits.map(c => c.subject)).toEqual([]) // no root work yet

      // Root task work + merge with the exemption (was: permanently refused
      // by the gitlink noise in the main-clean check).
      writeFileSync(join(root.worktreePath, 'root.txt'), 'work\n')
      git(root.worktreePath, 'add', '.')
      git(root.worktreePath, 'commit', '-qm', 'root work')
      await expect(face.merge(ws, 'task/gitlink+t-gitlink', ['sub-repo'])).resolves.toBeUndefined()

      // Whole-mirror removal survives the drift (children first, root last).
      await expect(removeMirror({ git: face, scanner }, { workspacePath: ws, taskId: 't-gitlink' }))
        .resolves.toBeUndefined()
      expect(existsSync(root.worktreePath)).toBe(false)
      expect(existsSync(child.worktreePath)).toBe(false)
    } finally {
      rmSync(base, { recursive: true, force: true, maxRetries: 3 })
    }
  }, 30_000)
})

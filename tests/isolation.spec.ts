/**
 * 0.6.3 multi-repo mirror: the isolation orchestration itself (prepare / remove)
 * over a scripted GitFace — only the FILESYSTEM is real (removeMirror probes
 * child-mirror existence), no real git.
 *
 * Regression focus (review fixes): the mirror removal dirty pre-check must NOT
 * read the root worktree's nested child worktrees as root dirt — real git
 * reports them as `?? sub/` untracked noise AND, once the child has committed
 * past a staged gitlink, as `M sub` gitlink drift — one REAL dirty repo
 * anywhere still refuses the whole mirror before anything is deleted, and the
 * removal order is children BEFORE root.
 *
 * @module dsh-taskboard/host/isolation.spec
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { prepareMirror, removeMirror } from '../src/host/isolation.ts'
import type { GitFace, SettlementFacts } from '../src/host/git.ts'
import { worktreePathOf } from '../src/host/git.ts'
import type { RepoRef, RepoScanner } from '../src/host/repos.ts'

const cleanup: string[] = []
afterEach(() => {
  while (cleanup.length > 0) rmSync(cleanup.pop()!, { recursive: true, force: true })
})

/** A real temp workspace with the mirror layout on disk (git stays scripted). */
function wsFixture(children: string[]): { ws: string; root: string; childPaths: string[] } {
  const ws = mkdtempSync(join(tmpdir(), 'dsh-atb-iso-'))
  cleanup.push(ws)
  const root = worktreePathOf(ws, 't-fix')
  mkdirSync(root, { recursive: true })
  const childPaths = children.map(rel => {
    const p = root + '/' + rel
    mkdirSync(p, { recursive: true })
    return p
  })
  return { ws, root, childPaths }
}

/** Scripted GitFace: only the paths isolation.ts touches. */
function stubGit(opts: {
  /** The workspace path `detect` should acknowledge (root-repo probe). */
  root?: string
  rootIsRepo?: boolean
  dirty?: Record<string, string[]>
  removes?: string[]
}): GitFace {
  const empties: SettlementFacts = { commits: [], commitsTotal: 0, dirtyFiles: [], dirtyFilesTotal: 0, changedFiles: 0 }
  return {
    detect: async root => opts.rootIsRepo === true && root === opts.root,
    binaryAvailable: async () => true,
    prepareWorktree: async (_root, path, branch) => ({ path, branch, baseCommit: 'base' }),
    collect: async () => empties,
    dirtyLines: async cwd => opts.dirty?.[cwd] ?? [],
    merge: async () => {},
    isAncestor: async () => false,
    removeWorktree: async (_root, path) => {
      opts.removes?.push(path)
      return 'removed'
    },
    deleteBranch: async () => {},
    showCommit: async () => undefined,
    showPathDiff: async () => undefined,
  }
}

function scannerOf(ws: string, rels: string[]): RepoScanner {
  const repos: RepoRef[] = rels.map(rel => ({ relPath: rel, absPath: `${ws}/${rel}` }))
  return { findNestedRepos: async () => repos, clearCache() {} }
}

describe('removeMirror (0.6.3 review fixes)', () => {
  it.each(['root', 'child'])('unknown %s status refuses the whole mirror before any removal', async where => {
    const { ws, root, childPaths } = wsFixture(['sub'])
    const unknown = where === 'root' ? root : childPaths[0]!
    writeFileSync(join(unknown, 'keep.txt'), 'uncommitted work')
    const removes: string[] = []
    const git = stubGit({ removes })
    git.dirtyLines = async path => path === unknown ? undefined : []
    await expect(removeMirror({ git, scanner: scannerOf(ws, ['sub']) }, { workspacePath: ws, taskId: 't-fix' }))
      .rejects.toMatchObject({ code: 'worktree-status-unavailable' })
    expect(removes).toEqual([])
    expect(readFileSync(join(unknown, 'keep.txt'), 'utf8')).toBe('uncommitted work')
    expect(existsSync(childPaths[0]!)).toBe(true)
  })

  it('a rejected status probe also preserves files', async () => {
    const { ws, root } = wsFixture([])
    writeFileSync(join(root, 'keep.txt'), 'save me')
    const removes: string[] = []
    const git = stubGit({ removes })
    git.dirtyLines = async () => { throw new Error('status unavailable') }
    await expect(removeMirror({ git, scanner: scannerOf(ws, []) }, { workspacePath: ws, taskId: 't-fix' }))
      .rejects.toMatchObject({ code: 'worktree-status-unavailable' })
    expect(removes).toEqual([])
    expect(readFileSync(join(root, 'keep.txt'), 'utf8')).toBe('save me')
  })

  it('stops before removing the parent when a child fails its fresh removal check', async () => {
    const { ws, root, childPaths } = wsFixture(['sub'])
    writeFileSync(join(childPaths[0]!, 'keep.txt'), 'new work after preflight')
    const removes: string[] = []
    const git = stubGit({ removes })
    git.removeWorktree = async (_repo, path) => {
      removes.push(path)
      throw new Error('cannot verify child status')
    }
    await expect(removeMirror({ git, scanner: scannerOf(ws, ['sub']) }, { workspacePath: ws, taskId: 't-fix' }))
      .rejects.toThrow('cannot verify child status')
    expect(removes).toEqual([childPaths[0]])
    expect(existsSync(root)).toBe(true)
    expect(readFileSync(join(childPaths[0]!, 'keep.txt'), 'utf8')).toBe('new work after preflight')
  })

  it('never unlinks leftover files even if git reports an unregistered clean path', async () => {
    const { ws, root } = wsFixture([])
    writeFileSync(join(root, 'keep.txt'), 'leftover work')
    const git = stubGit({})
    git.removeWorktree = async () => 'unregistered'
    await expect(removeMirror({ git, scanner: scannerOf(ws, []) }, { workspacePath: ws, taskId: 't-fix' }))
      .rejects.toMatchObject({ code: 'worktree-status-unavailable' })
    expect(readFileSync(join(root, 'keep.txt'), 'utf8')).toBe('leftover work')
  })

  it.each(['removed', 'unregistered'] as const)('a child reported %s must contain no files before its parent can be removed', async outcome => {
    const { ws, root, childPaths } = wsFixture(['sub'])
    writeFileSync(join(childPaths[0]!, 'keep.txt'), 'leftover child work')
    const removes: string[] = []
    const git = stubGit({})
    git.removeWorktree = async (_repo, path) => { removes.push(path); return outcome }
    await expect(removeMirror({ git, scanner: scannerOf(ws, ['sub']) }, { workspacePath: ws, taskId: 't-fix' }))
      .rejects.toThrow('Cannot verify worktree status')
    expect(removes).toEqual([childPaths[0]])
    expect(existsSync(root)).toBe(true)
    expect(readFileSync(join(childPaths[0]!, 'keep.txt'), 'utf8')).toBe('leftover child work')
  })

  it('cleans an empty non-git orphan container without forcing git removal', async () => {
    const { ws, root } = wsFixture(['empty/nested'])
    const removes: string[] = []
    const git = stubGit({ removes })
    git.dirtyLines = async () => undefined
    await removeMirror({ git, scanner: scannerOf(ws, []) }, { workspacePath: ws, taskId: 't-fix' })
    expect(removes).toEqual([])
    expect(existsSync(root)).toBe(false)
  })

  it('ignores nested child worktrees in the ROOT status (untracked + gitlink shapes), removes children first', async () => {
    const { ws, root, childPaths } = wsFixture(['dsh-taskboard', 'dsh-devlaunch'])
    const removes: string[] = []
    const git = stubGit({
      // Real-git root worktree status: untracked child dirs (`?? x/`) AND —
      // once a child commits past a staged gitlink — gitlink drift (`M x`).
      dirty: {
        [root]: ['?? dsh-taskboard/', 'M dsh-devlaunch'],
        [childPaths[0]!]: [],
        [childPaths[1]!]: [],
      },
      removes,
    })
    await expect(removeMirror({ git, scanner: scannerOf(ws, ['dsh-taskboard', 'dsh-devlaunch']) }, { workspacePath: ws, taskId: 't-fix' }))
      .resolves.toBeUndefined()
    // Children BEFORE the root (the root is only removable once they are gone).
    expect(removes).toEqual([childPaths[0], childPaths[1], root])
  })

  it('a REAL dirty child refuses the WHOLE mirror before anything is deleted', async () => {
    const { ws, root, childPaths } = wsFixture(['dsh-taskboard'])
    const removes: string[] = []
    const git = stubGit({
      dirty: { [root]: ['?? dsh-taskboard/'], [childPaths[0]!]: ['M src/x.ts'] },
      removes,
    })
    await expect(removeMirror({ git, scanner: scannerOf(ws, ['dsh-taskboard']) }, { workspacePath: ws, taskId: 't-fix' }))
      .rejects.toThrow(/dsh-taskboard/)
    expect(removes).toEqual([])
  })

  it('REAL root dirt refuses too — but nested-mirror noise is filtered out of the report', async () => {
    const { ws, root } = wsFixture(['dsh-taskboard'])
    const git = stubGit({
      dirty: { [root]: ['?? README.md', '?? dsh-taskboard/'] },
    })
    let message = ''
    await removeMirror({ git, scanner: scannerOf(ws, ['dsh-taskboard']) }, { workspacePath: ws, taskId: 't-fix' })
      .catch((error: unknown) => { message = error instanceof Error ? error.message : String(error) })
    expect(message).toContain('README.md')
    // The noise line must not be part of the refusal report.
    expect(message).not.toContain('?? dsh-taskboard/')
  })
})

describe('prepareMirror guards (0.6.3)', () => {
  it('no repo at all: 非 git 仓库 wording', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'dsh-atb-iso-'))
    cleanup.push(ws)
    const git = stubGit({ rootIsRepo: false })
    const outcome = await prepareMirror({ git, scanner: scannerOf(ws, []) }, { workspacePath: ws, taskId: 't-nr', branch: 'task/x', reuse: false })
    expect(outcome).toEqual({ note: '当前项目不是 git 仓库，已在原目录执行' })
  })

  it('more repos than the cap degrades the whole run with a readable note', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'dsh-atb-iso-'))
    cleanup.push(ws)
    const many = Array.from({ length: 9 }, (_, i) => 'r' + i)
    const git = stubGit({ root: ws, rootIsRepo: true })
    const outcome = await prepareMirror({ git, scanner: scannerOf(ws, many) }, { workspacePath: ws, taskId: 't-cap', branch: 'task/x', reuse: false })
    expect(outcome).toEqual({ note: '工作区内 git 仓库数超过镜像上限（10 > 8），已在原目录执行' })
  })
})

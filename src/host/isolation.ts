/**
 * Worktree isolation orchestration (0.6.3): turns the single-repo worktree
 * flow into a whole-workspace MIRROR when a workspace holds parallel git
 * repositories — the workspace root repo plus its nested ones (plan §3/§4).
 *
 * Responsibilities (git.ts stays the narrow per-repo face):
 * - prepareMirror: discover the repos, prepare one worktree per repo under
 *   the task mirror directory (root repo at the mirror root, each nested
 *   repo at its relative path), with per-repo reuse (续跑) and a bounded
 *   partial-failure policy: the FIRST repo failing degrades the whole run
 *   to the original directory (legacy semantics), a later repo failing
 *   just drops it from the mirror (framing marks it 禁改 — the isolation
 *   boundary never blurs).
 * - removeMirror: children-first removal with an aggregated dirty
 *   pre-check (one dirty repo refuses the WHOLE mirror before anything is
 *   deleted). Children must go first: a nested worktree under the root
 *   worktree reads as untracked noise there, so the root worktree is only
 *   removable once they are gone.
 *
 * Preparation stays fail-soft at the execution boundary. Destructive removal
 * refuses unknown status and propagates errors to the user action.
 *
 * @module dsh-taskboard/host/isolation
 */
import { MAX_MIRROR_REPOS, isValidRelRepoPath } from '../shared/protocol.ts'
import { lstat, readdir, rmdir } from 'node:fs/promises'
import type { GitFace } from './git.ts'
import { statusLineUnder, worktreePathOf, worktreeStatusError } from './git.ts'
import type { RepoRef, RepoScanner } from './repos.ts'

/** One prepared repo worktree inside a task mirror. */
export interface PreparedMirrorRepo {
  /** Repo path relative to the workspace ('' = the workspace root repo). */
  repo: string
  /** The task branch checked out there. */
  branch: string
  /** Absolute worktree path (the working directory for this repo in the run). */
  worktreePath: string
  /** Baseline for evidence collection: main HEAD (fresh) or worktree HEAD (reuse). */
  baseCommit: string
  /** True when an existing live worktree was kept as-is (续跑). */
  reused?: boolean
}

/** The mirror of one run: prepared repos + repos deliberately left out. */
export interface PreparedMirror {
  /** Absolute path of the task mirror directory (the framing names it). */
  root: string
  /** Prepared worktrees in mirror order (root repo first when present). */
  repos: PreparedMirrorRepo[]
  /** Repos discovered but NOT mirrored (prepare failed); framing marks them 禁改. */
  skipped: Array<{ repo: string; reason: string }>
  /** True when EVERY prepared worktree was kept as-is (续跑 — framing picks the resume wording). */
  allReused: boolean
}

/** Outcome of a mirror preparation: either a mirror or a degrade note. */
export type MirrorPrepareOutcome =
  | { mirror: PreparedMirror }
  | { note: string }

/** Whether this mirror is exactly the legacy single-repo shape. */
export function isLegacySingle(mirror: PreparedMirror): boolean {
  return mirror.repos.length === 1
    && mirror.repos[0]!.repo === ''
    && mirror.skipped.length === 0
}

/** Whether a repo key may ride into a mirror path (defense in depth under worktreePathOf). */
function assertRepoKey(repo: string): void {
  if (!isValidRelRepoPath(repo)) {
    throw new Error('Error: invalid_input: illegal repo path ' + JSON.stringify(repo.slice(0, 80)))
  }
}

/** Best-effort filesystem existence probe (fail-soft → false). */
async function pathExists(path: string): Promise<boolean> {
  try {
    const { stat } = await import('node:fs/promises')
    return await stat(path).then(() => true, () => false)
  } catch {
    return false
  }
}

/** Join a repo relative path under a base path (forward slashes). */
function under(base: string, rel: string): string {
  return rel === '' ? base : base + '/' + rel
}

/** Unlike preparation's fail-soft probe, deletion may only ignore ENOENT. */
async function removalPathExists(path: string): Promise<boolean> {
  try {
    const info = await lstat(path)
    if (!info.isDirectory() || info.isSymbolicLink()) throw worktreeStatusError(path)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw worktreeStatusError(path, error)
  }
}

/** A non-git mirror root is removable only when it contains checked children
 * and empty container directories. Files, .git markers, and symlinks refuse. */
async function assertPlainContainer(path: string, children: readonly string[], rel = ''): Promise<void> {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === '.git') throw worktreeStatusError(path)
    const childRel = rel.length === 0 ? entry.name : rel + '/' + entry.name
    if (!children.includes(childRel)) await assertPlainContainer(under(path, entry.name), children, childRel)
  }
}

/** Git removes registered worktrees. Leftover containers may lose empty
 * directories only; never recursively unlink files after a status check. */
async function removeEmptyContainers(root: string): Promise<void> {
  const directories: string[] = []
  const inspect = async (path: string): Promise<void> => {
    if (!await removalPathExists(path)) return
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw worktreeStatusError(path)
      await inspect(under(path, entry.name))
    }
    directories.push(path)
  }
  try {
    await inspect(root)
    for (const path of directories) {
      // rmdir also refuses files created since inspection (ENOTEMPTY).
      try { await rmdir(path) }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    }
  } catch (error) { throw worktreeStatusError(root, error) }
}

/**
 * Prepare the task mirror across every repo of the workspace.
 *
 * Repo list: the workspace root repo (GitFace.detect decides, whatever its
 * .git shape) leads, nested parallel repos follow in path order. Each repo
 * gets its own worktree on the SAME task branch name; reuse keeps live
 * worktrees as-is per repo (续跑), falling back to a fresh preparation per
 * repo — and a stale blocking directory gets one forced-fresh retry.
 */
export async function prepareMirror(
  deps: { git: GitFace; scanner: RepoScanner },
  args: { workspacePath: string; taskId: string; branch: string; reuse: boolean },
): Promise<MirrorPrepareOutcome> {
  const { git, scanner } = deps

  // 1. Discover. The root repo is probed through the git face; nested repos
  //    come from the bounded scanner.
  const repos: RepoRef[] = []
  let inside = false
  try {
    inside = await git.detect(args.workspacePath)
  } catch { /* fail-soft → treated as "root is not a repo" */ }
  if (inside) repos.push({ relPath: '', absPath: args.workspacePath })
  let nested: RepoRef[] = []
  try {
    nested = await scanner.findNestedRepos(args.workspacePath)
  } catch { nested = [] }
  for (const repo of nested) {
    assertRepoKey(repo.relPath)
    repos.push(repo)
  }

  if (repos.length === 0) {
    // Distinguish 未装 git from 非 git 仓库 (0.3.1 wording preserved).
    let hasBinary = true
    try {
      hasBinary = await git.binaryAvailable()
    } catch { /* fail-soft → repo-side wording */ }
    return {
      note: hasBinary
        ? '当前项目不是 git 仓库，已在原目录执行'
        : 'git 不可用（未安装或不在 PATH），已在原目录执行',
    }
  }
  if (repos.length > MAX_MIRROR_REPOS) {
    return { note: '工作区内 git 仓库数超过镜像上限（' + repos.length + ' > ' + MAX_MIRROR_REPOS + '），已在原目录执行' }
  }

  // 2. Prepare per repo. FIRST repo failing → whole-run degrade (legacy
  //    semantics); a later failure drops just that repo from the mirror.
  const mirrorRoot = worktreePathOf(args.workspacePath, args.taskId)
  const prepared: PreparedMirrorRepo[] = []
  const skipped: PreparedMirror['skipped'] = []
  for (let i = 0; i < repos.length; i++) {
    const repo = repos[i]!
    const target = under(mirrorRoot, repo.relPath)
    let info
    try {
      info = await git.prepareWorktree(repo.absPath, target, args.branch, args.reuse ? 'reuse' : 'fresh')
    } catch { /* fail-soft */ }
    if (info === undefined && args.reuse) {
      // A stale non-matching directory can block reuse; force one fresh
      // attempt (fresh mode already drops + prunes the stale worktree).
      try {
        info = await git.prepareWorktree(repo.absPath, target, args.branch, 'fresh')
      } catch { /* fail-soft */ }
    }
    if (info === undefined) {
      if (i === 0) return { note: 'worktree 准备失败（git 报错或目录被占用），已在原目录执行' }
      skipped.push({ repo: repo.relPath, reason: 'worktree 准备失败' })
      continue
    }
    prepared.push({
      repo: repo.relPath,
      branch: info.branch,
      worktreePath: info.path,
      baseCommit: info.baseCommit,
      ...(info.reused === true ? { reused: true } : {}),
    })
  }
  return {
    mirror: {
      root: mirrorRoot,
      repos: prepared,
      skipped,
      allReused: prepared.length > 0 && prepared.every(p => p.reused === true),
    },
  }
}

/**
 * Remove a task whole mirror: aggregate the dirty pre-check across EVERY
 * repo worktree first (one dirty repo refuses everything, nothing is
 * deleted), then remove children before the root (see module doc).
 * Unknown status refuses deletion; a plain root container must contain only
 * verified children. After git removal, only empty directories are cleaned.
 * @throws with code dirty-mirror when any repo worktree holds uncommitted changes.
 */
export async function removeMirror(
  deps: { git: GitFace; scanner: RepoScanner },
  args: { workspacePath: string; taskId: string },
): Promise<void> {
  const { git, scanner } = deps
  const mirrorRoot = worktreePathOf(args.workspacePath, args.taskId)
  // Structural teardown must target a FRESH discovery: a stale TTL cache
  // could miss a repo added since the last scan and strand its mirror
  // worktree inside the root (which then reads as unremovable noise). The
  // cache exists for the prepare/merge hot path, not for teardown.
  scanner.clearCache()
  let nested: RepoRef[] = []
  try {
    nested = await scanner.findNestedRepos(args.workspacePath)
  } catch (error) { throw worktreeStatusError(mirrorRoot, error) }

  const targets: Array<{ repo: string; repoRoot: string; path: string }> = []
  for (const repo of nested) {
    assertRepoKey(repo.relPath)
    const path = under(mirrorRoot, repo.relPath)
    if (await removalPathExists(path)) targets.push({ repo: repo.relPath, repoRoot: repo.absPath, path })
  }
  // The mirror ROOT is always a target (the legacy flow called removeWorktree
  // unconditionally): when the workspace root is a repo this removes the root
  // worktree; when it is not (plain mirror dir, already-gone path) git side
  // status preflight proves it is a plain container or an already-gone path.
  targets.push({ repo: '', repoRoot: args.workspacePath, path: mirrorRoot })

  const childRels = targets.filter(t => t.repo !== '').map(t => t.repo)
  const dirty: Array<{ repo: string; lines: string[] }> = []
  const skipGit = new Set<string>()
  for (const target of targets) {
    const raw = await git.dirtyLines(target.path).catch(() => undefined)
    if (raw === undefined) {
      if (!await removalPathExists(target.path)) {
        skipGit.add(target.path)
        continue
      }
      if (target.repo !== '') throw worktreeStatusError(target.path)
      // Plain container roots have no git status of their own. Prove that
      // their only contents are the children checked by this same preflight.
      try { await assertPlainContainer(target.path, childRels) }
      catch (error) { throw worktreeStatusError(target.path, error) }
      skipGit.add(target.path)
      continue
    }
    // The root worktree's status lists its nested child worktrees as untracked
    // noise (`?? sub/`) — those trees belong to the children (checked in their
    // own pass below), not to the root repo's uncommitted changes. Without
    // this exemption a fully committed mirror still reads as dirty and every
    // cleanup route refuses forever (0.6.3 review fix).
    const lines = target.repo === '' && raw !== undefined
      ? raw.filter(l => !statusLineUnder(l, childRels))
      : raw
    if (lines !== undefined && lines.length > 0) dirty.push({ repo: target.repo, lines })
  }
  if (dirty.length > 0) {
    const detail = dirty
      .map(d => (d.repo === '' ? '根仓库' : d.repo) + '：\n' + d.lines.slice(0, 10).join('\n'))
      .join('\n')
    throw Object.assign(
      new Error('镜像中 ' + dirty.length + ' 个仓库有未提交修改，拒绝删除：\n' + detail),
      { code: 'dirty-mirror' },
    )
  }

  // Removal walks the array FORWARD: children were pushed before the root, so
  // this IS the children-first order. (The original reverse loop removed the
  // root FIRST — its own doc said children-first; the P1 dirty refusal above
  // masked the bug because the loop never actually ran on a real mirror.)
  for (const target of targets) {
    if (skipGit.has(target.path) && target.repo === '') continue
    try {
      // The root's structural noise (nested child worktrees / gitlink drift)
      // survived the aggregated pre-check above — exempt + force is safe by
      // construction: real dirt never got past it.
      if (!skipGit.has(target.path)) {
        await git.removeWorktree(target.repoRoot, target.path,
          target.repo === '' ? { exempt: childRels, force: true } : undefined)
      }
      // Unregistered/partly removed children must not survive under a parent
      // that is about to be force-removed with a structural-noise exemption.
      if (target.repo !== '') await removeEmptyContainers(target.path)
    } catch (error) {
      // Never force-remove the parent after a child failed its own fresh
      // status check or removal: the child's files are still inside it.
      throw new Error('删除镜像失败：' + (target.repo === '' ? '根仓库' : target.repo) + '：' + (error instanceof Error ? error.message : String(error)), { cause: error })
    }
  }
  await removeEmptyContainers(mirrorRoot)
}

/**
 * Absolute path of a repo main checkout inside the workspace (the fallback
 * cwd for diff views after a mirror is gone).
 */
export function repoMainPath(workspacePath: string, repo: string): string {
  assertRepoKey(repo)
  return under(workspacePath, repo)
}

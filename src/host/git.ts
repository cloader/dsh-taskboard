/**
 * Host git face (0.3.0): the ONLY place dsh-taskboard shells out to git.
 * 0.3.1: per-repo serialization of structural operations, binary probing,
 * no-op merge detection, worktree REUSE mode, and evidence size caps.
 *
 * Design invariants (plan §3.4/§3.5):
 * - NARROW interface: detect / binaryAvailable / prepareWorktree / collect /
 *   merge / isAncestor / removeWorktree / deleteBranch — nothing else leaks
 *   into the plugin.
 * - FAIL-SOFT: every call has a timeout and resolves to a benign result
 *   (false / undefined / empty facts) on ANY git failure — a missing git,
 *   a locked worktree, or a damaged repo degrades execution to the original
 *   directory and NEVER fails the ledger or the run pipeline. Only the
 *   explicit user actions (merge / remove / deleteBranch) throw, with a
 *   readable message the GUI surfaces as-is.
 * - SERIALIZED structural ops: concurrent isolated executions on the SAME
 *   repository would race on git's index/worktree locks, so every structural
 *   operation (prepareWorktree / merge / removeWorktree / deleteBranch) runs
 *   inside a per-root in-process mutex. Read-only collects stay concurrent.
 * - INJECTABLE runner: the exec layer is a single function so unit tests
 *   script every path without a real git.
 *
 * @module dsh-taskboard/host/git
 */
import { resolve } from 'node:path'
import { isValidTaskId, type CommitInfo } from '../shared/protocol.ts'

/** Timeout for quick read-only queries (rev-parse / status / log / diff). */
const QUICK_TIMEOUT_MS = 2_000

/** Timeout for structural operations (worktree add/remove, merge, branch). */
const HEAVY_TIMEOUT_MS = 15_000

/** Directory under a workspace where task worktrees live. */
export const WORKTREE_DIR = '.dsh-worktrees'

/**
 * The path segment of one `status --porcelain` line. Shape-aware: the RAW
 * line is `XY path` (path at index 3) while the plugin's trimmed evidence
 * lines collapse a leading-space status to `X path` (path at index 2) —
 * slicing a fixed 3 misparses exactly the gitlink/unstaged shapes a
 * multi-repo mirror produces (` M sub-repo`), 0.6.3 review fix.
 */
export function statusLinePath(line: string): string {
  if (line.length >= 3 && line[2] === ' ') return line.slice(3)
  if (line.length >= 2 && line[1] === ' ') return line.slice(2)
  return line
}

/**
 * Whether a `status --porcelain` line targets one of `rels` (a repo-relative
 * path) or anything under it. Porcelain prints untracked directories with a
 * trailing slash (`?? sub/`), so all three shapes match. Empty rels never
 * match (0.6.3 review fix).
 */
export function statusLineUnder(line: string, rels: readonly string[]): boolean {
  const p = statusLinePath(line)
  return rels.some(rel => rel.length > 0 && (p === rel || p === rel + '/' || p.startsWith(rel + '/')))
}

/** Evidence caps: commits kept per execution record (newest first). */
export const MAX_COMMIT_EVIDENCE = 50

/** Evidence caps: uncommitted-change lines kept per execution record. */
export const MAX_DIRTY_EVIDENCE = 100

/** Diff viewer caps (0.4.0): raw text kept per view. */
export const MAX_DIFF_BYTES = 128 * 1024

/** Diff viewer caps: lines kept per view. */
export const MAX_DIFF_LINES = 2_000

/** One capped, read-only diff view (diff viewer, 0.4.0). */
export interface DiffResult {
  text: string
  truncated: boolean
}

/** Cap one diff payload by bytes and lines (in order, marking truncation). */
function capDiff(out: string): DiffResult {
  let text = out
  let truncated = false
  if (text.length > MAX_DIFF_BYTES) {
    text = text.slice(0, MAX_DIFF_BYTES)
    truncated = true
  }
  const lines = text.split('\n')
  if (lines.length > MAX_DIFF_LINES) {
    text = lines.slice(0, MAX_DIFF_LINES).join('\n')
    truncated = true
  }
  return { text, truncated }
}

/** A plausible git object hash (defense against option injection). */
function isHash(hash: string): boolean {
  return /^[0-9a-f]{4,64}$/i.test(hash)
}

/** Result of one underlying exec: `ok` is exit-0, output never null. */
export interface ExecResult { ok: boolean; stdout: string; stderr: string }

/** The injectable exec layer: run `git <args>` under a cwd with a timeout. */
export type ExecFn = (args: string[], options: { cwd?: string; timeout?: number }) => Promise<ExecResult>

/** Unknown status must never authorize worktree or filesystem deletion. */
export function worktreeStatusError(path: string, cause?: unknown): Error & { code: string } {
  return Object.assign(new Error(`Cannot verify worktree status; refusing to delete: ${path}`, { cause }), {
    code: 'worktree-status-unavailable',
  })
}

/** Facts needed to open an isolated execution. */
export interface WorktreeInfo {
  /** Absolute worktree path (the session's cwd). */
  path: string
  /** The task branch checked out there. */
  branch: string
  /** Baseline for evidence collection: main HEAD (fresh) or worktree HEAD (reuse). */
  baseCommit: string
  /** True when an existing live worktree was kept as-is (续跑). */
  reused?: boolean
}

/** Settlement facts collected from a worktree (partial on best-effort basis). */
export interface SettlementFacts {
  headCommit?: string
  commits: CommitInfo[]
  /** Total commits before capping (equals commits.length when under the cap). */
  commitsTotal: number
  dirtyFiles: string[]
  /** Total uncommitted lines before capping. */
  dirtyFilesTotal: number
  diffStat?: string
  changedFiles: number
}

/** The narrow git face the rest of the plugin depends on. */
export interface GitFace {
  /** Whether `root` sits inside a usable git work tree (fail-soft → false). */
  detect(root: string): Promise<boolean>
  /** Whether a usable git binary answers at all (distinguishes 未装 git vs 非 git 仓库). */
  binaryAvailable(): Promise<boolean>
  /**
   * Ensure a worktree at `path` on `branch`. Default mode `'fresh'` resets to
   * the main worktree's current HEAD (每次全新); mode `'reuse'` keeps a live
   * worktree exactly as-is (续跑 — agent's commits and uncommitted changes
   * survive) and falls back to a fresh creation when none is alive. Resolves
   * undefined on any failure — callers degrade to the original directory.
   */
  prepareWorktree(root: string, path: string, branch: string, mode?: 'fresh' | 'reuse'): Promise<WorktreeInfo | undefined>
  /**
   * Collect settlement facts (never throws; missing pieces stay unset).
   * `excludeRelPaths` drops `status --porcelain` lines targeting those
   * repo-relative paths (or anything under them) — the mirror's NESTED repo
   * worktrees read as untracked noise in the root worktree's status and are
   * not this repo's uncommitted changes (0.6.3 review fix).
   */
  collect(worktreePath: string, baseCommit: string, excludeRelPaths?: readonly string[]): Promise<SettlementFacts>
  /**
   * Uncommitted-change lines of a working tree ([] = clean; undefined on git
   * failure or when cwd is not the worktree root). Undefined is UNKNOWN,
   * never clean: destructive callers must refuse it.
   */
  dirtyLines(cwd: string): Promise<string[] | undefined>
  /**
   * Merge `branch` into the main worktree (`--no-ff`); THROWS with a readable
   * reason. `exemptRelPaths` extends the main-clean exemption beyond
   * `.dsh-worktrees`: uncommitted-shape noise under those repo-relative paths
   * (parallel repos are self-governing — their content AND their gitlink
   * entries don't gate the root repo's merge, 0.6.3 review fix).
   */
  merge(root: string, branch: string, exemptRelPaths?: readonly string[]): Promise<void>
  /** Whether `branch` is already an ancestor of HEAD (a merge would be a no-op). */
  isAncestor(root: string, branch: string): Promise<boolean>
  /**
   * Remove a worktree. Resolves 'removed' on success, 'unregistered' when git
   * no longer knows the path (an orphaned directory). THROWS when it still
   * has uncommitted changes, or on any other git failure (readable reason).
   * `opts.exempt` drops mirror-structural noise from the dirty check and
   * `opts.force` lets `git worktree remove` accept it — for callers that have
   * ALREADY aggregated the real-dirty check themselves (the mirror removal:
   * noise-exempt clean → force is safe; real dirt never gets here).
   */
  removeWorktree(root: string, worktreePath: string, opts?: { exempt?: readonly string[]; force?: boolean }): Promise<'removed' | 'unregistered'>
  /** Delete a branch; THROWS (e.g. still checked out in a worktree). */
  deleteBranch(root: string, branch: string): Promise<void>
  /**
   * Show one commit (message + patch) — diff viewer (0.4.0). Fail-soft:
   * undefined on any git failure; the payload is capped.
   */
  showCommit(cwd: string, hash: string): Promise<DiffResult | undefined>
  /**
   * Show the diff of one path — diff viewer (0.4.0). Without `baseCommit`:
   * the working-tree view (staged + unstaged vs HEAD, e.g. uncommitted
   * changes in a live worktree); with `baseCommit`: the range
   * base..HEAD restricted to the path. Fail-soft: undefined on failure.
   */
  showPathDiff(cwd: string, path: string, baseCommit?: string): Promise<DiffResult | undefined>
}

/**
 * Build the task branch name `task/<标题>+<taskId>` (plan §9 拍板).
 *
 * Title sanitizing: whitespace runs collapse to `-`; git-illegal characters
 * (`~ ^ : ? * [ \ / @ { }` and friends) are stripped; `..` collapses; the
 * segment is trimmed of leading/trailing `.-` and truncated to ~20 code
 * points; an empty result falls back to the bare `task/<taskId>`.
 * @param title - the task title (already normalized 1..200 chars).
 * @param taskId - the task id (stable suffix).
 * @returns the branch name.
 */
export function sanitizeBranchName(title: string, taskId: string): string {
  const segment = title.trim()
    .replace(/\s+/g, '-')
    .replace(/[/\\~^:?*[\]@{}"'<>|#%&;$!`'=,;()]+/g, '')
    .replace(/\.\.+/g, '.')
    .replace(/^[-.\s]+|[-.\s]+$/g, '')
  const head = Array.from(segment).slice(0, 20).join('').replace(/^[-.]+|[-.]+$/g, '')
  return head.length === 0 ? `task/${taskId}` : `task/${head}+${taskId}`
}

/**
 * The canonical worktree path of a task inside its workspace (forward
 * slashes). R4②: the id is validated HERE so every present and future call
 * site is covered — a traversal-shaped id must never ride into a filesystem
 * path (the cleanup/purge flows `rm -rf` what this returns).
 */
export function worktreePathOf(workspacePath: string, taskId: string): string {
  if (!isValidTaskId(taskId)) {
    throw new Error(`Error: invalid_input: illegal task id ${JSON.stringify(taskId.slice(0, 40))}`)
  }
  const root = workspacePath.replace(/[\\/]+$/, '').replaceAll('\\', '/')
  return `${root}/${WORKTREE_DIR}/${taskId}`
}

/** Real exec layer over child_process.execFile (windowsHide, timeout, maxBuffer). */
const realExec: ExecFn = (args, options) => new Promise(resolve => {
  void (async () => {
    const { execFile } = await import('node:child_process')
    execFile('git', args, {
      cwd: options.cwd,
      timeout: options.timeout ?? QUICK_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
      encoding: 'utf8',
    }, (error, stdout, stderr) => {
      resolve({ ok: error === null, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  })().catch(() => resolve({ ok: false, stdout: '', stderr: 'exec unavailable' }))
})

/**
 * Build a {@link GitFace} over an injectable exec layer.
 * @param exec - the exec function (real `git` when omitted).
 */
export function createGitFace(exec: ExecFn = realExec): GitFace {
  const quick = (args: string[], cwd?: string): Promise<ExecResult> => exec(args, { cwd, timeout: QUICK_TIMEOUT_MS })
  const heavy = (args: string[], cwd?: string): Promise<ExecResult> => exec(args, { cwd, timeout: HEAVY_TIMEOUT_MS })

  const dirtyLines = async (cwd: string): Promise<string[] | undefined> => {
    try {
      const status = await quick(['status', '--porcelain'], cwd)
      if (!status.ok) return undefined
      // A leftover with no .git can inherit the MAIN repo's clean status.
      // Only the requested worktree's own status can authorize its removal.
      const top = await quick(['rev-parse', '--show-toplevel'], cwd)
      const normalize = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
      if (!top.ok || top.stdout.trim().length === 0 || normalize(top.stdout.trim()) !== normalize(cwd)) return undefined
      return status.stdout.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    } catch { return undefined }
  }

  // Per-root mutex (0.3.1): structural git ops on the SAME repository run one
  // at a time — concurrent isolated executions must not race on git's locks.
  const locks = new Map<string, Promise<unknown>>()
  const withRootLock = <T>(root: string, fn: () => Promise<T>): Promise<T> => {
    const prev = locks.get(root) ?? Promise.resolve()
    const next = prev.then(fn, fn)
    locks.set(root, next.catch(() => { /* the chain never blocks later ops */ }))
    return next
  }

  return {
    async detect(root) {
      const r = await quick(['rev-parse', '--is-inside-work-tree'], root)
      return r.ok && r.stdout.trim() === 'true'
    },

    async binaryAvailable() {
      const r = await quick(['--version'])
      return r.ok && r.stdout.startsWith('git version')
    },

    prepareWorktree: (root, path, branch, mode = 'fresh') => withRootLock(root, async () => {
      // 续跑: a live worktree at the path is kept EXACTLY as-is — the agent's
      // commits and uncommitted changes survive; the baseline becomes the
      // worktree's own HEAD so evidence covers only the new run.
      if (mode === 'reuse') {
        const wtHead = await quick(['rev-parse', 'HEAD'], path)
        // S14: a readable HEAD is not enough — the worktree must be on OUR
        // branch, otherwise a user-created repo at the path would be silently
        // taken over. Foreign or detached → fall through to fresh preparation.
        const wtBranch = wtHead.ok ? await quick(['rev-parse', '--abbrev-ref', 'HEAD'], path) : undefined
        if (wtHead.ok && wtHead.stdout.trim().length > 0
          && wtBranch !== undefined && wtBranch.ok && wtBranch.stdout.trim() === branch) {
          return { path, branch, baseCommit: wtHead.stdout.trim(), reused: true }
        }
        // No live worktree on our branch → fall through to a fresh preparation.
      }

      // Baseline: the main worktree's current HEAD (also validates the repo).
      const head = await quick(['rev-parse', 'HEAD'], root)
      if (!head.ok) return undefined
      const baseCommit = head.stdout.trim()

      const exists = await quick(['show-ref', '--verify', `refs/heads/${branch}`], root)
      if (exists.ok) {
        // Reuse the fixed branch name, but guarantee a FRESH baseline: drop
        // any stale worktree at the path, move the branch to the current
        // HEAD, then check the branch out again (每次全新，复用仅作选项保留).
        await heavy(['worktree', 'remove', '--force', path], root)
        await heavy(['worktree', 'prune'], root)
        const moved = await heavy(['branch', '-f', branch, 'HEAD'], root)
        if (!moved.ok) {
          // The branch is pinned by ANOTHER live worktree — e.g. a previous
          // cycle's in_review card still holding it — so it cannot be
          // force-moved (`fatal: cannot force update the branch ... used by
          // worktree at ...`). Degrade to a per-run branch instead of
          // failing the whole preparation and running in the user's main
          // checkout (#94); pinBranches records the fallback name and later
          // runs reuse it normally (only our own path holds it then).
          const fallback = `${branch}+r${crypto.randomUUID().slice(0, 8)}`
          const added = await heavy(['worktree', 'add', '-b', fallback, path], root)
          if (!added.ok) return undefined
          return { path, branch: fallback, baseCommit }
        }
        const added = await heavy(['worktree', 'add', path, branch], root)
        if (!added.ok) return undefined
      } else {
        const added = await heavy(['worktree', 'add', '-b', branch, path], root)
        if (!added.ok) return undefined
      }
      return { path, branch, baseCommit }
    }),

    async collect(worktreePath, baseCommit, excludeRelPaths) {
      const facts: SettlementFacts = { commits: [], commitsTotal: 0, dirtyFiles: [], dirtyFilesTotal: 0, changedFiles: 0 }
      const range = `${baseCommit}..HEAD`

      const head = await quick(['rev-parse', 'HEAD'], worktreePath)
      if (head.ok) facts.headCommit = head.stdout.trim()

      const log = await quick(['log', '--pretty=format:%h %s', range], worktreePath)
      if (log.ok) {
        const commits = log.stdout.split('\n')
          .map(line => line.trim())
          .filter(line => line.length > 0)
          .map(line => {
            const space = line.indexOf(' ')
            return space === -1
              ? { hash: line, subject: '' }
              : { hash: line.slice(0, space), subject: line.slice(space + 1) }
          })
        // Evidence caps (0.3.1): the ledger is rewritten whole on every
        // mutation — cap what a huge branch/status dump can add to it.
        facts.commitsTotal = commits.length
        facts.commits = commits.slice(0, MAX_COMMIT_EVIDENCE)
      }

      const status = await quick(['status', '--porcelain'], worktreePath)
      if (status.ok) {
        // excludeRelPaths drops the mirror's nested repo worktrees — they
        // read as untracked noise / gitlink drift here, not as this repo's
        // uncommitted changes. Excluded on the RAW line (path extraction is
        // shape-aware); the stored evidence keeps its trimmed 0.3.x shape.
        const dirty = status.stdout.split('\n')
          .filter(l => l.trim().length > 0)
          .filter(l => !statusLineUnder(l, excludeRelPaths ?? []))
          .map(l => l.trim())
        facts.dirtyFilesTotal = dirty.length
        facts.dirtyFiles = dirty.slice(0, MAX_DIRTY_EVIDENCE)
      }

      const shortstat = await quick(['diff', '--shortstat', range], worktreePath)
      if (shortstat.ok && shortstat.stdout.trim().length > 0) facts.diffStat = shortstat.stdout.trim()

      const names = await quick(['diff', '--name-only', range], worktreePath)
      if (names.ok) facts.changedFiles = names.stdout.split('\n').filter(l => l.trim().length > 0).length

      return facts
    },

    dirtyLines,

    merge: (root, branch, exemptRelPaths) => withRootLock(root, async () => {
      // Main-clean check. The plugin's own worktree directory
      // (<root>/.dsh-worktrees) shows up as untracked noise and is EXEMPT —
      // otherwise merging would be impossible without gitignoring it first.
      const status = await quick(['status', '--porcelain'], root)
      if (status.ok) {
        const dirtyLines = status.stdout.split('\n')
          .filter(l => l.trim().length > 0)
          .filter(l => !statusLineUnder(l, [WORKTREE_DIR, ...(exemptRelPaths ?? [])]))
          .map(l => l.trim())
        if (dirtyLines.length > 0) {
          // Machine-readable tag: callers classify without parsing zh-CN text.
          throw Object.assign(new Error(`主工作区有 ${dirtyLines.length} 处未提交修改，请先提交或暂存后再合并`), { code: 'dirty-tree' })
        }
      }
      const merged = await heavy(['merge', '--no-ff', '--no-edit', branch], root)
      if (!merged.ok) {
        // Roll the half-finished merge back so the main worktree stays usable;
        // report the ORIGINAL failure verbatim (不自动解决冲突).
        await heavy(['merge', '--abort'], root)
        throw new Error(`合并失败：${merged.stderr.trim().slice(0, 300)}`)
      }
    }),

    async isAncestor(root, branch) {
      // exit 0 = branch is an ancestor of (or equal to) HEAD → merge no-op.
      const r = await quick(['merge-base', '--is-ancestor', branch, 'HEAD'], root)
      return r.ok
    },

    removeWorktree: (root, worktreePath, opts) => withRootLock(root, async (): Promise<'removed' | 'unregistered'> => {
      const status = await dirtyLines(worktreePath)
      if (status === undefined) throw worktreeStatusError(worktreePath)
      if (status.length > 0) {
        // opts.exempt drops mirror-structural noise (nested child worktrees /
        // gitlink drift) — the caller's aggregated check already refused real
        // dirt before reaching here.
        const lines = status
          .filter(l => !statusLineUnder(l, opts?.exempt ?? []))
          .map(l => l.trim())
        if (lines.length > 0) {
          // Machine-readable tag: purge flows classify without parsing zh-CN text.
          throw Object.assign(new Error(`worktree 有 ${lines.length} 处未提交修改，拒绝删除：\n${lines.slice(0, 10).join('\n')}`), { code: 'dirty-worktree' })
        }
      }
      const removed = await heavy(opts?.force === true
        ? ['worktree', 'remove', '--force', worktreePath]
        : ['worktree', 'remove', worktreePath], root)
      if (removed.ok) return 'removed'
      // S3: classify the failure WITHOUT parsing git's (localizable) stderr —
      // a path absent from `worktree list` is an unregistered leftover, not
      // an error the caller should relay verbatim.
      const list = await quick(['worktree', 'list', '--porcelain'], root)
      if (!list.ok) throw worktreeStatusError(worktreePath)
      const registered = list.stdout.split('\n')
        .some(l => l.startsWith('worktree ')
          && resolve(l.slice('worktree '.length).trim()).toLowerCase() === resolve(worktreePath).toLowerCase())
      if (!registered) return 'unregistered'
      throw new Error(`删除 worktree 失败：${(removed.stderr.trim() || removed.stdout.trim()).slice(0, 300)}`)
    }),

    deleteBranch: (root, branch) => withRootLock(root, async () => {
      const deleted = await heavy(['branch', '-D', branch], root)
      if (!deleted.ok) throw new Error(`删除分支失败：${deleted.stderr.trim().slice(0, 300)}`)
    }),

    async showCommit(cwd, hash) {
      if (!isHash(hash)) return undefined
      const r = await quick(['show', '--no-color', '--format=medium', hash], cwd)
      if (!r.ok || r.stdout.trim().length === 0) return undefined
      return capDiff(r.stdout)
    },

    async showPathDiff(cwd, path, baseCommit) {
      const target = path.trim()
      if (target.length === 0) return undefined
      if (baseCommit !== undefined && isHash(baseCommit)) {
        const r = await quick(['diff', '--no-color', `${baseCommit}..HEAD`, '--', target], cwd)
        if (!r.ok) return undefined
        if (r.stdout.trim().length === 0) return { text: '（该文件无差异）', truncated: false }
        return capDiff(r.stdout)
      }
      // Working-tree view: staged + unstaged vs HEAD.
      const r = await quick(['diff', '--no-color', 'HEAD', '--', target], cwd)
      if (r.ok && r.stdout.trim().length > 0) return capDiff(r.stdout)
      // Untracked files never appear in `git diff` — detect one and synthesize
      // its new-file patch via --no-index (which exits 1 on differences, so
      // its stdout is trusted whenever it carries a diff header).
      const st = await quick(['status', '--porcelain', '--', target], cwd)
      if (r.ok && st.ok && st.stdout.trim().startsWith('??')) {
        const ni = await exec(['diff', '--no-color', '--no-index', '--', '/dev/null', target], { cwd, timeout: QUICK_TIMEOUT_MS })
        if (ni.stdout.includes('diff --git')) return capDiff(ni.stdout)
        return { text: `（未跟踪新文件：${target}）`, truncated: false }
      }
      if (!r.ok) return undefined
      return { text: '（该文件无差异）', truncated: false }
    },
  }
}

/**
 * The task detail pane — visually polished: urgency accent header with
 * status pill and meta chips, card-wrapped description/prompt, chat-style
 * comment bubbles distinguishing user vs agent authors, a timeline of
 * executions with outcome pills, grouped actions (run / transitions /
 * danger zone), and the user comment composer.
 *
 * @module dsh-taskboard/client/board/TaskDetail
 */
import { useEffect, useState, type ReactNode } from 'react'
import type { BoardController } from '../controller.ts'
import type { CommentRecord, ExecutionRecord, TaskRecord } from '../../shared/protocol.ts'
import { canTransition, checklistProgress } from '../../shared/protocol.ts'
import { useAlert } from './AlertModal.tsx'
import { fmtTime, isStaleClaim } from './format.ts'
import { MOVE_KEYS, OUTCOME_KEYS, STATUS_KEYS, URGENCY_KEYS } from './labels.ts'
import { useT, type Translate } from '../i18n/runtime.ts'

/** Statuses a user may move this task to, per the state machine. */
function moveTargets(task: TaskRecord): TaskRecord['status'][] {
  const all: TaskRecord['status'][] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled', 'archived']
  return all.filter(to => canTransition(task.status, to))
}

/** Compact session-id display (execution sessions carry the taskboard infix). */
function shortId(id: string | undefined): string {
  if (id === undefined) return ''
  return id.replace(/^session-(taskboard-)?/, '').slice(0, 8)
}

/**
 * Render a comment body, localizing host-generated system messages (0.6.4).
 * System comments carry a `systemKey` (+ flat params, or structured per-repo
 * rows for the multi-repo merge summary); user/agent comments render raw.
 */
export function commentBody(t: Translate, c: CommentRecord): string {
  if (c.systemKey === undefined) return c.body
  if (c.systemRows !== undefined) {
    const summary = c.systemRows
      .map(r => {
        const label = r.repo === '' ? t('iso.repo.root') : r.repo
        const mark = r.outcome === 'merged' ? '✓' : r.outcome === 'noop' ? '⟲' : '✗'
        return r.outcome === 'failed' && r.error !== undefined ? `${label} ${mark} ${r.error}` : `${label} ${mark}`
      })
      .join(' · ')
    return t(c.systemKey, { summary })
  }
  return t(c.systemKey, c.systemParams)
}

/** Execution duration between start and end. */
function duration(startedAt: number | undefined, endedAt: number | undefined): string {
  if (startedAt === undefined || endedAt === undefined) return ''
  const s = Math.max(0, Math.round((endedAt - startedAt) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`
}

/** Small labelled meta chip. */
function Chip({ icon, children, tone, title }: { icon?: string; children: ReactNode; tone?: string; title?: string }) {
  return <span className="dsh-atb-chip2" data-tone={tone} title={title}>{icon !== undefined && <span className="dsh-atb-chip2-icon">{icon}</span>}{children}</span>
}

/** Render markdown text with embedded clickable images and lightbox preview. */
function MarkdownContent({ text }: { text: string }) {
  const t = useT()
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const regex = /!\[(.*?)\]\(((?:data:image\/[^)]+)|(?:https?:\/\/[^)]+)|(?:[^)]+\.(?:png|jpg|jpeg|gif|webp|svg)))\)/gi
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let count = 0

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={`txt-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>)
    }
    const alt = match[1] || t('md.imageAlt', { n: ++count })
    const url = match[2] ?? ''
    parts.push(
      <div key={`img-${match.index}`} className="dsh-atb-detail-img-wrap">
        <img
          src={url}
          alt={alt}
          className="dsh-atb-detail-img"
          onClick={() => setLightboxUrl(url)}
          title={t('md.imageTitle', { alt })}
        />
        <span className="dsh-atb-detail-img-caption">{alt}</span>
      </div>,
    )
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) {
    parts.push(<span key={`txt-${lastIndex}`}>{text.slice(lastIndex)}</span>)
  }

  return (
    <>
      <div className="dsh-atb-markdown-body">{parts}</div>
      {lightboxUrl !== null && (
        <div className="dsh-atb-lightbox-backdrop" onClick={() => setLightboxUrl(null)}>
          <div className="dsh-atb-lightbox-content" onClick={e => e.stopPropagation()}>
            <img src={lightboxUrl} alt={t('md.lightboxAlt')} className="dsh-atb-lightbox-img" />
            <button
              type="button"
              className="dsh-atb-lightbox-close"
              title={t('md.closePreview')}
              onClick={() => setLightboxUrl(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/** The most recent execution carrying isolation facts, newest first. */
function latestIsolated(task: TaskRecord): ExecutionRecord | undefined {
  return [...task.executions].reverse().find(e => e.isolation !== undefined || e.worktreePath !== undefined || e.isolationNote !== undefined)
}

/** Short commit hash for display. */
function shortHash(hash: string | undefined): string {
  return hash === undefined ? '' : hash.slice(0, 8)
}

/** Extract the path from one `git status --porcelain` line (rename-aware). */
function porcelainPath(line: string): string {
  let p = line.slice(3)
  const arrow = p.indexOf(' -> ')
  if (arrow >= 0) p = p.slice(arrow + 4)
  if (p.startsWith('"') && p.endsWith('"') && p.length > 1) p = p.slice(1, -1)
  return p
}

/**
 * Lazy diff viewer (0.4.0): loads on mount, renders inside a capped <pre>.
 * `repo` picks one repo of a multi-repo mirror (0.6.3; absent = legacy root).
 * @param spec - what to show: one commit hash, or one changed path.
 */
function DiffView({ controller, task, execution, commit, path, repo }: {
  controller: BoardController
  task: TaskRecord
  execution: ExecutionRecord
  commit?: string
  path?: string
  repo?: string
}) {
  const t = useT()
  const [state, setState] = useState<{ loading: boolean; diff?: string; truncated?: boolean; failed?: boolean }>({ loading: true })
  useEffect(() => {
    let alive = true
    setState({ loading: true })
    void controller.fetchDiff(task.id, { execution: execution.id, ...(commit !== undefined ? { commit } : { path: path ?? '' }), ...(repo !== undefined ? { repo } : {}) }).then(result => {
      if (!alive) return
      if (result === undefined) setState({ loading: false, failed: true })
      else setState({ loading: false, diff: result.diff, truncated: result.truncated })
    })
    return () => { alive = false }
  }, [controller, task.id, execution.id, commit, path, repo])
  return (
    <div className="dsh-atb-diffview">
      <div className="dsh-atb-diffview-head">
        <span className="dsh-atb-diffview-title">{commit !== undefined ? t('diff.commit', { hash: shortHash(commit) }) : t('diff.file', { path: path ?? '' })}</span>
        {state.loading && <span className="dsh-atb-diffview-hint">{t('shared.loading')}</span>}
        {state.truncated === true && <span className="dsh-atb-diffview-hint">{t('diff.truncated')}</span>}
      </div>
      {state.failed === true
        ? <div className="dsh-atb-diffview-error">{t('diff.failed')}</div>
        : <pre className="dsh-atb-diffview-pre">{state.diff ?? ''}</pre>}
    </div>
  )
}

/**
 * The DoD checklist block (0.4.0): user-togglable items, checker + evidence
 * per row; unchecked items highlight while the task sits in in_review.
 */
function ChecklistBlock({ task, controller }: { task: TaskRecord; controller: BoardController }) {
  const t = useT()
  const items = task.checklist ?? []
  if (items.length === 0) return null
  const { done, total } = checklistProgress(task)
  const unchecked = total - done
  const reviewing = task.status === 'in_review'
  return (
    <div className="dsh-atb-fieldcard" data-kind="checklist">
      <div className="dsh-atb-fieldcard-label">
        {t('checklist.title')}
        <span className="dsh-atb-cl-progress" data-tone={reviewing && unchecked > 0 ? 'bad' : undefined}>
          ☑ {done}/{total}{reviewing && unchecked > 0 ? t('checklist.unchecked', { n: unchecked }) : done === total ? t('checklist.allDone') : ''}
        </span>
      </div>
      <div className="dsh-atb-cl-items">
        {items.map(item => (
          <label
            key={item.id}
            className="dsh-atb-cl-item"
            data-checked={item.checked ? 'true' : undefined}
            data-alert={reviewing && !item.checked ? 'true' : undefined}
          >
            <input
              type="checkbox"
              checked={item.checked}
              onChange={() => void controller.toggleChecklistItem(task, item.id)}
            />
            <span className="dsh-atb-cl-text">{item.text}</span>
            <span className="dsh-atb-cl-meta">
              {item.checked
                ? `${item.checkedBy === 'user' ? t('checklist.byUser') : `🤖 ${shortId(item.checkedBy)}`} · ${fmtTime(item.checkedAt)}`
                : t('checklist.uncheckedItem')}
              {item.note !== undefined && item.note.length > 0 && <span className="dsh-atb-cl-note" title={item.note}>{t('checklist.evidence', { note: item.note })}</span>}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

/**
 * The structured execution report block (0.4.0): the newest execution that
 * carries one, rendered section by section for the reviewer.
 */
function ReportBlock({ task }: { task: TaskRecord }) {
  const t = useT()
  const execution = [...task.executions].reverse().find(e => e.report !== undefined)
  const report = execution?.report
  if (execution === undefined || report === undefined) return null
  const section = (label: string, rows: string[] | undefined): ReactNode => rows !== undefined && rows.length > 0
    ? (
        <div className="dsh-atb-rpt-sec">
          <div className="dsh-atb-rpt-label">{label}</div>
          <ul className="dsh-atb-rpt-list">{rows.map((row, i) => <li key={i}>{row}</li>)}</ul>
        </div>
      )
    : null
  return (
    <div className="dsh-atb-fieldcard" data-kind="report">
      <div className="dsh-atb-fieldcard-label">{t('report.title')}<span className="dsh-atb-cl-progress">{t('report.submitted', { time: fmtTime(execution.endedAt ?? execution.startedAt) })}</span></div>
      <div className="dsh-atb-rpt-summary">{report.summary}</div>
      {section(t('report.changedFiles'), report.changedFiles)}
      {section(t('report.checks'), report.checks)}
      {section(t('report.artifacts'), report.artifacts)}
      {report.risk.length > 0 && (
        <div className="dsh-atb-rpt-sec">
          <div className="dsh-atb-rpt-label">{t('report.risk')}</div>
          <div className="dsh-atb-rpt-risk">{report.risk}</div>
        </div>
      )}
    </div>
  )
}

/**
 * The 0.3.0 isolation block: branch / baseline→head commits / change stats /
 * uncommitted-changes warning, plus the user-only git actions (merge /
 * remove worktree — plan §3.3).
 */
function IsolationBlock({ task, controller }: { task: TaskRecord; controller: BoardController }) {
  const t = useT()
  const { alert: showAlert, el: alertEl } = useAlert()
  const [confirmMerge, setConfirmMerge] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<'wt' | 'wtb' | null>(null)
  const [busy, setBusy] = useState(false)
  // Diff viewer (0.4.0): which commit / changed path is expanded (0.6.3: + repo).
  const [openDiff, setOpenDiff] = useState<{ commit?: string; path?: string; repo?: string } | null>(null)
  const [dirtyOpen, setDirtyOpen] = useState(false)
  const execution = latestIsolated(task)
  const running = task.executions.some(e => e.outcome === 'running')
  if (execution === undefined) return null

  const doMerge = (): void => {
    setBusy(true)
    void controller.mergeBranch(task.id).then(result => {
      setBusy(false)
      setConfirmMerge(false)
      if (!result.ok) showAlert(t('iso.merge.failed', { error: result.error }))
      else if (result.results !== undefined) {
        // Multi-repo mirror (0.6.3): one compact per-repo outcome line.
        const labelOf = (repo: string): string => repo === '' ? t('iso.repo.root') : repo
        const summary = result.results
          .map(r => `${labelOf(r.repo)} ${r.outcome === 'merged' ? '✓' : r.outcome === 'noop' ? '⟲' : '✗'}`)
          .join(' · ')
        const failed = result.results.some(r => r.outcome === 'failed')
        const failedError = result.results.find(r => r.outcome === 'failed')?.error
        showAlert(failed
          ? t('iso.merge.partial', { summary, error: failedError ?? '' })
          : t('iso.merge.done', { summary }))
      }
      else if (result.noop === true) showAlert(t('iso.merge.noop'))
    })
  }

  const doRemove = (deleteBranch: boolean): void => {
    setBusy(true)
    void controller.removeWorktree(task.id, deleteBranch).then(result => {
      setBusy(false)
      setConfirmRemove(null)
      if (!result.ok) showAlert(t('iso.remove.failed', { error: result.error }))
      else if (result.branchError !== undefined) showAlert(t('iso.remove.branchFailed', { error: result.branchError }))
    })
  }

  // Degraded / off isolation: one quiet line explaining why.
  if (execution.isolation !== 'worktree' || execution.worktreePath === undefined) {
    return (
      <div className="dsh-atb-fieldcard" data-kind="isolation">
        <div className="dsh-atb-fieldcard-label">{t('iso.title')}</div>
        <div className="dsh-atb-iso-none">{t('iso.none')}{execution.isolationNote !== undefined ? ` · ${execution.isolationNote}` : ''}</div>
        {alertEl}
      </div>
    )
  }

  // 0.6.3: multi-repo mirrors render ONE section per repo (execution.repos);
  // legacy single-repo records keep the exact old shape (a synthetic view).
  const multi = execution.repos !== undefined && execution.repos.length > 0
  const views: Array<{
    repo?: string
    label: string
    branch?: string
    worktreePath?: string
    baseCommit?: string
    headCommit?: string
    commits: NonNullable<ExecutionRecord['commits']>
    commitTotal: number
    dirty: string[]
    dirtyTotal: number
    diffStat?: string
    changedFiles?: number
  }> = multi
    ? (execution.repos ?? []).map(r => ({
        repo: r.repo,
        label: r.repo === '' ? t('iso.repo.root') : r.repo,
        branch: r.branch,
        worktreePath: r.worktreePath,
        baseCommit: r.baseCommit,
        headCommit: r.headCommit,
        commits: r.commits ?? [],
        commitTotal: r.commitsTotal ?? (r.commits ?? []).length,
        dirty: r.dirtyFiles ?? [],
        dirtyTotal: r.dirtyFilesTotal ?? (r.dirtyFiles ?? []).length,
        ...(r.diffStat !== undefined ? { diffStat: r.diffStat } : {}),
        ...(r.changedFiles !== undefined ? { changedFiles: r.changedFiles } : {}),
      }))
    : [{
        label: t('iso.repo.root'),
        branch: execution.branch ?? task.branch,
        worktreePath: execution.worktreePath,
        baseCommit: execution.baseCommit,
        headCommit: execution.headCommit,
        commits: execution.commits ?? [],
        commitTotal: execution.commitsTotal ?? (execution.commits ?? []).length,
        dirty: execution.dirtyFiles ?? [],
        dirtyTotal: execution.dirtyFilesTotal ?? (execution.dirtyFiles ?? []).length,
        ...(execution.diffStat !== undefined ? { diffStat: execution.diffStat } : {}),
        ...(execution.changedFiles !== undefined ? { changedFiles: execution.changedFiles } : {}),
      }]

  const renderRepo = (view: (typeof views)[number]): ReactNode => (
    <section key={view.repo ?? 'root'} className="dsh-atb-iso-repo" data-multi={multi ? 'true' : undefined}>
      {multi && (
        <div className="dsh-atb-iso-repohead" title={view.worktreePath}>
          <code>{view.label}</code>
          <span className="dsh-atb-iso-fact">{t('iso.branch')} <b>{view.branch}</b></span>
        </div>
      )}
      <div className="dsh-atb-iso-facts">
        {!multi && (
          <span className="dsh-atb-iso-fact" title={view.worktreePath}>{t('iso.branch')} <b>{view.branch}</b></span>
        )}
        <span className="dsh-atb-iso-fact">{t('iso.baseline', { base: shortHash(view.baseCommit), head: shortHash(view.headCommit) })}</span>
        {view.changedFiles !== undefined && view.changedFiles > 0 && (
          <span className="dsh-atb-iso-fact">{t('iso.changed', { n: view.changedFiles })}</span>
        )}
        {view.diffStat !== undefined && <span className="dsh-atb-iso-fact" title={view.diffStat}>{view.diffStat}</span>}
      </div>

      {view.commits.length > 0
        ? (
            <div className="dsh-atb-iso-commits">
              {view.commits.slice(0, 10).map(c => (
                <div key={c.hash} className="dsh-atb-iso-commit" data-open={openDiff?.commit === c.hash && openDiff?.repo === view.repo ? 'true' : undefined}>
                  <button
                    type="button"
                    className="dsh-atb-iso-commit-btn"
                    title={t('iso.commit.openTitle')}
                    onClick={() => setOpenDiff(openDiff?.commit === c.hash && openDiff?.repo === view.repo ? null : { commit: c.hash, ...(view.repo !== undefined ? { repo: view.repo } : {}) })}
                  >
                    <code>{shortHash(c.hash)}</code>
                    <span>{c.subject}</span>
                  </button>
                  {openDiff?.commit === c.hash && openDiff?.repo === view.repo && (
                    <DiffView controller={controller} task={task} execution={execution} commit={c.hash} repo={view.repo} />
                  )}
                </div>
              ))}
              {view.commitTotal > 10 && <div className="dsh-atb-iso-more">{t('iso.commits.more', { n: view.commitTotal })}</div>}
            </div>
          )
        : <div className="dsh-atb-iso-nocommit">{t('iso.nocommit')}</div>}

      {view.dirtyTotal > 0 && (
        <div className="dsh-atb-iso-dirty">
          <button type="button" className="dsh-atb-iso-dirty-toggle" onClick={() => setDirtyOpen(!dirtyOpen)}>
            {t('iso.dirty.toggle', { n: view.dirtyTotal })}{dirtyOpen ? t('iso.dirty.collapse') : t('iso.dirty.expand')}
          </button>
          {dirtyOpen && (
            <div className="dsh-atb-iso-dirty-files">
              {view.dirty.slice(0, 30).map((line, index) => {
                const filePath = porcelainPath(line)
                return (
                  <button
                    key={`${line}-${index}`}
                    type="button"
                    className="dsh-atb-iso-dirty-file"
                    title={t('iso.dirty.openTitle')}
                    onClick={() => setOpenDiff(openDiff?.path === filePath && openDiff?.repo === view.repo ? null : { path: filePath, ...(view.repo !== undefined ? { repo: view.repo } : {}) })}
                  >
                    <code>{line.slice(0, 2)}</code> {filePath}
                  </button>
                )
              })}
              {view.dirtyTotal > 30 && <div className="dsh-atb-iso-more">{t('iso.dirty.more', { n: view.dirtyTotal })}</div>}
            </div>
          )}
          {openDiff?.path !== undefined && openDiff?.repo === view.repo && dirtyOpen && (
            <DiffView controller={controller} task={task} execution={execution} path={openDiff.path} repo={view.repo} />
          )}
        </div>
      )}
    </section>
  )

  return (
    <div className="dsh-atb-fieldcard" data-kind="isolation">
      <div className="dsh-atb-fieldcard-label">{t('iso.worktreeTitle')}</div>
      {views.map(renderRepo)}

      <div className="dsh-atb-iso-actions">
        {running
          ? <span className="dsh-atb-iso-hint">{t('iso.hint.running')}</span>
          : confirmMerge
            ? (
                <span className="dsh-atb-confirm">
                  <span className="dsh-atb-confirm-label">{t('iso.merge.confirm')}</span>
                  <button type="button" className="dsh-atb-btn" data-primary="true" disabled={busy} onClick={doMerge}>{t('iso.merge.go')}</button>
                  <button type="button" className="dsh-atb-btn" onClick={() => setConfirmMerge(false)}>{t('shared.cancel')}</button>
                </span>
              )
            : (
                <button
                  type="button"
                  className="dsh-atb-btn"
                  disabled={busy}
                  title={t('iso.merge.title')}
                  onClick={() => setConfirmMerge(true)}
                >
                  {t('iso.merge.button')}
                </button>
              )}
        {!running && (confirmRemove === null
          ? (
              <>
                <button
                  type="button"
                  className="dsh-atb-btn"
                  data-danger="true"
                  disabled={busy}
                  title={t('iso.remove.wtTitle')}
                  onClick={() => setConfirmRemove('wt')}
                >
                  {t('iso.remove.wt')}
                </button>
                {task.branch !== undefined && (
                  <button
                    type="button"
                    className="dsh-atb-btn"
                    data-danger="true"
                    disabled={busy}
                    title={t('iso.remove.wtbTitle')}
                    onClick={() => setConfirmRemove('wtb')}
                  >
                    {t('iso.remove.wtb')}
                  </button>
                )}
              </>
            )
          : (
              <span className="dsh-atb-confirm">
                <span className="dsh-atb-confirm-label">{confirmRemove === 'wtb' ? t('iso.remove.confirmWtb') : t('iso.remove.confirmWt')}</span>
                <button type="button" className="dsh-atb-btn" data-danger="true" disabled={busy} onClick={() => doRemove(confirmRemove === 'wtb')}>{t('shared.confirmDelete')}</button>
                <button type="button" className="dsh-atb-btn" onClick={() => setConfirmRemove(null)}>{t('shared.cancel')}</button>
              </span>
            ))}
        {!running && confirmRemove === null && !confirmMerge && <span className="dsh-atb-iso-hint">{t('iso.hint.keep')}</span>}
      </div>
      {alertEl}
    </div>
  )
}

/**
 * The detail view.
 * @param task - the task record.
 * @param controller - the controller.
 * @param now - current epoch ms (stale-claim highlight).
 */
export function TaskDetail({ task, controller, now }: { task: TaskRecord; controller: BoardController; now?: number }) {
  const t = useT()
  const [comment, setComment] = useState('')
  const [confirmDone, setConfirmDone] = useState(false)
  const [confirmPurge, setConfirmPurge] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  // Top action buttons (duplicate / save-as-template / run / reuse-run)
  // share one in-flight guard: a double click used to fire duplicate runs or
  // copies while the first round-trip was still pending (review P0).
  const [actionBusy, setActionBusy] = useState(false)
  const { alert: showAlert, el: alertEl } = useAlert()
  const ws = controller.getSnapshot().workspaces.find(w => w.id === task.workspaceId)
  const canRun = task.status !== 'in_progress' && task.status !== 'done' && task.status !== 'archived'
  const runningExecution = task.executions.find(e => e.outcome === 'running')
  const holder = task.status === 'in_progress' ? task.claimedBy : undefined
  const stale = now !== undefined && isStaleClaim(task, now)
  const unchecked = (task.checklist ?? []).filter(i => !i.checked).length
  const sessionExecution = [...task.executions].reverse().find(e => e.sessionId !== undefined)
  const targetSessionId = runningExecution?.sessionId ?? sessionExecution?.sessionId ?? (task.claimedBy?.startsWith('session-') ? task.claimedBy : undefined)

  /** Fire one top action under the shared busy guard; re-enable on settle. */
  const runAction = (action: () => Promise<unknown>): void => {
    if (actionBusy) return
    setActionBusy(true)
    void action().catch(() => undefined).finally(() => setActionBusy(false))
  }

  /** Jump to an execution's session; prompt precisely when it cannot open. */
  const jumpToSession = (sessionId: string): void => {
    void controller.openSession(sessionId).then(result => {
      if (result === 'missing') showAlert(t('card.session.missing', { id: shortId(sessionId) }))
      else if (result === 'archived') showAlert(t('card.session.archived', { id: shortId(sessionId) }))
      else if (result === 'unavailable') showAlert(t('card.session.unavailable', { id: sessionId }))
    })
  }

  return (
    <div className="dsh-atb-detail" data-urgency={task.urgency}>
      <div className="dsh-atb-detail-head">
        <div className="dsh-atb-detail-titlewrap">
          <div className="dsh-atb-detail-titlebar">
            <h3>{task.title}</h3>
            <span className="dsh-atb-statuspill" data-status={task.status}>{t(STATUS_KEYS[task.status] ?? task.status)}</span>
          </div>
          <div className="dsh-atb-detail-chips">
            <Chip tone={task.urgency}>● {t(URGENCY_KEYS[task.urgency] ?? task.urgency)}</Chip>
            <Chip icon="📁">{ws?.title ?? shortId(task.workspaceId)}</Chip>
            {task.model !== undefined && (
              <Chip
                icon="✦"
                title={t('card.badge.modelTitle', { model: task.model.provider + '/' + task.model.model }) + (task.model.reasoningEffort !== undefined ? t('card.badge.modelEffort', { effort: task.model.reasoningEffort }) : '')}
              >
                {task.model.model}{task.model.reasoningEffort !== undefined ? ` · ${task.model.reasoningEffort}` : ''}
              </Chip>
            )}
            {task.presetId !== undefined && <Chip icon="🎛" >{task.presetId}</Chip>}
            {task.execution.mode === 'scheduled' && (
              <Chip icon="⏰">{t('detail.chip.nextRun', { cron: task.execution.cron ?? '', time: fmtTime(task.execution.nextRunAt) })}</Chip>
            )}
            {task.blocked && <Chip icon="⛔" tone="urgent">{t('shared.blocked')}</Chip>}
            {task.checklist !== undefined && task.checklist.length > 0 && (
              <Chip icon="☑" tone={task.status === 'in_review' && task.checklist.some(i => !i.checked) ? 'urgent' : undefined}>
                {t('detail.chip.checklist', { done: checklistProgress(task).done, total: task.checklist.length })}
              </Chip>
            )}
            {task.branch !== undefined && (
              <Chip icon="🌿" tone={undefined}>Worktree · {task.branch.length > 28 ? `${task.branch.slice(0, 28)}…` : task.branch}</Chip>
            )}
            {(task.isolation === undefined || task.isolation === 'worktree') && task.branch === undefined && <Chip icon="🌿">{t('detail.chip.isolated')}</Chip>}
            {task.permission === 'read-only' && <Chip icon="🔒" tone="urgent">{t('detail.chip.permReadOnly')}</Chip>}
            {task.permission === 'danger-full-access' && <Chip icon="⚡" tone="urgent">{t('detail.chip.permFull')}</Chip>}
            {(task.permission === 'workspace-write' || task.permission === undefined) && <Chip icon="📁">{t('detail.chip.permWrite')}</Chip>}
            {holder !== undefined && (
              <button
                type="button"
                className="dsh-atb-chip2 dsh-atb-chip-btn"
                data-tone={stale ? 'urgent' : undefined}
                title={t('detail.chip.holderTitle', { id: holder })}
                onClick={() => jumpToSession(holder)}
              >
                <span className="dsh-atb-chip2-icon">{stale ? '⏱' : '🤖'}</span>
                {stale ? t('detail.chip.holderStale') : t('detail.chip.holderBy')}{shortId(holder)}{t('detail.chip.holderSuffix')}
              </button>
            )}
            {task.trashedAt !== undefined && <Chip icon="🗑" tone="urgent">{t('detail.chip.trashed')}</Chip>}
            <Chip>v{task.version}</Chip>
          </div>
          <div className="dsh-atb-detail-sub">
            {t('detail.sub.line', { time: fmtTime(task.updatedAt), who: task.updatedBy.kind === 'agent' ? `🤖 ${shortId(task.updatedBy.sessionId)}` : task.updatedBy.kind === 'system' ? t('detail.updatedBy.system') : t('detail.updatedBy.user') })}
          </div>
        </div>
        <div className="dsh-atb-detail-topbtns">
          {targetSessionId !== undefined && (
            <button
              type="button"
              className="dsh-atb-detail-session"
              title={t('detail.session.jumpTitle', { id: targetSessionId })}
              onClick={() => jumpToSession(targetSessionId)}
            >
              {t('detail.session.jump')}
            </button>
          )}
          <button type="button" className="dsh-atb-detail-edit" onClick={() => controller.openEditor(task.id)}>{t('detail.action.edit')}</button>
          <button
            type="button"
            className="dsh-atb-detail-edit"
            title={t('detail.action.duplicateTitle')}
            disabled={actionBusy}
            onClick={() => runAction(() => controller.duplicate(task))}
          >
            {t('detail.action.duplicate')}
          </button>
          <button
            type="button"
            className="dsh-atb-detail-edit"
            title={t('detail.action.saveTplTitle')}
            disabled={actionBusy}
            onClick={() => runAction(async () => {
              const ok = await controller.saveAsTemplate(task)
              if (ok) showAlert(t('detail.action.saveTplDone'))
            })}
          >
            {t('detail.action.saveTpl')}
          </button>
          {canRun && task.branch !== undefined && (
            <button
              type="button"
              className="dsh-atb-detail-run"
              title={t('detail.action.reuseTitle')}
              disabled={actionBusy}
              onClick={() => runAction(() => controller.run(task.id, true))}
            >
              {t('detail.action.reuse')}
            </button>
          )}
          {canRun && (
            <button
              type="button"
              className="dsh-atb-detail-run"
              title={task.model !== undefined ? t('detail.action.runTitleModel', { model: task.model.model }) : t('detail.action.runTitleDefault')}
              disabled={actionBusy}
              onClick={() => runAction(() => controller.run(task.id))}
            >
              {t('detail.action.run')}
            </button>
          )}
          {runningExecution !== undefined && (confirmCancel
            ? (
              <span className="dsh-atb-confirm">
                <span className="dsh-atb-confirm-label">{t('detail.action.stopConfirm')}</span>
                <button type="button" className="dsh-atb-btn" data-danger="true" onClick={() => { void controller.cancel(task.id); setConfirmCancel(false) }}>{t('detail.action.stop')}</button>
                <button type="button" className="dsh-atb-btn" onClick={() => setConfirmCancel(false)}>{t('shared.cancel')}</button>
              </span>
            )
            : (
              <button
                type="button"
                className="dsh-atb-detail-run"
                data-danger="true"
                title={t('detail.action.stopTitle', { id: runningExecution.sessionId ?? '' })}
                onClick={() => setConfirmCancel(true)}
              >
                {t('detail.action.stopExec')}
              </button>
            ))}
          <button type="button" className="dsh-atb-detail-close" aria-label={t('shared.close')} onClick={() => controller.select(undefined)}>✕</button>
        </div>
      </div>

      {task.description.length > 0 && (
        <div className="dsh-atb-fieldcard">
          <div className="dsh-atb-fieldcard-label">{t('detail.field.description')}</div>
          <div className="dsh-atb-desc"><MarkdownContent text={task.description} /></div>
        </div>
      )}

      {task.prompt.length > 0 && (
        <div className="dsh-atb-fieldcard" data-kind="prompt">
          <div className="dsh-atb-fieldcard-label">{t('detail.field.prompt')}</div>
          <div className="dsh-atb-promptbox"><MarkdownContent text={task.prompt} /></div>
        </div>
      )}

      <IsolationBlock task={task} controller={controller} />

      <ReportBlock task={task} />

      <ChecklistBlock task={task} controller={controller} />

      <div className="dsh-atb-detail-actions">
        <div className="dsh-atb-movebtns">
          {moveTargets(task).map(to => to === 'done'
            ? (confirmDone
                ? (
                    <span key={to} className="dsh-atb-confirm">
                      <span className="dsh-atb-confirm-label" data-tone={unchecked > 0 ? 'bad' : undefined}>
                        {unchecked > 0 ? t('detail.move.confirmDoneUnchecked', { n: unchecked }) : t('detail.move.confirmDone')}
                      </span>
                      <button type="button" className="dsh-atb-btn" data-primary="true" onClick={() => { void controller.move(task.id, task.version, 'done'); setConfirmDone(false) }}>{t('detail.move.confirm')}</button>
                      <button type="button" className="dsh-atb-btn" onClick={() => setConfirmDone(false)}>{t('shared.cancel')}</button>
                    </span>
                  )
                : <button key={to} type="button" className="dsh-atb-movebtn" data-to={to} onClick={() => setConfirmDone(true)}>{t('detail.move.to', { status: t(MOVE_KEYS[to]) })}</button>)
            : (
                <button key={to} type="button" className="dsh-atb-movebtn" data-to={to} onClick={() => void controller.move(task.id, task.version, to)}>
                  {t('detail.move.to', { status: t(MOVE_KEYS[to]) })}
                </button>
              ))}
          <button type="button" className="dsh-atb-movebtn" data-to="blocked" onClick={() => void controller.toggleBlocked(task)}>
            {task.blocked ? t('detail.blocked.unmark') : t('detail.blocked.mark')}
          </button>
          {holder !== undefined && (
            <button
              type="button"
              className="dsh-atb-movebtn"
              data-to="release"
              title={t('detail.release.title', { id: holder })}
              onClick={() => void controller.move(task.id, task.version, 'todo')}
            >
              {t('detail.release.button')}
            </button>
          )}
        </div>
      </div>

      <div className="dsh-atb-section">
        <h4>{t('detail.comments.title')}{task.comments.length > 0 && <span className="dsh-atb-count2">{task.comments.length}</span>}</h4>
        {task.comments.length === 0
          ? <div className="dsh-atb-empty2">{t('detail.comments.empty')}</div>
          : (
              <div className="dsh-atb-commentlist">
                {task.comments.map(c => (
                  <div key={c.id} className="dsh-atb-bubble" data-from={c.threadId !== undefined ? 'agent' : 'user'}>
                    <div className="dsh-atb-bubble-avatar">{c.threadId !== undefined ? '🤖' : '👤'}</div>
                    <div className="dsh-atb-bubble-main">
                      <div className="dsh-atb-bubble-meta">
                        <b>{c.threadId !== undefined ? `agent ${shortId(c.threadId)}` : t('detail.comments.user')}</b>
                        <span>{fmtTime(c.createdAt)}</span>
                      </div>
                      <div className="dsh-atb-bubble-body">{commentBody(t, c)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        <div className="dsh-atb-composer">
          <textarea
            className="dsh-atb-composer-input"
            value={comment}
            placeholder={t('detail.composer.placeholder')}
            onChange={e => setComment(e.target.value)}
            onKeyDown={e => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && comment.trim().length > 0) {
                // T13: keep the draft when the post fails (reject 表单同样保留).
                void controller.comment(task.id, comment).then(ok => { if (ok) setComment('') })
              }
            }}
          />
          <button
            type="button"
            className="dsh-atb-composer-send"
            disabled={comment.trim().length === 0}
            onClick={() => {
              void controller.comment(task.id, comment).then(ok => { if (ok) setComment('') })
            }}
          >
            {t('detail.composer.send')}
          </button>
        </div>
      </div>

      {task.executions.length > 0 && (
        <div className="dsh-atb-section">
          <h4>{t('detail.exec.title')}<span className="dsh-atb-count2">{task.executions.length}</span>
            {task.executionsPruned !== undefined && task.executionsPruned > 0 && (
              <span className="dsh-atb-count2" title={t('detail.exec.prunedTitle', { n: task.executionsPruned })}>{t('detail.exec.pruned', { n: task.executionsPruned })}</span>
            )}
          </h4>
          <div className="dsh-atb-execlist">
            {[...task.executions].reverse().map(e => (
              <div key={e.id} className="dsh-atb-exec-row">
                <span className="dsh-atb-exec-dot" data-outcome={e.outcome} />
                <span className="dsh-atb-exec-trigger">{e.trigger === 'manual' ? t('detail.exec.trigger.manual') : t('detail.exec.trigger.scheduled')}</span>
                <span className="dsh-atb-exec-outcome" data-outcome={e.outcome}>{t(OUTCOME_KEYS[e.outcome] ?? e.outcome)}</span>
                <span className="dsh-atb-exec-time">{fmtTime(e.startedAt)}{e.endedAt !== undefined && ` · ${duration(e.startedAt, e.endedAt)}`}</span>
                {e.sessionId !== undefined && (
                  <button
                    type="button"
                    className="dsh-atb-exec-session"
                    title={t('detail.exec.openTitle', { id: e.sessionId })}
                    onClick={() => jumpToSession(e.sessionId!)}
                  >
                    🤖 {shortId(e.sessionId)} ↗
                  </button>
                )}
                {e.error !== undefined && <span className="dsh-atb-exec-error" title={e.error}>{e.error.slice(0, 80)}{e.error.length > 80 ? '…' : ''}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dsh-atb-dangerzone">
        {task.trashedAt === undefined
          ? <button type="button" className="dsh-atb-btn" data-danger="true" onClick={() => void controller.remove(task.id, task.version, false)}>{t('detail.danger.delete')}</button>
          : (confirmPurge
              ? (
                  <span className="dsh-atb-confirm">
                    <span className="dsh-atb-confirm-label">{t('detail.danger.purgeConfirm')}</span>
                    <button type="button" className="dsh-atb-btn" data-danger="true" onClick={() => { void controller.remove(task.id, task.version, true); setConfirmPurge(false) }}>{t('detail.danger.purgeGo')}</button>
                    <button type="button" className="dsh-atb-btn" onClick={() => setConfirmPurge(false)}>{t('shared.cancel')}</button>
                  </span>
                )
              : <button type="button" className="dsh-atb-btn" data-danger="true" onClick={() => setConfirmPurge(true)}>{t('detail.danger.purge')}</button>)}
      </div>

      {alertEl}
    </div>
  )
}

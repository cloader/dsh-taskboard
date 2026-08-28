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
import type { ExecutionRecord, TaskRecord } from '../../shared/protocol.ts'
import { canTransition, checklistProgress } from '../../shared/protocol.ts'
import { useAlert } from './AlertModal.tsx'
import { fmtTime, isStaleClaim } from './format.ts'
import { MOVE_LABEL, OUTCOME_LABEL, STATUS_LABEL, URGENCY_LABEL } from './labels.ts'

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

/** Execution duration between start and end. */
function duration(startedAt: number | undefined, endedAt: number | undefined): string {
  if (startedAt === undefined || endedAt === undefined) return ''
  const s = Math.max(0, Math.round((endedAt - startedAt) / 1000))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`
}

/** Small labelled meta chip. */
function Chip({ icon, children, tone }: { icon?: string; children: ReactNode; tone?: string }) {
  return <span className="dsh-atb-chip2" data-tone={tone}>{icon !== undefined && <span className="dsh-atb-chip2-icon">{icon}</span>}{children}</span>
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
 * @param spec - what to show: one commit hash, or one changed path.
 */
function DiffView({ controller, task, execution, commit, path }: {
  controller: BoardController
  task: TaskRecord
  execution: ExecutionRecord
  commit?: string
  path?: string
}) {
  const [state, setState] = useState<{ loading: boolean; diff?: string; truncated?: boolean; failed?: boolean }>({ loading: true })
  useEffect(() => {
    let alive = true
    setState({ loading: true })
    void controller.fetchDiff(task.id, { execution: execution.id, ...(commit !== undefined ? { commit } : { path: path ?? '' }) }).then(result => {
      if (!alive) return
      if (result === undefined) setState({ loading: false, failed: true })
      else setState({ loading: false, diff: result.diff, truncated: result.truncated })
    })
    return () => { alive = false }
  }, [controller, task.id, execution.id, commit, path])
  return (
    <div className="dsh-atb-diffview">
      <div className="dsh-atb-diffview-head">
        <span className="dsh-atb-diffview-title">{commit !== undefined ? `提交 ${shortHash(commit)}` : `文件 ${path}`}</span>
        {state.loading && <span className="dsh-atb-diffview-hint">读取中…</span>}
        {state.truncated === true && <span className="dsh-atb-diffview-hint">⚠ 内容过长已截断</span>}
      </div>
      {state.failed === true
        ? <div className="dsh-atb-diffview-error">获取失败（原因见看板顶部错误条；对象可能已随 worktree 删除丢失）</div>
        : <pre className="dsh-atb-diffview-pre">{state.diff ?? ''}</pre>}
    </div>
  )
}

/**
 * The DoD checklist block (0.4.0): user-togglable items, checker + evidence
 * per row; unchecked items highlight while the task sits in in_review.
 */
function ChecklistBlock({ task, controller }: { task: TaskRecord; controller: BoardController }) {
  const items = task.checklist ?? []
  if (items.length === 0) return null
  const { done, total } = checklistProgress(task)
  const unchecked = total - done
  const reviewing = task.status === 'in_review'
  return (
    <div className="dsh-atb-fieldcard" data-kind="checklist">
      <div className="dsh-atb-fieldcard-label">
        验收清单（DoD）
        <span className="dsh-atb-cl-progress" data-tone={reviewing && unchecked > 0 ? 'bad' : undefined}>
          ☑ {done}/{total}{reviewing && unchecked > 0 ? ` · ${unchecked} 项未完成` : done === total ? ' · 全部完成' : ''}
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
                ? `${item.checkedBy === 'user' ? '👤 用户' : `🤖 ${shortId(item.checkedBy)}`} · ${fmtTime(item.checkedAt)}`
                : '未完成'}
              {item.note !== undefined && item.note.length > 0 && <span className="dsh-atb-cl-note" title={item.note}>证据：{item.note}</span>}
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
      <div className="dsh-atb-fieldcard-label">执行报告<span className="dsh-atb-cl-progress">由执行会话提交 · {fmtTime(execution.endedAt ?? execution.startedAt)}</span></div>
      <div className="dsh-atb-rpt-summary">{report.summary}</div>
      {section('改动文件', report.changedFiles)}
      {section('自验情况', report.checks)}
      {section('产物', report.artifacts)}
      {report.risk.length > 0 && (
        <div className="dsh-atb-rpt-sec">
          <div className="dsh-atb-rpt-label">剩余风险</div>
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
  const { alert: showAlert, el: alertEl } = useAlert()
  const [confirmMerge, setConfirmMerge] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<'wt' | 'wtb' | null>(null)
  const [busy, setBusy] = useState(false)
  // Diff viewer (0.4.0): which commit / changed path is expanded.
  const [openDiff, setOpenDiff] = useState<{ commit?: string; path?: string } | null>(null)
  const [dirtyOpen, setDirtyOpen] = useState(false)
  const execution = latestIsolated(task)
  const running = task.executions.some(e => e.outcome === 'running')
  if (execution === undefined) return null

  const doMerge = (): void => {
    setBusy(true)
    void controller.mergeBranch(task.id).then(result => {
      setBusy(false)
      setConfirmMerge(false)
      if (!result.ok) showAlert(`合并失败：${result.error}`)
      else if (result.noop === true) showAlert('该分支没有领先主工作区的新提交，无需合并（可退回续跑或直接清理）')
    })
  }

  const doRemove = (deleteBranch: boolean): void => {
    setBusy(true)
    void controller.removeWorktree(task.id, deleteBranch).then(result => {
      setBusy(false)
      setConfirmRemove(null)
      if (!result.ok) showAlert(`删除失败：${result.error}`)
      else if (result.branchError !== undefined) showAlert(`worktree 已删除，但分支删除失败：${result.branchError}`)
    })
  }

  // Degraded / off isolation: one quiet line explaining why.
  if (execution.isolation !== 'worktree' || execution.worktreePath === undefined) {
    return (
      <div className="dsh-atb-fieldcard" data-kind="isolation">
        <div className="dsh-atb-fieldcard-label">执行隔离</div>
        <div className="dsh-atb-iso-none">📁 原目录执行{execution.isolationNote !== undefined ? ` · ${execution.isolationNote}` : ''}</div>
        {alertEl}
      </div>
    )
  }

  const commits = execution.commits ?? []
  const commitTotal = execution.commitsTotal ?? commits.length
  const dirty = execution.dirtyFiles ?? []
  const dirtyTotal = execution.dirtyFilesTotal ?? dirty.length

  return (
    <div className="dsh-atb-fieldcard" data-kind="isolation">
      <div className="dsh-atb-fieldcard-label">执行隔离 · Worktree</div>
      <div className="dsh-atb-iso-facts">
        <span className="dsh-atb-iso-fact" title={execution.worktreePath}>🌿 分支 <b>{execution.branch ?? task.branch}</b></span>
        <span className="dsh-atb-iso-fact">基线 {shortHash(execution.baseCommit)} → {shortHash(execution.headCommit)}</span>
        {execution.changedFiles !== undefined && execution.changedFiles > 0 && (
          <span className="dsh-atb-iso-fact">改动 {execution.changedFiles} 个文件</span>
        )}
        {execution.diffStat !== undefined && <span className="dsh-atb-iso-fact" title={execution.diffStat}>{execution.diffStat}</span>}
      </div>

      {commits.length > 0
        ? (
            <div className="dsh-atb-iso-commits">
              {commits.slice(0, 10).map(c => (
                <div key={c.hash} className="dsh-atb-iso-commit" data-open={openDiff?.commit === c.hash ? 'true' : undefined}>
                  <button
                    type="button"
                    className="dsh-atb-iso-commit-btn"
                    title="点击展开该提交的 diff"
                    onClick={() => setOpenDiff(openDiff?.commit === c.hash ? null : { commit: c.hash })}
                  >
                    <code>{shortHash(c.hash)}</code>
                    <span>{c.subject}</span>
                  </button>
                  {openDiff?.commit === c.hash && (
                    <DiffView controller={controller} task={task} execution={execution} commit={c.hash} />
                  )}
                </div>
              ))}
              {commitTotal > 10 && <div className="dsh-atb-iso-more">… 共 {commitTotal} 个提交</div>}
            </div>
          )
        : <div className="dsh-atb-iso-nocommit">该次执行没有产生提交（改动可能未提交，见下方警告）</div>}

      {dirtyTotal > 0 && (
        <div className="dsh-atb-iso-dirty">
          <button type="button" className="dsh-atb-iso-dirty-toggle" onClick={() => setDirtyOpen(!dirtyOpen)}>
            ⚠ 有 {dirtyTotal} 处未提交修改（合并前请让 agent 提交，或手动处理）{dirtyOpen ? ' ▲' : ' ▼ 查看文件'}
          </button>
          {dirtyOpen && (
            <div className="dsh-atb-iso-dirty-files">
              {dirty.slice(0, 30).map((line, index) => {
                const filePath = porcelainPath(line)
                return (
                  <button
                    key={`${line}-${index}`}
                    type="button"
                    className="dsh-atb-iso-dirty-file"
                    title="点击查看该文件的未提交 diff"
                    onClick={() => setOpenDiff(openDiff?.path === filePath ? null : { path: filePath })}
                  >
                    <code>{line.slice(0, 2)}</code> {filePath}
                  </button>
                )
              })}
              {dirtyTotal > 30 && <div className="dsh-atb-iso-more">… 共 {dirtyTotal} 处（完整列表见任务台账）</div>}
            </div>
          )}
          {openDiff?.path !== undefined && dirtyOpen && (
            <DiffView controller={controller} task={task} execution={execution} path={openDiff.path} />
          )}
        </div>
      )}

      <div className="dsh-atb-iso-actions">
        {running
          ? <span className="dsh-atb-iso-hint">执行中 — 结束后可合并或清理</span>
          : confirmMerge
            ? (
                <span className="dsh-atb-confirm">
                  <span className="dsh-atb-confirm-label">将分支以 --no-ff 合并到主工作区？</span>
                  <button type="button" className="dsh-atb-btn" data-primary="true" disabled={busy} onClick={doMerge}>确认合并</button>
                  <button type="button" className="dsh-atb-btn" onClick={() => setConfirmMerge(false)}>取消</button>
                </span>
              )
            : (
                <button
                  type="button"
                  className="dsh-atb-btn"
                  disabled={busy}
                  title="在主工作区 git merge --no-ff 该任务分支（要求主区干净；冲突会原样报告）"
                  onClick={() => setConfirmMerge(true)}
                >
                  ⇥ 合并到主工作区
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
                  title="git worktree remove（有未提交修改时拒绝）"
                  onClick={() => setConfirmRemove('wt')}
                >
                  🗑 删除 worktree
                </button>
                {task.branch !== undefined && (
                  <button
                    type="button"
                    className="dsh-atb-btn"
                    data-danger="true"
                    disabled={busy}
                    title="删除 worktree 并删除任务分支（有未提交修改时拒绝）"
                    onClick={() => setConfirmRemove('wtb')}
                  >
                    🗑 删 worktree + 分支
                  </button>
                )}
              </>
            )
          : (
              <span className="dsh-atb-confirm">
                <span className="dsh-atb-confirm-label">{confirmRemove === 'wtb' ? '删除 worktree 并删除分支？' : '删除 worktree 目录？'}</span>
                <button type="button" className="dsh-atb-btn" data-danger="true" disabled={busy} onClick={() => doRemove(confirmRemove === 'wtb')}>确认删除</button>
                <button type="button" className="dsh-atb-btn" onClick={() => setConfirmRemove(null)}>取消</button>
              </span>
            ))}
        {!running && confirmRemove === null && !confirmMerge && <span className="dsh-atb-iso-hint">分支与 worktree 保留中 — 可退回继续修改</span>}
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
      if (result === 'missing') showAlert(`该会话已被删除（${shortId(sessionId)}），无法打开`)
      else if (result === 'archived') showAlert(`该会话已归档（${shortId(sessionId)}），已从会话列表隐藏`)
      else if (result === 'unavailable') showAlert(`会话导航不可用，会话 ID：${sessionId}`)
    })
  }

  return (
    <div className="dsh-atb-detail" data-urgency={task.urgency}>
      <div className="dsh-atb-detail-head">
        <div className="dsh-atb-detail-titlewrap">
          <div className="dsh-atb-detail-titlebar">
            <h3>{task.title}</h3>
            <span className="dsh-atb-statuspill" data-status={task.status}>{STATUS_LABEL[task.status] ?? task.status}</span>
          </div>
          <div className="dsh-atb-detail-chips">
            <Chip tone={task.urgency}>● {URGENCY_LABEL[task.urgency] ?? task.urgency}</Chip>
            <Chip icon="📁">{ws?.title ?? shortId(task.workspaceId)}</Chip>
            {task.model !== undefined && <Chip icon="✦">{task.model.model}</Chip>}
            {task.presetId !== undefined && <Chip icon="🎛" >{task.presetId}</Chip>}
            {task.execution.mode === 'scheduled' && (
              <Chip icon="⏰">{task.execution.cron} · 下次 {fmtTime(task.execution.nextRunAt)}</Chip>
            )}
            {task.blocked && <Chip icon="⛔" tone="urgent">受阻</Chip>}
            {task.checklist !== undefined && task.checklist.length > 0 && (
              <Chip icon="☑" tone={task.status === 'in_review' && task.checklist.some(i => !i.checked) ? 'urgent' : undefined}>
                清单 {checklistProgress(task).done}/{task.checklist.length}
              </Chip>
            )}
            {task.branch !== undefined && (
              <Chip icon="🌿" tone={undefined}>Worktree · {task.branch.length > 28 ? `${task.branch.slice(0, 28)}…` : task.branch}</Chip>
            )}
            {(task.isolation === undefined || task.isolation === 'worktree') && task.branch === undefined && <Chip icon="🌿">Worktree 隔离</Chip>}
            {holder !== undefined && (
              <button
                type="button"
                className="dsh-atb-chip2 dsh-atb-chip-btn"
                data-tone={stale ? 'urgent' : undefined}
                title={`点击跳转至该会话：${holder}`}
                onClick={() => jumpToSession(holder)}
              >
                <span className="dsh-atb-chip2-icon">{stale ? '⏱' : '🤖'}</span>
                {stale ? '认领超时 · ' : '由 '}{shortId(holder)} 持有 ↗
              </button>
            )}
            {task.trashedAt !== undefined && <Chip icon="🗑" tone="urgent">已删除待清除</Chip>}
            <Chip>v{task.version}</Chip>
          </div>
          <div className="dsh-atb-detail-sub">
            更新 {fmtTime(task.updatedAt)} · 最近操作 {task.updatedBy.kind === 'agent' ? `🤖 ${shortId(task.updatedBy.sessionId)}` : task.updatedBy.kind === 'system' ? '⚙️ 系统' : '👤 用户'}
          </div>
        </div>
        <div className="dsh-atb-detail-topbtns">
          {targetSessionId !== undefined && (
            <button
              type="button"
              className="dsh-atb-detail-session"
              title={`一键跳转到对应会话：${targetSessionId}`}
              onClick={() => jumpToSession(targetSessionId)}
            >
              🤖 跳转会话 ↗
            </button>
          )}
          <button type="button" className="dsh-atb-detail-edit" onClick={() => controller.openEditor(task.id)}>✎ 编辑</button>
          <button
            type="button"
            className="dsh-atb-detail-edit"
            title="复制此任务的全部配置为一张新卡（待办列）"
            disabled={actionBusy}
            onClick={() => runAction(() => controller.duplicate(task))}
          >
            ⧉ 复制
          </button>
          <button
            type="button"
            className="dsh-atb-detail-edit"
            title="把此任务的配置（含清单）保存为模板，新建任务时可用"
            disabled={actionBusy}
            onClick={() => runAction(async () => {
              const ok = await controller.saveAsTemplate(task)
              if (ok) showAlert('已存为模板（新建任务 ▼ 下拉可用，可在模板管理中改名）')
            })}
          >
            ⌗ 存为模板
          </button>
          {canRun && task.branch !== undefined && (
            <button
              type="button"
              className="dsh-atb-detail-run"
              title="续跑：保留现有 worktree 与分支（上次的改动和提交都在原处），在其上继续执行；默认「立即执行」会重置为全新基线"
              disabled={actionBusy}
              onClick={() => runAction(() => controller.run(task.id, true))}
            >
              ↻ 续跑
            </button>
          )}
          {canRun && (
            <button
              type="button"
              className="dsh-atb-detail-run"
              title={task.model !== undefined ? `新会话执行（${task.model.model}）` : '新会话执行（默认模型）'}
              disabled={actionBusy}
              onClick={() => runAction(() => controller.run(task.id))}
            >
              ▶ 立即执行
            </button>
          )}
          {runningExecution !== undefined && (confirmCancel
            ? (
              <span className="dsh-atb-confirm">
                <span className="dsh-atb-confirm-label">停止该执行会话？</span>
                <button type="button" className="dsh-atb-btn" data-danger="true" onClick={() => { void controller.cancel(task.id); setConfirmCancel(false) }}>停止</button>
                <button type="button" className="dsh-atb-btn" onClick={() => setConfirmCancel(false)}>取消</button>
              </span>
            )
            : (
              <button
                type="button"
                className="dsh-atb-detail-run"
                data-danger="true"
                title={`停止执行会话 ${runningExecution.sessionId ?? ''}（任务回到待办）`}
                onClick={() => setConfirmCancel(true)}
              >
                ■ 停止执行
              </button>
            ))}
          <button type="button" className="dsh-atb-detail-close" aria-label="关闭" onClick={() => controller.select(undefined)}>✕</button>
        </div>
      </div>

      {task.description.length > 0 && (
        <div className="dsh-atb-fieldcard">
          <div className="dsh-atb-fieldcard-label">描述</div>
          <div className="dsh-atb-desc">{task.description}</div>
        </div>
      )}

      {task.prompt.length > 0 && (
        <div className="dsh-atb-fieldcard" data-kind="prompt">
          <div className="dsh-atb-fieldcard-label">执行 Prompt</div>
          <div className="dsh-atb-promptbox">{task.prompt}</div>
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
                        {unchecked > 0 ? `仍有 ${unchecked} 项清单未勾选，确认完成？` : '确认完成？'}
                      </span>
                      <button type="button" className="dsh-atb-btn" data-primary="true" onClick={() => { void controller.move(task.id, task.version, 'done'); setConfirmDone(false) }}>确认</button>
                      <button type="button" className="dsh-atb-btn" onClick={() => setConfirmDone(false)}>取消</button>
                    </span>
                  )
                : <button key={to} type="button" className="dsh-atb-movebtn" data-to={to} onClick={() => setConfirmDone(true)}>移至→{MOVE_LABEL[to]}</button>)
            : (
                <button key={to} type="button" className="dsh-atb-movebtn" data-to={to} onClick={() => void controller.move(task.id, task.version, to)}>
                  移至→{MOVE_LABEL[to]}
                </button>
              ))}
          <button type="button" className="dsh-atb-movebtn" data-to="blocked" onClick={() => void controller.toggleBlocked(task)}>
            {task.blocked ? '✓ 解除受阻' : '⛔ 标记受阻'}
          </button>
          {holder !== undefined && (
            <button
              type="button"
              className="dsh-atb-movebtn"
              data-to="release"
              title={`释放 ${holder} 的认领：任务回到待办（持有会话可能仍在工作，确认它已停止后再释放）`}
              onClick={() => void controller.move(task.id, task.version, 'todo')}
            >
              🔓 释放认领
            </button>
          )}
        </div>
      </div>

      <div className="dsh-atb-section">
        <h4>评论{task.comments.length > 0 && <span className="dsh-atb-count2">{task.comments.length}</span>}</h4>
        {task.comments.length === 0
          ? <div className="dsh-atb-empty2">暂无评论 — agent 交接时会在这里汇报改动与验证结果</div>
          : (
              <div className="dsh-atb-commentlist">
                {task.comments.map(c => (
                  <div key={c.id} className="dsh-atb-bubble" data-from={c.threadId !== undefined ? 'agent' : 'user'}>
                    <div className="dsh-atb-bubble-avatar">{c.threadId !== undefined ? '🤖' : '👤'}</div>
                    <div className="dsh-atb-bubble-main">
                      <div className="dsh-atb-bubble-meta">
                        <b>{c.threadId !== undefined ? `agent ${shortId(c.threadId)}` : '用户'}</b>
                        <span>{fmtTime(c.createdAt)}</span>
                      </div>
                      <div className="dsh-atb-bubble-body">{c.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
        <div className="dsh-atb-composer">
          <textarea
            className="dsh-atb-composer-input"
            value={comment}
            placeholder="以用户身份留言（agent 开工前会读）…"
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
            发表
          </button>
        </div>
      </div>

      {task.executions.length > 0 && (
        <div className="dsh-atb-section">
          <h4>执行记录<span className="dsh-atb-count2">{task.executions.length}</span>
            {task.executionsPruned !== undefined && task.executionsPruned > 0 && (
              <span className="dsh-atb-count2" title={`更早的 ${task.executionsPruned} 条执行记录已按保留上限清理`}>+{task.executionsPruned} 已清理</span>
            )}
          </h4>
          <div className="dsh-atb-execlist">
            {[...task.executions].reverse().map(e => (
              <div key={e.id} className="dsh-atb-exec-row">
                <span className="dsh-atb-exec-dot" data-outcome={e.outcome} />
                <span className="dsh-atb-exec-trigger">{e.trigger === 'manual' ? '手动' : '定时'}</span>
                <span className="dsh-atb-exec-outcome" data-outcome={e.outcome}>{OUTCOME_LABEL[e.outcome] ?? e.outcome}</span>
                <span className="dsh-atb-exec-time">{fmtTime(e.startedAt)}{e.endedAt !== undefined && ` · ${duration(e.startedAt, e.endedAt)}`}</span>
                {e.sessionId !== undefined && (
                  <button
                    type="button"
                    className="dsh-atb-exec-session"
                    title={`点击打开该执行会话：${e.sessionId}`}
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
          ? <button type="button" className="dsh-atb-btn" data-danger="true" onClick={() => void controller.remove(task.id, task.version, false)}>🗑 删除（标记待清除）</button>
          : (confirmPurge
              ? (
                  <span className="dsh-atb-confirm">
                    <span className="dsh-atb-confirm-label">物理清除不可恢复</span>
                    <button type="button" className="dsh-atb-btn" data-danger="true" onClick={() => { void controller.remove(task.id, task.version, true); setConfirmPurge(false) }}>确认清除</button>
                    <button type="button" className="dsh-atb-btn" onClick={() => setConfirmPurge(false)}>取消</button>
                  </span>
                )
              : <button type="button" className="dsh-atb-btn" data-danger="true" onClick={() => setConfirmPurge(true)}>🔥 物理清除（需确认）</button>)}
      </div>

      {alertEl}
    </div>
  )
}

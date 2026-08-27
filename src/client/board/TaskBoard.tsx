/**
 * The main board view: toolbar (project filter, urgency chips, secondary tab,
 * composer), five status columns, the detail pane, and the new-task modal.
 *
 * @module dsh-taskboard/client/board/TaskBoard
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { BoardController, ControllerState } from '../controller.ts'
import type { TaskRecord, TaskStatus, Urgency } from '../../shared/protocol.ts'
import { MAIN_STATUSES, canTransition } from '../../shared/protocol.ts'
import { PLUGIN_VERSION } from '../../shared/version.ts'
import { COLUMN_LABELS, URGENCY_LABEL } from './labels.ts'
import { fmtTime, isStaleClaim } from './format.ts'
import { DRAG_TYPE, TaskCard } from './TaskCard.tsx'
import { TaskDetail } from './TaskDetail.tsx'
import { TaskFormModal } from './TaskFormModal.tsx'
import { SettingsModal } from './SettingsModal.tsx'
import { ImportModal } from './ImportModal.tsx'
import { TemplateManager } from './TemplateManager.tsx'
import { useAlert } from './AlertModal.tsx'

/** Urgency sort rank (urgent first). */
const URGENCY_RANK: Record<Urgency, number> = { urgent: 0, normal: 1, relaxed: 2 }

/** Apply the active filters + search + sort to a task list. */
export function filterTasks(state: ControllerState, tasks: TaskRecord[]): TaskRecord[] {
  const q = state.search.trim().toLowerCase()
  const filtered = tasks.filter(t =>
    (state.filters.workspaceId === undefined || t.workspaceId === state.filters.workspaceId)
    && (state.filters.urgencies.length === 0 || state.filters.urgencies.includes(t.urgency))
    && (q.length === 0 || t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q)))
  if (state.sortBy === 'default') return filtered
  const sorted = [...filtered]
  if (state.sortBy === 'updated') sorted.sort((a, b) => b.updatedAt - a.updatedAt)
  else if (state.sortBy === 'created') sorted.sort((a, b) => b.createdAt - a.createdAt)
  else if (state.sortBy === 'urgency') sorted.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || b.updatedAt - a.updatedAt)
  else if (state.sortBy === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))
  return sorted
}

/**
 * The board view root.
 * @param controller - the controller.
 */
export function TaskBoard({ controller }: { controller: BoardController }) {
  const state = useSyncExternalStore(
    cb => controller.subscribe(cb),
    () => controller.getSnapshot(),
  )
  // Minute ticker: re-renders stale-claim highlights even without ledger changes.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const live = filterTasks(state, state.ledger.tasks.filter(t => t.trashedAt === undefined))
  const selected = state.selectedId === undefined ? undefined : state.ledger.tasks.find(t => t.id === state.selectedId)
  const { alert: showAlert, el: alertEl } = useAlert()
  // + 新建任务 ▼ dropdown (0.4.0): blank / templates / manage / import.
  const [newMenuOpen, setNewMenuOpen] = useState(false)
  const closeMenu = (): void => setNewMenuOpen(false)
  // ⬇ 导出 ▼ dropdown (0.5.1): whole-ledger JSON backup or task-list CSV.
  const [exportOpen, setExportOpen] = useState(false)
  const closeExport = (): void => setExportOpen(false)

  return (
    <div className="dsh-atb-board">
      <div className="dsh-atb-toolbar">
        <h2 className="dsh-atb-title">Agent 任务看板</h2>
        <span className="dsh-atb-count">{live.length} 任务 · rev {state.ledger.revision}</span>
        <div className="dsh-atb-newmenu">
          <button
            type="button"
            className="dsh-atb-btn"
            data-primary="true"
            onClick={() => {
              const next = !newMenuOpen
              setNewMenuOpen(next)
              if (next) controller.prepareTemplateMenu()
            }}
          >
            + 新建任务 ▼
          </button>
          {newMenuOpen && (
            <>
              <div className="dsh-atb-newmenu-backdrop" onClick={closeMenu} />
              <div className="dsh-atb-newmenu-list">
                <button type="button" className="dsh-atb-newmenu-opt" onClick={() => { closeMenu(); controller.setComposer(true) }}>空白任务</button>
                {state.templates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className="dsh-atb-newmenu-opt"
                    title={t.task.description !== undefined && t.task.description.length > 0 ? t.task.description.slice(0, 120) : t.name}
                    onClick={() => { closeMenu(); controller.newFromTemplate(t.task) }}
                  >
                    {t.name}
                  </button>
                ))}
                <div className="dsh-atb-newmenu-sep" />
                <button type="button" className="dsh-atb-newmenu-opt" onClick={() => { closeMenu(); controller.openTemplateManager() }}>⌗ 管理模板…</button>
              </div>
            </>
          )}
        </div>
        <div className="dsh-atb-spacer" />
        <input
          className="dsh-atb-input dsh-atb-search"
          value={state.search}
          placeholder="搜索标题 / ID…"
          spellCheck={false}
          onChange={e => controller.setSearch(e.target.value)}
        />
        <select
          className="dsh-atb-select"
          value={state.filters.workspaceId ?? ''}
          onChange={e => controller.setWorkspaceFilter(e.target.value === '' ? undefined : e.target.value)}
        >
          <option value="">全部项目</option>
          {state.workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.title || ws.path}</option>)}
        </select>
        <select
          className="dsh-atb-select"
          value={state.sortBy}
          title="列内排序"
          onChange={e => controller.setSortBy(e.target.value as typeof state.sortBy)}
        >
          <option value="default">默认排序</option>
          <option value="updated">最近更新</option>
          <option value="urgency">按紧急度</option>
          <option value="created">创建时间</option>
          <option value="title">按标题</option>
        </select>
        {(['urgent', 'normal', 'relaxed'] as const).map(u => (
          <button
            key={u}
            type="button"
            className="dsh-atb-chip"
            data-urgency={u}
            data-on={state.filters.urgencies.includes(u)}
            onClick={() => controller.toggleUrgency(u)}
          >
            <span className="dsh-atb-dot" data-urgency={u} />
            {URGENCY_LABEL[u]}
          </button>
        ))}
        <button type="button" className="dsh-atb-btn" onClick={() => controller.toggleSecondary()}>
          {state.secondaryOpen ? '返回看板' : '其它任务'}
        </button>
        <button type="button" className="dsh-atb-btn" title="看板设置：新建任务的默认执行隔离等" onClick={() => controller.openSettings()}>🛠 设置</button>
        <button type="button" className="dsh-atb-btn" title="健康诊断：遗留 worktree、台账基本项" onClick={() => controller.openDiagnostics()}>⚙ 诊断</button>
        <button type="button" className="dsh-atb-btn" title="从 JSON 备份文件导入台账（预览后合并或整册替换）" onClick={() => controller.openImport()}>⬆ 导入</button>
        <div className="dsh-atb-newmenu">
          <button
            type="button"
            className="dsh-atb-btn"
            title="导出台账：完整 JSON 备份或任务清单 CSV"
            onClick={() => setExportOpen(!exportOpen)}
          >
            ⬇ 导出 ▼
          </button>
          {exportOpen && (
            <>
              <div className="dsh-atb-newmenu-backdrop" onClick={closeExport} />
              <div className="dsh-atb-newmenu-list">
                <button
                  type="button"
                  className="dsh-atb-newmenu-opt"
                  title="完整台账备份（含执行历史与看板设置），可用于导入恢复"
                  onClick={() => { closeExport(); controller.exportJson() }}
                >
                  完整台账（JSON）
                </button>
                <button
                  type="button"
                  className="dsh-atb-newmenu-opt"
                  title="任务清单表格（Excel 可直接打开，中文已加 BOM）"
                  onClick={() => { closeExport(); controller.exportCsv() }}
                >
                  任务清单（CSV）
                </button>
              </div>
            </>
          )}
        </div>
        <a
          className="dsh-atb-ver"
          href="https://github.com/cloader/dsh-taskboard"
          target="_blank"
          rel="noopener noreferrer"
        >
          V{PLUGIN_VERSION}
        </a>
      </div>

      {state.error !== undefined && <div className="dsh-atb-error">{state.error}</div>}

      {state.secondaryOpen
        ? <SecondaryTab controller={controller} tasks={filterTasks(state, state.ledger.tasks)} />
        : (
          <div className="dsh-atb-columns">
            {MAIN_STATUSES.map(status => {
              const columnTasks = live.filter(t => t.status === status)
              return (
                <div
                  className="dsh-atb-column"
                  key={status}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes(DRAG_TYPE)) {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = 'move'
                      e.currentTarget.dataset.dragover = 'true'
                    }
                  }}
                  onDragLeave={(e) => { delete e.currentTarget.dataset.dragover }}
                  onDrop={(e) => {
                    e.preventDefault()
                    delete e.currentTarget.dataset.dragover
                    const id = e.dataTransfer.getData(DRAG_TYPE)
                    if (id.length === 0) return
                    const task = state.ledger.tasks.find(t => t.id === id)
                    if (task === undefined || task.status === status) return
                    if (!canTransition(task.status, status)) {
                      showAlert(`无法从「${COLUMN_LABELS[task.status]}」拖至「${COLUMN_LABELS[status]}」`)
                      return
                    }
                    void controller.move(id, task.version, status)
                  }}
                >
                  <div className="dsh-atb-colhead">
                    <span className="dsh-atb-dot" data-status={status} />
                    {COLUMN_LABELS[status]}
                    <span className="dsh-atb-colcount">{columnTasks.length}</span>
                  </div>
                  <div className="dsh-atb-cards">
                    {columnTasks.map(task => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        controller={controller}
                        draggable
                        now={now}
                        onAlert={showAlert}
                      />
                    ))}
                    {columnTasks.length === 0 && <div className="dsh-atb-empty">无任务</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

      {selected !== undefined && (
        <div className="dsh-atb-detailpanel">
          {/* key: remount per task — without it, confirm states and comment
              drafts leak across task switches (review P0). */}
          <TaskDetail key={selected.id} task={selected} controller={controller} now={now} />
        </div>
      )}

      {state.composerOpen && (
        <TaskFormModal
          controller={controller}
          task={state.editingId === undefined ? undefined : state.ledger.tasks.find(t => t.id === state.editingId)}
        />
      )}

      {state.diagOpen && <DiagnosticsPanel controller={controller} />}

      {state.settingsOpen && <SettingsModal controller={controller} />}

      {state.importOpen && <ImportModal controller={controller} />}

      {state.tplManagerOpen && <TemplateManager controller={controller} />}

      {alertEl}
    </div>
  )
}

/** ⚙ Health-diagnostics panel (plan §3.6): ledger basics + orphan worktrees + one-click cleanup. */
function DiagnosticsPanel({ controller }: { controller: BoardController }) {
  const state = controller.getSnapshot()
  const diag = state.diagnostics
  const wsName = (id: string): string => {
    const ws = state.workspaces.find(w => w.id === id)
    return ws?.title ?? ws?.path ?? id.slice(0, 8)
  }
  return (
    <div className="dsh-atb-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) controller.closeDiagnostics() }}>
      <div className="dsh-atb-modal dsh-atb-diag" role="dialog" aria-modal="true" aria-label="健康诊断">
        <div className="dsh-atb-modal-head">
          <span className="dsh-atb-modal-headicon">⚙</span>
          <div className="dsh-atb-modal-headtext">
            <h3>健康诊断</h3>
            <p>台账基本项与 worktree 遗留清理</p>
          </div>
          <button type="button" className="dsh-atb-modal-close" aria-label="关闭" onClick={() => controller.closeDiagnostics()}>✕</button>
        </div>
        <div className="dsh-atb-modal-body">
          {diag === undefined
            ? <div className="dsh-atb-empty2">读取中…</div>
            : (
              <>
                <div className="dsh-atb-diag-grid">
                  <div className="dsh-atb-diag-item"><b>{diag.revision}</b><span>台账修订号</span></div>
                  <div className="dsh-atb-diag-item"><b>{diag.tasks}</b><span>任务总数</span></div>
                  <div className="dsh-atb-diag-item" data-bad={diag.staleRunning > 0 ? 'true' : undefined}><b>{diag.staleRunning}</b><span>执行中</span></div>
                  <div className="dsh-atb-diag-item" data-bad={diag.orphanWorktrees.length > 0 ? 'true' : undefined}><b>{diag.orphanWorktrees.length}</b><span>遗留 worktree</span></div>
                </div>
                <div className="dsh-atb-diag-sec">
                  <h4>遗留 worktree（台账无主但目录存在）</h4>
                  {diag.orphanWorktrees.length === 0
                    ? <div className="dsh-atb-empty2">无遗留 — 各项目 .dsh-worktrees 目录干净</div>
                    : (
                        <div className="dsh-atb-diag-orphans">
                          {diag.orphanWorktrees.map(o => (
                            <div key={o.path} className="dsh-atb-diag-orphan">
                              <span className="dsh-atb-diag-orphan-path" title={o.path}>{wsName(o.workspaceId)} · {o.taskId}</span>
                              <button type="button" className="dsh-atb-btn" data-danger="true" onClick={() => void controller.cleanupOrphan(o.workspaceId, o.taskId)}>清理</button>
                            </div>
                          ))}
                        </div>
                      )}
                  <div className="dsh-atb-empty2">提示：有未提交修改的遗留目录会被拒绝清理，请先手动处理其内容。live 任务的 worktree 请在任务详情页删除。</div>
                </div>
                <div className="dsh-atb-diag-sec">
                  <h4>gitignore 建议</h4>
                  {(diag.gitIgnoreSuggestions ?? []).length === 0
                    ? <div className="dsh-atb-empty2">无待办 — 各 git 项目已忽略 .dsh-worktrees 目录</div>
                    : (
                        <div className="dsh-atb-diag-orphans">
                          {diag.gitIgnoreSuggestions.map(s => (
                            <div key={s.workspaceId} className="dsh-atb-diag-orphan">
                              <span className="dsh-atb-diag-orphan-path" title={s.workspacePath}>
                                {wsName(s.workspaceId)} · 建议在 .gitignore 加入一行 <code>.dsh-worktrees/</code>（不会自动修改）
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                </div>
              </>
            )}
        </div>
      </div>
    </div>
  )
}

/** Secondary tab: tasks grouped into canceled / archived / trashed columns. */
function SecondaryTab({ controller, tasks }: { controller: BoardController; tasks: TaskRecord[] }) {
  // Trashed takes precedence (a trashed task still carries its old status,
  // but what matters to the user is the pending purge).
  const trashed = tasks.filter(t => t.trashedAt !== undefined)
  const archived = tasks.filter(t => t.trashedAt === undefined && t.status === 'archived')
  const canceled = tasks.filter(t => t.trashedAt === undefined && t.status === 'canceled')
  const groups = [
    { label: '已取消', dot: 'canceled', rows: canceled },
    { label: '已归档', dot: 'archived', rows: archived },
    { label: '已删除', dot: 'trashed', rows: trashed },
  ]
  if (trashed.length + archived.length + canceled.length === 0) {
    return (
      <div className="dsh-atb-secondary">
        <div className="dsh-atb-empty">无已取消 / 已归档 / 已删除任务</div>
      </div>
    )
  }
  return (
    <div className="dsh-atb-columns">
      {groups.map(group => (
        <div className="dsh-atb-column" key={group.label}>
          <div className="dsh-atb-colhead">
            <span className="dsh-atb-dot" data-status={group.dot} />
            {group.label}
            <span className="dsh-atb-colcount">{group.rows.length}</span>
          </div>
          <div className="dsh-atb-cards">
            {group.rows.map(task => (
              <TaskCard key={task.id} task={task} controller={controller} />
            ))}
            {group.rows.length === 0 && <div className="dsh-atb-empty">无任务</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

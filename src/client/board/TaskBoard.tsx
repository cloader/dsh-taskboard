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
import { COLUMN_KEYS, URGENCY_KEYS } from './labels.ts'
import { useT } from '../i18n/runtime.ts'
import { localizeBuiltinName, localizeBuiltinTask } from '../i18n/templates.ts'
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
  const t = useT()
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
        <h2 className="dsh-atb-title">{t('board.title')}</h2>
        <span className="dsh-atb-count">{t('board.count.tasks', { n: live.length, rev: state.ledger.revision })}</span>
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
            {t('board.action.newTask')}
          </button>
          {newMenuOpen && (
            <>
              <div className="dsh-atb-newmenu-backdrop" onClick={closeMenu} />
              <div className="dsh-atb-newmenu-list">
                <button type="button" className="dsh-atb-newmenu-opt" onClick={() => { closeMenu(); controller.setComposer(true) }}>{t('board.action.blankTask')}</button>
                {state.templates.map(t => {
                  const name = localizeBuiltinName(t)
                  const spec = localizeBuiltinTask(t)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      className="dsh-atb-newmenu-opt"
                      title={spec.description !== undefined && spec.description.length > 0 ? spec.description.slice(0, 120) : name}
                      onClick={() => { closeMenu(); controller.newFromTemplate(spec) }}
                    >
                      {name}
                    </button>
                  )
                })}
                <div className="dsh-atb-newmenu-sep" />
                <button type="button" className="dsh-atb-newmenu-opt" onClick={() => { closeMenu(); controller.openTemplateManager() }}>{t('board.action.manageTemplates')}</button>
              </div>
            </>
          )}
        </div>
        <div className="dsh-atb-spacer" />
        <input
          className="dsh-atb-input dsh-atb-search"
          value={state.search}
          placeholder={t('board.search.placeholder')}
          spellCheck={false}
          onChange={e => controller.setSearch(e.target.value)}
        />
        <select
          className="dsh-atb-select"
          value={state.filters.workspaceId ?? ''}
          onChange={e => controller.setWorkspaceFilter(e.target.value === '' ? undefined : e.target.value)}
        >
          <option value="">{t('board.filter.allProjects')}</option>
          {state.workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.title || ws.path}</option>)}
        </select>
        <select
          className="dsh-atb-select"
          value={state.sortBy}
          title={t('board.sort.title')}
          onChange={e => controller.setSortBy(e.target.value as typeof state.sortBy)}
        >
          <option value="default">{t('board.sort.default')}</option>
          <option value="updated">{t('board.sort.updated')}</option>
          <option value="urgency">{t('board.sort.urgency')}</option>
          <option value="created">{t('board.sort.created')}</option>
          <option value="title">{t('board.sort.byTitle')}</option>
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
            {t(URGENCY_KEYS[u])}
          </button>
        ))}
        <button type="button" className="dsh-atb-btn" onClick={() => controller.toggleSecondary()}>
          {state.secondaryOpen ? t('board.action.backToBoard') : t('board.action.otherTasks')}
        </button>
        <button type="button" className="dsh-atb-btn" title={t('board.action.settingsTitle')} onClick={() => controller.openSettings()}>{t('board.action.settings')}</button>
        <button type="button" className="dsh-atb-btn" title={t('board.action.diagTitle')} onClick={() => controller.openDiagnostics()}>{t('board.action.diag')}</button>
        <button type="button" className="dsh-atb-btn" title={t('board.action.importTitle')} onClick={() => controller.openImport()}>{t('board.action.import')}</button>
        <div className="dsh-atb-newmenu">
          <button
            type="button"
            className="dsh-atb-btn"
            title={t('board.action.exportTitle')}
            onClick={() => setExportOpen(!exportOpen)}
          >
            {t('board.action.export')}
          </button>
          {exportOpen && (
            <>
              <div className="dsh-atb-newmenu-backdrop" onClick={closeExport} />
              <div className="dsh-atb-newmenu-list">
                <button
                  type="button"
                  className="dsh-atb-newmenu-opt"
                  title={t('board.export.jsonTitle')}
                  onClick={() => { closeExport(); controller.exportJson() }}
                >
                  {t('board.export.json')}
                </button>
                <button
                  type="button"
                  className="dsh-atb-newmenu-opt"
                  title={t('board.export.csvTitle')}
                  onClick={() => { closeExport(); controller.exportCsv() }}
                >
                  {t('board.export.csv')}
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
                      showAlert(t('board.drag.forbidden', { from: t(COLUMN_KEYS[task.status]), to: t(COLUMN_KEYS[status]) }))
                      return
                    }
                    void controller.move(id, task.version, status)
                  }}
                >
                  <div className="dsh-atb-colhead">
                    <span className="dsh-atb-dot" data-status={status} />
                    {t(COLUMN_KEYS[status])}
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
                    {columnTasks.length === 0 && <div className="dsh-atb-empty">{t('board.empty')}</div>}
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
  const t = useT()
  const state = controller.getSnapshot()
  const diag = state.diagnostics
  const wsName = (id: string): string => {
    const ws = state.workspaces.find(w => w.id === id)
    return ws?.title ?? ws?.path ?? id.slice(0, 8)
  }
  return (
    <div className="dsh-atb-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) controller.closeDiagnostics() }}>
      <div className="dsh-atb-modal dsh-atb-diag" role="dialog" aria-modal="true" aria-label={t('diag.title')}>
        <div className="dsh-atb-modal-head">
          <span className="dsh-atb-modal-headicon">⚙</span>
          <div className="dsh-atb-modal-headtext">
            <h3>{t('diag.title')}</h3>
            <p>{t('diag.subtitle')}</p>
          </div>
          <button type="button" className="dsh-atb-modal-close" aria-label={t('shared.close')} onClick={() => controller.closeDiagnostics()}>✕</button>
        </div>
        <div className="dsh-atb-modal-body">
          {diag === undefined
            ? <div className="dsh-atb-empty2">{t('shared.loading')}</div>
            : (
              <>
                <div className="dsh-atb-diag-grid">
                  <div className="dsh-atb-diag-item"><b>{diag.revision}</b><span>{t('diag.revision')}</span></div>
                  <div className="dsh-atb-diag-item"><b>{diag.tasks}</b><span>{t('diag.tasks')}</span></div>
                  <div className="dsh-atb-diag-item" data-bad={diag.staleRunning > 0 ? 'true' : undefined}><b>{diag.staleRunning}</b><span>{t('diag.running')}</span></div>
                  <div className="dsh-atb-diag-item" data-bad={diag.orphanWorktrees.length > 0 ? 'true' : undefined}><b>{diag.orphanWorktrees.length}</b><span>{t('diag.orphans')}</span></div>
                </div>
                <div className="dsh-atb-diag-sec">
                  <h4>{t('diag.orphans.heading')}</h4>
                  {diag.orphanWorktrees.length === 0
                    ? <div className="dsh-atb-empty2">{t('diag.orphans.none')}</div>
                    : (
                        <div className="dsh-atb-diag-orphans">
                          {diag.orphanWorktrees.map(o => (
                            <div key={o.path} className="dsh-atb-diag-orphan">
                              <span className="dsh-atb-diag-orphan-path" title={o.path}>{wsName(o.workspaceId)} · {o.taskId}</span>
                              <button type="button" className="dsh-atb-btn" data-danger="true" onClick={() => void controller.cleanupOrphan(o.workspaceId, o.taskId)}>{t('diag.orphans.cleanup')}</button>
                            </div>
                          ))}
                        </div>
                      )}
                  <div className="dsh-atb-empty2">{t('diag.orphans.hint')}</div>
                </div>
                <div className="dsh-atb-diag-sec">
                  <h4>{t('diag.gitignore.heading')}</h4>
                  {(diag.gitIgnoreSuggestions ?? []).length === 0
                    ? <div className="dsh-atb-empty2">{t('diag.gitignore.none')}</div>
                    : (
                        <div className="dsh-atb-diag-orphans">
                          {diag.gitIgnoreSuggestions.map(s => (
                            <div key={s.workspaceId} className="dsh-atb-diag-orphan">
                              <span className="dsh-atb-diag-orphan-path" title={s.workspacePath}>
                                {wsName(s.workspaceId)} · {t('diag.gitignore.suggestA')} <code>.dsh-worktrees/</code>{t('diag.gitignore.suggestB')}
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
  const t = useT()
  // Trashed takes precedence (a trashed task still carries its old status,
  // but what matters to the user is the pending purge).
  const trashed = tasks.filter(t => t.trashedAt !== undefined)
  const archived = tasks.filter(t => t.trashedAt === undefined && t.status === 'archived')
  const canceled = tasks.filter(t => t.trashedAt === undefined && t.status === 'canceled')
  const groups = [
    { label: t('status.column.canceled'), dot: 'canceled', rows: canceled },
    { label: t('status.column.archived'), dot: 'archived', rows: archived },
    { label: t('board.group.trashed'), dot: 'trashed', rows: trashed },
  ]
  if (trashed.length + archived.length + canceled.length === 0) {
    return (
      <div className="dsh-atb-secondary">
        <div className="dsh-atb-empty">{t('board.secondary.empty')}</div>
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
            {group.rows.length === 0 && <div className="dsh-atb-empty">{t('board.empty')}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}

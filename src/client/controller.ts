/**
 * The board controller: framework-free state holder the React views render
 * from. Owns the ledger snapshot, workspace listing, view state (open,
 * filters, selection, modals), and the SSE subscription with gap-triggered
 * full refetch. Every mutation goes through the route client and lands in the
 * snapshot through the SSE change stream or the explicit refetch.
 *
 * @module dsh-taskboard/client/controller
 */
import type { ChangeEvent, DiagnosticsResponse, DiffResponse, ImportCommitResponse, ImportPreviewResponse, TaskTemplate, TaskTemplateSpec, UpdateTaskBody, WorkspaceView } from '../shared/api.ts'
import type { ChecklistItem, TaskLedger, TaskRecord, Urgency } from '../shared/protocol.ts'
import { emptyLedger } from '../shared/protocol.ts'
import type { TaskboardClient } from './api.ts'
import type { SessionJumpResult } from './session-jump.ts'

/** View filters over the ledger. */
export interface BoardFilters {
  /** Selected project id; undefined = all projects. */
  workspaceId?: string
  /** Selected urgency chips (empty = all). */
  urgencies: Urgency[]
}

/** Column sort orders. */
export type SortBy = 'default' | 'updated' | 'urgency' | 'created'

/** localStorage key for persisted view state (filters + sort). */
const VIEW_KEY = 'dsh-taskboard-view-v1'

/** Load the persisted view state (never throws; fresh on any parse error). */
function loadView(): { workspaceId?: string; urgencies: Urgency[]; sortBy: SortBy } {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    if (raw === null) return { urgencies: [], sortBy: 'default' }
    const parsed = JSON.parse(raw) as { workspaceId?: string; urgencies?: Urgency[]; sortBy?: SortBy }
    const sortBy = parsed.sortBy === 'updated' || parsed.sortBy === 'urgency' || parsed.sortBy === 'created' ? parsed.sortBy : 'default'
    return {
      workspaceId: typeof parsed.workspaceId === 'string' ? parsed.workspaceId : undefined,
      urgencies: Array.isArray(parsed.urgencies) ? parsed.urgencies.filter(u => u === 'urgent' || u === 'normal' || u === 'relaxed') : [],
      sortBy,
    }
  } catch {
    return { urgencies: [], sortBy: 'default' }
  }
}

/** Controller snapshot the views render. */
export interface ControllerState {
  boardOpen: boolean
  ledger: TaskLedger
  workspaces: WorkspaceView[]
  filters: BoardFilters
  /** Free-text search over title/id (case-insensitive). */
  search: string
  /** Column sort order. */
  sortBy: SortBy
  /** Selected task id (detail view); undefined closes the detail. */
  selectedId?: string
  /** Task form modal visible (create when editingId is unset). */
  composerOpen: boolean
  /** Task being edited in the form modal; unset = create mode. */
  editingId?: string
  /** Secondary (canceled/archived/trashed) tab visible. */
  secondaryOpen: boolean
  /** Health-diagnostics panel (⚙) visible. */
  diagOpen: boolean
  /** Last fetched diagnostics payload (⚙ panel). */
  diagnostics?: DiagnosticsResponse
  /** Task templates (0.4.0), lazy-loaded when the new-task menu opens. */
  templates: TaskTemplate[]
  /** Template manager modal visible. */
  tplManagerOpen: boolean
  /** Import modal visible (0.4.0). */
  importOpen: boolean
  /** Board-settings modal visible (0.5.0). */
  settingsOpen: boolean
  /** Fields a chosen template prefills into the create form (consumed on open). */
  templatePrefill?: TaskTemplateSpec
  /** Transient error surface (action failures); cleared on next success. */
  error?: string
}

/** Instantiate the default state (view state hydrated from localStorage). */
function initialState(): ControllerState {
  const view = loadView()
  return {
    boardOpen: false,
    ledger: emptyLedger(),
    workspaces: [],
    filters: { workspaceId: view.workspaceId, urgencies: view.urgencies },
    search: '',
    sortBy: view.sortBy,
    composerOpen: false,
    secondaryOpen: false,
    diagOpen: false,
    templates: [],
    tplManagerOpen: false,
    importOpen: false,
    settingsOpen: false,
  }
}

/**
 * The board controller.
 */
export class BoardController {
  private state: ControllerState = initialState()
  private readonly subscribers = new Set<() => void>()
  private disposed = false
  private disposeStream: (() => void) | undefined
  private refreshInFlight: Promise<void> | undefined
  /** Newest change-frame revision seen on the SSE stream (S16 refresh chase). */
  private seenRevision: number | undefined
  private sessionJumper: ((sessionId: string) => Promise<SessionJumpResult>) | undefined
  /** Composer catalog faces, installed formally by the client entry (T13). */
  private readonly catalogFaces: {
    models?: () => Promise<Array<{
      provider: string
      model: string
      name?: string
      reasoning?: {
        efforts: Array<{ id: string; name: string; description?: string }>
        defaultEffort?: string
      }
    }>>
    presets?: () => Promise<{ presets: Array<{ id: string; name?: string }>; defaultId?: string }>
  } = {}

  /** @param client - the route client. */
  constructor(private readonly client: TaskboardClient) {}

  /** Current snapshot (render input). */
  getSnapshot(): ControllerState {
    return this.state
  }

  /** Subscribe; returns unsubscribe. */
  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn)
    return () => this.subscribers.delete(fn)
  }

  private emit(): void {
    if (this.disposed) return
    for (const fn of this.subscribers) fn()
  }

  private setState(patch: Partial<ControllerState>): void {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  /** Start subscriptions; call once after construction. */
  start(): void {
    void this.refresh()
    this.disposeStream = this.client.stream(
      (change: ChangeEvent) => {
        this.seenRevision = change.revision
        // Any change invalidates the full snapshot; refetch (cheap, local).
        // No intermediate revision-only setState — the refresh result is the
        // single render a frame produces (review P2: frames rendered twice).
        void this.refresh()
      },
      () => { void this.refresh() },
    )
  }

  /** Full refetch (state + workspaces + open detail). */
  async refresh(): Promise<void> {
    if (this.refreshInFlight !== undefined) return this.refreshInFlight
    this.refreshInFlight = (async () => {
      try {
        // S16: a change frame landing while a fetch is in flight used to
        // strand the board on a stale snapshot forever (the deduped request
        // predates the newest frame and no further event arrives). Chase the
        // newest seen revision — bounded rounds, then give up until the next
        // frame.
        for (let round = 0; round < 3; round++) {
          const [ledger, workspaces] = await Promise.all([
            this.client.state(),
            this.client.workspaces(),
          ])
          let selected: TaskRecord | undefined
          if (this.state.selectedId !== undefined) {
            selected = ledger.tasks.find(t => t.id === this.state.selectedId)
          }
          this.setState({ ledger, workspaces, error: undefined, selectedId: selected === undefined ? undefined : this.state.selectedId })
          if (this.seenRevision === undefined || ledger.revision >= this.seenRevision) break
        }
      } catch (error) {
        this.setState({ error: error instanceof Error ? error.message : String(error) })
      } finally {
        this.refreshInFlight = undefined
      }
    })()
    return this.refreshInFlight
  }

  /** Stop everything. */
  dispose(): void {
    this.disposed = true
    this.disposeStream?.()
    this.subscribers.clear()
  }

  // ------------------------------------------------------------------ view
  /** Open the board (sidebar entry). */
  openBoard(): void { this.setState({ boardOpen: true }) }

  /** Close the board. */
  closeBoard(): void { this.setState({ boardOpen: false }) }

  /** Toggle the board. */
  toggleBoard(): void { this.setState({ boardOpen: !this.state.boardOpen }) }

  /** Set the project filter (persisted). */
  setWorkspaceFilter(workspaceId?: string): void {
    this.setState({ filters: { ...this.state.filters, workspaceId } })
    this.persistView()
  }

  /** Toggle one urgency chip (persisted). */
  toggleUrgency(urgency: Urgency): void {
    const set = new Set(this.state.filters.urgencies)
    if (set.has(urgency)) set.delete(urgency)
    else set.add(urgency)
    this.setState({ filters: { ...this.state.filters, urgencies: [...set] } })
    this.persistView()
  }

  /** Set the free-text search (transient — not persisted). */
  setSearch(search: string): void {
    this.setState({ search })
  }

  /** Set the column sort order (persisted). */
  setSortBy(sortBy: SortBy): void {
    this.setState({ sortBy })
    this.persistView()
  }

  /** Write the current view state to localStorage (best effort). */
  private persistView(): void {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify({
        workspaceId: this.state.filters.workspaceId,
        urgencies: this.state.filters.urgencies,
        sortBy: this.state.sortBy,
      }))
    } catch { /* storage unavailable (private mode etc.) — view just won't persist */ }
  }

  /** Select a task (open detail). */
  select(id?: string): void { this.setState({ selectedId: id }) }

  /** Show/hide the task form (create mode when opening); always blank (no template prefill). */
  setComposer(open: boolean): void { this.setState({ composerOpen: open, editingId: undefined, templatePrefill: undefined }) }

  /** Open the create form prefilled from a chosen template (0.4.0). */
  newFromTemplate(spec: TaskTemplateSpec): void {
    this.setState({ composerOpen: true, editingId: undefined, templatePrefill: spec })
  }

  /** Open the form modal editing an existing task (clears any template prefill). */
  openEditor(id: string): void { this.setState({ composerOpen: true, editingId: id, templatePrefill: undefined }) }

  /** Close the form modal whatever its mode. */
  closeForm(): void { this.setState({ composerOpen: false, editingId: undefined, templatePrefill: undefined }) }

  /** Toggle the secondary tab. */
  toggleSecondary(): void { this.setState({ secondaryOpen: !this.state.secondaryOpen }) }

  /** Whether a workspace passed git detection (form toggle enablement). */
  gitAvailable(workspaceId: string | undefined): boolean {
    if (workspaceId === undefined) return true
    return this.state.workspaces.find(w => w.id === workspaceId)?.gitAvailable === true
  }

  /**
   * Install the session-jump bridge (built from the runtime sessions service
   * by the client entry). Without it openSession reports 'unavailable'.
   * @param jumper - the jump function from createSessionJumper.
   */
  installSessionJumper(jumper: (sessionId: string) => Promise<SessionJumpResult>): void {
    this.sessionJumper = jumper
  }

  /** T13: formal installers for the composer catalog faces (was a monkeypatch from the client entry). */
  installModelCatalog(fn: () => Promise<Array<{
    provider: string
    model: string
    name?: string
    reasoning?: {
      efforts: Array<{ id: string; name: string; description?: string }>
      defaultEffort?: string
    }
  }>>): void {
    this.catalogFaces.models = fn
  }

  /** T13: formal installer for the preset roster face. */
  installPresetRoster(fn: () => Promise<{ presets: Array<{ id: string; name?: string }>; defaultId?: string }>): void {
    this.catalogFaces.presets = fn
  }

  /** The installed model catalog face, when the runtime provides one. */
  get modelCatalog(): (() => Promise<Array<{
    provider: string
    model: string
    name?: string
    reasoning?: {
      efforts: Array<{ id: string; name: string; description?: string }>
      defaultEffort?: string
    }
  }>>) | undefined {
    return this.catalogFaces.models
  }

  /** The installed preset roster face, when the runtime provides one. */
  get presetCatalog(): (() => Promise<{ presets: Array<{ id: string; name?: string }>; defaultId?: string }>) | undefined {
    return this.catalogFaces.presets
  }

  /**
   * Jump to an execution's session (open it in the GUI). On success the board
   * closes so the conversation shows; a deleted-or-archived session reports
   * 'missing' for the caller to prompt about.
   * @param sessionId - the execution's session id.
   * @returns the jump outcome.
   */
  async openSession(sessionId: string): Promise<SessionJumpResult> {
    if (this.sessionJumper === undefined) return 'unavailable'
    let result: SessionJumpResult
    try {
      result = await this.sessionJumper(sessionId)
    } catch {
      return 'unavailable'
    }
    if (result === 'opened') this.closeBoard()
    return result
  }

  // ---------------------------------------------------------------- writes
  /** Create a task (composer submit); returns the new task id, undefined on failure. */
  async create(body: Parameters<TaskboardClient['create']>[0]): Promise<string | undefined> {
    try {
      const summary = await this.client.create(body)
      this.setState({ composerOpen: false, error: undefined })
      await this.refresh()
      return summary.id
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
      return undefined
    }
  }

  /** Edit task fields (form modal submit; the GUI is the owner surface). */
  async update(id: string, ifVersion: number, body: Omit<UpdateTaskBody, 'ifVersion'>): Promise<boolean> {
    try {
      await this.client.update(id, { ifVersion, ...body })
      this.setState({ composerOpen: false, editingId: undefined, error: undefined })
      await this.refresh()
      return true
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  /** Move a task (user surface: done allowed). */
  async move(id: string, ifVersion: number, status: string): Promise<void> {
    try {
      await this.client.move(id, { ifVersion, status })
      await this.refresh()
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Quick-reject (card ✗ button): move back to todo with an optional user
   * comment, committed atomically host-side. Returns whether the task moved.
   * @param id - task id.
   * @param ifVersion - optimistic version (captured at click time).
   * @param comment - optional comment text; blank = move only.
   */
  async reject(id: string, ifVersion: number, comment?: string): Promise<boolean> {
    const body = comment !== undefined && comment.trim().length > 0 ? comment.trim() : undefined
    try {
      await this.client.reject(id, body === undefined ? { ifVersion } : { ifVersion, body })
      await this.refresh()
      return true
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  /** Toggle the blocked marker. */
  async toggleBlocked(task: TaskRecord): Promise<void> {
    try {
      await this.client.update(task.id, { ifVersion: task.version, blocked: !task.blocked })
      await this.refresh()
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Toggle one checklist item as the USER (0.4.0): flips the item, records
   * `checkedBy: 'user'`, keeps other items as they are (one update call).
   */
  async toggleChecklistItem(task: TaskRecord, itemId: string): Promise<void> {
    const items: ChecklistItem[] = (task.checklist ?? []).map(item => item.id === itemId
      ? (item.checked
          ? { id: item.id, text: item.text, checked: false }
          : { id: item.id, text: item.text, checked: true, checkedBy: 'user', checkedAt: Date.now(), ...(item.note !== undefined ? { note: item.note } : {}) })
      : item)
    try {
      await this.client.update(task.id, { ifVersion: task.version, checklist: items })
      await this.refresh()
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }

  /** Diff view (0.4.0): one execution's commit or changed path; errors surface via throw. */
  async fetchDiff(taskId: string, query: { execution: string; commit?: string; path?: string }): Promise<DiffResponse | undefined> {
    try {
      return await this.client.diff(taskId, query)
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
      return undefined
    }
  }

  /**
   * Append a user comment. Returns whether it landed — the composer keeps its
   * text on failure (T13: it used to clear unconditionally and lose the draft).
   */
  async comment(id: string, body: string): Promise<boolean> {
    try {
      await this.client.comment(id, body)
      await this.refresh()
      return true
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  /** Trigger a manual run (fresh in-project session, pinned model); `reuse` = 续跑. */
  async run(id: string, reuse = false): Promise<void> {
    try {
      await this.client.run(id, reuse ? { reuse: true } : {})
      await this.refresh()
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }

  /** Cancel the running execution (stops the agent session; task returns to todo). */
  async cancel(id: string): Promise<void> {
    try {
      await this.client.cancel(id)
      await this.refresh()
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * ⇥ 合并 (detail page): merge the task branch into the main worktree.
   * @returns the outcome; `noop` means the branch had no new commits (nothing merged).
   */
  async mergeBranch(id: string): Promise<{ ok: true; noop?: boolean } | { ok: false; error: string }> {
    try {
      const value = await this.client.mergeBranch(id)
      await this.refresh()
      return value.noop === true ? { ok: true, noop: true } : { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /**
   * 🗑 删除 worktree (detail page), optionally deleting the task branch too.
   * @returns the outcome; failures carry the git message for an alert.
   */
  async removeWorktree(id: string, deleteBranch: boolean): Promise<{ ok: true; branchError?: string } | { ok: false; error: string }> {
    try {
      const value = await this.client.worktreeRemove(id, { deleteBranch })
      await this.refresh()
      return value.branchError !== undefined ? { ok: true, branchError: value.branchError } : { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Open the ⚙ diagnostics panel and fetch a fresh snapshot. */
  openDiagnostics(): void {
    this.setState({ diagOpen: true })
    void this.client.diagnostics()
      .then(diagnostics => this.setState({ diagnostics }))
      .catch(error => this.setState({ error: error instanceof Error ? error.message : String(error) }))
  }

  /** Close the ⚙ diagnostics panel. */
  closeDiagnostics(): void { this.setState({ diagOpen: false }) }

  /** Open the board-settings modal (0.5.0). */
  openSettings(): void { this.setState({ settingsOpen: true }) }

  /** Close the board-settings modal. */
  closeSettings(): void { this.setState({ settingsOpen: false }) }

  /**
   * Replace board settings (0.5.0). The host broadcasts a settings-updated
   * frame; refresh() pulls ledger.settings so every open view follows.
   * @returns whether the write succeeded.
   */
  async updateSettings(body: Parameters<TaskboardClient['updateSettings']>[0]): Promise<boolean> {
    try {
      await this.client.updateSettings(body)
      await this.refresh()
      return true
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  /** Clean one orphan worktree (⚙ panel); refreshes the diagnostics payload. */
  async cleanupOrphan(workspaceId: string, taskId: string): Promise<void> {
    try {
      await this.client.worktreeCleanup(workspaceId, taskId)
      const diagnostics = await this.client.diagnostics()
      this.setState({ diagnostics, error: undefined })
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }

  /** Soft-delete (agent parity) then optional purge. */
  async remove(id: string, ifVersion: number, purge: boolean): Promise<void> {
    try {
      await this.client.remove(id, purge ? { purge: true } : { ifVersion })
      if (purge) this.setState({ selectedId: undefined })
      await this.refresh()
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }

  /** Duplicate a task into a fresh todo card (same project/urgency/prompt/execution/model/isolation/checklist). */
  async duplicate(task: TaskRecord): Promise<void> {
    try {
      await this.client.create({
        // Keep the suffix under the host's 200-char title cap (review P1).
        title: `${task.title.slice(0, 196)}（副本）`,
        workspaceId: task.workspaceId,
        urgency: task.urgency,
        description: task.description.length > 0 ? task.description : undefined,
        prompt: task.prompt.length > 0 ? task.prompt : undefined,
        execution: task.execution.mode === 'scheduled' && task.execution.cron !== undefined
          ? { mode: 'scheduled', cron: task.execution.cron }
          : { mode: 'claim' },
        model: task.model,
        isolation: task.isolation,
        ...(task.presetId !== undefined ? { presetId: task.presetId } : {}),
        ...(task.checklist !== undefined && task.checklist.length > 0 ? { checklist: task.checklist.map(i => i.text) } : {}),
      })
      await this.refresh()
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }

  // ------------------------------------------------ templates (0.4.0)
  /** Load the template list (best effort; errors surface). */
  async loadTemplates(): Promise<TaskTemplate[]> {
    try {
      const value = await this.client.templates()
      this.setState({ templates: value.templates, error: undefined })
      return value.templates
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
      return []
    }
  }

  /** Open the + 新建任务 dropdown's template list fresh (called on menu open). */
  prepareTemplateMenu(): void {
    if (this.state.templates.length === 0) void this.loadTemplates()
  }

  /** Open the template manager modal. */
  openTemplateManager(): void {
    this.setState({ tplManagerOpen: true })
    void this.loadTemplates()
  }

  /** Close the template manager modal. */
  closeTemplateManager(): void { this.setState({ tplManagerOpen: false }) }

  /** Create or replace a template; refreshes the list. */
  async upsertTemplate(body: { id?: string; name: string; task: TaskTemplateSpec }): Promise<boolean> {
    try {
      await this.client.templateUpsert(body)
      await this.loadTemplates()
      return true
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  /** Delete a template by id; refreshes the list. */
  async deleteTemplate(id: string): Promise<void> {
    try {
      await this.client.templateDelete(id)
      await this.loadTemplates()
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }

  /** 存为模板 from a task card: carries every configurable field incl. checklist texts. */
  async saveAsTemplate(task: TaskRecord): Promise<boolean> {
    return this.upsertTemplate({
      name: task.title.slice(0, 60),
      task: {
        title: task.title,
        description: task.description.length > 0 ? task.description : undefined,
        prompt: task.prompt.length > 0 ? task.prompt : undefined,
        urgency: task.urgency,
        execution: task.execution.mode === 'scheduled' && task.execution.cron !== undefined
          ? { mode: 'scheduled', cron: task.execution.cron }
          : { mode: 'claim' },
        model: task.model,
        isolation: task.isolation,
        ...(task.presetId !== undefined ? { presetId: task.presetId } : {}),
        ...(task.checklist !== undefined && task.checklist.length > 0 ? { checklist: task.checklist.map(i => i.text) } : {}),
      },
    })
  }

  // ------------------------------------------------ import (0.4.0)
  /** Open the import modal. */
  openImport(): void { this.setState({ importOpen: true }) }

  /** Close the import modal. */
  closeImport(): void { this.setState({ importOpen: false }) }

  /** Dry-run an import file: classify its tasks against the live ledger. */
  async importPreview(file: unknown): Promise<ImportPreviewResponse['plan'] | undefined> {
    try {
      const value = await this.client.importPreview(file)
      return value.plan
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
      return undefined
    }
  }

  /** Commit an import; refreshes the ledger afterwards. */
  async importCommit(mode: 'merge' | 'replace', ledger: unknown): Promise<ImportCommitResponse | undefined> {
    try {
      const value = await this.client.importCommit(mode, ledger)
      await this.refresh()
      return value
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
      return undefined
    }
  }

  /** Download the whole ledger as a JSON backup file. */
  exportJson(): void {
    const stamp = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const name = `dsh-taskboard-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.json`
    const body = JSON.stringify(this.state.ledger, null, 2)
    this.download(name, body, 'application/json')
  }

  /** Download the task list as a CSV (BOM-prefixed for Excel + Chinese text). */
  exportCsv(): void {
    const esc = (v: unknown): string => {
      let s = String(v ?? '')
      // S17: formula-injection guard — title/description are agent-controllable
      // and a cell starting with = + - @ would be EXECUTED as a formula by
      // Excel; neutralize with a leading apostrophe.
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = ['id', 'title', 'status', 'urgency', 'blocked', 'project', 'claimedBy', 'mode', 'cron', 'nextRunAt', 'model', 'createdAt', 'updatedAt', 'comments', 'executions']
    const rows = this.state.ledger.tasks.map(t => [
      t.id, t.title, t.status, t.urgency, t.blocked ? 'yes' : 'no', t.workspaceId,
      t.claimedBy ?? '', t.execution.mode, t.execution.cron ?? '',
      t.execution.nextRunAt !== undefined ? new Date(t.execution.nextRunAt).toISOString() : '',
      t.model !== undefined ? `${t.model.provider}/${t.model.model}` : '',
      new Date(t.createdAt).toISOString(), new Date(t.updatedAt).toISOString(),
      t.comments.length, t.executions.length,
    ].map(esc).join(','))
    const stamp = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const name = `dsh-taskboard-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}.csv`
    this.download(name, `\uFEFF${[header.join(','), ...rows].join('\r\n')}`, 'text/csv')
  }

  /** Trigger a browser download (no-op when the DOM is unavailable). */
  private download(filename: string, body: string, type: string): void {
    try {
      const blob = new Blob([body], { type })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5_000)
    } catch (error) {
      this.setState({ error: error instanceof Error ? error.message : String(error) })
    }
  }
}

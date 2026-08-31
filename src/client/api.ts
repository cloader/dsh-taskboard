/**
 * Browser client for the /taskboard host routes: typed fetch wrappers
 * (same origin as the GUI) and the SSE subscription with revision-gap
 * reconciliation (a gap or a reconnect triggers one full state refetch).
 *
 * @module dsh-taskboard/client/api
 */
import type {
  ApiResult,
  ChangeEvent,
  CreateTaskBody,
  DeleteTaskBody,
  DiagnosticsResponse,
  DiffResponse,
  ImportCommitResponse,
  ImportPreviewResponse,
  MergeBranchResponse,
  MoveTaskBody,
  PromptCompletionsResponse,
  RejectTaskBody,
  RunTaskBody,
  SettingsResponse,
  StateResponse,
  TaskRecord,
  TaskTemplate,
  TemplatesResponse,
  UpdateSettingsBody,
  UpdateTaskBody,
  WorktreeRemoveBody,
  WorkspaceView,
} from '../shared/api.ts'
import type { CommentRecord, TaskSummary } from '../shared/protocol.ts'

/** Unwrap the envelope or throw a readable error. */
async function unwrap<T>(pending: Response | Promise<Response>): Promise<T> {
  const res = await pending
  const body = (await res.json().catch(() => null)) as ApiResult<T> | null
  if (body === null) throw new Error(`taskboard: HTTP ${res.status}`)
  if (!body.ok) throw new Error(`taskboard: ${body.error.code}: ${body.error.message}`)
  return body.value
}

/** Request timeout (S15: a hung fetch must never pin refreshInFlight forever). */
const TIMEOUT_MS = 10_000

async function get<T>(path: string): Promise<T> {
  return unwrap<T>(fetch(path, { signal: AbortSignal.timeout(TIMEOUT_MS) }))
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  return unwrap<T>(res)
}

/** Route client face (the controller consumes this narrow surface). */
export interface TaskboardClient {
  state(): Promise<StateResponse>
  workspaces(): Promise<WorkspaceView[]>
  create(body: CreateTaskBody): Promise<TaskSummary>
  get(id: string): Promise<TaskRecord>
  update(id: string, body: UpdateTaskBody): Promise<TaskSummary>
  move(id: string, body: MoveTaskBody): Promise<TaskSummary>
  /** Quick-reject (card ✗): back to todo + optional comment, one mutation. */
  reject(id: string, body: RejectTaskBody): Promise<TaskSummary>
  comment(id: string, bodyText: string): Promise<CommentRecord>
  remove(id: string, body: DeleteTaskBody): Promise<{ trashed?: boolean; purged?: boolean }>
  /** Trigger a manual run (fresh in-project session); `reuse: true` = 续跑. */
  run(id: string, body?: RunTaskBody): Promise<{ executionId: string; sessionId: string }>
  /** Cancel the running execution (stops the agent session; task returns to todo). */
  cancel(id: string): Promise<{ cancelled: true; executionId: string }>
  /** Merge the task branch into the main worktree (--no-ff, user-only). */
  mergeBranch(id: string): Promise<MergeBranchResponse>
  /** Remove the task's worktree; optionally delete its branch. */
  worktreeRemove(id: string, body: WorktreeRemoveBody): Promise<{ removed: true; branchDeleted: boolean; branchError?: string }>
  /** Health diagnostics (⚙ panel). */
  diagnostics(): Promise<DiagnosticsResponse>
  /** Clean up one orphan worktree directory (task no longer in the ledger). */
  worktreeCleanup(workspaceId: string, taskId: string): Promise<{ cleaned: true; path: string }>
  /** Diff view: one execution's commit or changed path (read-only, capped). */
  diff(taskId: string, query: { execution: string; commit?: string; path?: string }): Promise<DiffResponse>
  /** Import dry-run: classify the uploaded ledger against the live one. */
  importPreview(file: unknown): Promise<ImportPreviewResponse>
  /** Commit an import (merge upserts; replace swaps the whole ledger, backing it up first). */
  importCommit(mode: 'merge' | 'replace', ledger: unknown): Promise<ImportCommitResponse>
  /** List task templates. */
  templates(): Promise<TemplatesResponse>
  /** Create or replace a template. */
  templateUpsert(body: { id?: string; name: string; task: TaskTemplate['task'] }): Promise<TaskTemplate>
  /** Delete a template by id. */
  templateDelete(id: string): Promise<{ deleted: boolean }>
  /** Board settings (0.5.0; absent fields = factory defaults). */
  settings(): Promise<SettingsResponse>
  /** Replace board settings (whole-object semantics; affects new tasks only). */
  updateSettings(body: UpdateSettingsBody): Promise<SettingsResponse>
  /** Prompt completions for skills and slash commands (0.5.5). */
  promptCompletions(): Promise<PromptCompletionsResponse>
  /** Subscribe to change frames; the disposer stops the stream. */
  stream(onChange: (event: ChangeEvent) => void, onGap: () => void): () => void
}

/** Build the client over fetch + EventSource. */
export function createClient(): TaskboardClient {
  return {
    state: () => get<StateResponse>('/dsh-taskboard/state'),
    workspaces: () => get<WorkspaceView[]>('/dsh-taskboard/workspaces'),
    create: body => post('/dsh-taskboard/tasks', body),
    get: id => get<TaskRecord>(`/dsh-taskboard/tasks/${encodeURIComponent(id)}`),
    update: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/update`, body),
    move: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/move`, body),
    reject: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/reject`, body),
    comment: (id, bodyText) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/comment`, { body: bodyText }),
    remove: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/delete`, body),
    run: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/run`, body ?? {}),
    cancel: id => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/cancel`, {}),
    mergeBranch: id => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/merge`, {}),
    worktreeRemove: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/worktree-remove`, body),
    diagnostics: () => get<DiagnosticsResponse>('/dsh-taskboard/diagnostics'),
    worktreeCleanup: (workspaceId, taskId) => post('/dsh-taskboard/worktree-cleanup', { workspaceId, taskId }),
    diff: (taskId, query) => {
      const params = new URLSearchParams({ execution: query.execution })
      if (query.commit !== undefined) params.set('commit', query.commit)
      if (query.path !== undefined) params.set('path', query.path)
      return get<DiffResponse>(`/dsh-taskboard/tasks/${encodeURIComponent(taskId)}/diff?${params.toString()}`)
    },
    importPreview: file => post('/dsh-taskboard/import/preview', file),
    importCommit: (mode, ledger) => post('/dsh-taskboard/import', { mode, ledger }),
    templates: () => get<TemplatesResponse>('/dsh-taskboard/templates'),
    templateUpsert: body => post('/dsh-taskboard/templates', body),
    templateDelete: id => post('/dsh-taskboard/templates/delete', { id }),
    settings: () => get<SettingsResponse>('/dsh-taskboard/settings'),
    updateSettings: body => post('/dsh-taskboard/settings/update', body),
    promptCompletions: () => get<PromptCompletionsResponse>('/dsh-taskboard/prompt-completions'),
    stream(onChange, onGap) {
      const es = new EventSource('/dsh-taskboard/events')
      let revision: number | undefined
      const hello = (event: MessageEvent): void => {
        let payload: { revision: number }
        try { payload = JSON.parse(event.data) as { revision: number } } catch { return } // malformed frame → ignore
        if (revision !== undefined && payload.revision !== revision) onGap()
        revision = payload.revision
      }
      const change = (event: MessageEvent): void => {
        let payload: ChangeEvent
        try { payload = JSON.parse(event.data) as ChangeEvent } catch { return } // malformed frame → ignore
        // A gap means we missed frames while disconnected: reconcile fully.
        if (revision !== undefined && payload.revision !== revision + 1) onGap()
        revision = payload.revision
        onChange(payload)
      }
      es.addEventListener('hello', hello as EventListener)
      es.addEventListener('change', change as EventListener)
      es.onerror = () => { /* EventSource auto-reconnects; hello re-checks the gap */ }
      return () => {
        es.close()
      }
    },
  }
}

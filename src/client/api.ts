/**
 * Browser client for the /taskboard host routes: typed fetch wrappers
 * (same origin as the GUI) and the SSE subscription with revision-gap
 * reconciliation (a gap or a reconnect triggers one full state refetch).
 *
 * @module dsh-taskboard/client/api
 */
import type {
  ApiResult,
  AttachmentUpload,
  ChangeEvent,
  CommentRunResponse,
  CreateTaskBody,
  DeleteTaskBody,
  DiagnosticsResponse,
  QueueClearResponse,
  DiffResponse,
  ImportCommitResponse,
  ImportPreviewResponse,
  MergeBranchResponse,
  ModelCatalogResponse,
  MoveTaskBody,
  MoveTaskResponse,
  SessionArchiveResult,
  PromptCompletionsResponse,
  ProjectSessionView,
  RejectTaskBody,
  RunTaskBody,
  SettingsResponse,
  StorageMigrationResult,
  StorageStatus,
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

/** Unwrap the envelope while keeping transport and payload failures distinct. */
async function unwrap<T>(pending: Response | Promise<Response>, path: string, signal?: AbortSignal): Promise<T> {
  const hasTimeoutName = (value: unknown): boolean =>
    typeof value === 'object' && value !== null && 'name' in value && value.name === 'TimeoutError'
  const timedOut = (error: unknown): boolean =>
    hasTimeoutName(error) || (signal?.aborted === true && hasTimeoutName(signal.reason))
  let res: Response
  try {
    res = await pending
  } catch (error) {
    throw new Error(`taskboard: ${path}: ${timedOut(error) ? 'request timed out' : 'network request failed'}`, { cause: error })
  }
  let raw: string
  try {
    raw = await res.text()
  } catch (error) {
    throw new Error(`taskboard: ${path}: ${timedOut(error) ? 'response body timed out' : 'response body read failed'} (HTTP ${res.status})`, { cause: error })
  }
  if (raw.trim().length === 0) throw new Error(`taskboard: ${path}: empty response body (HTTP ${res.status})`)
  let body: unknown
  try {
    body = JSON.parse(raw) as unknown
  } catch (error) {
    const contentType = res.headers.get('content-type') ?? ''
    const kind = contentType.toLowerCase().includes('json') ? 'invalid JSON response' : 'non-JSON response'
    throw new Error(`taskboard: ${path}: ${kind} (HTTP ${res.status})`, { cause: error })
  }
  if (typeof body !== 'object' || body === null || !('ok' in body) || typeof body.ok !== 'boolean') {
    throw new Error(`taskboard: ${path}: invalid API response (HTTP ${res.status})`)
  }
  if (!body.ok) {
    const failure = body as Partial<ApiResult<T>>
    if (!('error' in failure) || typeof failure.error?.code !== 'string' || typeof failure.error.message !== 'string') {
      throw new Error(`taskboard: ${path}: invalid API error response (HTTP ${res.status})`)
    }
    throw new Error(`taskboard: ${failure.error.code}: ${failure.error.message}`)
  }
  if (!('value' in body)) throw new Error(`taskboard: ${path}: invalid API response (HTTP ${res.status})`)
  if (!res.ok) throw new Error(`taskboard: ${path}: HTTP ${res.status} with success body`)
  return body.value as T
}

/** Request timeout (S15: a hung fetch must never pin refreshInFlight forever). */
const TIMEOUT_MS = 10_000

async function get<T>(path: string): Promise<T> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  return unwrap<T>(fetch(path, { signal }), path, signal)
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const signal = AbortSignal.timeout(TIMEOUT_MS)
  return unwrap<T>(fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  }), path, signal)
}

/** Upload raw image bytes; a custom header keeps the route outside simple CSRF requests. */
async function uploadImage(file: Blob): Promise<AttachmentUpload> {
  const path = '/dsh-taskboard/assets'
  const signal = AbortSignal.timeout(30_000)
  return unwrap<AttachmentUpload>(fetch(path, {
    method: 'POST',
    headers: { 'content-type': file.type, 'x-dsh-taskboard-upload': '1' },
    body: file,
    signal,
  }), path, signal)
}

/** Route client face (the controller consumes this narrow surface). */
export interface TaskboardClient {
  state(options?: { excludeDone?: boolean }): Promise<StateResponse>
  workspaces(): Promise<WorkspaceView[]>
  projectSessions(workspaceId: string): Promise<{ sessions: ProjectSessionView[] }>
  create(body: CreateTaskBody): Promise<TaskSummary>
  get(id: string): Promise<TaskRecord>
  update(id: string, body: UpdateTaskBody): Promise<TaskSummary>
  move(id: string, body: MoveTaskBody): Promise<MoveTaskResponse>
  archiveSessions?(id: string): Promise<SessionArchiveResult>
  /** Quick-reject (card ✗): back to todo + optional comment, one mutation. */
  reject(id: string, body: RejectTaskBody): Promise<TaskSummary>
  comment(id: string, bodyText: string): Promise<CommentRecord>
  /** Issue #51: deliver pending user comments to the task's conversation (optionally posting one first). */
  commentRun(id: string, bodyText: string): Promise<CommentRunResponse>
  /** Persist an image and return the short Markdown-safe URL. */
  uploadImage(file: Blob): Promise<AttachmentUpload>
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
  /** Drop every durable queue entry (board queue panel). */
  clearQueue(): Promise<QueueClearResponse>
  /** Clean up one orphan worktree directory (task no longer in the ledger). */
  worktreeCleanup(workspaceId: string, taskId: string): Promise<{ cleaned: true; path: string }>
  /** Diff view: one execution's commit or changed path (read-only, capped). */
  diff(taskId: string, query: { execution: string; commit?: string; path?: string; repo?: string }): Promise<DiffResponse>
  /** Import dry-run: classify the uploaded ledger against the live one. */
  importPreview(file: unknown): Promise<ImportPreviewResponse>
  /** Commit an import (merge upserts; replace swaps the whole ledger, backing it up first). */
  importCommit(mode: 'merge' | 'replace', ledger: unknown): Promise<ImportCommitResponse>
  /** List task templates. */
  templates(): Promise<TemplatesResponse>
  /** Create or replace a template. */
  templateUpsert(body: { id?: string; name: string; category?: string; task: TaskTemplate['task'] }): Promise<TaskTemplate>
  /** Delete a template by id. */
  templateDelete(id: string): Promise<{ deleted: boolean }>
  /** Board settings (0.5.0; absent fields = factory defaults). */
  settings(): Promise<SettingsResponse>
  /** Replace board settings (whole-object semantics; affects new tasks only). */
  updateSettings(body: UpdateSettingsBody): Promise<SettingsResponse>
  /** Inspect and validate the host-side data directory. */
  storage(): Promise<StorageStatus>
  checkStorage(directory: string): Promise<StorageStatus>
  /** Move ledger, templates, and attachments together. */
  migrateStorage(directory: string): Promise<StorageMigrationResult>
  /** Prompt completions for skills and slash commands (0.5.5). */
  promptCompletions(): Promise<PromptCompletionsResponse>
  /** Model catalog and agent preset roster (0.5.5). */
  modelCatalog(): Promise<ModelCatalogResponse>
  /** Subscribe to change frames; the disposer stops the stream. */
  stream(onChange: (event: ChangeEvent) => void, onGap: () => void): () => void
}

/** Build the client over fetch + EventSource. */
export function createClient(): TaskboardClient {
  return {
    state: (options) => {
      const query = options?.excludeDone === true ? '?excludeDone=true' : ''
      return get<StateResponse>(`/dsh-taskboard/state${query}`)
    },
    workspaces: () => get<WorkspaceView[]>('/dsh-taskboard/workspaces'),
    projectSessions: workspaceId => get<{ sessions: ProjectSessionView[] }>(`/dsh-taskboard/project-sessions?workspaceId=${encodeURIComponent(workspaceId)}`),
    create: body => post('/dsh-taskboard/tasks', body),
    get: id => get<TaskRecord>(`/dsh-taskboard/tasks/${encodeURIComponent(id)}`),
    update: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/update`, body),
    move: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/move`, body),
    archiveSessions: id => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/archive-sessions`, {}),
    reject: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/reject`, body),
    comment: (id, bodyText) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/comment`, { body: bodyText }),
    commentRun: (id, bodyText) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/comment-run`, { body: bodyText }),
    uploadImage,
    remove: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/delete`, body),
    run: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/run`, body ?? {}),
    cancel: id => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/cancel`, {}),
    mergeBranch: id => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/merge`, {}),
    worktreeRemove: (id, body) => post(`/dsh-taskboard/tasks/${encodeURIComponent(id)}/worktree-remove`, body),
    diagnostics: () => get<DiagnosticsResponse>('/dsh-taskboard/diagnostics'),
    clearQueue: () => post<QueueClearResponse>('/dsh-taskboard/queue/clear', {}),
    worktreeCleanup: (workspaceId, taskId) => post('/dsh-taskboard/worktree-cleanup', { workspaceId, taskId }),
    diff: (taskId, query) => {
      const params = new URLSearchParams({ execution: query.execution })
      if (query.commit !== undefined) params.set('commit', query.commit)
      if (query.path !== undefined) params.set('path', query.path)
      if (query.repo !== undefined) params.set('repo', query.repo)
      return get<DiffResponse>(`/dsh-taskboard/tasks/${encodeURIComponent(taskId)}/diff?${params.toString()}`)
    },
    importPreview: file => post('/dsh-taskboard/import/preview', file),
    importCommit: (mode, ledger) => post('/dsh-taskboard/import', { mode, ledger }),
    templates: () => get<TemplatesResponse>('/dsh-taskboard/templates'),
    templateUpsert: body => post('/dsh-taskboard/templates', body),
    templateDelete: id => post('/dsh-taskboard/templates/delete', { id }),
    settings: () => get<SettingsResponse>('/dsh-taskboard/settings'),
    updateSettings: body => post('/dsh-taskboard/settings/update', body),
    storage: () => get<StorageStatus>('/dsh-taskboard/storage'),
    checkStorage: directory => post<StorageStatus>('/dsh-taskboard/storage/check', { directory }),
    migrateStorage: directory => {
      const path = '/dsh-taskboard/storage/migrate'
      const signal = AbortSignal.timeout(120_000)
      return unwrap<StorageMigrationResult>(fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ directory }),
        signal,
      }), path, signal)
    },
    promptCompletions: () => get<PromptCompletionsResponse>('/dsh-taskboard/prompt-completions'),
    modelCatalog: () => get<ModelCatalogResponse>('/dsh-taskboard/model-catalog'),
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

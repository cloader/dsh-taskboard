import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { ExternalItem, ExternalSource, ExternalSyncRecord } from '../shared/external.ts'
import { externalKey, mergeExternalFields, normalizeExternalSource, normalizeExternalSyncRecords } from '../shared/external.ts'
import { defaultIsolationOf, defaultPermissionOf, newTaskId, normalizeTitle, type TaskRecord, type TaskLedger } from '../shared/protocol.ts'
import type { TaskStore } from './store.ts'
import type { ExternalConfig, ExternalSyncStatus, SyncResult } from '../shared/external.ts'
import type { ExternalTaskProvider, ExternalProviderRegistry } from './external-provider.ts'
import { createBuiltinProviders } from './external-providers.ts'
import { normalizeConnection } from './external-config.ts'
export type { ExternalConfig, SyncResult } from '../shared/external.ts'
export type { ExternalTaskProvider } from './external-provider.ts'

type SyncState = { config?: ExternalConfig }

export function normalizeExternalConfig(raw: unknown, previous?: ExternalConfig): ExternalConfig {
  return normalizeConnection(raw, createBuiltinProviders(), previous)
}

/** Host-only connection state. Credential files live outside task exports. */
export class ExternalSyncService {
  private state: SyncState = {}
  private volatileError?: string
  private ready: Promise<void>
  private lane: Promise<unknown> = Promise.resolve()
  private running = false
  private disposed = false
  private controller?: AbortController
  private timer?: ReturnType<typeof setInterval>
  private lastAttempt = 0
  private readonly registry: ExternalProviderRegistry
  constructor(private readonly options: {
    file: string; store: TaskStore; workspaceExists: (id: string) => boolean
    provider?: (config: ExternalConfig) => ExternalTaskProvider; now?: () => number; registry?: ExternalProviderRegistry
  }) {
    this.registry = options.registry ?? createBuiltinProviders()
    this.ready = this.load()
    // Construction is eager, before callers await ready. Keep the rejection
    // for request guards without letting a damaged ledger terminate the host.
    void this.ready.catch(error => {
      console.warn('[dsh-taskboard] external sync initialization failed; ledger retained:', error)
    })
  }
  private now(): number { return this.options.now?.() ?? Date.now() }
  private async load(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.options.file, 'utf8')) as SyncState & Partial<ExternalSyncRecord>
      if (raw.config) {
        if (typeof raw.config.id !== 'string' || !raw.config.id) throw new Error('invalid connection identity')
        this.state.config = { ...normalizeConnection(raw.config, this.registry, undefined, false, true), id: raw.config.id }
      }
      await this.options.store.load()
      // Move existing non-secret metadata once; token-only authentication is still rejected above.
      if (this.state.config && (Object.keys(raw.links ?? {}).length || raw.ignored?.length || raw.lastResult || raw.lastError)) {
        const id = this.state.config.id
        const migrated = normalizeExternalSyncRecords({ [id]: raw })[id]!
        await this.options.store.mutate('external-sync-updated', ledger => {
          if (ledger.externalSync?.[id]) return undefined
          ledger.externalSync ??= {}; ledger.externalSync[id] = migrated
          return []
        })
      }
      this.lastAttempt = this.state.config ? this.options.store.snapshot().externalSync?.[this.state.config.id]?.lastAttemptAt ?? 0 : 0
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.volatileError = 'External sync configuration could not be loaded; reconfigure the connection.'
    }
    await this.options.store.load()
  }
  private async persist(): Promise<void> {
    await mkdir(dirname(this.options.file), { recursive: true })
    const temp = `${this.options.file}.tmp`
    await writeFile(temp, JSON.stringify(this.state), { mode: 0o600 })
    await rename(temp, this.options.file)
  }
  private serial<T>(run: () => Promise<T>): Promise<T> {
    const next = this.lane.then(run, run)
    this.lane = next.catch(() => {})
    return next
  }
  async status(): Promise<ExternalSyncStatus> {
    await this.ready
    const config = this.state.config ? (({ credentials: _credentials, ...rest }) => rest)(this.state.config) : undefined
    const credentialPresent = Object.fromEntries(Object.entries(this.state.config?.credentials ?? {}).map(([key, value]) => [key, Boolean(value)]))
    const mode = config && this.registry.get(config.provider).descriptor.authModes.find(m => m.id === config.authMode)
    const credentialValues = Object.fromEntries((mode?.fields ?? []).filter(f => f.secret === false).map(f => [f.key, this.state.config!.credentials[f.key] ?? '']))
    const record = config ? this.options.store.snapshot().externalSync?.[config.id] : undefined
    return { config, credentialPresent, credentialValues, providers: this.registry.list(), running: this.running,
      requiresMappingReview: config?.provider === 'zentao' && !config.mappingMode,
      lastResult: record?.lastResult, lastError: this.volatileError ?? record?.lastError, lastAttemptAt: record?.lastAttemptAt, ignoredCount: record?.ignored.length ?? 0 }
  }
  async configure(raw: unknown): Promise<void> {
    await this.ready
    if (this.running) throw new Error('sync is running')
    await this.serial(async () => {
      if (this.running) throw new Error('sync is running')
      const config = normalizeConnection(raw, this.registry, this.state.config)
      if (config.mappings.some(m => m.workspaceId ? !this.options.workspaceExists(m.workspaceId) : !config.includeUnmapped)) throw new Error('unknown workspace')
      const old = this.state
      this.state = { config }
      try { await this.persist() } catch (e) { this.state = old; throw e }
      this.volatileError = undefined
    })
  }
  async clearIgnored(): Promise<void> {
    await this.ready
    if (this.running) throw new Error('sync is running')
    await this.serial(async () => {
      if (this.running) throw new Error('sync is running')
      if (!this.state.config) throw new Error('configure a connection first')
      await this.options.store.mutate('external-sync-updated', ledger => {
        const record = this.record(ledger, this.state.config!.id)
        record.ignored = []; record.links = {}
        return []
      })
    })
  }
  async resolve(taskId: string, field: string, acceptExternal: boolean, ifVersion: number): Promise<void> {
    if (!['title', 'description', 'urgency'].includes(field)) throw new Error('invalid conflict field')
    await this.options.store.mutate('task-updated', ledger => {
      const task = ledger.tasks.find(t => t.id === taskId)
      if (!task?.external || task.version !== ifVersion) throw new Error('task changed; refresh and retry')
      if (task.status === 'in_progress' || task.executions.some(e => e.outcome === 'running')) throw new Error('wait until execution finishes')
      const key = field as 'title' | 'description' | 'urgency'
      if (!task.external.conflicts.includes(key)) throw new Error('field is not an unresolved conflict')
      if (acceptExternal) {
        if (key === 'urgency') task.urgency = task.external.item.urgency
        else task[key] = task.external.item[key]
      }
      task.external.conflicts = task.external.conflicts.filter(k => k !== key)
      task.version++; task.updatedAt = this.now(); task.updatedBy = { kind: 'user' }
      return [task]
    })
  }
  private record(ledger: TaskLedger, connectionId: string): ExternalSyncRecord {
    ledger.externalSync ??= {}
    return ledger.externalSync[connectionId] ??= { links: {}, ignored: [] }
  }
  start(): void {
    if (this.timer || this.disposed) return
    this.timer = setInterval(() => { void this.tick().catch(() => {}) }, 30_000)
    this.timer.unref?.()
  }
  private async tick(): Promise<void> {
    await this.ready
    const interval = this.state.config?.intervalMinutes ?? 0
    if (this.state.config?.provider === 'zentao' && !this.state.config.mappingMode) return
    if (interval && !this.running && this.now() - this.lastAttempt >= interval * 60_000) await this.sync()
  }
  dispose(): void { this.disposed = true; if (this.timer) clearInterval(this.timer); this.controller?.abort() }
  cancel(): void { this.controller?.abort() }
  async test(raw?: unknown): Promise<void> {
    await this.ready
    const config = raw ? normalizeConnection(raw, this.registry, this.state.config, true) : this.state.config
    if (!config) throw new Error('configure a connection first')
    await this.provider(config).test(AbortSignal.timeout(30_000))
  }
  private provider(config: ExternalConfig): ExternalTaskProvider { return this.options.provider?.(config) ?? this.registry.create(config) }
  async discoverProjects(raw?: unknown) {
    await this.ready
    const config = raw ? normalizeConnection(raw, this.registry, this.state.config, true) : this.state.config
    if (!config) throw new Error('configure a connection first')
    const descriptor = this.registry.get(config.provider).descriptor
    const provider = this.provider(config)
    if (!descriptor.capabilities.projectDiscovery || !provider.listProjects) throw new Error('project discovery is not supported')
    return provider.listProjects(AbortSignal.timeout(30_000))
  }
  async discoverAccount() {
    await this.ready
    if (!this.state.config) throw new Error('configure a connection first')
    const definition = this.registry.get(this.state.config.provider)
    const provider = this.provider(this.state.config)
    if (!definition.descriptor.capabilities.accountDiscovery || !provider.getAccount) throw new Error('this provider requires an explicit assignee account')
    return provider.getAccount(AbortSignal.timeout(30_000))
  }
  async sync(): Promise<SyncResult> {
    await this.ready
    if (this.disposed) throw new Error('sync service stopped')
    if (this.running) throw new Error('sync is already running')
    if (!this.state.config) throw new Error('configure a connection first')
    if (this.state.config.provider === 'zentao' && !this.state.config.mappingMode) throw new Error('reassociate projects or executions before synchronizing')
    this.running = true
    this.lastAttempt = this.now()
    const config = structuredClone(this.state.config)
    this.controller = new AbortController()
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(300_000)])
    const result: SyncResult = { created: 0, updated: 0, unchanged: 0, conflicts: 0, ignored: 0, at: this.now() }
    let committed = false
    try {
      await this.options.store.load()
      const provider = this.provider(config)
      let mappings = config.mappings
      if (config.provider === 'zentao' && config.includeUnmapped) {
        if (!provider.listProjects) throw new Error('scope discovery is required for unmapped synchronization')
        const scopes = await provider.listProjects(signal)
        const associated = new Map(config.mappings.filter(m => m.workspaceId).map(m => [m.projectId, m]))
        for (const scope of scopes) {
          if (!new RegExp(`^${config.mappingMode}:\\d+$`).test(scope.id)) throw new Error('provider returned an unexpected mapping scope')
          if (!associated.has(scope.id)) associated.set(scope.id, { projectId: scope.id, workspaceId: '' })
        }
        mappings = [...associated.values()]
      }
      // Finish all pages before committing: a failed scan never infers deletion or advances state.
      const items: Array<{ item: ExternalItem; workspaceId: string }> = []
      for (const mapping of mappings) {
        if (mapping.workspaceId && !this.options.workspaceExists(mapping.workspaceId)) throw new Error('mapped workspace no longer exists')
        const existing = new Map(this.options.store.snapshot().tasks.filter(t => t.external?.connectionId === config.id && t.external.item.projectId === mapping.projectId)
          .map(t => [JSON.stringify([t.external!.item.type, t.external!.item.id]), { item: t.external!.item, metadataOnly: t.trashedAt !== undefined || ['done', 'canceled', 'archived'].includes(t.status) }]))
        for (const item of await provider.getItems(mapping.projectId, signal, { existing })) {
          if (item.projectId !== mapping.projectId || !config.itemTypes.includes(item.type)) throw new Error('provider returned an unexpected scope or work item type')
          const source = normalizeExternalSource({ connectionId: config.id, provider: config.provider, item, syncedAt: result.at, conflicts: [] })
          if (!source) throw new Error('provider returned an invalid work item')
          items.push({ item: source.item, workspaceId: mapping.workspaceId })
        }
      }
      signal.throwIfAborted()
      await this.serial(async () => {
        signal.throwIfAborted()
        await this.options.store.mutate('external-sync-updated', ledger => {
          signal.throwIfAborted()
          const record = this.record(ledger, config.id)
          const ignored = new Set(record.ignored)
          const links = { ...record.links }
          const changed: TaskRecord[] = []
          const byKey = new Map(ledger.tasks.filter(t => t.external).map(t => [externalKey(t.external!.connectionId, t.external!.item), t]))
          const seen = new Set<string>()
          for (const { item: rawItem, workspaceId } of items) {
            const item = { ...rawItem, title: normalizeTitle(rawItem.title) }
            const key = externalKey(config.id, item)
            if (seen.has(key)) continue
            seen.add(key)
            const task = byKey.get(key)
            if (task) links[key] = task.id
            if (!task && links[key]) ignored.add(key)
            if (task?.trashedAt !== undefined) { ignored.add(key); result.ignored++; continue }
            if (ignored.has(key)) { result.ignored++; continue }
            if (task?.status === 'archived') { result.unchanged++; continue }
            const source: ExternalSource = { connectionId: config.id, provider: config.provider, providerName: this.registry.get(config.provider).descriptor.name, item, syncedAt: result.at, conflicts: [] }
            if (!task) {
              if (item.closed || !(item.assignees ?? [item.assignedTo]).includes(config.account)) continue
              const created: TaskRecord = { id: newTaskId(), title: item.title, description: item.description, urgency: item.urgency,
                workspaceId, prompt: '', status: config.importStatus ?? 'backlog', blocked: false, execution: { mode: 'claim' },
                isolation: defaultIsolationOf(ledger.settings), permission: defaultPermissionOf(ledger.settings),
                model: ledger.settings?.defaultModel, presetId: ledger.settings?.defaultPresetId,
                version: 1, createdAt: result.at, updatedAt: result.at, createdBy: { kind: 'user' }, updatedBy: { kind: 'user' },
                comments: [], executions: [], external: source }
              ledger.tasks.push(created); changed.push(created); byKey.set(key, created); links[key] = created.id; result.created++
            } else {
              links[key] = task.id
              const workspaceChanged = config.provider === 'zentao' && task.workspaceId === '' && workspaceId !== ''
              if (workspaceChanged) task.workspaceId = workspaceId
              if (task.status === 'done' || task.status === 'canceled') {
                const old = task.external!.item
                const statusChanged = ['status', 'assignedTo', 'assignees', 'closed'].some(key => JSON.stringify(old[key as keyof ExternalItem]) !== JSON.stringify(item[key as keyof ExternalItem]))
                if (!workspaceChanged && !statusChanged && !task.external!.conflicts.length) { result.unchanged++; continue }
                task.external = { ...task.external!, item: { ...old, status: item.status, assignedTo: item.assignedTo, closed: item.closed,
                  ...(item.assignees !== undefined ? { assignees: item.assignees } : {}) }, conflicts: [], syncedAt: result.at }
                if (item.assignees === undefined) delete task.external.item.assignees
                task.version++; task.updatedAt = result.at
                changed.push(task); result.updated++
                continue
              }
              const merged = mergeExternalFields(task, task.external!, item,
                ['in_progress', 'in_review'].includes(task.status) || task.executions.some(e => e.outcome === 'running'))
              source.conflicts = merged.conflicts
              const previous = task.external!.item
              const sameItem = ([...new Set([...Object.keys(previous), ...Object.keys(item)])] as Array<keyof ExternalItem>).every(key => JSON.stringify(previous[key]) === JSON.stringify(item[key]))
              if (!workspaceChanged && sameItem && JSON.stringify(task.external!.conflicts) === JSON.stringify(source.conflicts)) { result.unchanged++; continue }
              Object.assign(task, merged.fields)
              task.external = source; task.version++; task.updatedAt = result.at
              changed.push(task); result.updated++
              if (source.conflicts.length) result.conflicts++
            }
          }
          record.ignored = [...ignored]; record.links = links; record.lastResult = result
          record.lastAttemptAt = this.lastAttempt; delete record.lastError
          return changed
        })
        committed = true
        this.volatileError = undefined
      })
      return result
    } catch (error) {
      // Never expose server bodies or request URLs (which may contain credentials).
      const message = committed ? 'Tasks were updated, but sync completion reporting failed.' : 'External sync failed. Check connection, credentials, permissions and server availability.'
      this.volatileError = message
      try {
        await this.serial(async () => this.options.store.mutate('external-sync-updated', ledger => {
          const record = this.record(ledger, config.id)
          record.lastAttemptAt = this.lastAttempt; record.lastError = message
          return []
        }))
      } catch { this.volatileError = `${message} Sync status could not be saved.` }
      throw new Error(this.volatileError, { cause: error })
    } finally { this.running = false; this.controller = undefined }
  }
}

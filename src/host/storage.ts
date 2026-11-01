/** Configurable taskboard data directory and crash-safe three-part migration. */
import { randomUUID } from 'node:crypto'
import { constants, copyFile, access, mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { StorageStatus, StorageMigrationResult } from '../shared/api.ts'
import type { AssetStore } from './assets.ts'
import type { TaskStore } from './store.ts'
import type { TemplateStore } from './templates.ts'
import { StorageQueue } from './storage-queue.ts'

export const STORAGE_CONFIG_FILE = 'dsh-taskboard-storage.json'
const CONFIG_SCHEMA_VERSION = 1

type StorageConfig = { schemaVersion: number; dataDirectory: string }

export interface StorageCoordinatorOptions {
  defaultDirectory: string
  configFile: string
  ledgerName: string
  templatesName: string
  assetsName: string
}

function normalized(path: string): string {
  const value = resolve(path.trim())
  return process.platform === 'win32' ? value.toLowerCase() : value
}

function samePath(a: string, b: string): boolean { return normalized(a) === normalized(b) }

function inside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  return rel.length === 0 || (!rel.startsWith('..') && !isAbsolute(rel))
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true } catch { return false }
}

async function persistConfig(file: string, config: StorageConfig): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temp = join(dirname(file), `.${basename(file)}.${randomUUID()}.tmp`)
  const handle = await open(temp, 'w')
  try {
    await handle.writeFile(JSON.stringify(config, null, 2), 'utf8')
    await handle.sync()
  } finally { await handle.close() }
  await rename(temp, file)
}

function configuredDirectory(options: StorageCoordinatorOptions): { directory: string; configured: boolean; error?: string } {
  if (!existsSync(options.configFile)) return { directory: resolve(options.defaultDirectory), configured: false }
  try {
    const parsed = JSON.parse(readFileSync(options.configFile, 'utf8')) as Partial<StorageConfig>
    if (parsed.schemaVersion !== CONFIG_SCHEMA_VERSION || typeof parsed.dataDirectory !== 'string' || !isAbsolute(parsed.dataDirectory)) {
      return { directory: resolve(options.defaultDirectory), configured: false, error: 'invalid storage location config; using the default directory' }
    }
    return { directory: resolve(parsed.dataDirectory), configured: true }
  } catch (error) {
    return { directory: resolve(options.defaultDirectory), configured: false, error: `cannot read storage location config: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** Coordinates all persistent stores so migration cannot race normal writes. */
export class StorageCoordinator {
  readonly queue = new StorageQueue()
  private currentDirectory: string
  private configured: boolean
  private startupError?: string
  private stores?: { ledger: TaskStore; templates: TemplateStore; assets: AssetStore }

  constructor(private readonly options: StorageCoordinatorOptions) {
    const selected = configuredDirectory(options)
    this.currentDirectory = selected.directory
    this.configured = selected.configured
    if (selected.error !== undefined) console.warn(`[dsh-taskboard] ${selected.error}`)
    if (selected.configured && !existsSync(selected.directory)) {
      this.startupError = `configured storage directory is unavailable: ${selected.directory}`
    }
  }

  attach(stores: { ledger: TaskStore; templates: TemplateStore; assets: AssetStore }): void { this.stores = stores }

  directory(): string { return this.currentDirectory }
  ledgerPath(directory = this.currentDirectory): string { return join(directory, this.options.ledgerName) }
  templatesPath(directory = this.currentDirectory): string { return join(directory, this.options.templatesName) }
  assetsPath(directory = this.currentDirectory): string { return join(directory, this.options.assetsName) }

  async ready(): Promise<void> {
    if (this.startupError !== undefined) throw new Error(`taskboard_storage_unavailable: ${this.startupError}`)
    try {
      await mkdir(this.currentDirectory, { recursive: true })
      await access(this.currentDirectory, constants.R_OK | constants.W_OK)
    } catch (error) {
      this.startupError = `cannot access storage directory ${this.currentDirectory}: ${error instanceof Error ? error.message : String(error)}`
      throw new Error(`taskboard_storage_unavailable: ${this.startupError}`, { cause: error })
    }
  }

  private requireStores(): { ledger: TaskStore; templates: TemplateStore; assets: AssetStore } {
    if (this.stores === undefined) throw new Error('storage coordinator is not attached')
    return this.stores
  }

  async status(): Promise<StorageStatus> {
    const error = this.startupError ?? this.stores?.ledger.loadError()
    let assetCount = 0
    let assetBytes = 0
    try {
      for (const entry of await readdir(this.assetsPath(), { withFileTypes: true })) {
        if (!entry.isFile()) continue
        assetCount += 1
        try { assetBytes += (await stat(join(this.assetsPath(), entry.name))).size } catch { /* best effort */ }
      }
    } catch { /* no attachment directory yet */ }
    return {
      currentDirectory: this.currentDirectory,
      defaultDirectory: resolve(this.options.defaultDirectory),
      isDefault: samePath(this.currentDirectory, this.options.defaultDirectory),
      configured: this.configured,
      writable: error === undefined,
      assetCount,
      assetBytes,
      ...(error === undefined ? {} : { error }),
    }
  }

  async check(directory: string): Promise<StorageStatus> {
    const target = this.validateTarget(directory)
    await mkdir(target, { recursive: true })
    await this.assertTargetAvailable(target)
    const probe = join(target, `.dsh-taskboard-write-${randomUUID()}.tmp`)
    const handle = await open(probe, 'wx')
    try { await handle.writeFile('ok', 'utf8'); await handle.sync() } finally { await handle.close(); await rm(probe, { force: true }) }
    return { ...(await this.status()), checkedDirectory: target, writable: true }
  }

  private validateTarget(directory: string): string {
    if (typeof directory !== 'string' || directory.trim().length === 0) return resolve(this.options.defaultDirectory)
    if (!isAbsolute(directory.trim())) throw new Error('storage directory must be an absolute path')
    const target = resolve(directory.trim())
    if (inside(this.assetsPath(), target)) throw new Error('storage directory cannot be inside the current attachment directory')
    return target
  }

  private async assertTargetAvailable(target: string): Promise<void> {
    if (samePath(target, this.currentDirectory)) return
    for (const path of [this.ledgerPath(target), this.templatesPath(target), this.assetsPath(target)]) {
      if (await exists(path)) throw new Error(`target already contains ${basename(path)}`)
    }
  }

  async migrate(directory: string): Promise<StorageMigrationResult> {
    const target = this.validateTarget(directory)
    return this.queue.run(async () => {
      // Re-check only after acquiring the shared queue: another migration may
      // have switched to this target while this request was waiting.
      if (samePath(target, this.currentDirectory)) return { ...(await this.status()), migrated: false, warnings: [] }
      if (this.startupError !== undefined) throw new Error(`taskboard_storage_unavailable: ${this.startupError}`)
      const stores = this.requireStores()
      await stores.ledger.load()
      await mkdir(target, { recursive: true })
      await this.assertTargetAvailable(target)

      const oldDirectory = this.currentDirectory
      const stage = join(target, `.dsh-taskboard-migration-${randomUUID()}`)
      const stageLedger = this.ledgerPath(stage)
      const stageTemplates = this.templatesPath(stage)
      const stageAssets = this.assetsPath(stage)
      const warnings: string[] = []
      try {
        await mkdir(stage, { recursive: true })
        await stores.ledger.writeCopy(stageLedger)
        await stores.templates.writeCopy(stageTemplates)
        await mkdir(stageAssets, { recursive: true })
        try {
          for (const entry of await readdir(stores.assets.location(), { withFileTypes: true })) {
            if (entry.isFile()) await copyFile(join(stores.assets.location(), entry.name), join(stageAssets, entry.name), constants.COPYFILE_EXCL)
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
        JSON.parse(await readFile(stageLedger, 'utf8'))
        JSON.parse(await readFile(stageTemplates, 'utf8'))

        await rename(stageLedger, this.ledgerPath(target))
        await rename(stageTemplates, this.templatesPath(target))
        await rename(stageAssets, this.assetsPath(target))
        if (samePath(target, this.options.defaultDirectory)) await rm(this.options.configFile, { force: true })
        else await persistConfig(this.options.configFile, { schemaVersion: CONFIG_SCHEMA_VERSION, dataDirectory: target })

        stores.ledger.setLocation(this.ledgerPath(target))
        stores.templates.setLocation(this.templatesPath(target))
        stores.assets.setLocation(this.assetsPath(target))
        this.currentDirectory = target
        this.configured = !samePath(target, this.options.defaultDirectory)
        this.startupError = undefined

        for (const oldPath of [this.ledgerPath(oldDirectory), this.templatesPath(oldDirectory), this.assetsPath(oldDirectory)]) {
          try { await rm(oldPath, { recursive: true, force: true }) } catch (error) { warnings.push(`could not remove ${oldPath}: ${error instanceof Error ? error.message : String(error)}`) }
        }
        await rm(stage, { recursive: true, force: true })
        return { ...(await this.status()), migrated: true, warnings }
      } catch (error) {
        await rm(stage, { recursive: true, force: true }).catch(() => undefined)
        // The pointer is the commit point. Before it changes, prepared target
        // files are safe to remove and the old directory remains authoritative.
        if (samePath(this.currentDirectory, oldDirectory)) {
          for (const path of [this.ledgerPath(target), this.templatesPath(target), this.assetsPath(target)]) {
            await rm(path, { recursive: true, force: true }).catch(() => undefined)
          }
        }
        throw error
      }
    })
  }
}

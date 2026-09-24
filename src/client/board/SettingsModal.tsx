/**
 * Board-settings modal (0.5.0): the user-owned defaults applied when a NEW
 * task is created without an explicit choice, plus the host data-directory
 * migration surface. Saving goes through host routes and
 * the SSE change stream refreshes every open view.
 *
 * @module dsh-taskboard/client/board/SettingsModal
 */
import { useEffect, useState } from 'react'
import type { BoardController } from '../controller.ts'
import { DEFAULT_DISPATCH_INTERVAL_MS, DEFAULT_ISOLATION, DEFAULT_MAX_CONCURRENT, DEFAULT_QUEUE_MAX_AGE_MINUTES, DEFAULT_SCHEDULE_MISSED_AFTER_MINUTES, defaultPermissionOf, defaultSyncExternalSessionsOf, dispatchIntervalMsOf, maxConcurrentOf, queueMaxAgeMinutesOf, scheduleMissedAfterMinutesOf, type IsolationMode, type PermissionMode } from '../../shared/protocol.ts'
import { useT, type Translate } from '../i18n/runtime.ts'

/** The isolation options with one-line hints (mirrors the task form; translated per render). */
const isolationOptions = (t: Translate): ReadonlyArray<{ value: IsolationMode; name: string; hint: string }> => [
  { value: 'none', name: t('form.iso.none'), hint: t('set.iso.noneHint') },
  { value: 'worktree', name: t('form.iso.worktree'), hint: t('set.iso.worktreeHint') },
]

/**
 * The 看板设置 modal: reads the live ledger settings, stages a local draft,
 * and writes back through the controller on save.
 * @param controller - the board controller.
 */
export function SettingsModal({ controller }: { controller: BoardController }) {
  const t = useT()
  const state = controller.getSnapshot()
  const currentIso = state.ledger.settings?.defaultIsolation ?? DEFAULT_ISOLATION
  const currentSync = defaultSyncExternalSessionsOf(state.ledger.settings)
  const currentPerm = defaultPermissionOf(state.ledger.settings)
  const currentMaxConcurrent = maxConcurrentOf(state.ledger.settings)
  const currentMissedAfterMinutes = scheduleMissedAfterMinutesOf(state.ledger.settings)
  const currentQueueMaxAgeMinutes = queueMaxAgeMinutesOf(state.ledger.settings)
  const currentDispatchIntervalMs = dispatchIntervalMsOf(state.ledger.settings)
  const [draftIso, setDraftIso] = useState<IsolationMode>(currentIso)
  const [draftSync, setDraftSync] = useState<boolean>(currentSync)
  const [draftPerm, setDraftPerm] = useState<PermissionMode>(currentPerm)
  const [draftMaxConcurrent, setDraftMaxConcurrent] = useState(String(currentMaxConcurrent))
  const [draftMissedAfterMinutes, setDraftMissedAfterMinutes] = useState(String(currentMissedAfterMinutes))
  const [draftQueueMaxAgeMinutes, setDraftQueueMaxAgeMinutes] = useState(String(currentQueueMaxAgeMinutes))
  const [draftDispatchIntervalMs, setDraftDispatchIntervalMs] = useState(String(currentDispatchIntervalMs))
  const [storagePath, setStoragePath] = useState(state.storage?.currentDirectory ?? '')
  const [storageTouched, setStorageTouched] = useState(false)
  const [storageBusy, setStorageBusy] = useState(false)
  const maxConcurrent = Number(draftMaxConcurrent)
  const missedAfterMinutes = Number(draftMissedAfterMinutes)
  const queueMaxAgeMinutes = Number(draftQueueMaxAgeMinutes)
  const dispatchIntervalMs = Number(draftDispatchIntervalMs)
  const scheduleValid = Number.isSafeInteger(maxConcurrent) && maxConcurrent >= 1 && maxConcurrent <= 100
    && Number.isSafeInteger(missedAfterMinutes) && missedAfterMinutes >= 1 && missedAfterMinutes <= 1440
    && Number.isSafeInteger(queueMaxAgeMinutes) && queueMaxAgeMinutes >= 0 && queueMaxAgeMinutes <= 10080
    && Number.isSafeInteger(dispatchIntervalMs) && dispatchIntervalMs >= 0 && dispatchIntervalMs <= 60000
  const dirty = draftIso !== currentIso || draftSync !== currentSync || draftPerm !== currentPerm
    || draftMaxConcurrent !== String(currentMaxConcurrent) || draftMissedAfterMinutes !== String(currentMissedAfterMinutes)
    || draftQueueMaxAgeMinutes !== String(currentQueueMaxAgeMinutes) || draftDispatchIntervalMs !== String(currentDispatchIntervalMs)
  const effectiveStoragePath = storagePath.trim().length === 0 ? state.storage?.defaultDirectory ?? '' : storagePath.trim()
  const storageDirty = state.storage !== undefined && effectiveStoragePath !== state.storage.currentDirectory

  useEffect(() => {
    if (!storageTouched && state.storage !== undefined) setStoragePath(state.storage.currentDirectory)
  }, [state.storage, storageTouched])

  const save = (): void => {
    void controller.updateSettings({
      defaultIsolation: draftIso,
      syncExternalSessions: draftSync,
      defaultPermission: draftPerm,
      maxConcurrent,
      scheduleMissedAfterMinutes: missedAfterMinutes,
      queueMaxAgeMinutes,
      dispatchIntervalMs,
    }).then(ok => {
      if (ok) controller.closeSettings()
    })
  }

  return (
    <div className="dsh-atb-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) controller.closeSettings() }}>
      <div className="dsh-atb-modal dsh-atb-set" role="dialog" aria-modal="true" aria-label={t('set.aria')}>
        <div className="dsh-atb-modal-head">
          <span className="dsh-atb-modal-headicon">🛠</span>
          <div className="dsh-atb-modal-headtext">
            <h3>{t('set.title')}</h3>
            <p>{t('set.subtitle')}</p>
          </div>
          <button type="button" className="dsh-atb-modal-close" aria-label={t('shared.close')} onClick={() => controller.closeSettings()}>✕</button>
        </div>

        <div className="dsh-atb-modal-body">
          <section className="dsh-atb-diag-sec">
            <h4>{t('set.iso.heading')}</h4>
            <div className="dsh-atb-mode-picker">
              {isolationOptions(t).map(o => (
                <button
                  key={o.value}
                  type="button"
                  className="dsh-atb-mode-opt"
                  data-on={draftIso === o.value}
                  title={o.hint}
                  onClick={() => setDraftIso(o.value)}
                >
                  <span className="dsh-atb-mode-name">{o.name}</span>
                  <span className="dsh-atb-mode-hint">{o.hint}</span>
                </button>
              ))}
            </div>
            <span className="dsh-atb-isolation-note">
              {t('set.iso.current', { current: currentIso === 'worktree' ? t('form.iso.worktree') : t('form.iso.none') })}
            </span>
          </section>

          <section className="dsh-atb-diag-sec">
            <h4>{t('set.sync.heading')}</h4>
            <div className="dsh-atb-mode-picker">
              <button
                type="button"
                className="dsh-atb-mode-opt"
                data-on={!draftSync}
                title={t('set.sync.off.title')}
                onClick={() => setDraftSync(false)}
              >
                <span className="dsh-atb-mode-name">{t('set.sync.off.name')}</span>
                <span className="dsh-atb-mode-hint">{t('set.sync.off.hint')}</span>
              </button>
              <button
                type="button"
                className="dsh-atb-mode-opt"
                data-on={draftSync}
                title={t('set.sync.on.title')}
                onClick={() => setDraftSync(true)}
              >
                <span className="dsh-atb-mode-name">{t('set.sync.on.name')}</span>
                <span className="dsh-atb-mode-hint">{t('set.sync.on.hint')}</span>
              </button>
            </div>
            <span className="dsh-atb-isolation-note">
              {currentSync
                ? t('set.sync.stateOn')
                : t('set.sync.stateOff')}
            </span>
          </section>

          <section className="dsh-atb-diag-sec">
            <h4>{t('set.perm.heading')}</h4>
            <div className="dsh-atb-perm-picker">
              <button
                type="button"
                className="dsh-atb-perm-opt"
                data-on={draftPerm === 'workspace-write'}
                onClick={() => setDraftPerm('workspace-write')}
              >
                <span className="dsh-atb-perm-name">{t('set.perm.writeName')}</span>
                <span className="dsh-atb-perm-hint">{t('set.perm.writeHint')}</span>
              </button>
              <button
                type="button"
                className="dsh-atb-perm-opt"
                data-on={draftPerm === 'read-only'}
                onClick={() => setDraftPerm('read-only')}
              >
                <span className="dsh-atb-perm-name">{t('set.perm.readOnlyName')}</span>
                <span className="dsh-atb-perm-hint">{t('set.perm.readOnlyHint')}</span>
              </button>
              <button
                type="button"
                className="dsh-atb-perm-opt"
                data-on={draftPerm === 'danger-full-access'}
                onClick={() => setDraftPerm('danger-full-access')}
              >
                <span className="dsh-atb-perm-name">{t('set.perm.fullName')}</span>
                <span className="dsh-atb-perm-hint">{t('set.perm.fullHint')}</span>
              </button>
            </div>
            <span className="dsh-atb-isolation-note">
              {t('set.perm.current', { current: currentPerm === 'read-only' ? t('set.perm.readOnlyName') : currentPerm === 'danger-full-access' ? t('set.perm.fullName') : t('set.perm.writeName') })}
            </span>
          </section>

          <section className="dsh-atb-diag-sec">
            <h4>{t('set.schedule.heading')}</h4>
            <p className="dsh-atb-isolation-note">{t('set.schedule.hint')}</p>
            <div className="dsh-atb-settings-numbers">
              <label>
                <span>{t('set.schedule.concurrent')}</span>
                <input className="dsh-atb-input" type="number" min="1" max="100" step="1" value={draftMaxConcurrent} onChange={e => setDraftMaxConcurrent(e.target.value)} />
              </label>
              <label>
                <span>{t('set.schedule.missedAfter')}</span>
                <input className="dsh-atb-input" type="number" min="1" max="1440" step="1" value={draftMissedAfterMinutes} onChange={e => setDraftMissedAfterMinutes(e.target.value)} />
              </label>
              <label>
                <span>{t('set.schedule.queueMaxAge')}</span>
                <input className="dsh-atb-input" type="number" min="0" max="10080" step="1" value={draftQueueMaxAgeMinutes} onChange={e => setDraftQueueMaxAgeMinutes(e.target.value)} />
              </label>
              <label>
                <span>{t('set.schedule.dispatchInterval')}</span>
                <input className="dsh-atb-input" type="number" min="0" max="60000" step="1" value={draftDispatchIntervalMs} onChange={e => setDraftDispatchIntervalMs(e.target.value)} />
              </label>
            </div>
            {!scheduleValid && <span className="dsh-atb-storage-error">{t('set.schedule.invalid')}</span>}
          </section>

          <section className="dsh-atb-diag-sec">
            <h4>{t('set.storage.heading')}</h4>
            <p className="dsh-atb-isolation-note">{t('set.storage.hint')}</p>
            <input
              className="dsh-atb-input dsh-atb-storage-path"
              value={storagePath}
              disabled={state.storage === undefined || storageBusy}
              placeholder={state.storage?.defaultDirectory ?? t('set.storage.loading')}
              onChange={e => { setStoragePath(e.target.value); setStorageTouched(true); controller.dismissStorageNotice() }}
            />
            {state.storageNotice !== undefined && (
              <div className="dsh-atb-storage-notice" role="status">
                <span className="dsh-atb-storage-notice-ok">✓ {t('set.storage.migrated', { path: state.storageNotice.path })}</span>
                {state.storageNotice.warnings.length > 0 && (
                  <span className="dsh-atb-storage-notice-warn">{t('set.storage.warnings', { warnings: state.storageNotice.warnings.join('; ') })}</span>
                )}
              </div>
            )}
            {state.storage !== undefined && (
              <div className="dsh-atb-storage-meta">
                <span>{t('set.storage.current', { path: state.storage.currentDirectory })}</span>
                <span>{t('set.storage.assets', { count: state.storage.assetCount, size: (state.storage.assetBytes / 1024 / 1024).toFixed(1) })}</span>
                {state.storage.error !== undefined && <span className="dsh-atb-storage-error">{state.storage.error}</span>}
              </div>
            )}
            <div className="dsh-atb-storage-actions">
              <button
                type="button"
                className="dsh-atb-btn"
                disabled={state.storage === undefined || storageBusy}
                onClick={() => { setStoragePath(state.storage?.defaultDirectory ?? ''); setStorageTouched(true) }}
              >
                {t('set.storage.default')}
              </button>
              <button
                type="button"
                className="dsh-atb-btn"
                disabled={state.storage === undefined || storageBusy || effectiveStoragePath.length === 0}
                onClick={() => {
                  setStorageBusy(true)
                  void controller.checkStorage(effectiveStoragePath).finally(() => setStorageBusy(false))
                }}
              >
                {t('set.storage.check')}
              </button>
              <button
                type="button"
                className="dsh-atb-btn"
                data-primary="true"
                disabled={!storageDirty || storageBusy}
                onClick={() => {
                  if (!window.confirm(t('set.storage.confirm', { from: state.storage?.currentDirectory ?? '', to: effectiveStoragePath }))) return
                  setStorageBusy(true)
                  void controller.migrateStorage(effectiveStoragePath).then(ok => {
                    if (ok) { setStorageTouched(false); setStoragePath(effectiveStoragePath) }
                  }).finally(() => setStorageBusy(false))
                }}
              >
                {storageBusy ? t('set.storage.migrating') : t('set.storage.migrate')}
              </button>
            </div>
          </section>
        </div>

        <div className="dsh-atb-modal-foot">
          <span className="dsh-atb-modal-hint">{dirty ? t('set.foot.dirty') : t('set.foot.clean')}</span>
          <span className="dsh-atb-modal-footbtns">
            <button type="button" className="dsh-atb-btn" onClick={() => controller.closeSettings()}>{t('shared.cancel')}</button>
            <button type="button" className="dsh-atb-btn" data-primary="true" disabled={!dirty || !scheduleValid} onClick={save}>{t('set.action.save')}</button>
          </span>
        </div>
      </div>
    </div>
  )
}

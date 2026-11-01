/**
 * The ledger-import modal (0.4.0): pick a JSON file → dry-run preview
 * (create / overwrite / invalid classification) → commit as merge or
 * replace. Replace swaps the WHOLE ledger after an automatic backup and a
 * double confirmation. Files exported by ⬇ JSON import as-is.
 *
 * @module dsh-taskboard/client/board/ImportModal
 */
import { useRef, useState } from 'react'
import type { BoardController } from '../controller.ts'
import type { ImportPreviewResponse } from '../../shared/api.ts'
import { useAlert } from './AlertModal.tsx'
import { useT } from '../i18n/runtime.ts'

/** One classified row (create / overwrite). */
function PlanRow({ row }: { row: { id: string; title: string; status: string } }) {
  return (
    <div className="dsh-atb-imp-row" title={row.id}>
      <span className="dsh-atb-imp-row-title">{row.title}</span>
      <span className="dsh-atb-imp-row-status">{row.status}</span>
    </div>
  )
}

/**
 * The import modal.
 * @param controller - the controller.
 */
export function ImportModal({ controller }: { controller: BoardController }) {
  const t = useT()
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState<unknown>(null)
  const [parseError, setParseError] = useState<string | undefined>(undefined)
  const [plan, setPlan] = useState<ImportPreviewResponse['plan'] | undefined>(undefined)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | undefined>(undefined)
  const [confirmReplace, setConfirmReplace] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  /** Pick sequence: a late read/preview may only land for the current file. */
  const loadSeq = useRef(0)
  const { alert: showAlert, el: alertEl } = useAlert()

  /** Read + parse the picked file, then dry-run the preview. */
  const onFile = (file: File | undefined): void => {
    const seq = ++loadSeq.current
    setPlan(undefined)
    setParseError(undefined)
    setResult(undefined)
    setConfirmReplace(false)
    setFileName('')
    setParsed(null)
    if (file === undefined) return
    void file.text().then(text => {
      // The user may have picked another file while this read was pending:
      // never let the older read replace the newer file's parsed payload.
      if (seq !== loadSeq.current) return
      try {
        const value: unknown = JSON.parse(text)
        setParsed(value)
        setFileName(file.name)
        void controller.importPreview(value).then(p => {
          // Previews can resolve out of order; only the current pick may set
          // the plan, otherwise Run would commit a file whose preview was
          // never shown (replace mode = whole-ledger swap).
          if (seq === loadSeq.current && p !== undefined) setPlan(p)
        })
      } catch {
        if (seq === loadSeq.current) setParseError(t('imp.parseError'))
      }
    })
  }

  /** Commit the import (replace requires the inline double confirmation). */
  const commit = (): void => {
    if (parsed === null || plan === undefined || busy) return
    if (mode === 'replace' && !confirmReplace) {
      setConfirmReplace(true)
      return
    }
    setBusy(true)
    void controller.importCommit(mode, parsed).then(r => {
      setBusy(false)
      setConfirmReplace(false)
      if (r === undefined) return
      setResult(r.mode === 'replace'
        ? t('imp.result.replace', { n: r.created + r.overwritten, total: r.replacedTotal ?? 0 })
        : t('imp.result.merge', { n: r.created, m: r.overwritten }))
    })
  }

  const close = (): void => controller.closeImport()

  return (
    <div className="dsh-atb-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) close() }}>
      <div className="dsh-atb-modal dsh-atb-imp" role="dialog" aria-modal="true" aria-label={t('imp.aria')}>
        <div className="dsh-atb-modal-head">
          <span className="dsh-atb-modal-headicon">⬆</span>
          <div className="dsh-atb-modal-headtext">
            <h3>{t('imp.title')}</h3>
            <p>{t('imp.subtitle')}</p>
          </div>
          <button type="button" className="dsh-atb-modal-close" aria-label={t('shared.close')} onClick={close}>✕</button>
        </div>
        <div className="dsh-atb-modal-body">
          <div className="dsh-atb-imp-picker">
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              onChange={e => onFile(e.target.files?.[0])}
            />
            {fileName.length > 0 && <span className="dsh-atb-imp-filename">{fileName}</span>}
          </div>
          <div className="dsh-atb-imp-note">{t('imp.note')}</div>

          {parseError !== undefined && <div className="dsh-atb-imp-error">{parseError}</div>}
          {plan === undefined && parseError === undefined && fileName.length > 0 && <div className="dsh-atb-empty2">{t('imp.previewing')}</div>}

          {plan !== undefined && (
            <>
              <div className="dsh-atb-imp-stats">
                <div className="dsh-atb-imp-stat" data-tone="ok"><b>{plan.create.length}</b><span>{t('imp.stat.create')}</span></div>
                <div className="dsh-atb-imp-stat" data-tone="warn"><b>{plan.overwrite.length}</b><span>{t('imp.stat.overwrite')}</span></div>
                <div className="dsh-atb-imp-stat" data-tone={plan.invalid.length > 0 ? 'bad' : undefined}><b>{plan.invalid.length}</b><span>{t('imp.stat.invalid')}</span></div>
              </div>

              {plan.create.length > 0 && (
                <div className="dsh-atb-imp-sec">
                  <h4>{t('imp.sec.create')}</h4>
                  <div className="dsh-atb-imp-list">{plan.create.map(r => <PlanRow key={r.id} row={r} />)}</div>
                </div>
              )}
              {plan.overwrite.length > 0 && (
                <div className="dsh-atb-imp-sec">
                  <h4>{t('imp.sec.overwrite')}</h4>
                  <div className="dsh-atb-imp-list">{plan.overwrite.map(r => <PlanRow key={r.id} row={r} />)}</div>
                </div>
              )}
              {plan.invalid.length > 0 && (
                <div className="dsh-atb-imp-sec">
                  <h4>{t('imp.sec.invalid')}</h4>
                  <div className="dsh-atb-imp-list">
                    {plan.invalid.map((r, i) => (
                      <div key={r.id ?? `invalid-${i}`} className="dsh-atb-imp-row" data-tone="bad" title={r.id ?? ''}>
                        <span className="dsh-atb-imp-row-title">{r.id ?? t('imp.noId')}</span>
                        <span className="dsh-atb-imp-row-status">{r.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="dsh-atb-mode-picker">
                <button type="button" className="dsh-atb-mode-opt" data-on={mode === 'merge'} onClick={() => { setMode('merge'); setConfirmReplace(false) }}>
                  <span className="dsh-atb-mode-name">{t('imp.mode.merge')}</span>
                  <span className="dsh-atb-mode-hint">{t('imp.mode.mergeHint')}</span>
                </button>
                <button type="button" className="dsh-atb-mode-opt" data-on={mode === 'replace'} onClick={() => setMode('replace')}>
                  <span className="dsh-atb-mode-name">{t('imp.mode.replace')}</span>
                  <span className="dsh-atb-mode-hint">{t('imp.mode.replaceHint')}</span>
                </button>
              </div>

              {result !== undefined && <div className="dsh-atb-imp-result">{result}</div>}
            </>
          )}
        </div>
        <div className="dsh-atb-modal-foot">
          <span className="dsh-atb-modal-hint">
            {mode === 'replace'
              ? confirmReplace ? t('imp.foot.replaceConfirm') : t('imp.foot.replaceNeedConfirm')
              : t('imp.foot.mergeHint')}
          </span>
          <span className="dsh-atb-modal-footbtns">
            <button type="button" className="dsh-atb-btn" onClick={close}>{result !== undefined ? t('shared.close') : t('shared.cancel')}</button>
            <button
              type="button"
              className="dsh-atb-btn"
              data-primary="true"
              data-danger={mode === 'replace' && confirmReplace ? 'true' : undefined}
              disabled={plan === undefined || busy}
              onClick={commit}
            >
              {mode === 'replace' && confirmReplace ? t('imp.action.confirmReplace') : t('imp.action.run')}
            </button>
          </span>
        </div>
      </div>
      {alertEl}
    </div>
  )
}

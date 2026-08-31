/**
 * Board-settings modal (0.5.0): the user-owned defaults applied when a NEW
 * task is created without an explicit choice. Currently one section — 默认执行
 * 隔离 (worktree vs original directory); further sections can slot into the
 * body below. Saving goes through the host route (whole-object replace) and
 * the SSE change stream refreshes every open view.
 *
 * @module dsh-taskboard/client/board/SettingsModal
 */
import { useState } from 'react'
import type { BoardController } from '../controller.ts'
import { DEFAULT_ISOLATION, defaultSyncExternalSessionsOf, type IsolationMode } from '../../shared/protocol.ts'

/** The isolation options with one-line hints (mirrors the task form). */
const ISOLATION_OPTIONS: ReadonlyArray<{ value: IsolationMode; name: string; hint: string }> = [
  { value: 'none', name: '📁 原目录执行', hint: '不使用 git，直接在项目目录工作（出厂默认）' },
  { value: 'worktree', name: '🌿 Worktree 隔离', hint: '每次执行在独立 worktree 分支上进行（task/标题+ID），互不污染' },
]

/**
 * The 看板设置 modal: reads the live ledger settings, stages a local draft,
 * and writes back through the controller on save.
 * @param controller - the board controller.
 */
export function SettingsModal({ controller }: { controller: BoardController }) {
  const state = controller.getSnapshot()
  const currentIso = state.ledger.settings?.defaultIsolation ?? DEFAULT_ISOLATION
  const currentSync = defaultSyncExternalSessionsOf(state.ledger.settings)
  const [draftIso, setDraftIso] = useState<IsolationMode>(currentIso)
  const [draftSync, setDraftSync] = useState<boolean>(currentSync)
  const dirty = draftIso !== currentIso || draftSync !== currentSync

  const save = (): void => {
    void controller.updateSettings({
      defaultIsolation: draftIso,
      syncExternalSessions: draftSync,
    }).then(ok => {
      if (ok) controller.closeSettings()
    })
  }

  return (
    <div className="dsh-atb-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) controller.closeSettings() }}>
      <div className="dsh-atb-modal dsh-atb-set" role="dialog" aria-modal="true" aria-label="看板设置">
        <div className="dsh-atb-modal-head">
          <span className="dsh-atb-modal-headicon">🛠</span>
          <div className="dsh-atb-modal-headtext">
            <h3>看板设置</h3>
            <p>新建任务与会话同步的全局默认值</p>
          </div>
          <button type="button" className="dsh-atb-modal-close" aria-label="关闭" onClick={() => controller.closeSettings()}>✕</button>
        </div>

        <div className="dsh-atb-modal-body">
          <section className="dsh-atb-diag-sec">
            <h4>默认执行隔离</h4>
            <div className="dsh-atb-mode-picker">
              {ISOLATION_OPTIONS.map(o => (
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
              当前保存的默认：{currentIso === 'worktree' ? '🌿 Worktree 隔离' : '📁 原目录执行'}。
              仅影响之后新建的任务；已有任务保持创建时的选择，非 git 项目运行时仍自动降级原目录。
            </span>
          </section>

          <section className="dsh-atb-diag-sec">
            <h4>自动同步工作区会话</h4>
            <div className="dsh-atb-mode-picker">
              <button
                type="button"
                className="dsh-atb-mode-opt"
                data-on={!draftSync}
                title="仅管理在任务看板中创建和触发的任务"
                onClick={() => setDraftSync(false)}
              >
                <span className="dsh-atb-mode-name">🚫 关闭同步</span>
                <span className="dsh-atb-mode-hint">仅管理看板任务（出厂默认）</span>
              </button>
              <button
                type="button"
                className="dsh-atb-mode-opt"
                data-on={draftSync}
                title="各工作区直接新建的会话也会在看板展示，运行中进入「进行中」，完成后自动进入「待验收」"
                onClick={() => setDraftSync(true)}
              >
                <span className="dsh-atb-mode-name">🔄 自动纳入会话</span>
                <span className="dsh-atb-mode-hint">跟踪运行并在完成后进入待验收</span>
              </button>
            </div>
            <span className="dsh-atb-isolation-note">
              {currentSync
                ? '已开启：工作区直接新建并执行的会话将自动在看板生成任务卡片，并在完成后流转至「待验收」列。'
                : '已关闭：仅在看板内部创建与触发执行的任务会出现在看板上。'}
            </span>
          </section>
        </div>

        <div className="dsh-atb-modal-foot">
          <span className="dsh-atb-modal-hint">{dirty ? '有未保存的修改' : '与看板当前设置一致'}</span>
          <span className="dsh-atb-modal-footbtns">
            <button type="button" className="dsh-atb-btn" onClick={() => controller.closeSettings()}>取消</button>
            <button type="button" className="dsh-atb-btn" data-primary="true" disabled={!dirty} onClick={save}>保存设置</button>
          </span>
        </div>
      </div>
    </div>
  )
}

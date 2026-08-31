/**
 * The template-manager modal (0.4.0): rename / delete / use the stored task
 * templates. Templates live host-side (side file next to the ledger) and
 * prefill the create form from the + 新建任务 ▼ dropdown.
 *
 * @module dsh-taskboard/client/board/TemplateManager
 */
import { useState } from 'react'
import type { BoardController } from '../controller.ts'
import { useAlert } from './AlertModal.tsx'

/**
 * The template manager modal.
 * @param controller - the controller.
 */
export function TemplateManager({ controller }: { controller: BoardController }) {
  const state = controller.getSnapshot()
  const [edits, setEdits] = useState<Record<string, string>>({})
  const [confirmId, setConfirmId] = useState<string | undefined>(undefined)
  const { alert: showAlert, el: alertEl } = useAlert()

  const close = (): void => controller.closeTemplateManager()

  const nameOf = (id: string, fallback: string): string => edits[id] ?? fallback

  /** Save one template's rename. */
  const save = (id: string, name: string): void => {
    const template = state.templates.find(t => t.id === id)
    if (template === undefined || name === template.name) return
    void controller.upsertTemplate({ id, name, task: template.task }).then(ok => {
      if (ok) {
        setEdits(prev => { const next = { ...prev }; delete next[id]; return next })
        showAlert('模板已改名')
      }
    })
  }

  return (
    <div className="dsh-atb-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) close() }}>
      <div className="dsh-atb-modal dsh-atb-tplm" role="dialog" aria-modal="true" aria-label="管理模板">
        <div className="dsh-atb-modal-head">
          <span className="dsh-atb-modal-headicon">⌗</span>
          <div className="dsh-atb-modal-headtext">
            <h3>任务模板</h3>
            <p>新建任务 ▼ 下拉的模板：改名 / 删除 / 直接使用；任务详情页「存为模板」可新增</p>
          </div>
          <button type="button" className="dsh-atb-modal-close" aria-label="关闭" onClick={close}>✕</button>
        </div>
        <div className="dsh-atb-modal-body">
          {state.templates.length === 0
            ? <div className="dsh-atb-empty2">暂无模板 — 在任务详情页点「存为模板」把常用配置沉淀下来</div>
            : (
                <div className="dsh-atb-tplm-list">
                  {state.templates.map(t => (
                    <div key={t.id} className="dsh-atb-tplm-row">
                      <input
                        className="dsh-atb-tplm-name"
                        value={nameOf(t.id, t.name)}
                        maxLength={60}
                        spellCheck={false}
                        aria-label={`模板名 ${t.name}`}
                        onChange={e => setEdits(prev => ({ ...prev, [t.id]: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') save(t.id, nameOf(t.id, t.name))
                        }}
                      />
                      <span
                        className="dsh-atb-tplm-meta"
                        title={`${t.builtin === true ? '内置' : '自建'}${t.task.checklist !== undefined && t.task.checklist.length > 0 ? ` · 清单 ${t.task.checklist.length} 项` : ''}${t.task.urgency !== undefined ? ` · ${t.task.urgency}` : ''}${t.task.permission !== undefined ? ` · 权限: ${t.task.permission}` : ''}`}
                      >
                        {t.builtin === true ? '内置' : '自建'}
                        {t.task.checklist !== undefined && t.task.checklist.length > 0 ? ` · 清单 ${t.task.checklist.length} 项` : ''}
                        {t.task.urgency !== undefined ? ` · ${t.task.urgency}` : ''}
                        {t.task.permission !== undefined && t.task.permission !== 'workspace-write' ? ` · ${t.task.permission === 'read-only' ? '仅查看' : '全权限'}` : ''}
                      </span>
                      <span className="dsh-atb-tplm-btns">
                        <button
                          type="button"
                          className="dsh-atb-btn"
                          disabled={nameOf(t.id, t.name) === t.name || nameOf(t.id, t.name).trim().length === 0}
                          title="保存改名"
                          onClick={() => save(t.id, nameOf(t.id, t.name))}
                        >
                          改名
                        </button>
                        <button
                          type="button"
                          className="dsh-atb-btn"
                          title="用此模板打开新建表单"
                          onClick={() => {
                            close()
                            controller.newFromTemplate(t.task)
                          }}
                        >
                          用此新建
                        </button>
                        {confirmId === t.id
                          ? (
                            <>
                              <button type="button" className="dsh-atb-btn" data-danger="true" onClick={() => { void controller.deleteTemplate(t.id); setConfirmId(undefined) }}>确认删除</button>
                              <button type="button" className="dsh-atb-btn" onClick={() => setConfirmId(undefined)}>取消</button>
                            </>
                          )
                          : (
                              <button type="button" className="dsh-atb-btn" data-danger="true" title="删除该模板" onClick={() => setConfirmId(t.id)}>
                                🗑
                              </button>
                            )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
        </div>
        <div className="dsh-atb-modal-foot">
          <span className="dsh-atb-modal-hint">模板随台账一同保存在 DSH 主目录，升级不丢</span>
          <span className="dsh-atb-modal-footbtns">
            <button type="button" className="dsh-atb-btn" onClick={close}>关闭</button>
          </span>
        </div>
      </div>
      {alertEl}
    </div>
  )
}

/**
 * The task form modal — create and edit in one polished dialog: header with
 * icon / subtitle / close, a sectioned field grid (title, project, model,
 * urgency tri-picker with hints, description, prompt, execution-mode
 * segmented picker, cron with presets and a live next-run preview), and a
 * footer bar carrying the validation hint and the actions. Esc closes;
 * the title input is focused on open.
 *
 * @module dsh-taskboard/client/board/TaskFormModal
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BoardController } from '../controller.ts'
import type { TaskTemplateSpec } from '../../shared/api.ts'
import type { ChecklistItem, IsolationMode, PermissionMode, TaskRecord, Urgency } from '../../shared/protocol.ts'
import { MAX_CHECKLIST_ITEMS, asPermission, defaultIsolationOf, defaultPermissionOf, nextCronTime, parseCron } from '../../shared/protocol.ts'
import { fmtTime } from './format.ts'
import { SlashPromptInput } from './SlashPromptInput.tsx'

/** One row of the configured model catalog (from llm.models). */
export interface CatalogModel {
  provider: string
  model: string
  name?: string
  reasoning?: {
    efforts: Array<{ id: string; name: string; description?: string }>
    defaultEffort?: string
  }
}

/** Local storage key for remembering the last selected model in create mode. */
export const LAST_MODEL_KEY = 'dsh-taskboard-last-model-v1'

/** Read the remembered model from localStorage. */
export function loadLastModel(): { provider: string; model: string; reasoningEffort?: string } | undefined {
  try {
    const raw = localStorage.getItem(LAST_MODEL_KEY)
    if (raw === null) return undefined
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed === 'object' && parsed !== null) {
      const { provider, model, reasoningEffort } = parsed as { provider?: unknown; model?: unknown; reasoningEffort?: unknown }
      if (typeof provider === 'string' && typeof model === 'string' && provider.trim().length > 0 && model.trim().length > 0) {
        return {
          provider: provider.trim(),
          model: model.trim(),
          ...(typeof reasoningEffort === 'string' && reasoningEffort.trim().length > 0 ? { reasoningEffort: reasoningEffort.trim() } : {}),
        }
      }
    }
    return undefined
  } catch {
    return undefined
  }
}

/** Save the remembered model to localStorage. */
export function saveLastModel(model?: { provider: string; model: string; reasoningEffort?: string }): void {
  try {
    if (model === undefined) {
      localStorage.removeItem(LAST_MODEL_KEY)
    } else {
      localStorage.setItem(LAST_MODEL_KEY, JSON.stringify(model))
    }
  } catch { /* storage unavailable */ }
}

/** Urgency segmented options with a one-line hint each. */
const URGENCY_OPTIONS: ReadonlyArray<{ value: Urgency; label: string; hint: string }> = [
  { value: 'urgent', label: '紧急', hint: '优先处理' },
  { value: 'normal', label: '一般', hint: '正常排期' },
  { value: 'relaxed', label: '不急', hint: '有空再做' },
]

/** Cron presets offered in the scheduled mode. */
const CRON_PRESETS: ReadonlyArray<{ label: string; cron: string }> = [
  { label: '每天 09:00', cron: '0 9 * * *' },
  { label: '每小时', cron: '0 * * * *' },
  { label: '每 10 分钟', cron: '*/10 * * * *' },
  { label: '每周一 09:00', cron: '0 9 * * 1' },
]

/** Permission presets aligned with DSH. */
const PERMISSION_OPTIONS: ReadonlyArray<{ value: PermissionMode; label: string; hint: string; icon: string }> = [
  { value: 'workspace-write', label: '可写入工作区', hint: '可读写工作区及临时目录（推荐默认）', icon: '📁' },
  { value: 'read-only', label: '仅可查看', hint: '只读查看与检索，禁止修改文件或执行外部命令', icon: '🔒' },
  { value: 'danger-full-access', label: '完全权限', hint: '完全无限制权限，可访问全盘及执行外部命令', icon: '⚡' },
]

/** Field shell: label + control, optionally spanning the full grid row. */
function Field({ label, required = false, full = false, children }: {
  label: string
  required?: boolean
  full?: boolean
  children: ReactNode
}) {
  return (
    <label className="dsh-atb-field" data-span={full ? 'full' : undefined}>
      <span className="dsh-atb-field-label">
        {label}
        {required && <em className="dsh-atb-req">*</em>}
      </span>
      {children}
    </label>
  )
}

/** One editable checklist row (create: fresh unchecked; edit: preserved ids/flags). */
interface CheckRow {
  id?: string
  text: string
  checked: boolean
  checkedBy?: string
  checkedAt?: number
  note?: string
}

/**
 * The checklist (DoD) editor: toggle + text + remove per row, add button,
 * cap-enforced. Edit mode preserves checked state and notes (the GUI
 * replaces the whole list on save).
 */
function ChecklistEditor({ rows, onChange, editing }: { rows: CheckRow[]; onChange: (rows: CheckRow[]) => void; editing: boolean }) {
  const setRow = (index: number, patch: Partial<CheckRow>): void => {
    const next = rows.map((row, i) => i === index ? { ...row, ...patch } : row)
    onChange(next)
  }
  const checked = rows.filter(r => r.checked).length
  return (
    <div className="dsh-atb-cke">
      {rows.map((row, index) => (
        <div key={row.id ?? `new-${index}`} className="dsh-atb-cke-row">
          {editing && (
            <input
              type="checkbox"
              className="dsh-atb-cke-box"
              checked={row.checked}
              title={`勾选状态随保存保留（当前勾选人：${row.checkedBy ?? '未勾选'}）`}
              onChange={e => setRow(index, { checked: e.target.checked })}
            />
          )}
          <input
            className="dsh-atb-cke-text"
            value={row.text}
            maxLength={200}
            placeholder={`验收项 ${index + 1}（完成标准）`}
            spellCheck={false}
            onChange={e => setRow(index, { text: e.target.value })}
          />
          <button type="button" className="dsh-atb-cke-del" title="删除该验收项" onClick={() => onChange(rows.filter((_, i) => i !== index))}>✕</button>
        </div>
      ))}
      {rows.length < MAX_CHECKLIST_ITEMS && (
        <button type="button" className="dsh-atb-cke-add" onClick={() => onChange([...rows, { text: '', checked: false }])}>＋ 添加验收项</button>
      )}
      {rows.length > 0 && (
        <span className="dsh-atb-cke-hint">{editing ? `已勾选 ${checked}/${rows.length}（保存将整体覆盖清单，勾选状态保留）` : `共 ${rows.length} 项，执行会话按清单干活并逐项勾选，未完成项验收时高亮`}</span>
      )}
    </div>
  )
}

/**
 * The form modal. Without `task` it composes a new task (optionally
 * prefilled from a chosen template); with `task` it edits that record
 * (project, urgency, execution, model included — the GUI is the owner
 * surface).
 * @param controller - the controller.
 * @param task - the task being edited (create mode when absent).
 */
export function TaskFormModal({ controller, task }: { controller: BoardController; task?: TaskRecord }) {
  const state = controller.getSnapshot()
  const prefill: TaskTemplateSpec | undefined = state.templatePrefill
  const editing = task !== undefined
  const [title, setTitle] = useState(task?.title ?? prefill?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? prefill?.description ?? '')
  const [prompt, setPrompt] = useState(task?.prompt ?? prefill?.prompt ?? '')
  const [workspaceId, setWorkspaceId] = useState(task?.workspaceId ?? state.filters.workspaceId ?? state.workspaces[0]?.id ?? '')
  const [urgency, setUrgency] = useState<Urgency>(task?.urgency ?? (prefill?.urgency === 'urgent' || prefill?.urgency === 'relaxed' ? prefill.urgency : 'normal'))
  const [mode, setMode] = useState<'claim' | 'scheduled'>(task?.execution.mode === 'scheduled' || prefill?.execution?.mode === 'scheduled' ? 'scheduled' : 'claim')
  const [cron, setCron] = useState(task?.execution.cron ?? prefill?.execution?.cron ?? '0 9 * * *')
  const [catalog, setCatalog] = useState<CatalogModel[]>([])

  // Model & reasoning effort selection:
  // In create mode (when not pinned by template), prefill from remembered last choice.
  const initialModel = task?.model ?? prefill?.model ?? (!editing ? loadLastModel() : undefined)
  const [model, setModel] = useState(initialModel !== undefined ? JSON.stringify({ provider: initialModel.provider, model: initialModel.model }) : '')
  const [reasoningEffort, setReasoningEffort] = useState(initialModel?.reasoningEffort ?? '')
  // Preset roster (0.3.3): create mode PRE-SELECTS the deployment default
  // (标准模式 in this deployment); '' = 跟随部署默认 (submit omits the field).
  const initialPreset = task?.presetId ?? prefill?.presetId ?? ''
  const [presetId, setPresetId] = useState(initialPreset)
  const [presets, setPresets] = useState<Array<{ id: string; name?: string }>>([])
  const [presetDefault, setPresetDefault] = useState<string | undefined>(undefined)
  // Permission preset (0.5.5): 'workspace-write' (default) | 'read-only' | 'danger-full-access'
  const [permission, setPermission] = useState<PermissionMode>(
    task?.permission ?? (prefill?.permission ? asPermission(prefill.permission) : defaultPermissionOf(state.ledger.settings)),
  )
  // Isolation toggle: create mode starts from the board setting (0.5.0
  // 看板设置 → 默认执行隔离) or the template's choice; edit mode starts from
  // the task and locks once execution began.
  const [isolation, setIsolation] = useState<IsolationMode>(task?.isolation ?? (prefill?.isolation === 'none' ? 'none' : prefill?.isolation === 'worktree' ? 'worktree' : defaultIsolationOf(state.ledger.settings)))
  // Checklist (0.4.0): create = template texts / blank rows; edit = live items.
  const [checkRows, setCheckRows] = useState<CheckRow[]>(
    task?.checklist !== undefined && task.checklist.length > 0
      ? task.checklist.map(i => ({ ...i }))
      : (prefill?.checklist ?? []).map(text => ({ text, checked: false })),
  )
  const titleRef = useRef<HTMLInputElement>(null)
  // One in-flight write at a time: the foot buttons disable while a
  // create/update/run round-trip is pending — a double click used to fire
  // duplicate creates (and runs) before the first one returned (review P0).
  const [busy, setBusy] = useState(false)

  // Focus the title and close on Esc while the dialog is open.
  useEffect(() => {
    titleRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') controller.closeForm()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [controller])

  // Model catalog: query runtime or fallback to host API
  useEffect(() => {
    void controller.fetchModelCatalog().then(setCatalog).catch(() => setCatalog([]))
  }, [controller])

  // Preset roster: query runtime or fallback to host API; pre-select the deployment default in
  // create mode (unless a template pinned one) so executions run with a
  // real tool set out of the box.
  useEffect(() => {
    void controller.fetchPresetCatalog().then(roster => {
      setPresets(roster.presets)
      setPresetDefault(roster.defaultId)
      // CREATE mode only (review P1): pre-selecting in edit mode would
      // silently pin the deployment default onto tasks that deliberately
      // follow it. In create mode `task` is undefined, so checking
      // `initialPreset` (template pin) alone is sufficient.
      if (!editing && initialPreset === '' && roster.defaultId !== undefined) setPresetId(roster.defaultId)
    }).catch(() => setPresets([]))
  }, [controller, editing, task?.presetId, initialPreset])

  // Live cron validation + next-run preview (same math as the host).
  const cronMatch = mode === 'scheduled' ? parseCron(cron.trim()) : null
  const nextRun = cronMatch !== null ? nextCronTime(cronMatch, Date.now()) : null
  const cronBad = mode === 'scheduled' && (cronMatch === null || nextRun === null)
  const valid = title.trim().length > 0 && workspaceId !== '' && !cronBad

  // A task already in progress cannot be run again (host rejects it).
  const runBlocked = editing && task.status === 'in_progress'

  // Isolation editability: locked once the task has execution history (the
  // branch and its baseline depend on the choice — plan §3.1).
  const isolationLocked = editing && ((task.executions?.length ?? 0) > 0 || task.status === 'in_progress')
  const gitOk = controller.gitAvailable(workspaceId)
  // Non-git project: the worktree option is disabled; submitting keeps the
  // default (runtime auto-degrades with a note) instead of persisting 'none'.
  const isolationDisabled = isolationLocked || !gitOk

  /**
   * Isolation payload for submit: undefined lets the HOST materialize the
   * current board default at creation (non-git projects degrade naturally).
   */
  const isolationPayload = (): string | undefined => {
    if (!gitOk) return undefined
    return isolation
  }

  /** Preset payload: '' = follow the deployment default (submit omits). */
  const presetPayload = (): string | undefined => (presetId.trim().length > 0 ? presetId.trim() : undefined)

  /** Checklist rows with non-empty text (blank rows are dropped on submit). */
  const filledRows = (): CheckRow[] => checkRows.map(r => ({ ...r, text: r.text.trim() })).filter(r => r.text.length > 0)

  const parsedModel = model !== '' ? (JSON.parse(model) as { provider: string; model: string }) : undefined
  const currentCatalogModel = parsedModel !== undefined ? catalog.find(m => m.provider === parsedModel.provider && m.model === parsedModel.model) : undefined
  const modelReasoning = currentCatalogModel?.reasoning

  const buildPickedModel = (): { provider: string; model: string; reasoningEffort?: string } | undefined => {
    if (parsedModel === undefined) return undefined
    const eff = reasoningEffort.trim()
    return {
      provider: parsedModel.provider,
      model: parsedModel.model,
      ...(eff.length > 0 ? { reasoningEffort: eff } : {}),
    }
  }

  const submit = (): void => {
    if (!valid || busy) return
    const picked = buildPickedModel()
    if (!editing) saveLastModel(picked)
    const isolationOut = isolationPayload()
    const presetOut = presetPayload()
    const rows = filledRows()
    setBusy(true)
    const action = editing
      ? controller.update(task.id, task.version, {
        title,
        description,
        prompt,
        urgency,
        workspaceId,
        execution: mode === 'scheduled' ? { mode, cron: cron.trim() } : { mode },
        // '' in edit mode clears the pinned model back to the default.
        model: picked ?? null,
        ...(isolationOut !== undefined && !isolationLocked ? { isolation: isolationOut } : {}),
        presetId: presetOut ?? null,
        permission,
        // [] clears the checklist (host deletes the field on empty).
        checklist: rows.length > 0 ? rows : null,
      })
      : controller.create({
        title,
        workspaceId,
        urgency,
        description: description.length > 0 ? description : undefined,
        prompt: prompt.length > 0 ? prompt : undefined,
        execution: mode === 'scheduled' ? { mode, cron: cron.trim() } : { mode },
        model: picked,
        ...(isolationOut !== undefined ? { isolation: isolationOut } : {}),
        ...(presetOut !== undefined ? { presetId: presetOut } : {}),
        permission,
        ...(rows.length > 0 ? { checklist: rows.map(r => r.text) } : {}),
      })
    void action.catch(() => undefined).finally(() => setBusy(false))
  }

  /** Save the form, then immediately trigger a manual run of the task. */
  const submitAndRun = (): void => {
    if (!valid || runBlocked || busy) return
    const picked = buildPickedModel()
    if (!editing) saveLastModel(picked)
    const isolationOut = isolationPayload()
    const presetOut = presetPayload()
    const rows = filledRows()
    setBusy(true)
    void (async () => {
      if (editing) {
        const saved = await controller.update(task.id, task.version, {
          title,
          description,
          prompt,
          urgency,
          workspaceId,
          execution: mode === 'scheduled' ? { mode, cron: cron.trim() } : { mode },
          model: picked ?? null,
          ...(isolationOut !== undefined && !isolationLocked ? { isolation: isolationOut } : {}),
          presetId: presetOut ?? null,
          permission,
          checklist: rows.length > 0 ? rows : null,
        })
        if (saved) await controller.run(task.id)
      } else {
        const id = await controller.create({
          title,
          workspaceId,
          urgency,
          description: description.length > 0 ? description : undefined,
          prompt: prompt.length > 0 ? prompt : undefined,
          execution: mode === 'scheduled' ? { mode, cron: cron.trim() } : { mode },
          model: picked,
          ...(isolationOut !== undefined ? { isolation: isolationOut } : {}),
          ...(presetOut !== undefined ? { presetId: presetOut } : {}),
          permission,
          ...(rows.length > 0 ? { checklist: rows.map(r => r.text) } : {}),
        })
        if (id !== undefined) await controller.run(id)
      }
    })().catch(() => undefined).finally(() => setBusy(false))
  }

  const hint = !valid
    ? (title.trim().length === 0 ? '请填写标题' : workspaceId === '' ? '请选择项目' : 'Cron 表达式无效（分 时 日 月 周）')
    : mode === 'scheduled' && nextRun !== null
      ? `下次运行 ${fmtTime(nextRun)}`
      : editing
        ? `保存后版本 v${task.version} → v${task.version + 1}`
        : '创建后项目内会话可认领执行'

  return (
    <div className="dsh-atb-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) controller.closeForm() }}>
      <div className="dsh-atb-modal dsh-atb-taskform-modal" data-mode={editing ? 'edit' : 'create'} role="dialog" aria-modal="true" aria-label={editing ? '编辑任务' : '新建任务'}>
        <div className="dsh-atb-modal-head">
          <span className="dsh-atb-modal-headicon">{editing ? '✎' : '✚'}</span>
          <div className="dsh-atb-modal-headtext">
            <h3>{editing ? '编辑任务' : '新建任务'}</h3>
            <p>{editing ? '调整任务内容与执行配置' : '推入看板，项目内会话可认领执行'}</p>
          </div>
          <button type="button" className="dsh-atb-modal-close" aria-label="关闭" onClick={() => controller.closeForm()}>✕</button>
        </div>

        <div className="dsh-atb-modal-body dsh-atb-taskform-body">
          {/* Left Column: Core Fields & Execution Configurations */}
          <div className="dsh-atb-form-col dsh-atb-form-left">
            <Field label="标题" required full>
              <input ref={titleRef} value={title} onChange={e => setTitle(e.target.value)} placeholder="一句话说清要做什么" maxLength={200} />
            </Field>

            <div className="dsh-atb-form-subgrid">
              <Field label="项目" required>
                <select value={workspaceId} onChange={e => setWorkspaceId(e.target.value)}>
                  {state.workspaces.map(ws => <option key={ws.id} value={ws.id}>{ws.title || ws.path}</option>)}
                </select>
              </Field>

              <Field label="模型（默认 = 会话默认模型）">
                <select
                  value={model}
                  onChange={e => {
                    const val = e.target.value
                    setModel(val)
                    if (val === '') {
                      setReasoningEffort('')
                    } else {
                      const pm = JSON.parse(val) as { provider: string; model: string }
                      const cm = catalog.find(m => m.provider === pm.provider && m.model === pm.model)
                      if (cm?.reasoning?.defaultEffort !== undefined) {
                        setReasoningEffort(cm.reasoning.defaultEffort)
                      } else {
                        setReasoningEffort('')
                      }
                    }
                  }}
                >
                  <option value="">默认模型</option>
                  {catalog.map(m => (
                    <option key={`${m.provider}/${m.model}`} value={JSON.stringify({ provider: m.provider, model: m.model })}>
                      {m.name ?? m.model}（{m.provider}）
                    </option>
                  ))}
                </select>
              </Field>

              {parsedModel !== undefined && (
                <Field label="思考强度（Reasoning Effort）">
                  <select
                    value={reasoningEffort}
                    onChange={e => setReasoningEffort(e.target.value)}
                    title="设置模型的思考强度（如 low/medium/high）；默认 = 跟随模型/提供商默认"
                  >
                    <option value="">跟随模型默认{modelReasoning?.defaultEffort !== undefined ? `（当前：${modelReasoning.efforts.find(ef => ef.id === modelReasoning.defaultEffort)?.name ?? modelReasoning.defaultEffort}）` : ''}</option>
                    {modelReasoning !== undefined && modelReasoning.efforts.length > 0 ? (
                      modelReasoning.efforts.map(eff => (
                        <option key={eff.id} value={eff.id}>
                          {eff.name}{eff.description ? ` (${eff.description})` : ''}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="low">低 (low)</option>
                        <option value="medium">中 (medium)</option>
                        <option value="high">高 (high)</option>
                        <option value="none">关闭思考 (none)</option>
                      </>
                    )}
                  </select>
                </Field>
              )}

              {presets.length > 0 && (
                <Field label="执行模式（preset）">
                  <select value={presetId} onChange={e => setPresetId(e.target.value)} title="执行会话按该 preset 组合（决定工具集与人设）；默认 = 部署默认 preset">
                    <option value="">跟随部署默认{presetDefault !== undefined ? `（当前：${presets.find(p => p.id === presetDefault)?.name ?? presetDefault}）` : ''}</option>
                    {presets.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name ?? p.id}{p.id === presetDefault ? '（部署默认）' : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>

            <Field label="紧急度" full>
              <div className="dsh-atb-urgency-picker">
                {URGENCY_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    type="button"
                    className="dsh-atb-urgency-opt"
                    data-urgency={o.value}
                    data-on={urgency === o.value}
                    onClick={() => setUrgency(o.value)}
                  >
                    <span className="dsh-atb-urgency-name"><span className="dsh-atb-dot" data-urgency={o.value} />{o.label}</span>
                    <span className="dsh-atb-urgency-hint">{o.hint}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="执行权限" full>
              <div className="dsh-atb-perm-picker">
                {PERMISSION_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className="dsh-atb-perm-opt"
                    data-on={permission === opt.value}
                    onClick={() => setPermission(opt.value)}
                  >
                    <span className="dsh-atb-perm-name">{opt.icon} {opt.label}{opt.value === 'workspace-write' ? '（默认）' : ''}</span>
                    <span className="dsh-atb-perm-hint">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="执行方式" full>
              <div className="dsh-atb-mode-picker">
                <button type="button" className="dsh-atb-mode-opt" data-on={mode === 'claim'} onClick={() => setMode('claim')}>
                  <span className="dsh-atb-mode-name">🤝 认领制</span>
                  <span className="dsh-atb-mode-hint">项目内会话认领</span>
                </button>
                <button type="button" className="dsh-atb-mode-opt" data-on={mode === 'scheduled'} onClick={() => setMode('scheduled')}>
                  <span className="dsh-atb-mode-name">⏰ 定时执行</span>
                  <span className="dsh-atb-mode-hint">到点自动开跑</span>
                </button>
              </div>
            </Field>

            {mode === 'scheduled' && (
              <Field label="Cron 表达式" required full>
                <input
                  className={cronBad ? 'dsh-atb-input-bad' : undefined}
                  value={cron}
                  onChange={e => setCron(e.target.value)}
                  placeholder="分 时 日 月 周"
                  spellCheck={false}
                />
                <span className="dsh-atb-cron-presets">
                  {CRON_PRESETS.map(p => (
                    <button
                      key={p.cron}
                      type="button"
                      className="dsh-atb-cron-preset"
                      data-on={cron.trim() === p.cron}
                      onClick={() => setCron(p.cron)}
                    >
                      {p.label}
                    </button>
                  ))}
                  {!cronBad && nextRun !== null && <span className="dsh-atb-cron-next">下次 {fmtTime(nextRun)}</span>}
                </span>
              </Field>
            )}

            <Field label="执行隔离" full>
              <div className="dsh-atb-mode-picker" data-disabled={isolationDisabled ? 'true' : undefined}>
                <button
                  type="button"
                  className="dsh-atb-mode-opt"
                  data-on={isolation === 'worktree'}
                  disabled={isolationDisabled}
                  title={isolationLocked ? '任务已有执行记录，隔离方式已锁定' : !gitOk ? '当前项目非 git 仓库' : '每次执行在独立 worktree 分支上进行'}
                  onClick={() => setIsolation('worktree')}
                >
                  <span className="dsh-atb-mode-name">🌿 Worktree 隔离</span>
                  <span className="dsh-atb-mode-hint">
                    {isolationLocked ? '已锁定（执行开始后不可更改）' : !gitOk ? '当前项目非 git 仓库' : '独立分支 task/标题+ID，互不污染'}
                  </span>
                </button>
                <button
                  type="button"
                  className="dsh-atb-mode-opt"
                  data-on={isolation === 'none'}
                  disabled={isolationDisabled}
                  title={isolationLocked ? '任务已有执行记录，隔离方式已锁定' : '直接在项目目录执行（不使用 git）'}
                  onClick={() => setIsolation('none')}
                >
                  <span className="dsh-atb-mode-name">📁 原目录执行</span>
                  <span className="dsh-atb-mode-hint">{isolationLocked ? '已锁定（执行开始后不可更改）' : !gitOk ? '当前项目非 git 仓库，将在原目录执行' : '不使用 git，直接在项目目录工作'}</span>
                </button>
              </div>
              {!gitOk && !isolationLocked && (
                <span className="dsh-atb-isolation-note">当前项目非 git 仓库，将在原目录执行（任务仍按默认配置创建，运行时自动降级）</span>
              )}
            </Field>

            <Field label={editing ? '验收清单（DoD）' : '验收清单（DoD，可选）'} full>
              <ChecklistEditor rows={checkRows} onChange={setCheckRows} editing={editing} />
            </Field>
          </div>

          {/* Right Column: Description & Execution Prompt */}
          <div className="dsh-atb-form-col dsh-atb-form-right">
            <Field label={editing ? '描述' : '描述（可选）'} full>
              <SlashPromptInput
                value={description}
                onChange={setDescription}
                controller={controller}
                rows={7}
                placeholder="需求细节、背景说明、验收标准…"
              />
            </Field>

            <Field label={editing ? '执行 Prompt（实际 Prompt = 标题+任务描述+Prompt）' : '执行 Prompt（可选；实际 Prompt = 标题+任务描述+Prompt）'} full>
              <SlashPromptInput
                value={prompt}
                onChange={setPrompt}
                controller={controller}
                rows={7}
                placeholder={'追加在「标题+任务描述」之后发给执行会话的补充指令。支持模板变量：{{lastExecution}}（上次执行结果）、{{lastComments}}（最近 3 条评论）'}
              />
            </Field>
          </div>
        </div>

        <div className="dsh-atb-modal-foot">
          <span className="dsh-atb-modal-hint" data-tone={valid ? undefined : 'bad'}>{hint}</span>
          <span className="dsh-atb-modal-footbtns">
            <button type="button" className="dsh-atb-btn" onClick={() => controller.closeForm()}>取消</button>
            <button
              type="button"
              className="dsh-atb-btn"
              disabled={!valid || runBlocked || busy}
              title={runBlocked ? '任务正在执行中，不能重复发起' : busy ? '正在提交…' : '保存后立即发起执行（新会话）'}
              onClick={submitAndRun}
            >
              ⚡ 立即执行
            </button>
            <button type="button" className="dsh-atb-btn" data-primary="true" disabled={!valid || busy} onClick={submit}>
              {editing ? '保存修改' : '创建任务'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}

/** The record shape this form edits (narrow structural type to avoid a value import). */
interface TaskRecordLike {
  id: string
  version: number
  status?: string
  title: string
  description: string
  prompt: string
  workspaceId: string
  urgency: Urgency
  execution: { mode: 'claim' | 'scheduled'; cron?: string }
  model?: { provider: string; model: string; reasoningEffort?: string }
  isolation?: IsolationMode
  presetId?: string
  checklist?: ChecklistItem[]
  executions?: unknown[]
}

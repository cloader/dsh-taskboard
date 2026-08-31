/**
 * SlashPromptInput: Rich text input component for task description & execution prompt.
 * Features:
 * - Slash autocomplete popup for commands and skills with keyboard navigation.
 * - Clean text editing without image base64 pollution.
 *
 * @module dsh-taskboard/client/board/SlashPromptInput
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import type { BoardController } from '../controller.ts'
import type { PromptCompletionItem } from '../../shared/api.ts'

/** Default built-in slash commands. */
export const DEFAULT_COMMANDS: PromptCompletionItem[] = [
  { name: 'goal', kind: 'command', description: '自主完成长期目标任务，持续深度推进', hint: '<目标描述>' },
  { name: 'schedule', kind: 'command', description: '设置一次性定时或周期性 Cron 调度', hint: '<时间/表达式>' },
  { name: 'plan', kind: 'command', description: '在行动前制定分步实施计划并由用户确认' },
  { name: 'browser', kind: 'command', description: '启动网页浏览器交互与实时页面检索' },
  { name: 'grill-me', kind: 'command', description: '通过多轮单题访谈深入对齐需求与设计意图' },
  { name: 'teamwork-preview', kind: 'command', description: '多智能体协作与团队工作流预览' },
  { name: 'learn', kind: 'command', description: '沉淀解决经验与新规则到知识库' },
  { name: 'review', kind: 'command', description: '多维度代码审查（正确性、架构与安全）' },
  { name: 'security', kind: 'command', description: '安全加固与代码漏洞扫描' },
  { name: 'permission', kind: 'command', description: '切换当前会话权限级别 (read-only / workspace-write / full-access)', hint: '<preset>' },
]

/** Default built-in skills. */
export const DEFAULT_SKILLS: PromptCompletionItem[] = [
  { name: 'frontend-ui-engineering', kind: 'skill', description: '构建生产级、可访问的高品质前端界面与组件' },
  { name: 'api-and-interface-design', kind: 'skill', description: '设计稳定契约、清晰边界的 REST / RPC 接口' },
  { name: 'test-driven-development', kind: 'skill', description: '测试驱动开发（TDD），编写单元与集成测试' },
  { name: 'debugging-and-error-recovery', kind: 'skill', description: '系统化定位 Bug 根因并恢复错误' },
  { name: 'performance-optimization', kind: 'skill', description: '前后端性能调优、减少渲染开销与查询优化' },
  { name: 'ci-cd-and-automation', kind: 'skill', description: '自动化构建、CI/CD 流水线与质量门禁' },
  { name: 'code-review-and-quality', kind: 'skill', description: '多轴向代码审查与重构指导' },
  { name: 'code-simplification', kind: 'skill', description: '精简复杂逻辑，提升可读性与可维护性' },
  { name: 'context-engineering', kind: 'skill', description: '优化上下文结构与提示词工程' },
  { name: 'doubt-driven-development', kind: 'skill', description: '以怀疑驱动的对抗式审查，确保核心逻辑正确' },
  { name: 'git-workflow-and-versioning', kind: 'skill', description: 'Git 工作流、分支管理、语义化版本与变更日志' },
  { name: 'idea-refine', kind: 'skill', description: '通过发散与收敛思维细化方案与假设检验' },
  { name: 'incremental-implementation', kind: 'skill', description: '小步快跑、增量交付多文件变更' },
  { name: 'interview-me', kind: 'skill', description: '深度访谈挖掘真实意图' },
  { name: 'memory-leak-debugging', kind: 'skill', description: '排查诊断 JavaScript/Node.js 内存泄漏' },
  { name: 'observability-and-instrumentation', kind: 'skill', description: '添加日志、指标打点与链路追踪' },
  { name: 'planning-and-task-breakdown', kind: 'skill', description: '将复杂需求拆解为有序可执行任务' },
  { name: 'security-and-hardening', kind: 'skill', description: '防御安全漏洞、输入过滤与鉴权加固' },
  { name: 'shipping-and-launch', kind: 'skill', description: '生产发布前检查清单与回滚策略' },
  { name: 'source-driven-development', kind: 'skill', description: '基于权威官方文档与源码进行设计实现' },
  { name: 'spec-driven-development', kind: 'skill', description: '在编码前制定清晰的技术规范' },
  { name: 'using-agent-skills', kind: 'skill', description: '发现并动态调用智能体各项专业技能' },
]

/** Props for SlashPromptInput. */
export interface SlashPromptInputProps {
  value: string
  onChange: (value: string) => void
  controller?: BoardController
  placeholder?: string
  rows?: number
  maxLength?: number
  disabled?: boolean
  autoFocus?: boolean
  className?: string
  ariaLabel?: string
}

/**
 * Rich prompt textarea with / autocomplete for slash commands & skills.
 */
export function SlashPromptInput({
  value,
  onChange,
  controller,
  placeholder,
  rows = 4,
  maxLength = 8000,
  disabled = false,
  autoFocus = false,
  className,
  ariaLabel,
}: SlashPromptInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Autocomplete state
  const [completions, setCompletions] = useState<{ commands: PromptCompletionItem[]; skills: PromptCompletionItem[] }>({
    commands: DEFAULT_COMMANDS,
    skills: DEFAULT_SKILLS,
  })
  const [popupOpen, setPopupOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  const [slashStart, setSlashStart] = useState(-1)
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Fetch host completions if controller provided
  useEffect(() => {
    if (controller === undefined) return
    let alive = true
    void controller.fetchPromptCompletions().then(res => {
      if (!alive || res === undefined) return
      setCompletions(prev => {
        // Merge commands
        const cmdMap = new Map<string, PromptCompletionItem>()
        for (const c of prev.commands) cmdMap.set(c.name, c)
        for (const c of res.commands) cmdMap.set(c.name, { ...c, kind: 'command' })

        // Merge skills
        const skillMap = new Map<string, PromptCompletionItem>()
        for (const s of prev.skills) skillMap.set(s.name, s)
        for (const s of res.skills) skillMap.set(s.name, { ...s, kind: 'skill' })

        return {
          commands: Array.from(cmdMap.values()),
          skills: Array.from(skillMap.values()),
        }
      })
    })
    return () => { alive = false }
  }, [controller])

  // Filter items based on query
  const filteredItems = useMemo<PromptCompletionItem[]>(() => {
    const q = slashQuery.toLowerCase().trim()
    const all = [...completions.commands, ...completions.skills]
    if (q.length === 0) return all
    return all.filter(item => item.name.toLowerCase().includes(q) || (item.description !== undefined && item.description.toLowerCase().includes(q)))
  }, [completions, slashQuery])

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= filteredItems.length) {
      setSelectedIndex(Math.max(0, filteredItems.length - 1))
    }
  }, [filteredItems.length, selectedIndex])

  // Detect slash typing on cursor movement or text change
  const checkSlashTrigger = (): void => {
    const el = textareaRef.current
    if (el === null) return
    const pos = el.selectionStart
    const currentText = el.value.slice(0, pos)
    
    // Check if cursor is right after a word starting with /
    const lastSlash = currentText.lastIndexOf('/')
    if (lastSlash >= 0) {
      const charBefore = lastSlash > 0 ? (currentText[lastSlash - 1] ?? '\n') : '\n'
      const isWordStart = /\s/.test(charBefore) || lastSlash === 0
      const queryPart = currentText.slice(lastSlash + 1)
      const noWhitespaceInQuery = !/\s/.test(queryPart)

      if (isWordStart && noWhitespaceInQuery) {
        setSlashStart(lastSlash)
        setSlashQuery(queryPart)
        setPopupOpen(true)
        return
      }
    }
    setPopupOpen(false)
  }

  // Insert picked completion item
  const applyCompletion = (item: PromptCompletionItem): void => {
    const el = textareaRef.current
    if (el === null || slashStart < 0) return
    const pos = el.selectionStart
    const before = value.slice(0, slashStart)
    const after = value.slice(pos)
    const inserted = `/${item.name} `
    const nextText = before + inserted + after
    onChange(nextText)
    setPopupOpen(false)

    // Restore focus & cursor position
    setTimeout(() => {
      if (textareaRef.current !== null) {
        const nextPos = slashStart + inserted.length
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(nextPos, nextPos)
      }
    }, 0)
  }

  // Keyboard navigation for slash popup
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (popupOpen && filteredItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % filteredItems.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        const picked = filteredItems[selectedIndex]
        if (picked !== undefined) {
          e.preventDefault()
          applyCompletion(picked)
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setPopupOpen(false)
        return
      }
    }
  }

  return (
    <div className={`dsh-atb-prompt-wrap ${className ?? ''}`}>
      <div className="dsh-atb-prompt-inner">
        <textarea
          ref={textareaRef}
          className="dsh-atb-prompt-input"
          value={value}
          rows={rows}
          maxLength={maxLength}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
            onChange(e.target.value)
            checkSlashTrigger()
          }}
          onKeyUp={checkSlashTrigger}
          onClick={checkSlashTrigger}
          onKeyDown={handleKeyDown}
        />

        {/* Slash Autocomplete Popup */}
        {popupOpen && filteredItems.length > 0 && (
          <div className="dsh-atb-slash-popup" role="listbox" aria-label="快捷命令与技能">
            <div className="dsh-atb-slash-head">
              <span className="dsh-atb-slash-title">快捷命令与技能补全</span>
              <span className="dsh-atb-slash-hint">↑↓ 选择 · Enter / Tab 确认 · Esc 关闭</span>
            </div>
            <div className="dsh-atb-slash-list">
              {filteredItems.map((item, idx) => (
                <div
                  key={`${item.kind}-${item.name}`}
                  role="option"
                  aria-selected={idx === selectedIndex}
                  className="dsh-atb-slash-item"
                  data-active={idx === selectedIndex ? 'true' : undefined}
                  data-kind={item.kind}
                  onClick={() => applyCompletion(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  <span className="dsh-atb-slash-badge" data-kind={item.kind}>
                    {item.kind === 'command' ? '⚡ 命令' : '🧩 技能'}
                  </span>
                  <span className="dsh-atb-slash-name">/{item.name}</span>
                  {item.hint && <span className="dsh-atb-slash-param">{item.hint}</span>}
                  {item.description && <span className="dsh-atb-slash-desc">{item.description}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom helper toolbar */}
      <div className="dsh-atb-prompt-foot">
        <span className="dsh-atb-prompt-tip">
          💡 输入 <code>/</code> 可快速补全 Slash 命令与 Agent 技能
        </span>
      </div>
    </div>
  )
}

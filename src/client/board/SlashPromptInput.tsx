/**
 * SlashPromptInput: Rich text input component for task description & execution prompt.
 * Features:
 * 1. Slash autocomplete popup for commands and skills with keyboard navigation.
 * 2. Image pasting (Ctrl+V) and drag-and-drop into Markdown image format.
 * 3. Thumbnail rail for attached/embedded images with delete and lightbox preview.
 * 4. File picker button for manual image uploads.
 *
 * @module dsh-taskboard/client/board/SlashPromptInput
 */
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type ClipboardEvent, type DragEvent } from 'react'
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

/** Parsed image entry from Markdown text. */
export interface ExtractedImage {
  id: string
  alt: string
  url: string
}

const IMAGE_MD_REGEX = /!\[(.*?)\]\(((?:data:image\/[^)\s]+)|(?:https?:\/\/[^)\s]+)|(?:[^)\s]+\.(?:png|jpg|jpeg|gif|webp|svg)))\)/gi

/** Extract markdown images `![alt](url)` from text. */
export function extractMarkdownImages(text: string): ExtractedImage[] {
  const images: ExtractedImage[] = []
  const regex = new RegExp(IMAGE_MD_REGEX.source, 'gi')
  let match: RegExpExecArray | null
  let count = 0
  while ((match = regex.exec(text)) !== null) {
    count++
    const url = match[2] ?? ''
    images.push({
      id: `img-${count}-${url.slice(0, 30)}`,
      alt: match[1] || `图片 ${count}`,
      url,
    })
  }
  return images
}

/** Split a markdown prompt into clean text (without markdown image tags) and extracted images. */
export function decomposePromptValue(fullValue: string): { text: string; images: ExtractedImage[] } {
  const images = extractMarkdownImages(fullValue)
  const regex = new RegExp(IMAGE_MD_REGEX.source, 'gi')
  const text = fullValue.replace(regex, '').trimEnd()
  return { text, images }
}

/** Compose clean text and images back into complete Markdown for task storage & agent execution. */
export function composePromptValue(text: string, images: ExtractedImage[]): string {
  const clean = text.trimEnd()
  if (images.length === 0) return clean
  const imagesMd = images.map((img, idx) => `![${img.alt || `图片 ${idx + 1}`}](${img.url})`).join('\n\n')
  if (clean.length === 0) return imagesMd
  return `${clean}\n\n${imagesMd}`
}

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
 * Rich prompt textarea with / autocomplete, image paste, and thumbnails.
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  // Internal decomposed text & attached images
  const lastPropValueRef = useRef<string>(value)
  const [text, setText] = useState<string>(() => decomposePromptValue(value).text)
  const [images, setImages] = useState<ExtractedImage[]>(() => decomposePromptValue(value).images)

  // Synchronize when prop `value` changes externally (e.g. template selection or reset)
  useEffect(() => {
    if (value !== lastPropValueRef.current) {
      lastPropValueRef.current = value
      const decomposed = decomposePromptValue(value)
      setText(decomposed.text)
      setImages(decomposed.images)
    }
  }, [value])

  const notifyChange = (nextText: string, nextImages: ExtractedImage[]): void => {
    const combined = composePromptValue(nextText, nextImages)
    lastPropValueRef.current = combined
    onChange(combined)
  }

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
    const before = text.slice(0, slashStart)
    const after = text.slice(pos)
    const inserted = `/${item.name} `
    const nextText = before + inserted + after
    setText(nextText)
    notifyChange(nextText, images)
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

  // Add images to attachments rail (without polluting textarea text)
  const addImages = (newImages: Array<{ alt: string; url: string }>): void => {
    if (newImages.length === 0) return
    const additions: ExtractedImage[] = newImages.map((img, idx) => ({
      id: `img-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      alt: img.alt,
      url: img.url,
    }))
    const nextImages = [...images, ...additions]
    setImages(nextImages)
    notifyChange(text, nextImages)
  }

  // Remove image from attachments rail
  const removeImage = (idToRemove: string): void => {
    const nextImages = images.filter(img => img.id !== idToRemove)
    setImages(nextImages)
    notifyChange(text, nextImages)
  }

  // Handle image files to Data URL
  const processImageFiles = (files: FileList | File[]): void => {
    const readPromises: Promise<{ alt: string; url: string }>[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file && file.type.startsWith('image/')) {
        readPromises.push(new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              resolve({
                alt: file.name.replace(/\.[^/.]+$/, '') || '图片',
                url: reader.result,
              })
            }
          }
          reader.readAsDataURL(file)
        }))
      }
    }
    if (readPromises.length > 0) {
      Promise.all(readPromises).then(newImgs => {
        addImages(newImgs)
      })
    }
  }

  // Paste handler
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const items = e.clipboardData?.items
    if (items !== undefined && items.length > 0) {
      const imageFiles: File[] = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item !== undefined && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file !== null) imageFiles.push(file)
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault()
        processImageFiles(imageFiles)
        return
      }
    }
    // Normal paste: update slash trigger after render
    setTimeout(checkSlashTrigger, 0)
  }

  // Drag & drop handlers
  const handleDragOver = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    if (e.dataTransfer.types.includes('Files')) {
      setDragOver(true)
    }
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      processImageFiles(e.dataTransfer.files)
    }
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
    <div
      className={`dsh-atb-prompt-wrap ${className ?? ''}`}
      data-drag-over={dragOver ? 'true' : undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="dsh-atb-prompt-inner">
        <textarea
          ref={textareaRef}
          className="dsh-atb-prompt-input"
          value={text}
          rows={rows}
          maxLength={maxLength}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={ariaLabel}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
            const nextText = e.target.value
            setText(nextText)
            notifyChange(nextText, images)
            checkSlashTrigger()
          }}
          onKeyUp={checkSlashTrigger}
          onClick={checkSlashTrigger}
          onPaste={handlePaste}
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

      {/* Extracted Images Rail */}
      {images.length > 0 && (
        <div className="dsh-atb-img-rail">
          <div className="dsh-atb-img-rail-label">已添加图片 ({images.length})</div>
          <div className="dsh-atb-img-list">
            {images.map(img => (
              <div key={img.id} className="dsh-atb-img-card">
                <img
                  src={img.url}
                  alt={img.alt}
                  className="dsh-atb-img-thumb"
                  onClick={() => setLightboxUrl(img.url)}
                  title="点击查看大图"
                />
                <span className="dsh-atb-img-name" title={img.alt}>{img.alt}</span>
                <button
                  type="button"
                  className="dsh-atb-img-del"
                  title="移除该图片"
                  onClick={() => removeImage(img.id)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom helper & upload trigger */}
      <div className="dsh-atb-prompt-foot">
        <span className="dsh-atb-prompt-tip">
          💡 输入 <code>/</code> 补全命令与技能 · 截图直接 <code>Ctrl+V</code> 粘贴图片 · 支持拖拽
        </span>
        <button
          type="button"
          className="dsh-atb-prompt-imgbtn"
          title="上传图片"
          onClick={() => fileInputRef.current?.click()}
        >
          🖼 添加图片
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={e => {
            if (e.target.files !== null && e.target.files.length > 0) {
              processImageFiles(e.target.files)
              e.target.value = ''
            }
          }}
        />
      </div>

      {/* Lightbox Modal */}
      {lightboxUrl !== null && (
        <div className="dsh-atb-lightbox-backdrop" onClick={() => setLightboxUrl(null)}>
          <div className="dsh-atb-lightbox-content" onClick={e => e.stopPropagation()}>
            <img src={lightboxUrl} alt="预览大图" className="dsh-atb-lightbox-img" />
            <button
              type="button"
              className="dsh-atb-lightbox-close"
              title="关闭预览"
              onClick={() => setLightboxUrl(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

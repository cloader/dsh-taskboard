// @vitest-environment jsdom
/**
 * Tests for SlashPromptInput, slash command/skill autocomplete,
 * and markdown image extraction.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COMMANDS,
  DEFAULT_SKILLS,
  extractMarkdownImages,
} from '../src/client/board/SlashPromptInput.tsx'

describe('SlashPromptInput & helpers (0.5.5)', () => {
  it('defines standard slash commands and skills with descriptions', () => {
    expect(DEFAULT_COMMANDS.length).toBeGreaterThanOrEqual(8)
    expect(DEFAULT_SKILLS.length).toBeGreaterThanOrEqual(15)

    const goalCmd = DEFAULT_COMMANDS.find(c => c.name === 'goal')
    expect(goalCmd).toBeDefined()
    expect(goalCmd?.kind).toBe('command')

    const uiSkill = DEFAULT_SKILLS.find(s => s.name === 'frontend-ui-engineering')
    expect(uiSkill).toBeDefined()
    expect(uiSkill?.kind).toBe('skill')
  })

  it('extractMarkdownImages extracts data URLs and http image URLs', () => {
    const sample = `
这里是需求描述：
![设计草图](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==)
还有一张架构图：
![架构图](https://example.com/arch.png)
无图普通文本
`
    const images = extractMarkdownImages(sample)
    expect(images).toHaveLength(2)
    expect(images[0]!.alt).toBe('设计草图')
    expect(images[0]!.url).toContain('data:image/png;base64')
    expect(images[1]!.alt).toBe('架构图')
    expect(images[1]!.url).toBe('https://example.com/arch.png')
  })

  it('decomposePromptValue and composePromptValue cleanly separate text from images (0.5.5)', async () => {
    const { decomposePromptValue, composePromptValue } = await import('../src/client/board/SlashPromptInput.tsx')
    const combined = '/goal 看看这是什么图\n\n![设计草图](data:image/png;base64,123)\n\n![架构图](https://example.com/arch.png)'
    const decomposed = decomposePromptValue(combined)
    expect(decomposed.text).toBe('/goal 看看这是什么图')
    expect(decomposed.images).toHaveLength(2)
    expect(decomposed.images[0]!.alt).toBe('设计草图')
    expect(decomposed.images[0]!.url).toBe('data:image/png;base64,123')
    expect(decomposed.images[1]!.alt).toBe('架构图')

    const recomposed = composePromptValue(decomposed.text, decomposed.images)
    expect(recomposed).toContain('/goal 看看这是什么图')
    expect(recomposed).toContain('![设计草图](data:image/png;base64,123)')
    expect(recomposed).toContain('![架构图](https://example.com/arch.png)')
  })

  it('renders SlashPromptInput with clean textarea and thumbnail rail for attached images (0.5.5)', async () => {
    const React = await import('react')
    const { createRoot } = await import('react-dom/client')
    const { SlashPromptInput } = await import('../src/client/board/SlashPromptInput.tsx')

    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)

    let currentVal = '/goal 请分析本图\n\n![架构图](https://example.com/arch.png)'
    const handleChange = (v: string) => { currentVal = v }

    root.render(React.createElement(SlashPromptInput, {
      value: currentVal,
      onChange: handleChange,
    }))
    await new Promise(r => setTimeout(r, 30))

    // Textarea only contains the clean text
    const textarea = host.querySelector<HTMLTextAreaElement>('textarea')!
    expect(textarea).not.toBeNull()
    expect(textarea.value).toBe('/goal 请分析本图')
    expect(textarea.value).not.toContain('https://example.com/arch.png')

    // Thumbnail rail displays the image card
    const imgRail = host.querySelector('.dsh-atb-img-rail')!
    expect(imgRail).not.toBeNull()
    const imgCards = host.querySelectorAll('.dsh-atb-img-card')
    expect(imgCards).toHaveLength(1)

    // Delete button removes the image and updates value
    const delBtn = host.querySelector<HTMLButtonElement>('.dsh-atb-img-del')!
    delBtn.click()
    await new Promise(r => setTimeout(r, 20))

    expect(currentVal).toBe('/goal 请分析本图')

    root.unmount()
    host.remove()
  })
})

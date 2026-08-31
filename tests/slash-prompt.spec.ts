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

  it('extractMarkdownImages handles empty and non-image markdown cleanly', () => {
    expect(extractMarkdownImages('')).toEqual([])
    expect(extractMarkdownImages('这是普通 [链接](https://example.com)')).toEqual([])
    expect(extractMarkdownImages('```ts\nconst a = 1\n```')).toEqual([])
  })
})

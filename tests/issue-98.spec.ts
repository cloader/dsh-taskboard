/**
 * Issue #98: customizable worktree branch naming.
 *
 * - `buildBranchName` under the four board presets — the `title-id` preset
 *   must reproduce the legacy `sanitizeBranchName` output byte for byte.
 * - `sanitizeCustomBranchName` (task-level full-name override) spectrum.
 * - `asBoardSettings` whitelist for the new fields + accessor fallbacks.
 *
 * @module dsh-taskboard/issue-98.spec
 */
import { describe, expect, it } from 'vitest'
import {
  asBoardSettings,
  branchNameModeOf,
  branchNamePrefixOf,
  buildBranchName,
  DEFAULT_BRANCH_NAME_MODE,
  DEFAULT_BRANCH_NAME_PREFIX,
  sanitizeBranchSegment,
  sanitizeCustomBranchName,
} from '../src/shared/protocol.ts'
import { sanitizeBranchName } from '../src/host/git.ts'

describe('buildBranchName presets', () => {
  it('title-id reproduces the legacy sanitizeBranchName byte for byte', () => {
    const titles = ['修复登录页 布局', 'fix: a ~bad~ name?', 'a..b', 'path/to/thing', '???', '   ', '---', 'x'.repeat(40)]
    for (const title of titles) {
      for (const id of ['t-1', 't-abc-123']) {
        expect(buildBranchName(title, id)).toBe(sanitizeBranchName(title, id))
      }
    }
  })

  it('title-id falls back to the bare task/<taskId> when the title sanitizes away', () => {
    expect(buildBranchName('???', 't-6')).toBe('task/t-6')
    expect(buildBranchName('???', 't-6', 'title-id', 'work')).toBe('task/t-6')
  })

  it('id preset is pure task/<taskId>', () => {
    expect(buildBranchName('修复登录', 't-1a2b', 'id')).toBe('task/t-1a2b')
  })

  it('prefix-id uses the sanitized board prefix verbatim', () => {
    expect(buildBranchName('修复登录', 't-1a2b', 'prefix-id', 'work')).toBe('work/t-1a2b')
  })

  it('prefix-title-id keeps the +id suffix; an empty title segment degrades to prefix/id', () => {
    expect(buildBranchName('修复登录', 't-1a2b', 'prefix-title-id', 'work')).toBe('work/修复登录+t-1a2b')
    expect(buildBranchName('???', 't-1a2b', 'prefix-title-id', 'work')).toBe('work/t-1a2b')
  })
})

describe('sanitizeBranchSegment', () => {
  it('matches the legacy title sanitizing (whitespace → -, illegal stripped, 20-cap)', () => {
    expect(sanitizeBranchSegment('修复登录页 布局')).toBe('修复登录页-布局')
    expect(sanitizeBranchSegment('a..b')).toBe('a.b')
    expect(sanitizeBranchSegment('---')).toBe('')
    const long = 'x'.repeat(40)
    expect(sanitizeBranchSegment(long)).toBe('x'.repeat(20))
  })
})

describe('sanitizeCustomBranchName (task-level override)', () => {
  it('keeps multi-level names and passes clean input through', () => {
    expect(sanitizeCustomBranchName('feat/login')).toBe('feat/login')
    expect(sanitizeCustomBranchName('  task/t-1a2b ')).toBe('task/t-1a2b')
    expect(sanitizeCustomBranchName('work/修复登录')).toBe('work/修复登录')
  })

  it('strips git-illegal characters but keeps the / separator', () => {
    expect(sanitizeCustomBranchName('feat/log~in?')).toBe('feat/login')
    expect(sanitizeCustomBranchName('feat//log\\\\in')).toBe('feat/login')
    expect(sanitizeCustomBranchName('feat/:log*in')).toBe('feat/login')
  })

  it('collapses whitespace runs to -', () => {
    expect(sanitizeCustomBranchName('feat/fix login now')).toBe('feat/fix-login-now')
  })

  it('rejects per-component .., .lock suffixes, and leading/trailing junk', () => {
    expect(sanitizeCustomBranchName('a../b')).toBe('a/b')
    expect(sanitizeCustomBranchName('.hidden/branch')).toBe('hidden/branch')
    expect(sanitizeCustomBranchName('feat/login.lock')).toBe('feat/login')
    expect(sanitizeCustomBranchName('-feat-/login-')).toBe('feat/login')
  })

  it('caps at 60 code points', () => {
    const long = 'a'.repeat(80)
    expect(Array.from(sanitizeCustomBranchName(long)!).length).toBe(60)
  })

  it('returns undefined when nothing legal remains (caller falls back to the board preset)', () => {
    expect(sanitizeCustomBranchName('')).toBeUndefined()
    expect(sanitizeCustomBranchName('   ')).toBeUndefined()
    expect(sanitizeCustomBranchName('???')).toBeUndefined()
    expect(sanitizeCustomBranchName('/')).toBeUndefined()
  })
})

describe('board settings: branchNameMode / branchNamePrefix', () => {
  it('accepts the four presets and sanitizes (or drops) the prefix', () => {
    for (const mode of ['title-id', 'id', 'prefix-id', 'prefix-title-id'] as const) {
      expect(asBoardSettings({ branchNameMode: mode })).toEqual({ branchNameMode: mode })
    }
    expect(asBoardSettings({ branchNamePrefix: '  work ' })).toEqual({ branchNamePrefix: 'work' })
    expect(asBoardSettings({ branchNamePrefix: 'feat/login!' })).toEqual({ branchNamePrefix: 'featlogin' })
    expect(asBoardSettings({ branchNamePrefix: '???' })).toEqual({})
    expect(asBoardSettings({ branchNamePrefix: 'a..b' })).toEqual({ branchNamePrefix: 'a.b' })
  })

  it('rejects an unknown mode and a non-string prefix', () => {
    expect(() => asBoardSettings({ branchNameMode: 'docker' })).toThrow('branchNameMode')
    expect(() => asBoardSettings({ branchNamePrefix: 42 })).toThrow('branchNamePrefix')
  })

  it('accessors resolve setting → factory defaults', () => {
    expect(branchNameModeOf(undefined)).toBe(DEFAULT_BRANCH_NAME_MODE)
    expect(branchNameModeOf({})).toBe('title-id')
    expect(branchNameModeOf({ branchNameMode: 'id' })).toBe('id')
    expect(branchNamePrefixOf(undefined)).toBe(DEFAULT_BRANCH_NAME_PREFIX)
    expect(branchNamePrefixOf({})).toBe('task')
    expect(branchNamePrefixOf({ branchNamePrefix: 'work' })).toBe('work')
  })
})

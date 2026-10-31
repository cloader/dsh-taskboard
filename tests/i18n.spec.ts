// @vitest-environment jsdom
/**
 * i18n suite: trilingual key parity (zh/en/ru), translate() lookup +
 * placeholder substitution, fallback-locale detection, the DSH locale
 * service soft-attach (live switch), and a source scan asserting every
 * t('...') literal in the client actually exists in all dictionaries.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { en } from '../src/client/i18n/en.ts'
import { ru } from '../src/client/i18n/ru.ts'
import { zh } from '../src/client/i18n/zh.ts'
import { localizeBuiltinCategory, localizeBuiltinName, localizeBuiltinTask } from '../src/client/i18n/templates.ts'
import { BUILTIN_TEMPLATE_IDS, builtinTemplateContent } from '../src/shared/builtin-templates.ts'
import { COLUMN_KEYS, MOVE_KEYS, OUTCOME_KEYS, STATUS_KEYS, URGENCY_KEYS } from '../src/client/board/labels.ts'
import { disposeI18n, initI18n, localeStore, setLocalePreference, translate } from '../src/client/i18n/runtime.ts'

describe('dictionaries', () => {
  it('zh, en and ru carry identical key sets', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort())
  })

  it('no value is empty (glue fragments may carry intentional edge spaces)', () => {
    for (const [dict, name] of [[zh, 'zh'], [en, 'en'], [ru, 'ru']] as const) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.length, name + ':' + key).toBeGreaterThan(0)
        expect(value.trim().length, name + ':' + key).toBeGreaterThan(0)
      }
    }
  })

  it('enum key maps (labels.ts) reference existing dictionary keys', () => {
    for (const map of [COLUMN_KEYS, STATUS_KEYS, MOVE_KEYS, URGENCY_KEYS, OUTCOME_KEYS]) {
      for (const key of Object.values(map)) {
        expect(zh, key).toHaveProperty(key)
        expect(en, key).toHaveProperty(key)
        expect(ru, key).toHaveProperty(key)
      }
    }
  })
})

describe('translate()', () => {
  it('resolves the active dictionary (zh via <html lang>)', () => {
    document.documentElement.lang = 'zh-CN'
    disposeI18n()
    expect(localeStore.getSnapshot().active).toBe('zh')
    expect(translate('board.title')).toBe(zh['board.title'])
  })

  it('resolves ru via <html lang> and substitutes its placeholders', () => {
    document.documentElement.lang = 'ru-RU'
    disposeI18n()
    expect(localeStore.getSnapshot().active).toBe('ru')
    expect(translate('board.title')).toBe(ru['board.title'])
    expect(translate('board.count.tasks', { n: 3, rev: 7 })).toBe(ru['board.count.tasks'].replace('{n}', '3').replace('{rev}', '7'))
    expect(translate('form.prompt.placeholder')).toContain('{{lastExecution}}')
  })

  it('resolves en and falls back to the key itself (fail loud, never blank)', () => {
    document.documentElement.lang = 'en-US'
    disposeI18n()
    expect(localeStore.getSnapshot().active).toBe('en')
    expect(translate('board.title')).toBe(en['board.title'])
    expect(translate('no.such.key')).toBe('no.such.key')
  })

  it('substitutes {name} placeholders and leaves unknown names verbatim', () => {
    document.documentElement.lang = 'en-US'
    disposeI18n()
    expect(translate('board.count.tasks', { n: 3, rev: 7 })).toBe('3 tasks · rev 7')
    // the prompt placeholder documents DSH template variables {{...}} —
    // a missing param must NOT eat the braces
    expect(translate('form.prompt.placeholder')).toContain('{{lastExecution}}')
  })

  it('navigator.language drives detection when <html lang> is empty', () => {
    document.documentElement.lang = ''
    disposeI18n()
    // jsdom defaults navigator.language to 'en-US'
    expect(localeStore.getSnapshot().active).toBe('en')
  })
})

describe('DSH locale service soft-attach', () => {
  beforeEach(() => { localStorage.clear(); disposeI18n() })
  afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); disposeI18n() })
  /** Minimal LocaleRuntime double: snapshot + subscribe only. */
  function fakeService(initial: string): { face: unknown; set(active: string): void } {
    let snap = { active: initial, revision: 1 }
    const listeners = new Set<() => void>()
    return {
      face: {
        getSnapshot: () => snap,
        subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
      },
      set(active: string) { snap = { active, revision: snap.revision + 1 }; for (const fn of listeners) fn() },
    }
  }

  it('follows a live locale switch without re-init', () => {
    document.documentElement.lang = ''
    const svc = fakeService('zh')
    initI18n(svc.face)
    expect(localeStore.getSnapshot().active).toBe('zh')
    svc.set('en')
    expect(localeStore.getSnapshot().active).toBe('en')
    expect(translate('board.title')).toBe(en['board.title'])
    disposeI18n()
  })

  it('keeps a manual preference across host switches and follows the latest host locale on reset', () => {
    const svc = fakeService('zh')
    initI18n(svc.face)
    expect(localeStore.getSnapshot().preference).toBe('follow')
    setLocalePreference('ru')
    expect(translate('board.title')).toBe(ru['board.title'])
    svc.set('en')
    expect(localeStore.getSnapshot()).toMatchObject({ preference: 'ru', active: 'ru' })
    setLocalePreference('follow')
    expect(localeStore.getSnapshot()).toMatchObject({ preference: 'follow', active: 'en' })
    expect(localStorage.getItem('dsh-taskboard-locale-v1')).toBeNull()
    svc.set('zh')
    expect(localeStore.getSnapshot().active).toBe('zh')
  })

  it('restores a saved preference before and after the DSH service attaches', () => {
    setLocalePreference('ru')
    disposeI18n()
    document.documentElement.lang = 'en'
    initI18n(undefined)
    expect(localeStore.getSnapshot()).toMatchObject({ preference: 'ru', active: 'ru' })
    initI18n(fakeService('zh').face)
    expect(localeStore.getSnapshot().active).toBe('ru')
    setLocalePreference('follow')
    expect(localeStore.getSnapshot().active).toBe('zh')
  })

  it('defaults to following DSH when the saved preference is invalid', () => {
    localStorage.setItem('dsh-taskboard-locale-v1', 'invalid')
    disposeI18n()
    initI18n(fakeService('zh').face)
    expect(localeStore.getSnapshot()).toMatchObject({ preference: 'follow', active: 'zh' })
  })

  it('still switches locally when storage is unavailable', () => {
    initI18n(fakeService('zh').face)
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    expect(() => setLocalePreference('ru')).not.toThrow()
    expect(write).toHaveBeenCalledOnce()
    expect(localeStore.getSnapshot()).toMatchObject({ preference: 'ru', active: 'ru' })
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Access denied', 'SecurityError')
    })
    expect(() => setLocalePreference('follow')).not.toThrow()
    expect(remove).toHaveBeenCalledOnce()
    expect(localeStore.getSnapshot().active).toBe('zh')
  })

  it('notifies the settings selector when the preference changes without changing the active language', () => {
    initI18n(fakeService('zh').face)
    const listener = vi.fn()
    const unsubscribe = localeStore.subscribe(listener)
    try {
      setLocalePreference('zh')
      expect(listener).toHaveBeenCalledOnce()
      expect(localeStore.getSnapshot()).toMatchObject({ preference: 'zh', active: 'zh' })
    } finally { unsubscribe() }
  })

  it('ignores absent and malformed services (fallback takes over)', () => {
    document.documentElement.lang = 'zh-CN'
    expect(() => initI18n(undefined)).not.toThrow()
    expect(() => initI18n({ nope: true })).not.toThrow()
    expect(localeStore.getSnapshot().active).toBe('zh')
    disposeI18n()
  })

  it('subscribe/unsubscribe round-trips through the store face', () => {
    document.documentElement.lang = ''
    const svc = fakeService('zh')
    initI18n(svc.face)
    let calls = 0
    const off = localeStore.subscribe(() => { calls++ })
    svc.set('en')
    expect(calls).toBe(1)
    off()
    svc.set('zh')
    expect(calls).toBe(1)
    disposeI18n()
  })
})

describe('late locale activation (issue #16)', () => {
  /** Minimal LocaleRuntime double (same shape as the soft-attach suite). */
  function fakeService(initial: string): { face: unknown; set(active: string): void } {
    let snap = { active: initial, revision: 1 }
    const listeners = new Set<() => void>()
    return {
      face: {
        getSnapshot: () => snap,
        subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } },
      },
      set(active: string) { snap = { active, revision: snap.revision + 1 }; for (const fn of listeners) fn() },
    }
  }

  it('no service at apply: a later <html lang> sync re-detects (SSR "en" → zh)', async () => {
    document.documentElement.lang = 'en' // the static server-rendered value
    initI18n(undefined)
    expect(localeStore.getSnapshot().active).toBe('en') // the one-shot fallback…
    document.documentElement.lang = 'zh-CN' // …but the locale runtime syncs late
    await new Promise(r => setTimeout(r, 50)) // MutationObserver delivery
    expect(localeStore.getSnapshot().active).toBe('zh') // …and we follow (#16)
    expect(translate('board.title')).toBe(zh['board.title'])
    disposeI18n()
  })

  it('no service at apply: the retry poll attaches the late-provided service', async () => {
    document.documentElement.lang = 'en'
    const svc = fakeService('zh')
    let provided = false
    initI18n(undefined, () => (provided ? svc.face : undefined))
    expect(localeStore.getSnapshot().active).toBe('en') // fallback until then
    await new Promise(r => setTimeout(r, 50))
    provided = true // the locale plugin provides after our activation
    await new Promise(r => setTimeout(r, 400)) // the next 250ms poll tick
    expect(localeStore.getSnapshot().active).toBe('zh') // service took over
    svc.set('en') // and live switches flow through the subscription
    expect(localeStore.getSnapshot().active).toBe('en')
    disposeI18n()
  })

  it('dispose tears the late attach down (no post-dispose flips)', async () => {
    document.documentElement.lang = 'en'
    initI18n(undefined)
    disposeI18n() // re-detects NOW (lang still "en") and removes the observer
    expect(localeStore.getSnapshot().active).toBe('en')
    document.documentElement.lang = 'zh-CN'
    await new Promise(r => setTimeout(r, 50))
    expect(localeStore.getSnapshot().active).toBe('en') // observer is gone — stays put
    document.documentElement.lang = 'en'
    await new Promise(r => setTimeout(r, 50))
    expect(localeStore.getSnapshot().active).toBe('en')
  })
})

describe('built-in template localization', () => {
  const builtin = { id: 'tpl-feature', name: '新增功能', task: { title: '新增：' }, builtin: true }

  it('builtinTemplateContent resolves per locale and rejects unknown ids', () => {
    expect(builtinTemplateContent('tpl-feature', 'zh')?.name).toBe('新增功能')
    expect(builtinTemplateContent('tpl-feature', 'en')?.name).toBe('New feature')
    expect(builtinTemplateContent('tpl-nope', 'en')).toBeUndefined()
    // Every built-in ships a category in both locales (0.8.8).
    for (const locale of ['zh', 'en'] as const) {
      for (const id of BUILTIN_TEMPLATE_IDS) {
        expect(builtinTemplateContent(id, locale)?.category?.length ?? 0).toBeGreaterThan(0)
      }
    }
    expect(builtinTemplateContent('tpl-patrol', 'zh')?.category).toBe('运维')
    expect(builtinTemplateContent('tpl-patrol', 'en')?.category).toBe('Operations')
  })

  it('localizeBuiltinName / localizeBuiltinTask follow the active locale', () => {
    document.documentElement.lang = 'en-US'
    disposeI18n()
    expect(localizeBuiltinName(builtin)).toBe('New feature')
    expect(localizeBuiltinTask(builtin).title).toBe('New feature:')
    expect(localizeBuiltinCategory(builtin)).toBe('Development')

    document.documentElement.lang = 'zh-CN'
    disposeI18n()
    expect(localizeBuiltinName(builtin)).toBe('新增功能')
    expect(localizeBuiltinTask(builtin).title).toBe('新增：')
    expect(localizeBuiltinCategory(builtin)).toBe('开发')
  })

  it('ru reuses the English built-in template content', () => {
    document.documentElement.lang = 'ru-RU'
    disposeI18n()
    expect(localeStore.getSnapshot().active).toBe('ru')
    expect(localizeBuiltinName(builtin)).toBe('New feature')
    expect(localizeBuiltinCategory(builtin)).toBe('Development')
  })

  it('custom templates and unknown built-in ids pass through untouched', () => {
    document.documentElement.lang = 'en-US'
    disposeI18n()
    const custom = { id: 'tpl-x', name: '我的模板', category: '服务', task: { title: '自定义' }, builtin: undefined }
    expect(localizeBuiltinName(custom)).toBe('我的模板')
    expect(localizeBuiltinTask(custom).title).toBe('自定义')
    expect(localizeBuiltinCategory(custom)).toBe('服务')
    const uncategorized = { id: 'tpl-y', name: '无类别', task: { title: '自定义' }, builtin: undefined }
    expect(localizeBuiltinCategory(uncategorized)).toBeUndefined()
    const unknownBuiltin = { id: 'tpl-1', name: 'Bug 修复', task: { urgency: 'urgent' as const }, builtin: true }
    expect(localizeBuiltinName(unknownBuiltin)).toBe('Bug 修复')
    expect(localizeBuiltinTask(unknownBuiltin).urgency).toBe('urgent')
  })
})

describe('host system message localization', () => {
  it('translate resolves the sys.* keys per locale', () => {
    document.documentElement.lang = 'zh-CN'
    disposeI18n()
    expect(translate('sys.sessionDone')).toContain('会话执行完毕')
    expect(translate('sys.execFailed', { error: 'boom' })).toContain('boom')

    document.documentElement.lang = 'en-US'
    disposeI18n()
    expect(translate('sys.sessionDone')).toContain('automatically moved to in review')
  })

  it('commentBody localizes system comments and renders the merge summary', async () => {
    document.documentElement.lang = 'en-US'
    disposeI18n()
    const { commentBody } = await import('../src/client/board/TaskDetail.tsx')
    const base = { id: 'c1', body: 'x', version: 1, createdAt: 0 }

    // A system comment renders its localized message.
    expect(commentBody(translate, { ...base, systemKey: 'sys.sessionDone' })).toContain('[System]')
    // A plain user/agent comment renders raw.
    expect(commentBody(translate, { ...base, body: 'plain text' })).toBe('plain text')
    // A multi-repo merge summary renders per-row localized labels + symbols.
    const merged = commentBody(translate, {
      ...base,
      systemKey: 'sys.mergeMulti',
      systemRows: [
        { repo: '', outcome: 'merged' },
        { repo: 'sub', outcome: 'noop' },
        { repo: 'x', outcome: 'failed', error: 'conflict' },
      ],
    })
    expect(merged).toContain('Root repo ✓')
    expect(merged).toContain('sub ⟲')
    expect(merged).toContain('x ✗ conflict')
  })

  // @tc TC-FUNC-014
  it('zh and en contain collapseBacklog and expandBacklog with expected translations', () => {
    expect(zh).toHaveProperty('board.column.collapseBacklog')
    expect(zh).toHaveProperty('board.column.expandBacklog')
    expect(en).toHaveProperty('board.column.collapseBacklog')
    expect(en).toHaveProperty('board.column.expandBacklog')
    expect(zh).toHaveProperty('board.column.collapseTodo')
    expect(zh).toHaveProperty('board.column.expandTodo')
    expect(en).toHaveProperty('board.column.collapseTodo')
    expect(en).toHaveProperty('board.column.expandTodo')

    expect(zh['board.column.collapseBacklog']).toBe('收起「待规划」列')
    expect(zh['board.column.expandBacklog']).toBe('展开「待规划」列')
    expect(en['board.column.collapseBacklog']).toBe('Collapse "Backlog" column')
    expect(en['board.column.expandBacklog']).toBe('Expand "Backlog" column')
    expect(zh['board.column.collapseTodo']).toBe('收起「待办」列')
    expect(zh['board.column.expandTodo']).toBe('展开「待办」列')
    expect(en['board.column.collapseTodo']).toBe('Collapse "To Do" column')
    expect(en['board.column.expandTodo']).toBe('Expand "To Do" column')
  })

  // @tc TC-FUNC-015
  it('translate dynamically resolves collapseBacklog and expandBacklog based on active locale', () => {
    document.documentElement.lang = 'zh-CN'
    disposeI18n()
    expect(translate('board.column.collapseBacklog')).toBe('收起「待规划」列')
    expect(translate('board.column.expandBacklog')).toBe('展开「待规划」列')
    expect(translate('board.column.collapseTodo')).toBe('收起「待办」列')
    expect(translate('board.column.expandTodo')).toBe('展开「待办」列')

    document.documentElement.lang = 'en-US'
    disposeI18n()
    expect(translate('board.column.collapseBacklog')).toBe('Collapse "Backlog" column')
    expect(translate('board.column.expandBacklog')).toBe('Expand "Backlog" column')
    expect(translate('board.column.collapseTodo')).toBe('Collapse "To Do" column')
    expect(translate('board.column.expandTodo')).toBe('Expand "To Do" column')

    document.documentElement.lang = 'ru-RU'
    disposeI18n()
    expect(translate('board.column.collapseBacklog')).toBe('Свернуть колонку «Бэклог»')
    expect(translate('board.column.expandBacklog')).toBe('Развернуть колонку «Бэклог»')
    expect(translate('board.column.collapseTodo')).toBe('Свернуть колонку «К выполнению»')
    expect(translate('board.column.expandTodo')).toBe('Развернуть колонку «К выполнению»')
  })
})

describe('source scan', () => {
  const clientDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'client')

  function walk(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) out.push(...walk(p))
      else if (/\.tsx?$/.test(entry.name)) out.push(p)
    }
    return out
  }

  it('every t(quoted-literal) in the client exists in ALL dictionaries', () => {
    const missing: string[] = []
    for (const file of walk(clientDir)) {
      const text = readFileSync(file, 'utf8')
      for (const m of text.matchAll(/\b(?:t|translate)\('([a-z][a-z0-9.]*)'/g)) {
        const key = m[1] ?? ''
        if (!(key in zh)) missing.push('zh missing: ' + key)
        if (!(key in en)) missing.push('en missing: ' + key)
        if (!(key in ru)) missing.push('ru missing: ' + key)
      }
    }
    expect(missing).toEqual([])
  })
})

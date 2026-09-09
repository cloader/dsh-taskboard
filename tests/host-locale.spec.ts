// @vitest-environment node
/**
 * Host-side locale reading: `activeHostLocale` resolves the DSH locale
 * preference (`locale.preference`) from the settings service, soft — absent
 * or malformed contexts fall back to `en` and never throw.
 */
import { describe, expect, it } from 'vitest'
import { activeHostLocale } from '../src/host/locale.ts'

/** Minimal cordis Context double: `get(name)` returns the settings service for 'settings'. */
function fakeCtx(settings: unknown): unknown {
  return { get: (name: string) => (name === 'settings' ? settings : undefined) }
}

/** Minimal settings-provider double: `get('locale')` returns the locale section. */
function settingsWith(preference: unknown): unknown {
  return { get: (ns: string) => (ns === 'locale' ? { preference } : undefined) }
}

describe('activeHostLocale', () => {
  it("resolves a persisted 'zh' preference", () => {
    expect(activeHostLocale(fakeCtx(settingsWith('zh')) as never)).toBe('zh')
  })

  it("resolves a persisted 'en' preference", () => {
    expect(activeHostLocale(fakeCtx(settingsWith('en')) as never)).toBe('en')
  })

  it('falls back to en when the preference is absent (browser-delegated)', () => {
    expect(activeHostLocale(fakeCtx(settingsWith(undefined)) as never)).toBe('en')
  })

  it('falls back to en when the settings service or locale section is missing', () => {
    expect(activeHostLocale(fakeCtx(undefined) as never)).toBe('en')
    expect(activeHostLocale(fakeCtx({}) as never)).toBe('en')
    expect(activeHostLocale({} as never)).toBe('en')
  })

  it('never throws on a throwing context (cosmetic line must not break boot)', () => {
    expect(activeHostLocale({ get: () => { throw new Error('boom') } } as never)).toBe('en')
  })
})

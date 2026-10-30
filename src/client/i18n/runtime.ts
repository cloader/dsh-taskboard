/**
 * Taskboard i18n runtime: the zh/en/ru dictionary lookup plus the locale
 * SOURCE adapter.
 *
 * Locale source, in priority order:
 * 1. The DSH locale service (ctx.get('locale'), the same plugin that backs
 *    设置 → 通用设置 → 语言). Consumed through a NARROW structural face and
 *    attached SOFTLY — the plugin must keep working on compositions where
 *    the service is absent, so 'locale' is deliberately NOT in the client
 *    inject list (a hard inject would wait forever there).
 * 2. A local fallback: <html lang> when the DSH locale plugin maintains it
 *    (it points <html lang> at the active locale), else navigator.language,
 *    else 'en' (matches DSH: zh only when something asked for Chinese).
 *
 * Preference WRITES are never made here: switching languages is the DSH
 * settings page's job; this module only reads.
 *
 * React re-render: useT() subscribes via useSyncExternalStore; the snapshot
 * object is replaced only on locale change, so renders are stable.
 *
 * @module dsh-taskboard/client/i18n/runtime
 */
import { useSyncExternalStore } from 'react'
import { zh, type TaskboardDict } from './zh.ts'
import { en } from './en.ts'
import { ru } from './ru.ts'

/**
 * Shipped locales: the DSH locale plugin's built-ins (zh, en) plus ru,
 * which the DSH locale service accepts as an open language-pack id
 * (`LocaleId = string` host-side) once a Russian language pack is active.
 */
export type LocaleId = 'zh' | 'en' | 'ru'

/** Immutable locale state published on every change. */
export interface TaskboardLocaleSnapshot {
  active: LocaleId
  /** Monotonic change counter (source snapshot revision or local bumps). */
  revision: number
}

/** Translate function: flat key lookup + {name} substitution. */
export type Translate = (key: string, params?: Record<string, string | number>) => string

const DICTS: Record<LocaleId, TaskboardDict> = { zh, en, ru }

/**
 * Narrow structural face of the DSH LocaleRuntime this module consumes.
 * Only the source side (snapshot/subscribe) — translation and preference
 * writes stay local, which keeps us decoupled from the DSH Translate
 * signature and the ns/common lookup chain.
 */
interface LocaleServiceFace {
  getSnapshot(): { active: string; revision: number }
  subscribe(fn: () => void): () => void
}

let service: LocaleServiceFace | undefined
let unsubscribeService: (() => void) | undefined
let snapshot: TaskboardLocaleSnapshot = { active: detectFallbackLocale(), revision: 0 }
const listeners = new Set<() => void>()

// Late attach (issue #16): the taskboard client injects NOTHING, so it can
// activate BEFORE the locale service provides — and before the locale
// runtime syncs <html lang> (the server-rendered static value is "en").
// Until a real service attaches, a MutationObserver re-detects on every
// <html lang> change and a short poll re-tries ctx.get('locale').
let langObserver: MutationObserver | undefined
let retryTimer: ReturnType<typeof setInterval> | undefined

/** Stop every late-attach mechanism (a service took over, or dispose). */
function clearLateAttach(): void {
  if (retryTimer !== undefined) {
    clearInterval(retryTimer)
    retryTimer = undefined
  }
  try { langObserver?.disconnect() } catch { /* observer already dead */ }
  langObserver = undefined
}

function isLocaleId(value: string): value is LocaleId {
  return value === 'zh' || value === 'en' || value === 'ru'
}

/** Derive the fallback locale without the DSH service (zh/ru only when asked). */
function detectFallbackLocale(): LocaleId {
  try {
    if (typeof document !== 'undefined') {
      const lang = document.documentElement.lang
      if (typeof lang === 'string' && lang.length > 0) {
        const lower = lang.toLowerCase()
        if (lower.startsWith('zh')) return 'zh'
        if (lower.startsWith('ru')) return 'ru'
        if (lower.startsWith('en')) return 'en'
      }
    }
  } catch { /* no DOM — fall through */ }
  try {
    if (typeof navigator !== 'undefined') {
      const lang = (navigator.language ?? 'en').toLowerCase()
      if (lang.startsWith('zh')) return 'zh'
      if (lang.startsWith('ru')) return 'ru'
      return 'en'
    }
  } catch { /* no navigator — fall through */ }
  return 'en'
}

/** Coerce an unknown ctx value into a usable service face, else undefined. */
function asLocaleService(value: unknown): LocaleServiceFace | undefined {
  const face = value as LocaleServiceFace | null | undefined
  if (face === null || face === undefined || typeof face.getSnapshot !== 'function' || typeof face.subscribe !== 'function') return undefined
  return face
}

/**
 * Watch for the late locale activation while no service is attached
 * (issue #16): re-detect on <html lang> changes (the locale runtime syncs
 * it once up) and poll ctx.get('locale') briefly (inject ordering — the
 * service may provide a moment after our apply).
 */
function startLateAttach(retryGetLocale: (() => unknown) | undefined): void {
  clearLateAttach()
  try {
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      langObserver = new MutationObserver(() => {
        if (service !== undefined) return // a real service owns the state
        const next = detectFallbackLocale()
        if (next !== snapshot.active) publish({ active: next, revision: snapshot.revision + 1 })
      })
      langObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    }
  } catch { /* no DOM — the poll below still covers service-side activation */ }
  if (retryGetLocale === undefined) return
  let tries = 0
  retryTimer = setInterval(() => {
    tries += 1
    let face: LocaleServiceFace | undefined
    try { face = asLocaleService(retryGetLocale()) } catch { face = undefined }
    if (face !== undefined) {
      initI18n(face) // attaches the service and tears the late attach down
      return
    }
    if (tries >= 8) clearLateAttach() // ~2s at 250ms — enough for boot ordering
  }, 250)
}

function publish(next: TaskboardLocaleSnapshot): void {
  if (next.active === snapshot.active && next.revision === snapshot.revision) return
  snapshot = next
  for (const fn of listeners) fn()
}

/**
 * Attach the DSH locale service (call from the client entry's apply with
 * ctx.get('locale')). Absent/malformed services are ignored — the fallback
 * detection stays in charge, and (issue #16) a late attach keeps watching:
 * the locale service can provide AFTER our activation (inject ordering), so
 * pass `retryGetLocale` to re-poll ctx.get('locale') for ~2s and pick the
 * service up the moment it exists; <html lang> changes re-run detection in
 * the meantime.
 * @param localeService - the ctx 'locale' service, when provided.
 * @param retryGetLocale - re-lookup for the service (the client entry passes
 *   `() => ctx.get?.('locale')`); polled only while no service is attached.
 */
export function initI18n(localeService: unknown, retryGetLocale?: () => unknown): void {
  const face = asLocaleService(localeService)
  if (face === undefined) {
    // No usable service: resolve the fallback NOW so a caller that inits
    // after the DOM is up gets the current detection, never a stale
    // module-load snapshot — then keep watching for the late activation.
    publish({ active: detectFallbackLocale(), revision: 0 })
    startLateAttach(retryGetLocale)
    return
  }
  clearLateAttach()
  service = face
  const sync = (): void => {
    try {
      const s = face.getSnapshot()
      const active = isLocaleId(s.active) ? s.active : detectFallbackLocale()
      publish({ active, revision: s.revision })
    } catch { /* a throwing source must not break the board */ }
  }
  sync()
  unsubscribeService = face.subscribe(sync)
}

/** Detach the service and return to fallback detection (tests, dispose). */
export function disposeI18n(): void {
  clearLateAttach()
  try { unsubscribeService?.() } catch { /* source already gone */ }
  unsubscribeService = undefined
  service = undefined
  publish({ active: detectFallbackLocale(), revision: 0 })
}

/** Subscribe-side store face for useSyncExternalStore. */
export const localeStore = {
  getSnapshot(): TaskboardLocaleSnapshot {
    return snapshot
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  },
}

const PLACEHOLDER = /\{(\w+)\}/g

/** Translate through the active dictionary, {name} placeholders substituted. */
export const translate: Translate = (key, params) => {
  const template = DICTS[snapshot.active][key as keyof TaskboardDict] ?? DICTS.en[key as keyof TaskboardDict] ?? key
  if (params === undefined) return template
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

/**
 * React hook: subscribes the component to locale changes and returns the
 * translate function (stable identity — it reads the active locale at call
 * time, so any re-render triggered by the subscription renders fresh text).
 */
export function useT(): Translate {
  useSyncExternalStore(localeStore.subscribe, localeStore.getSnapshot)
  return translate
}

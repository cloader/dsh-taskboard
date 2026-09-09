/**
 * Host-side locale reading for the few user-facing HOST log lines (the
 * gitignore suggestion). Everything else the user sees is localized by the
 * GUI (client i18n dictionaries), and host-written ledger comments carry a
 * `systemKey` that the GUI localizes at render — so this module is only for
 * the raw `console.*` lines the host emits itself.
 *
 * Source: the DSH locale plugin persists the explicit language choice as
 * `locale.preference` in `$DSH_HOME/settings.yaml` (loopback pages) and
 * exposes it through the settings service. When the preference is absent the
 * browser delegates, which the host cannot see — so we fall back to `en`,
 * matching the client's own fallback (zh only when something asked for it).
 *
 * @module dsh-taskboard/host/locale
 */
import type { Context } from '@deepseek-ai/cordis'

/** The two locales the taskboard ships. */
export type HostLocale = 'zh' | 'en'

/** Narrow settings-service face this module consumes (stringly-typed soft access). */
interface SettingsFace {
  get?: (ns: string) => unknown
}

/** The DSH locale settings section (`preference` carries the explicit choice). */
interface LocaleSettings {
  preference?: unknown
}

/**
 * Read the active GUI locale as a host-side hint. Absent / malformed settings
 * (or no settings service in scope) fall back to `en` and never throw — a
 * cosmetic log line must not break route boot.
 */
export function activeHostLocale(ctx: Context): HostLocale {
  try {
    const settings = ctx.get('settings') as SettingsFace | undefined
    const locale = settings?.get?.('locale') as LocaleSettings | undefined
    return locale?.preference === 'zh' ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

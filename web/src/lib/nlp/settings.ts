// Per-device quick-add preferences. Stored only in this browser's localStorage and
// never synced (natural-language-capture: "Per-device parsing toggle").
import { activeLanguages, VOCABULARIES, type DayMonthOrder } from './vocab'

export interface QuickAddSettings {
  /** Parse natural language in quick add. */
  enabled: boolean
  /** Explicit language list, or null to follow the browser's preferred languages. */
  languages: string[] | null
  /** Numeric date order; 'auto' follows the first active language. */
  dayMonthOrder: 'auto' | DayMonthOrder
}

export const DEFAULT_QUICK_ADD_SETTINGS: QuickAddSettings = { enabled: true, languages: null, dayMonthOrder: 'auto' }

const KEY = 'opentodo.quickadd'
const EVENT = 'opentodo:quickadd-settings'

export function loadQuickAddSettings(): QuickAddSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_QUICK_ADD_SETTINGS }
    const v = JSON.parse(raw) as Partial<QuickAddSettings>
    return {
      enabled: typeof v.enabled === 'boolean' ? v.enabled : true,
      languages: Array.isArray(v.languages) ? v.languages.filter((l): l is string => typeof l === 'string' && l in VOCABULARIES) : null,
      dayMonthOrder: v.dayMonthOrder === 'DM' || v.dayMonthOrder === 'MD' ? v.dayMonthOrder : 'auto',
    }
  } catch {
    // Private mode or blocked storage: parsing still works with the defaults.
    return { ...DEFAULT_QUICK_ADD_SETTINGS }
  }
}

export function saveQuickAddSettings(s: QuickAddSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Per-device convenience only.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENT))
}

/** Call `fn` whenever the settings change in this tab or another tab. */
export function onQuickAddSettingsChange(fn: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) fn()
  }
  window.addEventListener(EVENT, fn)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, fn)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * The language tags handed to the parser: the device's explicit list, else the
 * interface language (app-localization D5; omitted or 'system' when none is
 * chosen) followed by the browser's languages. English is always active.
 */
export function resolveLanguages(s: QuickAddSettings, browser: readonly string[], language?: string | null): string[] {
  if (s.languages !== null) return activeLanguages(s.languages)
  return activeLanguages(language && language !== 'system' ? [language, ...browser] : browser)
}

/** Where the numeric date order came from, for the quick-add settings panel. */
export type DayMonthOrderSource = 'device' | 'date-format' | 'language'

/**
 * Numeric date order and what decided it (date-time-preferences D6): the
 * explicit per-device setting, else the user's date format when it is day-month
 * or month-day, else the language rule (design D2 of natural-language-capture).
 */
export function dayMonthOrderSource(
  s: QuickAddSettings, browser: readonly string[], prefs?: { date_format?: string } | null,
): { order: DayMonthOrder; source: DayMonthOrderSource } {
  if (s.dayMonthOrder !== 'auto') return { order: s.dayMonthOrder, source: 'device' }
  if (prefs?.date_format === 'day-month') return { order: 'DM', source: 'date-format' }
  if (prefs?.date_format === 'month-day') return { order: 'MD', source: 'date-format' }
  return { order: languageDayMonthOrder(s, browser), source: 'language' }
}

/**
 * Numeric date order: explicit setting, else the date format preference, else M/D
 * only when the first preference is US-style English ("en", "en-US"), D/M for
 * every other bundled language and for English outside the US (design D2).
 */
export function resolveDayMonthOrder(s: QuickAddSettings, browser: readonly string[], prefs?: { date_format?: string } | null): DayMonthOrder {
  return dayMonthOrderSource(s, browser, prefs).order
}

function languageDayMonthOrder(s: QuickAddSettings, browser: readonly string[]): DayMonthOrder {
  const first = (s.languages !== null ? s.languages[0] : browser.find((t) => t.toLowerCase().split(/[-_]/)[0] in VOCABULARIES)) ?? 'en'
  const [lang, region] = first.toLowerCase().split(/[-_]/)
  if (lang === 'en') return !region || region === 'us' ? 'MD' : 'DM'
  return VOCABULARIES[lang]?.dayMonthOrder ?? 'MD'
}

/** `45` → `45m`, `90` → `1h30m`, `120` → `2h`. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  return m ? `${h}h${m}m` : `${h}h`
}

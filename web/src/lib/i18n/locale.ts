// Which locale the interface uses (OpenSpec `app-localization`, design D4): the
// language comes from the synced preference, the region from the browser.
import type { LanguagePref } from '../types'

/** The browser's languages, most preferred first (empty outside a browser). */
export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  return navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : []
}

const primary = (tag: string) => tag.toLowerCase().split('-')[0]

/**
 * The catalog language for a preference: the chosen one, or with 'system' the
 * first browser language that has a catalog, else English.
 */
export function resolveLanguage(pref: LanguagePref, shipped: readonly string[], browser = browserLanguages()): string {
  if (pref !== 'system') return pref
  for (const tag of browser) {
    const p = primary(tag)
    if (p === 'en' || shipped.includes(p)) return p
  }
  return 'en'
}

/**
 * The BCP 47 locale for Intl: with 'system' the browser's first entry as before;
 * otherwise the chosen language with the region of the first browser entry in
 * that language ('de-CH' for a Swiss browser), else the bare language.
 */
export function resolveLocale(pref: LanguagePref, browser = browserLanguages()): string {
  if (pref === 'system') return browser[0] ?? 'en'
  const match = browser.find((tag) => primary(tag) === pref)
  return match ?? pref
}

/**
 * Languages for quick add and voice: the chosen language first, then the
 * browser's (design D5). With 'system' the browser list as before.
 */
export function preferredLanguages(pref: LanguagePref, browser = browserLanguages()): string[] {
  if (pref === 'system') return [...browser]
  const rest = browser.filter((tag) => primary(tag) !== pref)
  return [resolveLocale(pref, browser), ...rest]
}

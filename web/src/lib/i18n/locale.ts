// Locale resolution (OpenSpec change app-localization, design D4 and D5): which
// shipped language a preference means, the locale handed to Intl (the language
// with the browser's region where it matches, so de-CH stays de-CH), and the
// language list for quick add and voice with the interface language first.
import { isShipped, type LanguageCode } from '../../locales'
import { currentPreference } from './catalog'

/** The browser's preferred languages, most preferred first. */
export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return ['en']
  return navigator.languages?.length ? navigator.languages : [navigator.language || 'en']
}

const primary = (tag: string) => tag.toLowerCase().split(/[-_]/)[0]

/** The shipped language a preference resolves to: the chosen one, else the first shipped browser language, else English. */
export function resolveLanguage(pref: string | null | undefined, browser: readonly string[] = browserLanguages()): LanguageCode {
  if (pref && pref !== 'system' && isShipped(pref)) return pref
  for (const tag of browser) {
    const p = primary(tag)
    if (isShipped(p)) return p
  }
  return 'en'
}

/**
 * The locale for Intl. With `system` it is the browser's first language, as before
 * this change; otherwise the chosen language with the region of the first browser
 * entry in that language, else the bare language.
 */
export function intlLocale(pref: string | null | undefined, browser: readonly string[] = browserLanguages()): string {
  const usable = (tag: string | undefined) => { try { return tag ? Intl.getCanonicalLocales(tag)[0] : null } catch { return null } }
  if (!pref || pref === 'system' || !isShipped(pref)) return usable(browser[0]) ?? 'en'
  return usable(browser.find((tag) => primary(tag) === pref)) ?? pref
}

/**
 * The languages quick add and voice consider (design D5): the interface language
 * first when one is chosen, then the browser's. The device's own quick-add list
 * still wins (lib/nlp/settings resolveLanguages).
 */
export function preferredLanguages(pref: string | null = currentPreference(), browser: readonly string[] = browserLanguages()): string[] {
  const chosen = pref && pref !== 'system' && isShipped(pref) ? [pref] : []
  return [...chosen, ...browser]
}

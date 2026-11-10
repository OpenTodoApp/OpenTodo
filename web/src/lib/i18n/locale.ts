// Locale resolution (OpenSpec change app-localization, design D4 and D5): which
// shipped language a preference means, the locale handed to Intl (the language
// with the browser's region where it matches, so de-CH stays de-CH), and the
// language list for quick add and voice with the interface language first.
import { isShipped, type LanguageCode } from '../../locales'
import { platform } from '../platform'
import { currentPreference } from './catalog'

/** The browser's (the device's) preferred languages, most preferred first. */
export function browserLanguages(): readonly string[] {
  return platform.languages()
}

const primary = (tag: string) => tag.toLowerCase().split(/[-_]/)[0]

const partsOf = (tag: string) => tag.toLowerCase().split(/[-_]/).filter(Boolean)

/**
 * Simplified Chinese, by script and region (simplified-chinese D2). Traditional
 * tags and unknown regions are not simplified, so a later Traditional catalog
 * does not inherit people who were shown the wrong script.
 */
export function isSimplifiedChineseTag(tag: string): boolean {
  const parts = partsOf(tag)
  if (parts[0] !== 'zh') return false
  if (parts.includes('hant')) return false
  if (parts[1] === 'tw' || parts[1] === 'hk' || parts[1] === 'mo') return false
  if (parts.includes('hans') || parts.length === 1) return true
  return parts[1] === 'cn' || parts[1] === 'sg'
}

/** A code that is actually shipped, or null. Keeps `zh` typable before it is listed. */
function shippedCode(code: string): LanguageCode | null {
  return isShipped(code) ? code : null
}

/** The shipped language a preference resolves to: the chosen one, else the first shipped browser language, else English. */
export function resolveLanguage(pref: string | null | undefined, browser: readonly string[] = browserLanguages()): LanguageCode {
  if (pref && pref !== 'system' && isShipped(pref)) return pref
  const zh = shippedCode('zh')
  for (const tag of browser) {
    if (primary(tag) === 'zh') {
      if (zh && isSimplifiedChineseTag(tag)) return zh
      continue
    }
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
  if (pref === 'zh') {
    const zh = shippedCode(pref)
    if (!zh) return usable(browser[0]) ?? 'en'
    return usable(browser.find((tag) => isSimplifiedChineseTag(tag))) ?? zh
  }
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

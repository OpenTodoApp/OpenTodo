// The message layer (OpenSpec change app-localization). See docs/translating.md.
import { setDateLocale } from '../dates'
import {
  currentLanguage, currentLocale, currentPreference, fetchCatalog, applyCatalog, mirrorPreference, mirroredPreference,
  setCurrentPreference, type LanguageCode,
} from './catalog'
import { intlLocale, resolveLanguage } from './locale'

export {
  t, msg, formatNumber, currentLanguage, currentLocale, currentPreference, languageVersion, onLanguageChange,
  mirroredPreference, SHIPPED, isShipped, type LanguageCode, type TFunction,
} from './catalog'
export { browserLanguages, intlLocale, preferredLanguages, resolveLanguage } from './locale'
export { errorMessage } from './errors'
export { T, useLanguageVersion, useT } from './react'

/**
 * Applies a stored language preference ('system' or a shipped code): loads the
 * catalog it resolves to, then makes it active, sets the document language and
 * the date locale, and remembers the preference for the next first paint. When
 * the catalog cannot be loaded the current language stays and the promise
 * rejects; the preference is kept, so the next attempt applies it.
 */
export async function applyLanguagePreference(pref: string, browser?: readonly string[]): Promise<void> {
  setCurrentPreference(pref)
  const code: LanguageCode = resolveLanguage(pref, browser)
  const locale = intlLocale(pref, browser)
  if (code !== currentLanguage() || locale !== currentLocale()) {
    const entries = await fetchCatalog(code)
    setDateLocale(locale)
    applyCatalog(code, locale, entries)
  }
  if (typeof document !== 'undefined') document.documentElement.lang = code
  mirrorPreference(pref)
}

/** First paint (design D3): the language last applied on this device, else the browser's. */
export function bootLanguage(): Promise<void> {
  return applyLanguagePreference(mirroredPreference() ?? 'system').catch(() => undefined)
}

/** Whether a stored preference is already the active one. */
export function isApplied(pref: string, browser?: readonly string[]): boolean {
  return currentPreference() === pref && resolveLanguage(pref, browser) === currentLanguage()
}

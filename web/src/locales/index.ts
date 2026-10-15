// The shipped interface languages (OpenSpec `app-localization`, design D3). A
// catalog in this folder that is not listed here is work in progress: the
// catalog check reports it, the app never offers it. English is the source
// language and has no catalog.
export const SHIPPED_LANGUAGES: readonly string[] = []

/** Each language in its own name, for the language picker. */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
}

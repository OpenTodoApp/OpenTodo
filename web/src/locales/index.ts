// The shipped interface languages (OpenSpec change app-localization, design D3).
// English is the source text in the code; every other language has a catalog
// <code>.json beside this file. A catalog in this folder that is not listed here is
// work in progress: `make i18n-check` reports it, Settings never offers it.
export const SHIPPED = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
] as const

export type LanguageCode = (typeof SHIPPED)[number]['code']

export const isShipped = (code: unknown): code is LanguageCode => SHIPPED.some((l) => l.code === code)

/** A language's name written in that language ("Deutsch"). */
export const nativeName = (code: LanguageCode): string => SHIPPED.find((l) => l.code === code)!.name

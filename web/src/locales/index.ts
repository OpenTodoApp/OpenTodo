// The shipped interface languages (OpenSpec change app-localization, design D3).
// English is the source text in the code; every other language has a catalog
// <code>.json beside this file. A catalog in this folder that is not listed here is
// work in progress: `make i18n-check` reports it, Settings never offers it.
//
// An entry with `community: true` is a community language (OpenSpec change
// more-languages, design D4): at least 90 % translated, a maintainer named in
// docs/translating.md, listed after the maintained languages with a caption, and
// missing text in English. Every other entry is maintained and complete.
export const SHIPPED = [
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
  { code: 'pt', name: 'Português' },
  { code: 'zh', name: '简体中文' },
  { code: 'nl', name: 'Nederlands' },
] as const satisfies readonly ShippedLanguage[]

/** One entry of SHIPPED. */
export interface ShippedLanguage {
  code: string
  /** The language's name in the language itself ("Deutsch"). */
  name: string
  /** A community translation (design D4); absent for a maintained language. */
  community?: true
}

export type LanguageCode = (typeof SHIPPED)[number]['code']

const LIST: readonly ShippedLanguage[] = SHIPPED

export const isShipped = (code: unknown): code is LanguageCode => SHIPPED.some((l) => l.code === code)

/** A language's name written in that language ("Deutsch"). */
export const nativeName = (code: LanguageCode): string => SHIPPED.find((l) => l.code === code)!.name

/** A shipped language's own name for any code ("nl" → "Nederlands"), or the code itself when none is shipped. */
export const languageName = (code: string): string => SHIPPED.find((l) => l.code === code)?.name ?? code

/** Whether a language is a community translation rather than a maintained one. */
export const isCommunity = (code: string, list: readonly ShippedLanguage[] = LIST): boolean =>
  list.some((l) => l.code === code && l.community === true)

/** The maintained languages, complete on every surface (emails, the digest, channel messages). */
export const MAINTAINED: readonly ShippedLanguage[] = LIST.filter((l) => !l.community)

/** The languages in the order Settings lists them: maintained first, then community ones. */
export const panelOrder = (list: readonly ShippedLanguage[] = LIST): ShippedLanguage[] =>
  [...list.filter((l) => !l.community), ...list.filter((l) => l.community)]

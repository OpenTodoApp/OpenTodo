import { de } from './de'
import { en } from './en'
import { es } from './es'
import { fr } from './fr'
import { it } from './it'
import { pt } from './pt'
import type { Vocabulary } from './types'

export type { DayMonthOrder, MonthVocab, Vocabulary } from './types'

/** Every bundled vocabulary, keyed by primary language subtag. */
export const VOCABULARIES: Record<string, Vocabulary> = { en, de, fr, it, es, pt }

export const BUNDLED_LANGUAGES = Object.keys(VOCABULARIES)

/**
 * Fold a word for matching: lower case, no diacritics, "ß" → "ss", typographic
 * apostrophes → "'". Trailing commas are dropped so "tomorrow," still matches.
 */
export function normalize(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[,;]+$/, '')
}

/**
 * Reduce a browser language list ("de-CH", "en-US", "ja") to the bundled codes in
 * preference order, always ending with English. Unknown languages are dropped.
 */
export function activeLanguages(preferred: readonly string[]): string[] {
  const out: string[] = []
  for (const tag of preferred) {
    const code = tag.toLowerCase().split(/[-_]/)[0]
    if (code in VOCABULARIES && !out.includes(code)) out.push(code)
  }
  if (!out.includes('en')) out.push('en')
  return out
}

export function vocabulariesFor(languages: readonly string[]): Vocabulary[] {
  return activeLanguages(languages).map((code) => VOCABULARIES[code])
}

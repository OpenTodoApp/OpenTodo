// Aisle sections of a reusable list (OpenSpec reusable-lists, design D5): the nine
// fixed aisle keys, their names in the app language and catalogue icons, and the
// bundled word lists that place a new item. The word lists are one JSON file per
// app language, loaded lazily (only in a project that sorts into aisles), and
// never leave the device.
import { msg, t } from '../i18n'
import { normalizeTitle } from '../reusable'
import type { Section } from '../types'

export const AISLES = ['produce', 'bakery', 'dairy', 'meat', 'frozen', 'pantry', 'drinks', 'household', 'personal'] as const
export type Aisle = (typeof AISLES)[number]

const NAMES: Record<Aisle, string> = {
  produce: msg('Produce'),
  bakery: msg('Bakery'),
  dairy: msg('Dairy and eggs'),
  meat: msg('Meat and fish'),
  frozen: msg('Frozen'),
  pantry: msg('Pantry'),
  drinks: msg('Drinks'),
  household: msg('Household'),
  personal: msg('Personal care'),
}

/** A catalogue icon per aisle (design-system "Icon catalogue"). */
export const AISLE_ICONS: Record<Aisle, string> = {
  produce: 'carrot', bakery: 'croissant', dairy: 'milk', meat: 'beef', frozen: 'snowflake',
  pantry: 'wheat', drinks: 'cup-soda', household: 'house', personal: 'bath',
}

/** The aisle's name in the app language. */
export const aisleName = (a: Aisle): string => t(NAMES[a])

/** A section's aisle key, or null for none or an unknown key (a newer client's). */
export function aisleOf(s: Pick<Section, 'aisle'> | null | undefined): Aisle | null {
  const v = s?.aisle
  return typeof v === 'string' && (AISLES as readonly string[]).includes(v) ? (v as Aisle) : null
}

/** Word (or phrase of up to four words, normalized) → aisle key. */
export type Vocabulary = Readonly<Record<string, string>>

const files = import.meta.glob<Vocabulary>('./*.json', { import: 'default' })

/** The vocabularies for `lang` and English, in that order; a language without a file falls back to English only. */
export async function loadVocabularies(lang: string): Promise<Vocabulary[]> {
  const code = lang.toLowerCase().split('-')[0]
  const codes = code === 'en' ? ['en'] : [code, 'en']
  const out: Vocabulary[] = []
  for (const c of codes) {
    const load = files[`./${c}.json`]
    if (load) out.push(await load())
  }
  return out
}

const MAX_WORDS = 4
// Punctuation at a word's edges ("milk," "(organic)") is not part of it.
const EDGES = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu

/**
 * The aisle a title's words name: the first vocabulary with a match wins (the
 * app language before English); in it the longest phrase wins, ties to the one
 * that starts first. Null when no word matches.
 */
export function aisleForTitle(title: string, vocabularies: readonly Vocabulary[]): Aisle | null {
  const words = normalizeTitle(title).split(' ').map((w) => w.replace(EDGES, '')).filter(Boolean)
  for (const vocab of vocabularies) {
    for (let n = Math.min(MAX_WORDS, words.length); n >= 1; n--) {
      for (let i = 0; i + n <= words.length; i++) {
        const hit = vocab[words.slice(i, i + n).join(' ')]
        if (hit && (AISLES as readonly string[]).includes(hit)) return hit as Aisle
      }
    }
  }
  return null
}

/** The first live section of the project carrying `aisle`, by position; null when there is none. */
export function sectionForAisle(projectId: string, aisle: Aisle | null, sections: readonly Section[]): string | null {
  if (!aisle) return null
  const hits = sections
    .filter((s) => s.project_id === projectId && !s.deleted_at && aisleOf(s) === aisle)
    .sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1))
  return hits[0]?.id ?? null
}

/** The aisles the project has no live section for, in store order. */
export function missingAisles(projectId: string, sections: readonly Section[]): Aisle[] {
  const have = new Set(sections.filter((s) => s.project_id === projectId && !s.deleted_at).map(aisleOf))
  return AISLES.filter((a) => !have.has(a))
}

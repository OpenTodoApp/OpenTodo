// Per-language spoken-token tables for voice capture (OpenSpec `voice-capture`, D3).
//
// Every table defines the same keys (a test enforces it). Words are matched after the
// quick-add parser's `normalize()` (lower case, no diacritics, "ß" → "ss"), so they
// may be written with their natural spelling. Multi-word phrases use single spaces.
// Time cues ("at" words, hour words, am/pm, "in") and hour units are not repeated
// here: normalisation reads them from the parser's vocabularies in `../../nlp/vocab`,
// so the two cannot drift apart.

export interface SpokenTable {
  /** BCP 47 primary language subtag, as in the parser's vocabularies. */
  code: string
  /** "hashtag <word>" → `#<word>`, always. */
  hashtag: string[]
  /** "project <name>" → `#<name>`, only when <name> is an existing project. */
  project: string[]
  /** "label <word>" → `@<word>`, always. */
  label: string[]
  /** "at <name>" → `@<name>`, only when <name> is an existing label. */
  labelAt: string[]
  /** "priority <one..four>" → `p1`–`p4`. */
  priority: string[]
  /** Spoken numbers 0–59, including compounds ("forty five", "einundzwanzig"). */
  numbers: Record<string, number>
  /** Words read as a leading zero of the minutes ("nine oh five" → 9:05). */
  minuteZero: string[]
  /** Minute units for durations ("thirty minutes" → `+30m`). */
  minutes: string[]
  /** "and" joining hours and minutes in a duration ("one hour and ten minutes"). */
  and: string[]
  /** Words before a duration that are absorbed with it ("for thirty minutes"). */
  durationBefore: string[]
}

/**
 * Build the 0–59 number map from the words for 0–19 (alternatives allowed), the tens
 * 20–50 and a compound rule. Hyphenated forms are also accepted with spaces, because
 * recognisers differ in how they write them ("vingt-deux" / "vingt deux").
 */
export function numberWords(
  ones: (string | string[])[],
  tens: string[],
  compound: (ten: string, one: string, unit: number) => string[],
): Record<string, number> {
  const out: Record<string, number> = {}
  const add = (word: string, n: number) => {
    out[word] = n
    if (word.includes('-')) out[word.replace(/-/g, ' ')] = n
  }
  const words = ones.map((w) => (Array.isArray(w) ? w : [w]))
  words.forEach((alts, n) => alts.forEach((w) => add(w, n)))
  tens.forEach((ten, i) => {
    const base = (i + 2) * 10
    add(ten, base)
    for (let unit = 1; unit <= 9; unit++) for (const one of words[unit]) for (const w of compound(ten, one, unit)) add(w, base + unit)
  })
  return out
}

// The server reads Todoist's localised date strings with the same month, weekday
// and day-word vocabulary as quick add (OpenSpec change named-importers, design
// D7). The vocabulary is exported to internal/importer/nlpvocab.json, which the
// Go importer embeds; this test fails when the two drift apart.
// Regenerate with: UPDATE_NLP_VOCAB=1 npx vitest run src/lib/nlp/vocabExport.test.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { normalize, VOCABULARIES } from './vocab'

const target = fileURLToPath(new URL('../../../../internal/importer/nlpvocab.json', import.meta.url))

/** The subset the server needs, folded with `normalize` so Go can match plainly. */
function exported() {
  const n = (list: string[]) => list.map(normalize)
  return Object.fromEntries(
    Object.entries(VOCABULARIES).map(([code, v]) => [
      code,
      {
        dayMonthOrder: v.dayMonthOrder,
        dayWords: Object.fromEntries(Object.entries(v.dayWords).map(([k, d]) => [normalize(k), d])),
        weekdays: v.weekdays.map(n),
        months: v.months.map((m) => ({ names: n(m.names), abbr: n(m.abbr) })),
        units: { day: n(v.units.day), week: n(v.units.week), month: n(v.units.month) },
        ofWords: n(v.ofWords),
        atWords: n(v.atWords),
        hourWords: n(v.hourWords),
        am: n(v.am),
        pm: n(v.pm),
      },
    ]),
  )
}

describe('NLP vocabulary shared with the server', () => {
  it('internal/importer/nlpvocab.json matches the quick-add vocabulary', () => {
    const want = JSON.stringify(exported(), null, 2) + '\n'
    if (process.env.UPDATE_NLP_VOCAB) writeFileSync(target, want)
    expect(readFileSync(target, 'utf8')).toBe(want)
  })
})

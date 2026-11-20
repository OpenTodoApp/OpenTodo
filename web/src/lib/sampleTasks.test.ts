// The sample tasks' words fit a row (OpenSpec change moments-and-onboarding, design
// risks): every title at most 50 characters and the note at most 200, in every catalog.
import { describe, expect, it } from 'vitest'
import de from '../locales/de.json'
import es from '../locales/es.json'
import fr from '../locales/fr.json'
import it_ from '../locales/it.json'
import pt from '../locales/pt.json'
import { holdsSample, SAMPLE_NOTE, SAMPLE_SUBTASK, SAMPLE_TITLES } from './sampleTasks'
import type { Task } from './types'

const catalogs: Record<string, Record<string, string>> = { en: {}, de, es, fr, it: it_, pt }

describe('sample task words', () => {
  for (const [lang, cat] of Object.entries(catalogs)) {
    it(`${lang}: titles within 50 characters, the note within 200`, () => {
      for (const title of [...SAMPLE_TITLES, SAMPLE_SUBTASK]) expect((cat[title] ?? title).length, title).toBeLessThanOrEqual(50)
      expect((cat[SAMPLE_NOTE] ?? SAMPLE_NOTE).length).toBeLessThanOrEqual(200)
    })
  }
})

// The Inbox menu's question, from the shared snapshot (inbox-first-sync): a write that
// touches no sample keeps the answer without looking at the other rows.
describe('holdsSample', () => {
  const row = (id: string, over: Partial<Task> = {}) => ({ id, title: id, deleted_at: null, sample: false, ...over }) as Task
  it('answers from the rows and follows the writes that touch a sample', () => {
    const plain = Array.from({ length: 1000 }, (_, i) => row(`t${i}`))
    expect(holdsSample(plain)).toBe(false)
    const withSample = [...plain, row('s', { sample: true })]
    expect(holdsSample(withSample)).toBe(true)
    const trashed = [...plain, row('s', { sample: true, deleted_at: 1 })]
    expect(holdsSample(trashed)).toBe(false)
    const grown = [...trashed, row('t-new')]
    expect(holdsSample(grown)).toBe(false)
  })
})

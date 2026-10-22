// The sample tasks' words fit a row (OpenSpec change moments-and-onboarding, design
// risks): every title at most 50 characters and the note at most 200, in every catalog.
import { describe, expect, it } from 'vitest'
import de from '../locales/de.json'
import es from '../locales/es.json'
import fr from '../locales/fr.json'
import it_ from '../locales/it.json'
import pt from '../locales/pt.json'
import { SAMPLE_NOTE, SAMPLE_SUBTASK, SAMPLE_TITLES } from './sampleTasks'

const catalogs: Record<string, Record<string, string>> = { en: {}, de, es, fr, it: it_, pt }

describe('sample task words', () => {
  for (const [lang, cat] of Object.entries(catalogs)) {
    it(`${lang}: titles within 50 characters, the note within 200`, () => {
      for (const title of [...SAMPLE_TITLES, SAMPLE_SUBTASK]) expect((cat[title] ?? title).length, title).toBeLessThanOrEqual(50)
      expect((cat[SAMPLE_NOTE] ?? SAMPLE_NOTE).length).toBeLessThanOrEqual(200)
    })
  }
})

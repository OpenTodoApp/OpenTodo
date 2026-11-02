import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeTitle } from '../reusable'
import { AISLES, AISLE_ICONS, aisleForTitle, aisleOf, loadVocabularies, missingAisles, sectionForAisle } from '.'
import { CATALOGUE_NAMES } from '../../ui/icons/catalogue.names'
import type { Section } from '../types'

const dir = join(__dirname)
const section = (id: string, aisle: string | null, position: number, extra: Partial<Section> = {}): Section =>
  ({ id, name: id, project_id: 'p', position, created_at: 0, deleted_at: null, aisle, ...extra }) as Section

describe('aisle vocabularies (reusable-lists D5)', () => {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  it('has one file per app language', () => {
    expect(files.sort()).toEqual(['de.json', 'en.json', 'es.json', 'fr.json', 'it.json', 'pt.json'])
  })
  for (const f of files) {
    it(`${f}: normalized keys of at most four words, known aisles only`, () => {
      const vocab = JSON.parse(readFileSync(join(dir, f), 'utf8')) as Record<string, string>
      expect(Object.keys(vocab).length).toBeGreaterThan(150)
      for (const [word, aisle] of Object.entries(vocab)) {
        expect(normalizeTitle(word)).toBe(word)
        expect(word.split(' ').length).toBeLessThanOrEqual(4)
        expect(AISLES).toContain(aisle)
      }
    })
  }

  it('every aisle icon is in the icon catalogue', () => {
    for (const a of AISLES) expect(CATALOGUE_NAMES.split(' ')).toContain(AISLE_ICONS[a])
  })
})

describe('placing a new item', () => {
  it('finds the aisle in the app language, then English; the longest phrase wins', async () => {
    const it_ = await loadVocabularies('it')
    expect(aisleForTitle('latte', it_)).toBe('dairy')
    expect(aisleForTitle('Milk', it_)).toBe('dairy') // English fallback
    const en = await loadVocabularies('en-GB')
    expect(aisleForTitle('Greek yoghurt', en)).toBe('dairy')
    expect(aisleForTitle('Oat milk', en)).toBe('dairy')
    expect(aisleForTitle('Orange juice', en)).toBe('drinks') // two words beat "orange"
    expect(aisleForTitle('Bananas, ripe', en)).toBe('produce')
    expect(aisleForTitle('Birthday card', en)).toBeNull()
    const fr = await loadVocabularies('fr')
    expect(aisleForTitle('Pain au chocolat', fr)).toBe('bakery')
    expect(aisleForTitle('Crème fraîche', fr)).toBe('dairy')
    expect(await loadVocabularies('xx')).toHaveLength(1)
  })

  it('uses the first live section with the key, by position', () => {
    const list = [section('b', 'dairy', 2), section('a', 'dairy', 1, { deleted_at: 5 }), section('c', 'dairy', 3), section('d', null, 0)]
    expect(sectionForAisle('p', 'dairy', list)).toBe('b')
    expect(sectionForAisle('p', 'frozen', list)).toBeNull()
    expect(sectionForAisle('p', null, list)).toBeNull()
  })

  it('reads an unknown key as none and lists the missing aisles in store order', () => {
    expect(aisleOf(section('x', 'deli', 0))).toBeNull()
    expect(aisleOf(section('x', 'meat', 0))).toBe('meat')
    expect(missingAisles('p', [section('a', 'produce', 0), section('b', 'personal', 1)])).toEqual(['bakery', 'dairy', 'meat', 'frozen', 'pantry', 'drinks', 'household'])
  })
})

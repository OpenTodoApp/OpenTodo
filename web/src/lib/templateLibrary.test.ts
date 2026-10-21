// The library's offsets, search and tree (OpenSpec change template-library, task 3.1).
import { describe, expect, it } from 'vitest'
import library from '../generated/templates.json'
import { byCategory, libraryTree, offsetLabel, pick, resolveOffset, searchLibrary, type Library } from './templateLibrary'

const templates = (library as Library).templates

describe('resolveOffset (design D3)', () => {
  it('counts days, weeks and months from the start day; months clamp to the last day', () => {
    expect(resolveOffset('+0d', '2026-01-31')).toBe('2026-01-31')
    expect(resolveOffset('+2d', '2026-01-31')).toBe('2026-02-02')
    expect(resolveOffset('+1w', '2026-01-31')).toBe('2026-02-07')
    expect(resolveOffset('+1m', '2026-01-31')).toBe('2026-02-28')
    expect(resolveOffset('+1m', '2028-01-31')).toBe('2028-02-29')
    expect(resolveOffset('+12m', '2026-03-15')).toBe('2027-03-15')
    expect(resolveOffset('+11m', '2026-03-31')).toBe('2027-02-28')
    expect(() => resolveOffset('next week', '2026-01-31')).toThrow()
  })
  it('names offsets from 1 in the preview', () => {
    expect(offsetLabel('+0d')).toBe('day 1')
    expect(offsetLabel('+2d')).toBe('day 3')
    expect(offsetLabel('+1w')).toBe('week 2')
    expect(offsetLabel('+0m')).toBe('month 1')
  })
})

describe('the tree of a library template', () => {
  const trip = templates.find((x) => x.slug === 'trip-planning')!
  it('resolves every offset from the start day and uses it as the reference day', () => {
    const tree = libraryTree(trip, 'en', '2026-01-05')
    expect(tree.day).toBe('2026-01-05')
    const tasks = tree.projects[0].sections.flatMap((s) => s.tasks)
    expect(tasks.find((x) => x.title === 'Check passport expiry date')?.due).toEqual({ date: '2026-01-05' })
    expect(tasks.find((x) => x.title === 'Clothes')?.due).toEqual({ date: '2026-02-02' })
    expect(tree.projects[0].icon).toBe('plane')
  })
  it('is in the interface language where translated, English elsewhere', () => {
    const italian = libraryTree(trip, 'it', '2026-01-05')
    expect(italian.projects[0].name).toBe('Viaggio')
    expect(italian.labels.map((l) => l.name)).toEqual(['prenotazione', 'valigia'])
    expect(italian.projects[0].sections[2].tasks[0].labels).toEqual(['valigia'])
    expect(libraryTree(trip, 'de', '2026-01-05').projects[0].name).toBe('Trip')
    expect(pick(trip.text.title, 'pt')).toBe('Trip planning')
  })
})

describe('searchLibrary', () => {
  it('matches tasks and labels: "pack" finds Trip planning and Moving house only', () => {
    expect(searchLibrary(templates, 'pack', 'en').map((x) => x.slug).sort()).toEqual(['moving-house', 'trip-planning'])
  })
  it('needs every word, in the interface language or English', () => {
    expect(searchLibrary(templates, 'things done', 'en').map((x) => x.slug)).toEqual(['gtd-setup'])
    expect(searchLibrary(templates, 'valigia', 'it').map((x) => x.slug)).toEqual(['trip-planning'])
    expect(searchLibrary(templates, 'valigia', 'en')).toEqual([])
    expect(searchLibrary(templates, '  ', 'en')).toHaveLength(templates.length)
  })
  it('groups by category in the library order', () => {
    expect(byCategory(templates).map((g) => g.category)).toEqual(['personal', 'home', 'work', 'study', 'method'])
  })
})

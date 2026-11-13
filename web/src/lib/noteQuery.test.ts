// The Notes page's search tokens (OpenSpec change notes-space, notes-page "Search tokens").
import { describe, expect, it } from 'vitest'
import type { NoteEntry } from './noteList'
import { addTokens, commitTokens, compileTokens, filterByTokens, missing, chipText, monthRange, parseStoredTokens, replaceTyping, tokenOf, tokensFromFilters, typingOf, type MatchContext, type NoteToken, type TokenWorld } from './noteQuery'

const W: TokenWorld = {
  projects: [{ id: 'house', name: 'House' }, { id: 'kitchen', name: 'Kitchen', parent_id: 'house' }, { id: 'side', name: 'Side projects' }, { id: 'reno', name: 'Renovation' }],
  labels: [{ id: 'errand', name: 'errand' }, { id: 'phone', name: 'Phone' }, { id: 'cafe', name: 'Café' }],
  notes: [{ id: 'trip', title: 'Trip' }, { id: 'pack', title: 'Packing list' }, { id: 'ideas', title: 'Ideas' }],
}
const NOW = Date.UTC(2026, 10, 10, 12)
const DAY = 86_400_000
const e = (key: string, extra: Partial<NoteEntry> = {}): NoteEntry => {
  const [source, id] = key.split(':') as [NoteEntry['source'], string]
  return { key, source, id, title: id, text: '', projectId: null, labels: [], updated: NOW, ...extra }
}
const ENTRIES = [
  e('task:paint', { projectId: 'house', labels: ['errand'] }),
  e('task:tiles', { projectId: 'kitchen', labels: ['phone'], updated: NOW - 10 * DAY }),
  e('project:house', { projectId: 'house', updated: NOW - 40 * DAY }),
  e('note:trip', { projectId: 'reno', labels: ['errand'], updated: NOW - DAY }),
  e('note:pack', { updated: NOW - 3 * DAY }),
  e('note:ideas', { updated: Date.UTC(2026, 9, 31, 12) }),
]
const ctx = (extra: Partial<MatchContext> = {}): MatchContext => ({
  projects: W.projects, pinnedIds: ['pack'], now: NOW, dayOf: (ms) => new Date(ms).toISOString().slice(0, 10),
  linked: new Set(['note:trip', 'note:pack']),
  linkedWith: (id) => (id === 'trip' ? new Set(['note:pack', 'task:tiles', 'note:trip']) : new Set()),
  ...extra,
})
const keys = (tokens: NoteToken[], c = ctx()) => filterByTokens(ENTRIES, tokens, c)!.map((x) => x.key)
const tok = (raw: string) => tokenOf(raw, W)!

describe('reading tokens', () => {
  it('reads every key, the # and @ forms, quotes, case and accents', () => {
    expect(tok('in:House')).toEqual({ key: 'in', id: 'house', name: 'House' })
    expect(tok('#house')).toEqual(tok('in:House'))
    expect(tok('in:"Side projects"')).toEqual({ key: 'in', id: 'side', name: 'Side projects' })
    expect(tok('@errand')).toEqual({ key: 'label', id: 'errand', name: 'errand' })
    expect(tok('label:phone')).toEqual({ key: 'label', id: 'phone', name: 'Phone' })
    expect(tok('@cafe')).toEqual({ key: 'label', id: 'cafe', name: 'Café' })
    expect(tok('kind:task')).toEqual({ key: 'kind', value: 'task' })
    expect(tok('kind:standalone')).toEqual({ key: 'kind', value: 'note' })
    expect(tok('linked:"packing list"')).toEqual({ key: 'linked', id: 'pack', name: 'Packing list' })
    expect(tok('ORPHAN')).toEqual({ key: 'orphan' })
    expect(tok('unlinked')).toEqual({ key: 'orphan' })
    expect(tok('pinned')).toEqual({ key: 'pinned' })
    for (const v of ['<7d', '>2w', '>3m', 'today', 'yesterday', '2026-11-01', '<2026-11-01', '>2026-11-01']) expect(tok(`changed:${v}`)).toEqual({ key: 'changed', value: v })
  })

  it('leaves words and tokens that name nothing as words', () => {
    for (const raw of ['ferry', 'in:Nowhere', 'kind:folder', 'changed:soon', 'changed:2026-02-30', 'foo:bar', '"pinned"']) expect(tokenOf(raw, W)).toBeNull()
  })
})

describe('committing chips', () => {
  it('commits complete tokens and keeps words and the token being typed', () => {
    expect(commitTokens('in:House ferry kind:no', W)).toEqual({ text: 'ferry kind:no', tokens: [tok('in:House')] })
    expect(commitTokens('kind:note changed:<7d ', W)).toEqual({ text: '', tokens: [tok('kind:note'), tok('changed:<7d')] })
    expect(commitTokens('ferry', W)).toEqual({ text: 'ferry', tokens: [] })
  })

  it('a paste commits its last token too', () => {
    expect(commitTokens('@errand ferry #House', W, true)).toEqual({ text: 'ferry ', tokens: [tok('@errand'), tok('#House')] })
  })

  it('adds a chip only once', () => {
    expect(addTokens([tok('@errand')], [tok('label:errand'), tok('pinned')])).toEqual([tok('@errand'), tok('pinned')])
  })
})

describe('typing', () => {
  it('suggests values after a key and keys after two letters', () => {
    expect(typingOf('ferry in:Hou')).toMatchObject({ kind: 'value', key: 'in', value: 'Hou' })
    expect(typingOf('@')).toMatchObject({ kind: 'value', key: 'label', value: '' })
    expect(typingOf('#"Side pro')).toMatchObject({ kind: 'value', key: 'in', value: 'Side pro' })
    expect(typingOf('pin')).toMatchObject({ kind: 'key', words: ['pinned'] })
    expect(typingOf('li')).toMatchObject({ kind: 'key', words: ['linked:'] })
    expect(typingOf('p')).toBeNull()
    expect(typingOf('ferry ')).toBeNull()
    expect(typingOf('pinned')).toBeNull()
  })

  it('replaces the typed segment', () => {
    const t = typingOf('ferry in:Hou')!
    expect(replaceTyping('ferry in:Hou', t, 'in:House ')).toBe('ferry in:House ')
  })
})

describe('matching (notes-page "Search tokens")', () => {
  it('Project with sub-projects: in:House keeps task notes, project notes and notes in House and Kitchen', () => {
    expect(keys([tok('in:House')])).toEqual(['task:paint', 'task:tiles', 'project:house'])
  })

  it('Labels like the task filter, two labels with either', () => {
    expect(keys([tok('@errand')])).toEqual(['task:paint', 'note:trip'])
    expect(keys([tok('@errand'), tok('@phone')])).toEqual(['task:paint', 'task:tiles', 'note:trip'])
  })

  it('Kind and age, keys combined with AND', () => {
    expect(keys([tok('kind:note'), tok('changed:<7d')])).toEqual(['note:trip', 'note:pack'])
    expect(keys([tok('changed:>30d')])).toEqual(['project:house'])
    expect(keys([tok('changed:today')])).toEqual(['task:paint'])
    expect(keys([tok('changed:yesterday')])).toEqual(['note:trip'])
    expect(keys([tok('changed:<2026-11-01')])).toEqual(['task:tiles', 'project:house', 'note:ideas'])
    expect(keys([tok('changed:2026-10-31')])).toEqual(['task:tiles', 'note:ideas'])
  })

  it('Linked with a note, not the note itself; orphans; pinned', () => {
    expect(keys([tok('linked:Trip')])).toEqual(['task:tiles', 'note:pack'])
    expect(keys([tok('orphan')])).toEqual(['note:ideas'])
    expect(keys([tok('pinned')])).toEqual(['note:pack'])
  })

  it('waits for the link index', () => {
    expect(filterByTokens(ENTRIES, [tok('orphan')], ctx({ linked: null }))).toBeNull()
    expect(filterByTokens(ENTRIES, [tok('linked:Trip')], ctx({ linkedWith: () => null }))).toBeNull()
  })

  it('a deleted item matches nothing and keeps its name; a rename shows the new name', () => {
    const gone: NoteToken = { key: 'in', id: 'gone', name: 'Old' }
    expect(keys([gone])).toEqual([])
    expect(missing(gone, W)).toBe(true)
    expect(chipText(gone, W)).toEqual({ key: 'in:', value: 'Old' })
    expect(chipText({ key: 'in', id: 'reno', name: 'Before' }, W)).toEqual({ key: 'in:', value: 'Renovation' })
  })

  it('count check: 2,500 entries, one lookup of the link index per chip, never per entry', () => {
    const many = Array.from({ length: 2500 }, (_, i) => e(`note:n${i}`, { updated: NOW - i * 3_600_000 }))
    let lookups = 0
    const c = ctx({ linkedWith: () => { lookups++; return new Set(['note:n1']) } })
    const test = compileTokens([tok('linked:Trip'), tok('changed:<7d'), tok('kind:note')], c)!
    expect(many.filter(test).map((x) => x.key)).toEqual(['note:n1'])
    expect(lookups).toBe(1)
  })
})

describe('stored chips', () => {
  it('Filters of an earlier version become chips', () => {
    expect(tokensFromFilters({ source: 'note', projectId: 'reno', labelId: null }, W)).toEqual([{ key: 'kind', value: 'note' }, { key: 'in', id: 'reno', name: 'Renovation' }])
    expect(tokensFromFilters({ source: 'unlinked', projectId: null, labelId: 'errand' }, W)).toEqual([{ key: 'orphan' }, { key: 'label', id: 'errand', name: 'errand' }])
    expect(tokensFromFilters({ source: 'all', projectId: null, labelId: null }, W)).toEqual([])
  })

  it('reads back what it wrote and drops anything else', () => {
    const list: NoteToken[] = [tok('in:House'), tok('kind:task'), tok('changed:<7d'), tok('pinned')]
    expect(parseStoredTokens(JSON.parse(JSON.stringify(list)))).toEqual(list)
    expect(parseStoredTokens([{ key: 'kind', value: 'folder' }, { key: 'in' }, 3, null])).toEqual([])
    expect(parseStoredTokens('x')).toBeNull()
  })
})

// note-search-operators "Changed within a date range" and the field prefixes.
describe('changed: ranges and field prefixes', () => {
  const notes = [
    e('note:trip', { updated: Date.UTC(2026, 9, 14, 9) }),
    e('note:taxes', { updated: Date.UTC(2026, 10, 2, 9) }),
    e('note:ideas', { updated: Date.UTC(2026, 8, 30, 9) }),
    e('note:late', { updated: Date.UTC(2026, 9, 31, 23, 30) }),
  ]
  const kept = (raw: string) => filterByTokens(notes, [tokenOf(raw, W)!], ctx())!.map((x) => x.id)

  it('October: a chip, both ends included', () => {
    const t = commitTokens('changed:2026-10-01..2026-10-31 ', W)
    expect(t.tokens).toEqual([{ key: 'changed', value: '2026-10-01..2026-10-31' }])
    expect(chipText(t.tokens[0], W).value).toMatch(/Oct/)
    expect(chipText(t.tokens[0], W).value).toMatch(/2026/)
    expect(kept('changed:2026-10-01..2026-10-31')).toEqual(['trip', 'late'])
  })

  it('backwards and open ends', () => {
    expect(tokenOf('changed:2026-10-31..2026-10-01', W)).toEqual({ key: 'changed', value: '2026-10-01..2026-10-31' })
    expect(kept('changed:2026-10-01..')).toEqual(['trip', 'taxes', 'late'])
    expect(kept('changed:..2026-09-30')).toEqual(['ideas'])
    expect(tokenOf('changed:..', W)).toBeNull()
    expect(tokenOf('changed:2026-02-30..2026-03-01', W)).toBeNull()
  })

  it('Last month from the suggestions covers the month before', () => {
    expect(monthRange('2026-11-12', -1)).toBe('2026-10-01..2026-10-31')
    expect(monthRange('2026-01-05', -1)).toBe('2025-12-01..2025-12-31')
    expect(monthRange('2026-02-10', 0)).toBe('2026-02-01..2026-02-28')
  })

  it('title: and text: are offered like the keys and stay words', () => {
    expect(typingOf('ti')).toEqual({ kind: 'key', words: ['title:'], raw: 'ti' })
    // te also offers the template token (note-templates).
    expect(typingOf('te')).toEqual({ kind: 'key', words: ['template', 'text:'], raw: 'te' })
    expect(commitTokens('title:wifi ', W)).toEqual({ text: 'title:wifi ', tokens: [] })
  })
})

describe('the template token (note-templates)', () => {
  it('"Only templates": keeps the templates and combines with the other keys', () => {
    const list = [...ENTRIES, e('note:meet', { template: true, labels: ['errand'] }), e('note:retro', { template: true })]
    expect(tok('template')).toEqual({ key: 'template' })
    expect(filterByTokens(list, [tok('template')], ctx())!.map((x) => x.key)).toEqual(['note:meet', 'note:retro'])
    expect(filterByTokens(list, [tok('template'), tok('@errand')], ctx())!.map((x) => x.key)).toEqual(['note:meet'])
    expect(parseStoredTokens([{ key: 'template' }])).toEqual([{ key: 'template' }])
  })
})

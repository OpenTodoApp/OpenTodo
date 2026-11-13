// Token suggestions (OpenSpec change smart-title-tokens, design D1 and D2).
import { describe, expect, it } from 'vitest'
import { matchProject } from './attributes'
import { parse } from './parse'
import { findLabel } from './quickadd'
import { energySuggestions, hasExact, insertToken, labelSuggestions, PRIORITY_SUGGESTIONS, projectSuggestions, tokenAtCaret } from './suggest'

const projects = [
  { id: 'p-home', name: 'Home' }, { id: 'p-homework', name: 'Homework' }, { id: 'p-reno', name: 'Home renovation' },
  { id: 'p-work', name: 'Work' }, { id: 'p-work-docs', name: 'Docs', parent_id: 'p-work' }, { id: 'p-home-docs', name: 'Docs', parent_id: 'p-home' },
  { id: 'p-cafe', name: 'Café plans' }, { id: 'p-old', name: 'Old', archived: true },
]
const labels = [{ id: 'l1', name: 'errand' }, { id: 'l2', name: 'deep work' }, { id: 'l3', name: 'gone', deleted_at: 1 }]

describe('tokenAtCaret', () => {
  it('finds a # or @ at the start of the word under the caret', () => {
    expect(tokenAtCaret('Paint the hall #ren', 19)).toEqual({ kind: 'project', start: 15, end: 19, query: 'ren' })
    expect(tokenAtCaret('Call @d', 7)).toEqual({ kind: 'label', start: 5, end: 7, query: 'd' })
    expect(tokenAtCaret('Call #', 6)).toEqual({ kind: 'project', start: 5, end: 6, query: '' })
  })

  it('is null in a plain word, in the middle of a word and inside quotes', () => {
    expect(tokenAtCaret('Call the bank', 9)).toBeNull()
    expect(tokenAtCaret('a#b', 3)).toBeNull()
    expect(tokenAtCaret('Read "#notes', 12)).toBeNull()
  })
})

describe('priority suggestions (priority-names D4)', () => {
  it('a lone p after a space lists the four levels; a word, a whole p1 or a line-start p does not', () => {
    expect(tokenAtCaret('Pay rent p', 10)).toEqual({ kind: 'priority', start: 9, end: 10, query: '' })
    expect(tokenAtCaret('Pay rent P', 10)?.kind).toBe('priority')
    expect(tokenAtCaret('Pay rent pa', 11)).toBeNull()
    expect(tokenAtCaret('Pay rent p1', 11)).toBeNull()
    expect(tokenAtCaret('p', 1)).toBeNull()
    expect(tokenAtCaret('Say "hi p', 9)).toBeNull()
  })
  it('picking a level inserts its numeric token, never a name', () => {
    expect(PRIORITY_SUGGESTIONS.map((s) => s.token)).toEqual(['p1', 'p2', 'p3', 'p4'])
    const at = tokenAtCaret('Pay rent p', 10)!
    expect(insertToken('Pay rent p', at, PRIORITY_SUGGESTIONS[0].token)).toEqual({ value: 'Pay rent p1 ', caret: 12 })
  })
})

describe('energy suggestions (task-energy D4)', () => {
  it('a ~ token counts only while energy is on', () => {
    expect(tokenAtCaret('Call ~', 6)).toBeNull()
    expect(tokenAtCaret('Call ~', 6, { energy: true })).toEqual({ kind: 'energy', start: 5, end: 6, query: '' })
    expect(tokenAtCaret('Call ~Me', 8, { energy: true })).toEqual({ kind: 'energy', start: 5, end: 8, query: 'Me' })
  })
  it('typing ~ suggests the three levels, a prefix narrows them, anything else none', () => {
    expect(energySuggestions('').map((s) => s.token)).toEqual(['~deep', '~medium', '~low'])
    expect(energySuggestions('L').map((s) => s.level)).toEqual(['low'])
    expect(energySuggestions('6')).toEqual([])
  })
})

describe('projectSuggestions', () => {
  it('matches any word, ignoring case and accents, and leaves archived projects out', () => {
    expect(projectSuggestions('ren', projects).map((s) => s.project.id)).toEqual(['p-reno'])
    expect(projectSuggestions('cafe', projects).map((s) => s.project.id)).toEqual(['p-cafe'])
    expect(projectSuggestions('old', projects)).toEqual([])
  })

  it('ranks exact, then prefix, and shows the path of nested projects', () => {
    const home = projectSuggestions('home', projects)
    expect(home[0].project.id).toBe('p-home')
    expect(projectSuggestions('docs', projects).map((s) => s.path)).toEqual([['Home'], ['Work']])
  })

  it('inserts a token that resolves to exactly that project, a path when the name is shared', () => {
    for (const s of [...projectSuggestions('ren', projects), ...projectSuggestions('docs', projects), ...projectSuggestions('home', projects)]) {
      expect(matchProject(s.token, projects)?.id, s.token).toBe(s.project.id)
    }
    expect(projectSuggestions('ren', projects)[0].token).toBe('#Homerenovation')
    expect(projectSuggestions('docs', projects).map((s) => s.token)).toEqual(['#Home/Docs', '#Work/Docs'])
  })
})

describe('labelSuggestions', () => {
  it('suggests live labels and inserts a token that finds them, spaces as dashes', () => {
    const s = labelSuggestions('d', labels)
    expect(s.map((x) => x.label.id)).toEqual(['l2'])
    expect(s[0].token).toBe('@deep-work')
    expect(findLabel('deep-work', labels)?.id).toBe('l2')
  })

  it('offers Create only when nothing has exactly the typed name', () => {
    expect(hasExact('label', 'd', projects, labels)).toBe(false)
    expect(hasExact('label', 'Errand', projects, labels)).toBe(true)
    expect(hasExact('project', 'garden', projects, labels)).toBe(false)
    expect(hasExact('project', 'home', projects, labels)).toBe(true)
  })
})

describe('insertToken', () => {
  it('replaces the typed token with the picked one and a space, caret after it', () => {
    const at = tokenAtCaret('Paint the hall #ren', 19)!
    expect(insertToken('Paint the hall #ren', at, '#Homerenovation')).toEqual({ value: 'Paint the hall #Homerenovation ', caret: 31 })
  })
})

// Dutch (OpenSpec change more-languages, task 2.3): suggestions fold Dutch names,
// and a #token or @token next to Dutch date words is suggested and explained the same.
describe('Dutch lines', () => {
  const nlProjects = [{ id: 'p-verb', name: 'Verbouwing' }, { id: 'p-tuin', name: 'Tuin' }, { id: 'p-tuinhuis', name: 'Tuinhuis' }, { id: 'p-een', name: 'Één keer per jaar' }]
  const nlLabels = [{ id: 'l-bel', name: 'bellen' }, { id: 'l-bood', name: 'boodschappen' }]
  const nl = (line: string) => parse(line, { today: '2026-10-09', languages: ['nl'], projects: nlProjects })

  it('suggests Dutch project and label names, accents folded, and the token resolves', () => {
    const line = 'Tegels kiezen morgen om half 4 #verb'
    const at = tokenAtCaret(line, line.length)!
    expect(at).toEqual({ kind: 'project', start: 31, end: 36, query: 'verb' })
    const [s] = projectSuggestions(at.query, nlProjects)
    expect(s.token).toBe('#Verbouwing')
    expect(nl(insertToken(line, at, s.token).value)).toMatchObject({ projectId: 'p-verb', title: 'Tegels kiezen', due: { date: '2026-10-10', time: '03:30' } })
    expect(projectSuggestions('een', nlProjects).map((x) => x.project.id)).toEqual(['p-een'])
    expect(labelSuggestions('bo', nlLabels).map((x) => x.token)).toEqual(['@boodschappen'])
  })

  it('explains an unmatched #token while the Dutch date words still parse', () => {
    expect(nl('Snoeien elke zaterdag #tuinn')).toMatchObject({ recurrence: 'every saturday', unmatched: [{ span: { start: 22, end: 28, text: '#tuinn' }, reason: 'none' }] })
    expect(nl('Snoeien op vr #tuin').unmatched).toEqual([])
    expect(nl('Snoeien op vr #tui').unmatched).toEqual([expect.objectContaining({ reason: 'ambiguous', count: 2 })])
  })
})

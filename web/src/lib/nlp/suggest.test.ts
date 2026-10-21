// Token suggestions (OpenSpec change smart-title-tokens, design D1 and D2).
import { describe, expect, it } from 'vitest'
import { matchProject } from './attributes'
import { findLabel } from './quickadd'
import { hasExact, insertToken, labelSuggestions, projectSuggestions, tokenAtCaret } from './suggest'

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

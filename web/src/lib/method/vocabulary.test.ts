import { describe, expect, it } from 'vitest'
import { HORIZONS, METHOD_NAME, MOVES, PLACES, PRINCIPLES, RHYTHMS, methodScreen, move } from '.'

describe('Open Loops vocabulary (open-loops "One method vocabulary")', () => {
  const groups = { moves: MOVES, principles: PRINCIPLES, places: PLACES, rhythms: RHYTHMS, horizons: HORIZONS }

  it('has the five moves, seven principles, seven Places, three Rhythms and three Horizons', () => {
    expect(MOVES.map((m) => m.id)).toEqual(['catch', 'clarify', 'place', 'do', 'review'])
    expect(PRINCIPLES).toHaveLength(7)
    expect(PLACES.map((p) => p.id)).toEqual(['inbox', 'next', 'waiting', 'scheduled', 'later', 'someday', 'projects'])
    expect(RHYTHMS.map((r) => r.id)).toEqual(['daily', 'weekly', 'monthly'])
    expect(HORIZONS.map((h) => h.id)).toEqual(['step', 'project', 'area'])
  })

  it('every term has a unique id within its group, a name and a one-sentence description', () => {
    for (const [group, terms] of Object.entries(groups)) {
      expect(new Set(terms.map((x) => x.id)).size, group).toBe(terms.length)
      for (const term of terms) {
        expect(term.name.trim(), `${group}.${term.id}`).not.toBe('')
        expect(term.description, `${group}.${term.id}`).toMatch(/^[A-Z].*[.]$/)
      }
    }
  })

  it('every move names the screen and keys that serve it, and a Help screen', () => {
    for (const m of MOVES) {
      expect(m.route).toMatch(/^\//)
      expect(m.keys).toBeTruthy()
    }
    expect(move('clarify').route).toBe('/triage')
    expect(methodScreen('do')).toBe('method/do')
    expect(METHOD_NAME).toBe('Open Loops')
  })
})

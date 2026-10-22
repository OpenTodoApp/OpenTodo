import { describe, expect, it } from 'vitest'
import type { RuleNames } from '.'
import { queryToCondition } from './convert'
import { summarizeRule } from './summary'

const names: RuleNames = {
  labels: [{ id: 'le', name: 'errand', deleted_at: null }, { id: 'lw', name: 'waiting', deleted_at: null }],
  projects: [{ id: 'pw', name: 'Work', deleted_at: null }, { id: 'ph', name: 'Home', deleted_at: null }],
  sections: [{ id: 'sw', name: 'Waiting', deleted_at: null }],
}

describe('rule summary', () => {
  it('reads trigger · condition → actions', () => {
    expect(summarizeRule({
      trigger: { kind: 'label.added', label_id: 'lw' },
      condition: { project: { in: ['pw'] } },
      actions: { section: { project_id: 'pw', section_id: 'sw' } },
    }, names)).toBe('When label waiting is added · in Work → section Waiting of Work')
  })

  it('names the automation actions and the schedule', () => {
    expect(summarizeRule({
      trigger: { kind: 'schedule', at: '18:00', weekdays: [7] },
      condition: { due: 'overdue' },
      actions: { due: { in_days: 1 }, assignee: 'me', notify: true },
    }, names)).toBe('Sunday at 18:00 · due: overdue → due in 1 day, assigns to me, notifies me')
  })

  it('says when a part is unknown', () => {
    expect(summarizeRule({ trigger: null, condition: null, actions: { priority: 1 } }, names)).toMatch(/^When something this version does not know happens → priority 1$/)
  })
})

describe('query to condition', () => {
  it('converts a quadrant: priorities carried over, a date range across fields reported', () => {
    const r = queryToCondition('(p1 | p2) & (due <= tomorrow | deadline <= tomorrow)', names)
    expect(r.condition).toEqual({ priority: { in: [1, 2] } })
    expect(r.dropped).toEqual(['due <= tomorrow | deadline <= tomorrow'])
  })

  it('names a term not carried over', () => {
    const r = queryToCondition('@errand & search: "oat milk"', names)
    expect(r.condition).toEqual({ labels: { all: ['le'] } })
    expect(r.dropped).toEqual(['search: "oat milk"'])
  })

  it('carries the structural terms', () => {
    const r = queryToCondition('##Work & !@waiting & overdue & blocked & habit & origin: email & no deadline', names)
    expect(r.condition).toEqual({
      project: { in: ['pw'], descendants: true }, labels: { none: ['lw'] }, due: 'overdue', blocked: true, habit: true, origin: { kind: 'email' }, deadline: 'none',
    })
    expect(r.dropped).toEqual([])
  })

  it('reports a second value for one predicate, an unknown name and a bad query', () => {
    expect(queryToCondition('today & no date', names)).toEqual({ condition: { due: 'today' }, dropped: ['no date'] })
    expect(queryToCondition('@nowhere', names)).toEqual({ condition: null, dropped: ['@nowhere'] })
    expect(queryToCondition('(((', names).condition).toBeNull()
    expect(queryToCondition('#Work | #Home', names).condition).toEqual({ project: { in: ['pw', 'ph'] } })
  })
})

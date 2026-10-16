// Custom field terms in queries (OpenSpec custom-fields: "Field terms in queries"
// and the modified "Query grammar").
import { describe, expect, it } from 'vitest'
import type { FieldDef, Project, Task } from '../types'
import { runFilter, type FilterContext } from './evaluate'
import { FilterSyntaxError, parse, printQuery } from './parse'
import { fieldSuggestions } from './suggest'

const TODAY = '2026-10-16' // a Friday

/** An AST without source positions (printing moves them). */
const strip = (n: unknown): unknown => JSON.parse(JSON.stringify(n, (k, v) => (k === 'pos' || k === 'opPos' ? undefined : v)))

function def(id: string, name: string, type: FieldDef['type'], project_id: string, extra: Partial<FieldDef> = {}): FieldDef {
  return { id, name, type, project_id, options: '', position: 0, created_at: 0, deleted_at: null, _clock: {}, ...extra }
}
function project(id: string, name: string): Project {
  return { id, name, color: '#000', position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {} }
}
function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [],
    position: 0, created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...extra,
  }
}

const FIELDS: FieldDef[] = [
  def('k-cost', 'Cost', 'number', 'kitchen'),
  def('k-client', 'Client', 'choice', 'kitchen', { options: 'Acme\nGlobex' }),
  def('k-order', 'Order date', 'date', 'kitchen'),
  def('k-paid', 'Paid', 'checkbox', 'kitchen'),
  def('k-quote', 'Quote', 'link', 'kitchen'),
  def('g-cost', 'cost', 'number', 'garden'),
  def('k-due', 'due', 'date', 'kitchen'),
  def('k-old', 'Budget', 'number', 'kitchen', { deleted_at: 5 }),
]
const TASKS: Task[] = [
  task('tiles', { project_id: 'kitchen', fields: { 'k-cost': 120, 'k-client': 'Acme', 'k-order': '2026-10-14', 'k-paid': true, 'k-due': '2026-10-20' } }),
  task('paint', { project_id: 'kitchen', fields: { 'k-cost': 80, 'k-client': 'globex', 'k-order': '2026-10-20' } }),
  task('sink', { project_id: 'kitchen', fields: { 'k-cost': null, 'k-paid': false } }),
  task('seeds', { project_id: 'garden', fields: { 'g-cost': 150 } }),
  task('moved', { project_id: 'garden', fields: { 'k-cost': 999 } }),
  task('old', { project_id: 'kitchen', fields: { 'k-cost': 500, 'k-old': 20 }, completed_at: 1 }),
  task('legacy', { project_id: 'kitchen' }),
  task('wrong-type', { project_id: 'kitchen', fields: { 'k-cost': 'cheap' } }),
]
const CTX: FilterContext = { today: TODAY, labels: [], projects: [project('kitchen', 'Kitchen'), project('garden', 'Garden')], fields: FIELDS, weekStart: 1 }

function ids(q: string): string[] {
  const r = runFilter(q, TASKS, CTX)
  if (!r.ok) throw new Error(r.error)
  return r.tasks.map((t) => t.id).sort()
}

describe('field terms: grammar', () => {
  it('parses bare and quoted names, numbers, text, booleans and dates, and round-trips', () => {
    for (const q of ['cost > 100', 'client = "Acme"', '"Order date" <= friday & cost > 100', 'no cost', 'no "Order date"', 'paid = true', 'cost >= -2.5', 'client = Acme', '"Order date" = this week', 'cost = 3']) {
      const ast = parse(q)!
      expect(strip(parse(printQuery(ast)))).toEqual(strip(ast))
    }
    expect(parse('"Order date" <= friday & cost > 100')).toMatchObject({ kind: 'and', items: [
      { kind: 'field', name: 'Order date', op: '<=', value: { type: 'date', date: { type: 'weekday', day: 5 } } },
      { kind: 'field', name: 'cost', op: '>', value: { type: 'number', value: 100 } },
    ] })
    expect(parse('no cost')).toMatchObject({ kind: 'nofield', name: 'cost' })
  })

  it('keeps reserved words reserved: `due <= tomorrow` is the due-date term', () => {
    expect(parse('due <= tomorrow')).toMatchObject({ kind: 'date', field: 'due' })
    expect(parse('"due" <= tomorrow')).toMatchObject({ kind: 'field', name: 'due' })
    expect(parse('no date')).toMatchObject({ kind: 'keyword', keyword: 'no date' })
  })

  it('reports a missing value and a bare "no"', () => {
    expect(() => parse('cost >')).toThrow('Expected a value after ">" at position 6')
    expect(() => parse('no')).toThrow(FilterSyntaxError)
  })
})

describe('field terms: evaluation', () => {
  it('compares numbers numerically in every project defining the name', () => {
    expect(ids('cost > 100')).toEqual(['seeds', 'tiles'])
    expect(ids('cost <= 80')).toEqual(['paint'])
  })

  it('matches text and choice with = ignoring case and rejects other operators', () => {
    expect(ids('client = "Acme"')).toEqual(['tiles'])
    expect(ids('client = "GLOBEX"')).toEqual(['paint'])
    const r = runFilter('client > "A"', TASKS, CTX)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('support "=" only')
      expect(r.position).toBe(8)
    }
  })

  it('compares dates with the date grammar', () => {
    expect(ids('"Order date" <= today')).toEqual(['tiles'])
    expect(ids('"Order date" = this week')).toEqual(['tiles'])
    expect(ids('"Order date" > friday')).toEqual(['paint'])
    expect(ids('"due" >= 2026-10-20')).toEqual(['tiles'])
  })

  it('checkboxes take = true and = false; an unset box is unchecked', () => {
    expect(ids('paid = true')).toEqual(['tiles'])
    expect(ids('paid = false')).toEqual(['legacy', 'paint', 'sink', 'wrong-type'])
    expect(runFilter('paid > true', TASKS, CTX).ok).toBe(false)
  })

  it('`no name` lists tasks of projects defining the field without a value', () => {
    expect(ids('no cost')).toEqual(['legacy', 'moved', 'sink'])
    expect(ids('no client')).toEqual(['legacy', 'seeds', 'sink', 'wrong-type'].filter((id) => id !== 'seeds'))
  })

  it('an unknown or deleted name warns and matches nothing', () => {
    const r = runFilter('budget > 10', TASKS, CTX)
    expect(r).toMatchObject({ ok: true, tasks: [], warnings: ['No field named "budget"'] })
  })

  it('a value of another project or of the wrong type never matches; completed tasks only when asked', () => {
    expect(ids('cost > 900')).toEqual([])
    expect(ids('cost >= 500 & completed')).toEqual(['old'])
  })
})

describe('field name suggestions', () => {
  it('offers matching names after an opening quote, not after @ or #', () => {
    expect(fieldSuggestions('p1 & "or', FIELDS).map((s) => s.name)).toEqual(['Order date'])
    expect(fieldSuggestions('p1 & "or', FIELDS)[0].query).toBe('p1 & "Order date" ')
    expect(fieldSuggestions('"', FIELDS).map((s) => s.name.toLowerCase())).toEqual(['client', 'cost', 'due', 'order date', 'paid', 'quote'])
    expect(fieldSuggestions('@"or', FIELDS)).toEqual([])
    expect(fieldSuggestions('#"or', FIELDS)).toEqual([])
    expect(fieldSuggestions('"Order date" <= friday', FIELDS)).toEqual([])
  })
})

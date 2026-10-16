// Field terms in queries (OpenSpec change custom-fields, task 5.5): numbers,
// dates, text equality only, checkboxes, `no name`, unknown names, reserved words
// and the printQuery round trip.
import { describe, expect, it } from 'vitest'
import type { FieldDef, Task } from '../types'
import { runFilter } from './evaluate'
import { parse, printQuery } from './parse'

const def = (id: string, name: string, type: FieldDef['type'], project = 'p1', options = ''): FieldDef =>
  ({ id, name, type, project_id: project, options, position: 0, created_at: 0, deleted_at: null, _clock: {} } as FieldDef)
const task = (id: string, fields: Record<string, unknown>, project: string | null = 'p1'): Task =>
  ({ id, title: id, description: '', project_id: project, parent_id: null, priority: 4, due: null, labels: [], position: 0, created_at: 0, completed_at: null, deleted_at: null, fields } as unknown as Task)

const fields = [def('cost', 'Cost', 'number'), def('client', 'Client', 'text'), def('od', 'Order date', 'date'), def('paid', 'Paid', 'checkbox'), def('cost2', 'Cost', 'number', 'p2')]
const tasks = [
  task('a', { cost: 120, client: 'Acme', od: '2026-10-15', paid: true }),
  task('b', { cost: 80, client: 'acme ltd' }),
  task('c', {}),
  task('d', { cost2: 300 }, 'p2'),
  task('e', {}, null),
]
const ctx = { today: '2026-10-14', labels: [], projects: [{ id: 'p1', name: 'Kitchen', deleted_at: null }, { id: 'p2', name: 'Bath', deleted_at: null }] as never, fields }
const ids = (q: string) => { const r = runFilter(q, tasks, ctx); if (!r.ok) throw new Error(r.error); return r.tasks.map((t) => t.id) }

describe('field terms', () => {
  it('compares numbers in every project that defines the field', () => {
    expect(ids('cost > 100')).toEqual(['a', 'd'])
    expect(ids('cost <= 80')).toEqual(['b'])
  })

  it('matches text with = ignoring case, and rejects other comparisons', () => {
    expect(ids('client = "acme"')).toEqual(['a'])
    const r = runFilter('client > "A"', tasks, ctx)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.error).toMatch(/Text fields support = only/)
  })

  it('compares dates with the date grammar, and checkboxes with true / false', () => {
    expect(ids('"Order date" <= friday')).toEqual(['a'])
    expect(ids('paid = true')).toEqual(['a'])
    expect(ids('paid = false')).toEqual(['b', 'c'])
  })

  it('no name lists tasks of defining projects without a value; unknown names warn', () => {
    expect(ids('no cost')).toEqual(['c'])
    const r = runFilter('budget > 10', tasks, ctx)
    expect(r.ok && r.tasks).toEqual([])
    expect(r.ok && r.warnings).toEqual(['No field is named "budget"'])
  })

  it('keeps reserved words reserved and round-trips through printQuery', () => {
    expect(parse('due <= tomorrow')).toMatchObject({ kind: 'date', field: 'due' })
    expect(parse('"due" = "x"')).toMatchObject({ kind: 'field', name: 'due', quoted: true })
    for (const q of ['cost > 100', 'client = "Acme"', '"Order date" <= friday', 'no cost', 'paid = true', '"due" = x']) {
      expect(printQuery(parse(q)!)).toBe(q)
    }
  })

  it('accepts and rejects the same field terms as the Go parser (internal/filter)', () => {
    for (const q of ['cost > 100', 'client = "Acme"', 'client = acme', '"Order date" <= friday', 'ordered before 2026-11-01', 'ordered <= 7 days',
      'paid = true', 'no cost', 'no "Order date"', '"due" = x', 'cost >= -2,5 & !approved = false']) expect(() => parse(q), q).not.toThrow()
    const cases: [string, string][] = [
      ['cost >', 'Expected a value after ">" at position 6'],
      ['cost = (', 'Expected a value after "=" at position 6'],
      ['no today', 'Expected "date", "project", "labels", "time", "deadline" or "start" after "no" at position 1'],
      ['ordered < 3 dys', 'Expected "&" or "|" before "dys" at position 13'],
    ]
    for (const [q, msg] of cases) expect(() => parse(q), q).toThrow(msg)
    expect(ids('"Order date" before 2026-10-16')).toEqual(['a'])
  })
})

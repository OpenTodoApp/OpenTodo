// Time sector terms in the query language (OpenSpec change time-sectors, task 4.3).
import { describe, expect, it } from 'vitest'
import type { Task } from '../types'
import { compile } from './evaluate'
import { FilterSyntaxError, parse, printQuery } from './parse'

const task = (id: string, over: Partial<Task>): Task => ({
  id, title: id, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {}, ...over,
} as Task)

const tasks = [task('w44', { sector: '2026-W44' }), task('w45', { sector: '2026-W45' }), task('none', {})]
const ids = (q: string, today: string) => {
  const f = compile(parse(q)!, { today, weekStart: 1, projects: [], labels: [] })
  return tasks.filter((t) => f.test(t)).map((t) => t.id)
}

describe('sector terms', () => {
  it('read relative words in one or two words and periods in any case', () => {
    for (const q of ['sector: this week', 'sector:this-week', 'SECTOR: This Week', 'sector: "this week"']) expect(printQuery(parse(q)!)).toBe('sector: this week')
    expect(printQuery(parse('sector: 2026-w44')!)).toBe('sector: 2026-W44')
    expect(printQuery(parse('carried | no sector')!)).toBe('(carried | no sector)')
  })

  it('refuses an invalid period with an error that names it', () => {
    expect(() => parse('sector: 2026-W60')).toThrowError(FilterSyntaxError)
    expect(() => parse('sector: 2026-W60')).toThrowError(/2026-W60/)
  })

  it('follow the local date across a week boundary, from local data', () => {
    expect(ids('sector: this week', '2026-11-01')).toEqual(['w44'])
    expect(ids('sector: this week', '2026-11-02')).toEqual(['w45'])
    expect(ids('carried', '2026-11-02')).toEqual(['w44'])
    expect(ids('sector', '2026-11-02')).toEqual(['w44', 'w45'])
    expect(ids('no sector', '2026-11-02')).toEqual(['none'])
  })
})

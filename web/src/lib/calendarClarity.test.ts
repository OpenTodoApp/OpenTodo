// The pure parts of OpenSpec change calendar-clarity: deadline markers (D1) and that
// they never count toward capacity, Colour by (D3) with its contrast guarantee, the
// label clause of the filter's checkboxes (D4), the add dialog's due (D2) and the
// project layout cycle (D5).
import { describe, expect, it } from 'vitest'
import { dueOnDay } from '../app/calendar/AddOnDayDialog'
import { focusedDay } from '../app/calendar/useCalendarKeys'
import { HUE_NAMES } from '../ui/tokens/pairs'
import { calendarTasks, dayLoad, deadlineMarkers } from './calendar'
import { colorBy, NEUTRAL_HUE, normalizeColorBy, PRIORITY_HUE } from './colorBy'
import { splitLabels, withLabels } from './filter/labelTerms'
import { parse } from './filter'
import { nextViewMode } from './sections'
import type { Label, Task } from './types'

function task(p: Partial<Task> = {}): Task {
  return {
    id: 't', title: 'T', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
    created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...p,
  }
}

describe('deadlineMarkers (D1)', () => {
  const projects = [{ id: 'live', archived: false }, { id: 'old', archived: true }]
  it('lists open, live tasks of non-archived projects on their deadline day within the range', () => {
    const tasks = [
      task({ id: 'a', title: 'Report', due: { date: '2026-11-19', time: '10:00' }, deadline: '2026-11-20', project_id: 'live' }),
      task({ id: 'done', deadline: '2026-11-20', completed_at: 1 }),
      task({ id: 'gone', deadline: '2026-11-20', deleted_at: 1 }),
      task({ id: 'archived', deadline: '2026-11-20', project_id: 'old' }),
      task({ id: 'outside', deadline: '2026-12-01' }),
      task({ id: 'nodue', deadline: '2026-11-21' }),
    ]
    const m = deadlineMarkers(tasks, projects, '2026-11-16', '2026-11-22')
    expect([...m.keys()].sort()).toEqual(['2026-11-20', '2026-11-21'])
    expect(m.get('2026-11-20')!.map((t) => t.id)).toEqual(['a'])
    expect(m.get('2026-11-21')!.map((t) => t.id)).toEqual(['nodue'])
  })

  it('leaves out a task due on its deadline day: the task itself carries the diamond', () => {
    const m = deadlineMarkers([task({ due: { date: '2026-11-20' }, deadline: '2026-11-20' })], projects, '2026-11-16', '2026-11-22')
    expect(m.size).toBe(0)
  })

  it('never counts toward capacity (1.4): the day load is the same with and without markers', () => {
    const tasks = [
      task({ id: 'a', due: { date: '2026-11-19', time: '10:00' }, estimate_minutes: 60, deadline: '2026-11-20' }),
      task({ id: 'b', due: { date: '2026-11-20' }, estimate_minutes: 30 }),
    ]
    const shown = calendarTasks(tasks, [], '2026-11-16', '2026-11-22')
    const before = dayLoad(shown, '2026-11-20', 480)
    expect(deadlineMarkers(tasks, [], '2026-11-16', '2026-11-22').get('2026-11-20')!.map((t) => t.id)).toEqual(['a'])
    expect(dayLoad(shown, '2026-11-20', 480)).toEqual(before)
    expect(before.tasks).toBe(30)
  })
})

describe('colorBy (D3)', () => {
  const label = (id: string, color: string, position: number): Label => ({ id, name: id, color, position, created_at: 0, deleted_at: null, _clock: {} } as unknown as Label)
  const labels = new Map([
    ['errand', label('errand', '#f97316', 2)],
    ['call', label('call', '#3b82f6', 1)],
    ['grey', label('grey', '#64748b', 0)],
  ])
  const ctx = { projects: new Map([['p', { color: '#22c55e' }]]), labels }

  it('Project is the project hue, the neutral hue without a project', () => {
    expect(colorBy(task({ project_id: 'p' }), 'project', ctx)).toBe('green')
    expect(colorBy(task(), 'project', ctx)).toBe(NEUTRAL_HUE)
  })

  it('Label takes the first coloured label in the label order, skipping the default grey', () => {
    expect(colorBy(task({ labels: ['errand', 'call'] }), 'label', ctx)).toBe('blue')
    expect(colorBy(task({ labels: ['grey', 'errand'] }), 'label', ctx)).toBe('orange')
    expect(colorBy(task({ labels: ['grey'] }), 'label', ctx)).toBe(NEUTRAL_HUE)
    expect(colorBy(task({ labels: [] }), 'label', ctx)).toBe(NEUTRAL_HUE)
    expect(colorBy(task({ labels: ['unknown'] }), 'label', ctx)).toBe(NEUTRAL_HUE)
  })

  it('Priority takes the priority hues for P1 to P3 and the neutral hue for P4', () => {
    expect(colorBy(task({ priority: 1 }), 'priority', ctx)).toBe('red')
    expect(colorBy(task({ priority: 2 }), 'priority', ctx)).toBe('orange')
    expect(colorBy(task({ priority: 3 }), 'priority', ctx)).toBe('blue')
    expect(colorBy(task({ priority: 4 }), 'priority', ctx)).toBe(NEUTRAL_HUE)
  })

  it('every hue it returns is a palette hue, whose block edge the token tests hold to 3:1 in light and dark', () => {
    for (const hue of [...Object.values(PRIORITY_HUE), NEUTRAL_HUE]) expect(HUE_NAMES).toContain(hue)
  })

  it('a missing or unknown stored value reads as Project', () => {
    expect(normalizeColorBy(undefined)).toBe('project')
    expect(normalizeColorBy('section')).toBe('project')
    expect(normalizeColorBy('label')).toBe('label')
    expect(normalizeColorBy('priority')).toBe('priority')
  })
})

describe('label checkboxes write the query (D4)', () => {
  it('an empty or label-only query is the label clause', () => {
    expect(withLabels('', ['errand'])).toBe('@errand')
    expect(withLabels('@errand', ['errand', 'call'])).toBe('@errand | @call')
    expect(splitLabels('@errand | @call')).toEqual({ names: ['errand', 'call'], rest: [] })
    expect(withLabels('@errand | @call', [])).toBe('')
  })

  it('keeps the other terms of an "all of" query', () => {
    const q = withLabels('##Work & p1', ['errand', 'call'])!
    expect(q).toBe('##Work & p1 & (@errand | @call)')
    expect(parse(q)).toBeTruthy()
    expect(splitLabels(q)!.names).toEqual(['errand', 'call'])
    expect(withLabels(q, ['call'])).toBe('##Work & p1 & @call')
    expect(withLabels('p1 | p2', ['call'])).toBe('(p1 | p2) & @call')
  })

  it('an invalid query has no label clause to write', () => {
    expect(splitLabels('p1 &')).toBeNull()
    expect(withLabels('p1 &', ['call'])).toBeNull()
  })
})

describe('adding on a day (D2)', () => {
  it('a line without a date is due on the dialog day, at the grid time when given', () => {
    expect(dueOnDay({}, '2026-11-19', '14:30', '2026-11-18')).toEqual({ date: '2026-11-19', time: '14:30' })
    expect(dueOnDay({}, '2026-11-19', undefined, '2026-11-18')).toEqual({ date: '2026-11-19' })
  })

  it('a bare time ("at 4pm", parsed as today) moves to the dialog day; a named day stays', () => {
    expect(dueOnDay({ due: { date: '2026-11-18', time: '16:00' } }, '2026-11-19', undefined, '2026-11-18')).toEqual({ date: '2026-11-19', time: '16:00' })
    expect(dueOnDay({ due: { date: '2026-11-25' } }, '2026-11-19', '09:00', '2026-11-18')).toEqual({ date: '2026-11-25' })
  })

  it('q adds on the selected day, else today when shown, else the first day', () => {
    const week = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']
    expect(focusedDay(week, '2026-11-18', '2026-11-19')).toBe('2026-11-19')
    expect(focusedDay(week, '2026-11-18', null)).toBe('2026-11-18')
    expect(focusedDay(week, '2026-12-01', undefined)).toBe('2026-11-16')
  })
})

describe('project layouts (D5)', () => {
  it('v cycles List, Board, Timeline, Calendar', () => {
    expect(nextViewMode('list')).toBe('board')
    expect(nextViewMode('board')).toBe('timeline')
    expect(nextViewMode('timeline')).toBe('calendar')
    expect(nextViewMode('calendar')).toBe('list')
  })
})

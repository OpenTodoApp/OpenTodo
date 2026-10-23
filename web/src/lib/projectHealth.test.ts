// Project health (OpenSpec change projects-table, tasks 1.1 to 1.3): every scenario of
// statistics "Project health" and the table's sort rules, from fixture rows.
import { describe, expect, it } from 'vitest'
import { compareProjects, firstDirection, healthOf, QUIET_DAYS, summarizeProjects, type ProjectSortKey } from './projectHealth'
import type { Project, Task } from './types'

const TODAY = '2026-10-14'
const NOW = new Date(2026, 9, 14, 12).getTime()
const DAY = 86_400_000
const clock = (ms: number) => ({ title: { ts: ms, device: 'd' } })

function task(id: string, project: string, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', project_id: project, parent_id: null, priority: 4, due: null, labels: [],
    position: 0, created_at: NOW - 30 * DAY, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null,
    series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: clock(NOW - DAY), ...extra,
  }
}
function project(id: string, extra: Partial<Project> = {}): Project {
  return { id, name: id, color: 'grey', position: 0, archived: false, parent_id: null, created_at: NOW - 60 * DAY, deleted_at: null, _clock: clock(NOW - 60 * DAY), ...extra }
}
const done = (id: string, p: string, extra: Partial<Task> = {}) => task(id, p, { completed_at: NOW - 2 * DAY, ...extra })
const summary = (projects: Project[], tasks: Task[]) => summarizeProjects({ projects, tasks, today: TODAY, now: NOW })

/** The fixture: one case per rule, each with the word it must give. */
const CASES: { name: string; tasks: Task[]; word: ReturnType<typeof healthOf>; qualifier?: Record<string, unknown> }[] = [
  { name: 'nothing open', tasks: [done('a', 'p')], word: null },
  { name: 'empty project', tasks: [], word: null },
  { name: 'on track: open work, nothing late, changed this week', tasks: [task('a', 'p', { due: { date: TODAY } }), done('b', 'p')], word: 'on-track' },
  { name: 'slipping: an open task due before today', tasks: [task('a', 'p', { due: { date: '2026-10-12' } }), task('b', 'p')], word: 'slipping', qualifier: { late: 1 } },
  { name: 'late: a passed deadline outranks a late due date', tasks: [task('passport', 'p', { deadline: '2026-10-10', due: { date: '2026-10-09' } })], word: 'late', qualifier: { pastDeadline: 1, firstPastDeadline: { id: 'passport', title: 'passport' } } },
  { name: 'a deadline today is not late', tasks: [task('a', 'p', { deadline: TODAY })], word: 'on-track' },
  { name: 'quiet: open work and no change for a week', tasks: [task('a', 'p', { _clock: clock(NOW - 9 * DAY) })], word: 'quiet', qualifier: { quietDays: 9 } },
  { name: 'slipping outranks quiet', tasks: [task('a', 'p', { due: { date: '2026-09-01' }, _clock: clock(NOW - 30 * DAY) })], word: 'slipping' },
  { name: 'a completed late task does not slip', tasks: [done('a', 'p', { due: { date: '2026-10-01' } }), task('b', 'p')], word: 'on-track' },
  { name: 'trashed, skipped and sample tasks count nowhere', tasks: [
    task('t', 'p', { deleted_at: NOW, due: { date: '2026-10-01' } }),
    task('s', 'p', { sample: true, deadline: '2026-10-01' }),
    task('k', 'p', { skipped: true, completed_at: NOW, due: { date: '2026-10-01' } }),
    task('ok', 'p'),
  ], word: 'on-track' },
]

describe('project health rules', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const s = summary([project('p', { _clock: clock(NOW - 60 * DAY) })], c.tasks).get('p')!
      expect(s.health.word).toBe(c.word)
      if (c.qualifier) expect(s.health).toMatchObject(c.qualifier)
    })
  }

  it('the quiet threshold is a week to the millisecond', () => {
    const f = { pending: 1, pastDeadline: 0, late: 0 }
    expect(healthOf({ ...f, updated: NOW - QUIET_DAYS * DAY + 1 }, NOW)).toBe('on-track')
    expect(healthOf({ ...f, updated: NOW - QUIET_DAYS * DAY }, NOW)).toBe('quiet')
  })
})

describe('project summary', () => {
  it('progress, open, next due and updated', () => {
    const s = summary([project('p')], [
      task('a', 'p', { due: { date: '2026-10-20' } }),
      task('b', 'p', { due: { date: '2026-10-16', time: '09:00' }, _clock: clock(NOW - 60_000) }),
      task('c', 'p'),
      done('d', 'p'),
    ]).get('p')!
    expect(s).toMatchObject({ open: 3, done: 1, progress: 0.25, nextDue: { date: '2026-10-16', time: '09:00' }, nextDueLate: false, updated: NOW - 60_000 })
  })

  it('a recurring series counts once: its occurrence records are not completions', () => {
    const s = summary([project('p')], [
      task('series', 'p', { recurrence: 'every day', due: { date: TODAY } }),
      done('occ1', 'p', { series_id: 'series' }),
      done('occ2', 'p', { series_id: 'series' }),
    ]).get('p')!
    expect(s).toMatchObject({ open: 1, done: 0, progress: 0 })
  })

  it('a late next due is marked', () => {
    expect(summary([project('p')], [task('a', 'p', { due: { date: '2026-10-13' } })]).get('p')!.nextDueLate).toBe(true)
  })

  it('a project includes its live, unarchived sub-projects', () => {
    const s = summary([
      project('work'),
      project('hiring', { parent_id: 'work' }),
      project('designer', { parent_id: 'hiring' }),
      project('old', { parent_id: 'work', archived: true }),
      project('gone', { parent_id: 'work', deleted_at: NOW }),
    ], [
      task('w', 'work'),
      task('h', 'hiring', { due: { date: '2026-10-01' } }),
      task('d', 'designer', { deadline: '2026-10-02' }),
      task('o', 'old', { deadline: '2026-01-01' }),
      task('g', 'gone', { deadline: '2026-01-01' }),
    ])
    expect(s.get('work')).toMatchObject({ open: 3, health: { word: 'late', pastDeadline: 1, late: 1, firstPastDeadline: { id: 'd' } } })
    expect(s.get('hiring')!.open).toBe(2)
    expect(s.get('designer')!.health.word).toBe('late')
    expect(s.has('old')).toBe(false)
    expect(s.has('gone')).toBe(false)
  })

  it('an expanded project counts only its own tasks (the sidebar rule)', () => {
    const projects = [project('home'), project('garden', { parent_id: 'home' })]
    const tasks = [task('h', 'home'), task('g1', 'garden', { due: { date: '2026-10-01' } }), task('g2', 'garden')]
    const s = summarizeProjects({ projects, tasks, today: TODAY, now: NOW, rollUp: (id) => id !== 'home' })
    expect(s.get('home')).toMatchObject({ open: 1, health: { word: 'on-track' } })
    expect(s.get('garden')).toMatchObject({ open: 2, health: { word: 'slipping' } })
  })

  it('a deferred task is not counted open today but keeps the project from being done', () => {
    const s = summary([project('p')], [task('later', 'p', { start: 'someday' }), done('d', 'p')]).get('p')!
    expect(s).toMatchObject({ open: 0, done: 1, progress: 0.5, health: { word: 'on-track' } })
  })

  it('a cycle from concurrent moves is not followed', () => {
    const s = summary([project('a', { parent_id: 'b' }), project('b', { parent_id: 'a' })], [task('x', 'a'), task('y', 'b')])
    expect(s.get('a')!.open).toBe(2)
    expect(s.get('b')!.open).toBe(2)
  })

  it('the project row itself counts as a change', () => {
    expect(summary([project('p', { _clock: clock(NOW - 3_000) })], []).get('p')!.updated).toBe(NOW - 3_000)
  })
})

describe('sorting', () => {
  const s = summary([project('a'), project('b'), project('c'), project('d')], [
    task('a1', 'a', { due: { date: '2026-10-20' } }),
    task('b1', 'b', { deadline: '2026-10-01', _clock: clock(NOW - 10 * DAY) }),
    task('c1', 'c', { due: { date: '2026-10-01' } }), done('c2', 'c'),
  ])
  const rows = ['d', 'c', 'b', 'a'].map((id) => ({ name: id, summary: s.get(id) }))
  const order = (key: ProjectSortKey, dir: 1 | -1 = firstDirection(key)) => [...rows].sort((x, y) => compareProjects(key, dir, x, y)).map((r) => r.name)

  it('health starts with the most urgent; a project with nothing open is last', () => {
    expect(order('health')).toEqual(['b', 'c', 'a', 'd'])
    expect(order('health', -1)).toEqual(['a', 'c', 'b', 'd'])
  })
  it('next due puts projects without one last in both directions', () => {
    expect(order('next-due')).toEqual(['c', 'a', 'b', 'd'])
    expect(order('next-due', -1)).toEqual(['a', 'c', 'b', 'd'])
  })
  it('updated starts with the newest change', () => {
    expect(firstDirection('updated')).toBe(-1)
    expect(order('updated')[order('updated').length - 1]).toBe('d')
  })
  it('name, open and progress', () => {
    expect(order('name')).toEqual(['a', 'b', 'c', 'd'])
    expect(order('open', -1)).toEqual(['a', 'b', 'c', 'd'])
    expect(order('progress', -1)).toEqual(['c', 'a', 'b', 'd'])
  })
})

import { describe, expect, it } from 'vitest'
import { cellTasks, monthGrid, visibleRows } from './month'
import type { Task } from './types'

const task = (id: string, due: Task['due'], priority: Task['priority'] = 4, position = 0) => ({ id, due, priority, position })

describe('month grid (month-and-timeline-views D1)', () => {
  it('six weeks from the first week of the month, Monday or Sunday first', () => {
    const mon = monthGrid('2026-11-17', 1)
    expect(mon).toHaveLength(6)
    expect(mon[0][0]).toBe('2026-10-26')
    expect(mon[5][6]).toBe('2026-12-06')
    const sun = monthGrid('2026-11-17', 0)
    expect(sun[0][0]).toBe('2026-11-01')
    expect(sun[0].every((d, i) => i === 0 || d > sun[0][i - 1])).toBe(true)
  })

  it('a month that needs six rows (August 2026 from Monday) fits', () => {
    const g = monthGrid('2026-08-01', 1)
    expect(g[0][0]).toBe('2026-07-27')
    expect(g.flat()).toContain('2026-08-31')
    expect(g[5][0]).toBe('2026-08-31')
  })

  it('orders a cell: timed by time, then priority, then position; zoned dues by the viewer day', () => {
    const tasks = [
      task('late', { date: '2026-11-03', time: '18:00' }),
      task('p1', { date: '2026-11-03' }, 1, 5),
      task('early', { date: '2026-11-03', time: '08:00' }),
      task('p4a', { date: '2026-11-03' }, 4, 1),
      task('p4b', { date: '2026-11-03' }, 4, 0),
      task('tokyo', { date: '2026-11-04', time: '07:00', tz: 'Asia/Tokyo' }),
      task('other', { date: '2026-11-04' }),
    ]
    expect(cellTasks(tasks, '2026-11-03', 'Europe/Berlin').map((t) => t.id)).toEqual(['early', 'late', 'tokyo', 'p1', 'p4b', 'p4a'])
    expect(cellTasks(tasks, '2026-11-04', 'Europe/Berlin').map((t) => t.id)).toEqual(['other'])
  })

  it('keeps a line for "+N more"', () => {
    expect(visibleRows([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], hidden: 0 })
    expect(visibleRows([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2], hidden: 3 })
  })
})

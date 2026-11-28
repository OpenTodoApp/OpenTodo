// @vitest-environment happy-dom
// Today at a glance and Upcoming's week (OpenSpec change phone-modern-look, design D2):
// what the tiles count, which task Up next opens, and the days the strip offers.
import { describe, expect, it, vi } from 'vitest'
import { addDaysISO } from '../lib/dates'
import type { Task } from '../lib/types'
import { click, render } from '../ui/test-utils'
import { glanceOf, TodayGlance } from './components/TodayGlance'
import { WeekStrip } from './components/WeekStrip'

const opened: string[] = []
vi.mock('./transition', () => ({ openTaskFromList: (id: string) => opened.push(id) }))

const TODAY = '2026-11-27'
const at = (hhmm: string) => new Date(`${TODAY}T${hhmm}:00`).getTime()
const task = (id: string, more: Partial<Task> = {}) => ({ id, title: id, completed_at: null, due: { date: TODAY }, ...more }) as unknown as Task

describe('Today at a glance', () => {
  it('counts the day\'s tasks done, picks the next one at a time still ahead, and passes the late count on', () => {
    const listed = [
      task('done', { completed_at: at('08:00') }),
      task('past', { due: { date: TODAY, time: '09:00' } }),
      task('later', { due: { date: TODAY, time: '16:00' } }),
      task('soon', { due: { date: TODAY, time: '11:00' } }),
      task('untimed'),
      task('earlier', { due: { date: '2026-11-25' } }),
    ]
    const g = glanceOf(listed, [...listed, task('elsewhere', { completed_at: at('09:30'), due: null }), task('skipped', { completed_at: at('09:30'), skipped: true })], 1, TODAY, at('10:30'))
    // Every task completed today counts, a skipped one does not; the earlier one is the Late tile's.
    expect([g.done, g.total, g.late]).toEqual([2, 6, 1])
    expect(g.next?.id).toBe('soon')
  })

  it('falls back to the first task of the day without a time once every time has passed', () => {
    const g = glanceOf([task('past', { due: { date: TODAY, time: '09:00' } }), task('untimed')], [], 0, TODAY, at('20:00'))
    expect(g.next?.id).toBe('untimed')
  })

  it('shows nothing on a day with no task and nothing late', async () => {
    const r = await render(<TodayGlance listed={[]} all={[]} late={0} today={TODAY} onLate={() => {}} />)
    expect(r.container.querySelector('[data-today-glance]')).toBeNull()
    await r.unmount()
  })

  it('opens the next task, and the Late tile goes to the earlier tasks', async () => {
    const onLate = vi.fn()
    const r = await render(<TodayGlance listed={[task('a', { due: { date: TODAY, time: '23:59' } })]} all={[]} late={2} today={TODAY} onLate={onLate} />)
    expect([...r.container.querySelectorAll('[data-glance]')].map((el) => el.getAttribute('data-glance'))).toEqual(['next', 'done', 'late'])
    await click(r.container.querySelector('[data-glance="next"]')!)
    expect(opened).toEqual(['a'])
    await click(r.container.querySelector('[data-glance="late"]')!)
    expect(onLate).toHaveBeenCalledOnce()
    await r.unmount()
  })
})

describe('Upcoming\'s week', () => {
  it('offers the next seven days, with dots for their tasks, and only a day with tasks can be chosen', async () => {
    const onDay = vi.fn()
    const tomorrow = addDaysISO(TODAY, 1)
    const r = await render(<WeekStrip today={TODAY} counts={new Map([[tomorrow, 5], [addDaysISO(TODAY, 3), 1]])} onDay={onDay} />)
    const days = [...r.container.querySelectorAll<HTMLButtonElement>('[data-week-day]')]
    expect(days.map((d) => d.dataset.weekDay)).toEqual(Array.from({ length: 7 }, (_, i) => addDaysISO(TODAY, i + 1)))
    expect(days.map((d) => d.disabled)).toEqual([false, true, false, true, true, true, true])
    // Three dots at most, however many tasks the day holds.
    expect(days[0].querySelectorAll('[aria-hidden] > span')).toHaveLength(3)
    await click(days[0])
    expect(onDay).toHaveBeenCalledWith(tomorrow)
    await r.unmount()
  })
})

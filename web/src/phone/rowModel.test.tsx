// A task as a phone row (OpenSpec change phone-ui-trial, "Phone task rows"): the one
// line of facts, in a fixed order, at most four, in the words the app uses elsewhere.
import { describe, expect, it } from 'vitest'
import type { Project, Task } from '../lib/types'
import { MAX_ROW_FACTS } from './components/PhoneRow'
import { factsOf, rowOf, shownTitle } from './rowModel'

const TODAY = '2026-10-14'
const work = { id: 'p1', name: 'Work', color: '#3b82c4' } as Project
const of = { today: TODAY, zone: 'UTC' }
const full = { ...of, project: work, progress: { done: 1, total: 3 } }
const task = (patch: Partial<Task>) => ({ id: 't', title: 'Send the invoice', priority: 4, ...patch }) as Task

describe('a phone row', () => {
  it('orders its facts: when, subtasks, repeat, project', () => {
    const facts = factsOf(task({ due: { date: '2026-10-12' }, recurrence: 'every month', project_id: work.id }), undefined, full)
    expect(facts.map((f) => f.id)).toEqual(['due', 'subtasks', 'repeat', 'project'])
    expect(facts[0].tone).toBe('danger')
    expect(facts[1].text).toBe('1/3')
    expect(facts[2].text).toBe('every month')
    expect(facts[3].text).toBe('Work')
    expect(facts.length).toBeLessThanOrEqual(MAX_ROW_FACTS)
  })

  it('under a heading that names the day shows the time alone, and nothing for a task without a time', () => {
    const timed = factsOf(task({ id: 'x', due: { date: TODAY, time: '09:30' } }), { date: TODAY }, of)
    expect(timed.map((f) => f.id)).toEqual(['due'])
    expect(timed[0].text).not.toMatch(/today/i)
    expect(timed[0].tone).toBe('accent')
    expect(factsOf(task({ id: 'x', due: { date: TODAY } }), { date: TODAY }, of)).toEqual([])
  })

  it('leaves the project out where the heading already names it', () => {
    const facts = factsOf(task({ id: 'x', project_id: work.id }), { project: true }, { ...of, project: work })
    expect(facts).toEqual([])
  })

  it('reads Untitled for a task without a title, and keeps priority within 1 to 4', () => {
    expect(shownTitle(task({ title: '' }))).toBe('Untitled')
    expect(rowOf(task({ priority: 2 }), undefined, of).priority).toBe(2)
    expect(rowOf(task({ priority: 9 as never, completed_at: 5 }), undefined, of)).toMatchObject({ priority: 4, done: true })
  })

  it('says Yesterday for the day before today, with its time, and the date further back (phone-calm D7)', () => {
    expect(factsOf(task({ due: { date: '2026-10-13', time: '09:30' } }), undefined, of)[0]).toMatchObject({ id: 'due', text: 'Yesterday 09:30', tone: 'danger' })
    expect(factsOf(task({ due: { date: '2026-10-13' } }), undefined, of)[0]).toMatchObject({ text: 'Yesterday' })
    expect(factsOf(task({ due: { date: '2026-10-12' } }), undefined, of)[0].text).not.toBe('Yesterday')
  })
})

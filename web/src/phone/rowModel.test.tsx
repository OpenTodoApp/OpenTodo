// A task as a phone row (OpenSpec change phone-ui-trial, "Phone task rows"): the one
// line of facts, in a fixed order, at most four, in the words the app uses elsewhere.
import { describe, expect, it } from 'vitest'
import type { Project, Task } from '../lib/types'
import { MAX_ROW_FACTS } from './components/PhoneRow'
import { rowFacts, rowModel, shownTitle } from './rowModel'

const TODAY = '2026-10-14'
const work = { id: 'p1', name: 'Work', color: '#3b82c4' } as Project
const ctx = { today: TODAY, zone: 'UTC', projects: new Map([[work.id, work]]), progress: new Map([['t', { done: 1, total: 3 }]]) }
const task = (patch: Partial<Task>) => ({ id: 't', title: 'Send the invoice', priority: 4, ...patch }) as Task

describe('a phone row', () => {
  it('orders its facts: when, subtasks, repeat, project', () => {
    const facts = rowFacts({ task: task({ due: { date: '2026-10-12' }, recurrence: 'every month', project_id: work.id }) }, ctx)
    expect(facts.map((f) => f.id)).toEqual(['due', 'subtasks', 'repeat', 'project'])
    expect(facts[0].tone).toBe('danger')
    expect(facts[1].text).toBe('1/3')
    expect(facts[2].text).toBe('every month')
    expect(facts[3].text).toBe('Work')
    expect(facts.length).toBeLessThanOrEqual(MAX_ROW_FACTS)
  })

  it('under a heading that names the day shows the time alone, and nothing for a task without a time', () => {
    const timed = rowFacts({ task: task({ id: 'x', due: { date: TODAY, time: '09:30' } }), implied: { date: TODAY } }, ctx)
    expect(timed.map((f) => f.id)).toEqual(['due'])
    expect(timed[0].text).not.toMatch(/today/i)
    expect(timed[0].tone).toBe('accent')
    expect(rowFacts({ task: task({ id: 'x', due: { date: TODAY } }), implied: { date: TODAY } }, ctx)).toEqual([])
  })

  it('leaves the project out where the heading already names it', () => {
    const facts = rowFacts({ task: task({ id: 'x', project_id: work.id }), implied: { project: true } }, ctx)
    expect(facts).toEqual([])
  })

  it('reads Untitled for a task without a title, and keeps priority within 1 to 4', () => {
    expect(shownTitle(task({ title: '' }))).toBe('Untitled')
    expect(rowModel({ task: task({ priority: 2 }) }, ctx).priority).toBe(2)
    expect(rowModel({ task: task({ priority: 9 as never, completed_at: 5 }) }, ctx)).toMatchObject({ priority: 4, done: true })
  })
})

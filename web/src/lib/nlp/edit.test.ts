// Parsing while editing a title (OpenSpec change smart-title-tokens, design D5).
import { describe, expect, it } from 'vitest'
import { editPlan, parseEdit, unchangedSpans } from './edit'

const ctx = { today: '2026-10-09', languages: ['en'], projects: [{ id: 'p-work', name: 'Work' }] }
const task = { title: 'Call the bank', project_id: null }

describe('parseEdit', () => {
  it('reads only the text typed in this edit', () => {
    const r = parseEdit('Call the bank', 'Call the bank tomorrow p1', ctx)
    expect(r).toMatchObject({ title: 'Call the bank', due: { date: '2026-10-10' }, priority: 1 })
  })

  it('never re-reads the old title: "Review may report" + " draft" has no date', () => {
    const r = parseEdit('Review may report', 'Review may report draft', ctx)
    expect(r.due).toBeNull()
    expect(r.title).toBe('Review may report draft')
    expect(r.chips).toEqual([])
  })

  it('finds a token typed in the middle', () => {
    const r = parseEdit('Call the bank', 'Call #Work the bank', ctx)
    expect(r.projectId).toBe('p-work')
    expect(r.title).toBe('Call the bank')
  })

  it('the unchanged spans are the common prefix and suffix', () => {
    expect(unchangedSpans('abc', 'abXc')).toEqual([{ start: 0, end: 2, text: 'ab' }, { start: 3, end: 4, text: 'c' }])
    expect(unchangedSpans('', 'new')).toEqual([])
  })
})

describe('editPlan', () => {
  it('overwrites scalar fields, moves on a project token, adds label names, keeps reminders', () => {
    const r = parseEdit('Call the bank', 'Call the bank #Work @errand friday p2 +30m remind me at 9', ctx)
    const plan = editPlan(task, r)
    expect(plan.patch).toMatchObject({ project_id: 'p-work', priority: 2, estimate_minutes: 30 })
    expect(plan.patch.title).toBeUndefined()
    expect(plan.patch.due).toBeTruthy()
    expect(plan.labels).toEqual(['errand'])
    expect(plan.reminders).toHaveLength(1)
  })

  it('a plain rename writes only the title', () => {
    expect(editPlan(task, parseEdit('Call the bank', 'Call the bank again', ctx))).toEqual({ patch: { title: 'Call the bank again' }, labels: [], reminders: [] })
  })
})

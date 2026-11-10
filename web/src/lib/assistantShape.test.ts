// A proposal's shape and edits before applying (OpenSpec change
// assistant-generative-ui, tasks 5.1, 5.3).
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { reviewChangeSet } from './assistant'
import type { ProposedChange } from './assistantTypes'
import { calendarDays, checkEdit, editableFields, editReviewItem, shapeOf } from './assistantShape'
import { db } from './db'
import { createTask, resetDeviceId } from './ops'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

const item = (change: ProposedChange) => ({ change, state: 'ok' as const, checked: true, title: change.entityId, lines: [], shared: false })
const move = (id: string, date: string) => item({ entity: 'task', entityId: id, patch: { due: { date } }, base: { due: null } })

describe('shapeOf (5.1)', () => {
  it('a week of new dates is a calendar from the first day to the last', () => {
    const items = ['2026-11-16', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'].map((d, i) => move(`t${i}`, d))
    expect(shapeOf({ items }, false)).toBe('calendar')
    expect(calendarDays(items)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'])
    // A start or a deadline places the item too.
    expect(shapeOf({ items: [item({ entity: 'task', entityId: 'a', patch: { start: '2026-11-17' } }), item({ entity: 'task', entityId: 'b', patch: { deadline: '2026-11-18' } })] }, false)).toBe('calendar')
  })

  it('more than 7 days, a single item, or an item without a date is the list', () => {
    expect(shapeOf({ items: [move('a', '2026-11-16'), move('b', '2026-11-23')] }, false)).toBe('list')
    expect(shapeOf({ items: [move('a', '2026-11-16')] }, false)).toBe('list')
    expect(shapeOf({ items: [move('a', '2026-11-16'), item({ entity: 'task', entityId: 'b', patch: { title: 'Renamed' } })] }, false)).toBe('list')
    expect(shapeOf({ items: [move('a', '2026-11-16'), item({ entity: 'task', entityId: 'b', patch: { start: 'someday' } })] }, false)).toBe('list')
  })

  it('a new project is an outline; places are a map only while maps are on', () => {
    expect(shapeOf({ items: [item({ entity: 'project', entityId: 'p', create: true, patch: { name: 'Move flat' } }), move('a', '2026-11-16'), move('b', '2026-11-17')] }, false)).toBe('outline')
    const placed = [1, 2].map((n) => item({ entity: 'task', entityId: `t${n}`, patch: { location: { name: 'Post office', lat: 52.5, lon: 13.4 } } }))
    expect(shapeOf({ items: placed }, true)).toBe('map')
    expect(shapeOf({ items: placed }, false)).toBe('list')
  })
})

describe('edits before applying (5.3)', () => {
  it('offers only the fields the proposal sets, with the app\'s checks', () => {
    expect(editableFields(item({ entity: 'task', entityId: 'n', create: true, patch: { title: 'Call landlord', due: { date: '2026-11-13' } } }))).toEqual(['title', 'due', 'time'])
    expect(editableFields(item({ entity: 'task', entityId: 'e', patch: { priority: 1, labels: ['x'] } }))).toEqual(['priority'])
    // An existing task's title is not editable here: the proposal is not about it.
    expect(editableFields(item({ entity: 'task', entityId: 'e', patch: { title: 'Renamed' } }))).toEqual([])
    expect(editableFields(item({ entity: 'comment', entityId: 'c', create: true, patch: { body: 'x' } }))).toEqual([])
    expect(checkEdit('title', '  ')).toBe('empty')
    expect(checkEdit('due', '2026-02-30')).toBe('date')
    expect(checkEdit('priority', '5')).toBe('priority')
    expect(checkEdit('deadline', '2026-11-13')).toBeNull()
  })

  it('replaces the proposed value, describes the item again and marks it edited', async () => {
    const existing = await createTask({ title: 'Report', priority: 4 })
    const review = await reviewChangeSet([
      { entity: 'project', entityId: 'p-new', create: true, patch: { name: 'Move flat' } },
      { entity: 'task', entityId: 'n1', create: true, patch: { title: 'Call landlord', project_id: 'p-new', due: { date: '2026-11-13', time: '10:00' } } },
      { entity: 'task', entityId: existing, patch: { priority: 1 }, base: { priority: 4 } },
    ])
    const next = await editReviewItem(review, 1, { title: ' Call landlord about deposit ', due: '2026-11-12' })
    expect(next.items[1].change.patch).toMatchObject({ title: 'Call landlord about deposit', due: { date: '2026-11-12', time: '10:00' } })
    expect(next.items[1].title).toBe('New task in Move flat: Call landlord about deposit')
    expect(next.items[1].edited).toBe(true)
    // A field the proposal does not set, and an invalid value, change nothing.
    expect(await editReviewItem(next, 1, { priority: '1' })).toBe(next)
    expect(await editReviewItem(next, 2, { priority: '9' })).toBe(next)
    expect(next.items[2].edited).toBeUndefined()
  })
})

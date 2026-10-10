import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { createProject, createTask, resetDeviceId } from './ops'
import { positionAtEnd, positionBetween, positionForStep } from './ordering'
import {
  createSection, effectiveSection, groupBySection, loadCollapsedSections, loadViewMode, saveViewMode, setSectionCollapsed,
} from './sections'
import { storeMemberships } from './sharing'
import { removeLocally } from './trash'
import type { Section, Task } from './types'

let n = 0
beforeEach(() => {
  useDatabase(`sections-${Date.now()}-${n++}`)
  resetDeviceId()
})

const section = (id: string, project_id: string, position: number, deleted_at: number | null = null): Section => ({
  id, name: id, project_id, position, created_at: 0, deleted_at, _clock: {},
})
type Card = Pick<Task, 'id' | 'position' | 'created_at' | 'section_id' | 'project_id'>
const card = (id: string, section_id: string | null, position: number, project_id = 'p'): Card => ({ id, position, created_at: 0, section_id, project_id })

describe('groupBySection', () => {
  it('orders No section first, then sections by position, tasks by position', () => {
    const groups = groupBySection('p', [card('a', 'doing', 2), card('b', null, 1), card('c', 'backlog', 3), card('d', 'doing', 1)], [
      section('doing', 'p', 20), section('backlog', 'p', 10),
    ])
    expect(groups.map((g) => [g.key, g.tasks.map((t) => t.id)])).toEqual([['', ['b']], ['backlog', ['c']], ['doing', ['d', 'a']]])
  })

  it('shows dangling references under No section: deleted, foreign-project and missing sections', () => {
    const groups = groupBySection('p', [
      card('deleted', 'gone', 1), card('foreign', 'elsewhere', 2), card('missing', 'not-yet', 3), card('ok', 'live', 4),
    ], [section('gone', 'p', 1, 123), section('elsewhere', 'q', 2), section('live', 'p', 3)])
    expect(groups.map((g) => g.key)).toEqual(['', 'live'])
    expect(groups[0].tasks.map((t) => t.id)).toEqual(['deleted', 'foreign', 'missing'])
    expect(groups[1].tasks.map((t) => t.id)).toEqual(['ok'])
    // The display rule never writes: the tasks keep their references.
    expect(effectiveSection({ section_id: 'gone', project_id: 'p' }, new Map([['gone', section('gone', 'p', 1, 123)]]))).toBeNull()
  })

  it('always has a No section group, even when empty', () => {
    expect(groupBySection('p', [], [])).toEqual([{ section: null, key: '', tasks: [] }])
  })
})

describe('per-device preferences', () => {
  it('view mode and collapsed sections persist per project and are never queued', async () => {
    expect(await loadViewMode('p1')).toBe('list')
    await saveViewMode('p1', 'board')
    expect(await loadViewMode('p1')).toBe('board')
    expect(await loadViewMode('p2')).toBe('list')
    expect(await setSectionCollapsed('p1', 'doing', true)).toEqual(['doing'])
    await setSectionCollapsed('p1', '', true)
    await setSectionCollapsed('p1', 'doing', false)
    expect(await loadCollapsedSections('p1')).toEqual([''])
    expect(await loadCollapsedSections('p2')).toEqual([])
    expect(await db.outbox.count()).toBe(0)
  })
})

describe('ordering helpers', () => {
  it('appends after the maximum and finds midpoints', () => {
    expect(positionAtEnd([{ id: 'a', position: 3 }, { id: 'b', position: 9 }])).toBe(1009)
    expect(positionAtEnd([{ id: 'a', position: 3 }], 'a', 77)).toBe(77)
    expect(positionBetween(1, 2)).toBe(1.5)
    expect(positionBetween(null, 5)).toBe(-995)
    expect(positionBetween(5, null)).toBe(1005)
    expect(positionBetween(null, null, 11)).toBe(11)
  })

  it('steps one place up or down', () => {
    const list = [{ id: 'a', position: 1 }, { id: 'b', position: 2 }, { id: 'c', position: 3 }]
    expect(positionForStep(list, 'c', -1)).toBe(1.5)
    expect(positionForStep(list, 'b', -1)).toBe(-999)
    expect(positionForStep(list, 'a', 1)).toBe(2.5)
    expect(positionForStep(list, 'b', 1)).toBe(1003)
    expect(positionForStep(list, 'a', -1)).toBeNull()
    expect(positionForStep(list, 'c', 1)).toBeNull()
  })
})

describe('local removal of sections', () => {
  it('purging a project removes its sections and their queued ops', async () => {
    const p = await createProject({ name: 'Garden' })
    const keep = await createProject({ name: 'Keep' })
    const s = await createSection(p, 'Beds')
    const other = await createSection(keep, 'Other')
    await removeLocally([{ entity: 'project', entityId: p }], true)
    expect(await db.sections.get(s)).toBeUndefined()
    expect(await db.sections.get(other)).toBeDefined()
    expect((await db.outbox.toArray()).some((o) => o.entityId === s)).toBe(false)
    // A purge marker for a section alone also removes it.
    await removeLocally([{ entity: 'section', entityId: other }])
    expect(await db.sections.get(other)).toBeUndefined()
  })

  it('leaving a shared project removes its sections', async () => {
    const p = await createProject({ name: 'Team' })
    const s = await createSection(p, 'Doing')
    await createTask({ title: 'x', project_id: p, section_id: s })
    await db.memberships.put({ projectId: p, role: 'editor', ownerId: 'alice', members: [] })
    await storeMemberships([])
    expect(await db.sections.get(s)).toBeUndefined()
    expect(await db.tasks.where('project_id').equals(p).count()).toBe(0)
  })
})

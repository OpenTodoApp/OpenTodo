// Collapse defaults (OpenSpec change sidebar-groups, project-organization "Collapse
// and expand"): a device that never stored a state reads every parent as collapsed;
// the first write materialises the set, so one toggle changes one project; a stored
// array is respected; Collapse all and Expand all write the whole set.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, getMeta, setMeta } from './db'
import {
  COLLAPSED_PROJECTS_INIT_KEY, COLLAPSED_PROJECTS_KEY, collapseAllProjects, expandAllProjects, expandAncestorsOf, getCollapsedProjects,
  parentProjectIds, readCollapsed, toggleCollapsedProject,
} from './projects'
import type { Project } from './types'

const project = (id: string, parent_id: string | null, over: Partial<Project> = {}): Project => ({
  id, name: id, color: '#000', position: 0, archived: false, parent_id, created_at: 0, deleted_at: null, description: '', notes_doc: null, icon: null, _clock: {}, ...over,
} as unknown as Project)

const items = [project('work', null), project('hiring', 'work'), project('designer', 'hiring'), project('home', null), project('garden', 'home'), project('solo', null)]

beforeEach(async () => {
  await db.delete()
  await db.open()
  await db.projects.bulkPut(items)
})

describe('readCollapsed', () => {
  it('nothing stored: every parent is collapsed, from the given list or the table, and nothing is written', async () => {
    expect([...(await readCollapsed(items))].sort()).toEqual(['hiring', 'home', 'work'])
    expect([...(await readCollapsed())].sort()).toEqual(['hiring', 'home', 'work'])
    expect(await getMeta(COLLAPSED_PROJECTS_INIT_KEY, false)).toBe(false)
    expect((await getCollapsedProjects()).size).toBe(0)
  })

  it('archived and deleted projects are neither parents nor children', async () => {
    const list = [...items, project('old', 'solo', { archived: true }), project('gone', 'solo', { deleted_at: 1 })]
    expect(parentProjectIds(list).has('solo')).toBe(false)
    expect([...parentProjectIds([project('a', null, { archived: true }), project('b', 'a')])]).toEqual([])
  })

  it('one toggle on a fresh device changes that project only', async () => {
    await toggleCollapsedProject('work')
    expect([...(await readCollapsed(items))].sort()).toEqual(['hiring', 'home'])
    expect(await getMeta(COLLAPSED_PROJECTS_INIT_KEY, false)).toBe(true)
    // From now on the stored set is the truth, even for a new parent.
    await db.projects.put(project('kid', 'solo'))
    expect([...(await readCollapsed())].sort()).toEqual(['hiring', 'home'])
  })

  it('an existing stored array is respected as it is', async () => {
    await setMeta(COLLAPSED_PROJECTS_KEY, ['home'])
    await setMeta(COLLAPSED_PROJECTS_INIT_KEY, true)
    expect([...(await readCollapsed(items))]).toEqual(['home'])
  })

  it('navigating materialises the default and expands only the ancestors', async () => {
    await expandAncestorsOf('designer', items)
    expect([...(await readCollapsed(items))].sort()).toEqual(['home'])
  })

  it('Collapse all and Expand all', async () => {
    await expandAllProjects()
    expect((await readCollapsed(items)).size).toBe(0)
    await collapseAllProjects()
    expect([...(await readCollapsed(items))].sort()).toEqual(['hiring', 'home', 'work'])
  })
})

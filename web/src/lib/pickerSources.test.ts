import { describe, expect, it } from 'vitest'
import { INBOX_KEY, NONE_KEY, parentSource, projectSource, sectionSource } from './pickerSources'
import type { Membership, Project, Section, Task } from './types'

const project = (id: string, name: string, over: Partial<Project> = {}): Project =>
  ({ id, name, color: '#16a34a', position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {}, ...over })
const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: id.toUpperCase(), description: '', project_id: 'p', parent_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null,
  section_id: null, ical_extra: null, notes_doc: '', _clock: {}, ...over,
})
const section = (id: string, name: string, position: number, over: Partial<Section> = {}): Section =>
  ({ id, name, project_id: 'p', position, created_at: 0, deleted_at: null, _clock: {}, ...over })

describe('projectSource', () => {
  const projects = [
    project('home', 'Home', { position: 1 }),
    project('work', 'Work', { position: 2 }),
    project('hi', 'Ideas', { parent_id: 'home' }),
    project('wi', 'Ideas', { parent_id: 'work' }),
    project('old', 'Old stuff', { archived: true, position: 3 }),
    project('gone', 'Gone', { deleted_at: 5 }),
  ]

  it('lists the Inbox first, then live projects in tree order with paths', () => {
    const items = projectSource(projects)
    expect(items.map((i) => i.key)).toEqual([INBOX_KEY, 'home', 'hi', 'work', 'wi'])
    expect(items[0]).toMatchObject({ value: null, label: 'No project', keywords: expect.stringContaining('inbox') })
  })

  it('tells same-name projects apart by path', () => {
    const ideas = projectSource(projects).filter((i) => i.label === 'Ideas')
    expect(ideas.map((i) => i.path)).toEqual([['Home'], ['Work']])
  })

  it('lists an archived project only as the current value, first and marked', () => {
    expect(projectSource(projects).some((i) => i.key === 'old')).toBe(false)
    const items = projectSource(projects, { current: 'old' })
    expect(items[0]).toMatchObject({ key: 'old', marker: 'archived', meta: 'archived' })
    expect(items.filter((i) => i.key === 'old')).toHaveLength(1)
    expect(projectSource(projects, { current: 'gone' })[0]).toMatchObject({ key: 'gone', marker: 'deleted' })
    expect(projectSource(projects, { current: 'work' })[0].key).toBe(INBOX_KEY)
  })

  it('marks shared projects, can leave out the Inbox and exclude projects', () => {
    const memberships = new Map<string, Membership>([['work', { projectId: 'work', role: 'owner', ownerId: 'me', members: [] }]])
    const items = projectSource(projects, { inbox: false, memberships, exclude: new Set(['hi']) })
    expect(items.map((i) => i.key)).toEqual(['home', 'work', 'wi'])
    expect(items.find((i) => i.key === 'work')?.shared).toBe(true)
  })
})

describe('parentSource', () => {
  it('excludes the task itself and its descendants, and other projects', () => {
    const tasks = [task('a'), task('b', { parent_id: 'a' }), task('c', { parent_id: 'b' }), task('d'), task('x', { project_id: 'other' })]
    const items = parentSource(tasks, tasks[0])
    expect(items.map((i) => i.key)).toEqual([NONE_KEY, 'd'])
    expect(items[0]).toMatchObject({ value: null, label: 'No parent' })
  })

  it('lists open tasks in tree order with their path and section', () => {
    const tasks = [task('a', { position: 1, section_id: 's1' }), task('b', { parent_id: 'a', position: 1 }), task('d', { position: 2 }), task('me', { position: 3 })]
    const items = parentSource(tasks, tasks[3], [section('s1', 'Doing', 1)])
    expect(items.map((i) => i.key)).toEqual([NONE_KEY, 'a', 'b', 'd'])
    expect(items.find((i) => i.key === 'a')?.meta).toBe('Doing')
    expect(items.find((i) => i.key === 'b')?.path).toEqual(['A'])
  })

  it('lists a completed or deleted current parent first, marked, and no other completed tasks', () => {
    const tasks = [task('done', { completed_at: 10 }), task('other-done', { completed_at: 11 }), task('trash', { deleted_at: 3 }), task('me', { parent_id: 'done' })]
    const items = parentSource(tasks, tasks[3])
    expect(items[0]).toMatchObject({ key: 'done', marker: 'completed', meta: 'completed' })
    expect(items.map((i) => i.key)).toEqual(['done', NONE_KEY])
    const deleted = parentSource(tasks, { ...tasks[3], parent_id: 'trash' })
    expect(deleted[0]).toMatchObject({ key: 'trash', marker: 'deleted' })
  })
})

describe('sectionSource', () => {
  it('lists No section, then live sections of the project in board order', () => {
    const sections = [section('s2', 'Done', 2), section('s1', 'Doing', 1), section('s0', 'Old', 0, { deleted_at: 9 }), section('sx', 'Elsewhere', 0, { project_id: 'q' })]
    expect(sectionSource(sections, 'p').map((i) => i.label)).toEqual(['No section', 'Doing', 'Done'])
  })
})

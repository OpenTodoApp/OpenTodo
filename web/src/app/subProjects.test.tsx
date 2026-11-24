// @vitest-environment happy-dom
// Sub-projects as a collapsible group at the top of a project (OpenSpec change
// ux-overhaul, project-organization "Sub-projects inside a project view").
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { createSection, saveViewMode } from '../lib/sections'
import { click, render, mockFetch, noPublicLinks, visibleText, waitFor } from '../ui/test-utils'
import { SubProjects } from './SubProjects'
import { TaskListView } from './TaskListView'

// The project header asks the server for its public links.
beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals() })

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  history.replaceState(null, '', '/')
})


describe('sub-projects group', () => {
  it('lists direct sub-projects with subtree counts above the first task, collapses per device, and is absent on a leaf', async () => {
    const home = await createProject({ name: 'Home' })
    const kitchen = await createProject({ name: 'Kitchen', parent_id: home })
    const sink = await createProject({ name: 'Sink', parent_id: kitchen })
    const garden = await createProject({ name: 'Garden', parent_id: home })
    await createTask({ title: 'Paint', project_id: home })
    await createTask({ title: 'Tiles', project_id: kitchen })
    await createTask({ title: 'Taps', project_id: kitchen })
    await createTask({ title: 'Trap', project_id: sink })

    const r = await render(<TaskListView route={{ view: 'project', id: home }} />)
    await waitFor(() => r.container.textContent!.includes('Paint') && r.container.querySelector('[data-sub-projects]') !== null)
    const group = r.container.querySelector('[data-sub-projects]')!
    // Direct children only, each with the open total of its whole subtree.
    expect([...group.querySelectorAll('[data-sub-project]')].map((b) => visibleText(b))).toEqual(['Kitchen3', 'Garden0'])
    expect(visibleText(group.querySelector('[data-group-header] [data-group-count]')!)).toBe('2')
    // Above the list, below the header.
    const order = [...r.container.querySelectorAll('[data-page-header], [data-sub-projects], [data-task-id]')]
    expect(order[0].hasAttribute('data-page-header')).toBe(true)
    expect(order[1].hasAttribute('data-sub-projects')).toBe(true)

    await click(group.querySelector('[data-group-toggle]')!)
    await waitFor(() => group.querySelectorAll('[data-sub-project]').length === 0, 'the group folded')
    expect(group.querySelectorAll('[data-sub-project]')).toHaveLength(0)
    expect(group.querySelector('[data-group-toggle]')?.getAttribute('aria-expanded')).toBe('false')
    expect(JSON.parse(localStorage.getItem('ot.subprojects.collapsed')!)).toEqual([home])
    await r.unmount()

    // The collapse survives a reload of the view; a leaf project has no group at all.
    const again = await render(<SubProjects projectId={home} />)
    await waitFor(() => again.container.querySelector('[data-group-header]') !== null)
    expect(again.container.querySelector('[data-group-header]')?.getAttribute('data-collapsed')).toBe('true')
    await click(again.container.querySelector('[data-group-toggle]')!)
    await waitFor(() => again.container.querySelectorAll('[data-sub-project]').length === 2)
    await click(again.container.querySelector(`[data-sub-project="${kitchen}"]`)!)
    expect(location.pathname).toBe(`/project/${kitchen}`)
    await again.unmount()

    const leaf = await render(<SubProjects projectId={garden} />)
    // The parent beside it lists its children: the projects are read.
    const parent = await render(<SubProjects projectId={home} />)
    await waitFor(() => parent.container.querySelectorAll('[data-sub-project]').length > 0, 'the projects read')
    await parent.unmount()
    expect(leaf.container.innerHTML).toBe('')
    await leaf.unmount()
  })
})

// Sub-projects and the project's own tasks apart (subprojects-above-tasks, GitHub issue 1981).
describe('sub-projects above the tasks', () => {
  /** The page's sub-projects group, bars and task rows, top to bottom. */
  const outline = (root: HTMLElement) => [...root.querySelectorAll('[data-sub-projects], [data-group-header], [data-task-id]')]
    .filter((el) => !el.closest('[data-sub-projects]') || el.hasAttribute('data-sub-projects'))
    .map((el) => el.hasAttribute('data-sub-projects') ? 'sub-projects'
      : el.hasAttribute('data-task-id') ? `task:${visibleText(el.querySelector('[data-row-title]') ?? el).trim()}`
      : `bar:${visibleText(el.querySelector('[data-group-label]')!)}`)

  it('puts the tasks under their own Tasks bar, at the top level, below the sub-projects', async () => {
    const home = await createProject({ name: 'Home' })
    await createProject({ name: 'Garden', parent_id: home })
    const paint = await createTask({ title: 'Paint', project_id: home })
    await createTask({ title: 'Buy brushes', project_id: home, parent_id: paint })
    await createTask({ title: 'Tiles', project_id: home })

    const r = await render(<TaskListView route={{ view: 'project', id: home }} />)
    await waitFor(() => r.container.querySelector('[data-group^="tasks:"] [data-group-header]') !== null, 'the Tasks bar')
    const order = outline(r.container)
    expect(order[0]).toBe('sub-projects')
    expect(order[1]).toBe('bar:Tasks')
    expect(order.slice(2).every((o) => o.startsWith('task:'))).toBe(true)
    // The bar counts the open rows below it.
    expect(visibleText(r.container.querySelector('[data-group^="tasks:"] [data-group-header] [data-group-count]')!)).toBe('3')
    // Top-level tasks are not indented; only the subtask is.
    const depth = (id: string) => r.container.querySelector(`[data-task-id="${id}"]`)!.getAttribute('data-depth')
    expect(depth(paint)).toBe('0')
    // A sub-project row keeps a task row's columns: the leading slot, then the mark where the checkbox is.
    const row = r.container.querySelector('[data-sub-project]')!
    expect(row.children).toHaveLength(4)
    expect(row.children[0].getAttribute('aria-hidden')).toBe('true')
    expect(row.children[0].className).toContain('w-4')
    expect(row.children[1].className).toContain('w-5')
    // The bar folds the tasks of this project only, on this device.
    await click(r.container.querySelector(`[data-group="tasks:${home}"] [data-group-toggle]`)!)
    await waitFor(() => r.container.querySelector(`[data-task-id="${paint}"]`) === null, 'the tasks folded')
    await r.unmount()
    const errands = await createProject({ name: 'Errands' })
    await createProject({ name: 'Post', parent_id: errands })
    await createTask({ title: 'Stamps', project_id: errands })
    const other = await render(<TaskListView route={{ view: 'project', id: errands }} />)
    await waitFor(() => other.container.textContent!.includes('Stamps'), 'another project keeps its tasks open')
    await other.unmount()
  })

  it('adds no Tasks bar to a leaf project, nor where sections already head the tasks', async () => {
    const leaf = await createProject({ name: 'Errands' })
    await createTask({ title: 'Post office', project_id: leaf })
    const a = await render(<TaskListView route={{ view: 'project', id: leaf }} />)
    await waitFor(() => a.container.textContent!.includes('Post office'))
    expect(a.container.querySelector('[data-group^="tasks:"] [data-group-header]')).toBeNull()
    await a.unmount()

    const home = await createProject({ name: 'Home' })
    await createProject({ name: 'Garden', parent_id: home })
    const s = await createSection(home, 'Kitchen')
    await createTask({ title: 'Paint', project_id: home })
    await createTask({ title: 'Tiles', project_id: home, section_id: s })
    const b = await render(<TaskListView route={{ view: 'project', id: home }} />)
    await waitFor(() => b.container.textContent!.includes('Tiles') && b.container.querySelector('[data-sub-projects]') !== null)
    expect(b.container.querySelector('[data-group^="tasks:"] [data-group-header]')).toBeNull()
    expect(outline(b.container).slice(0, 3)).toEqual(['sub-projects', 'bar:No section', 'task:Paint'])
    await b.unmount()
  })

  it('shows no sub-projects on the board: its columns are the sections', async () => {
    const home = await createProject({ name: 'Home' })
    await createProject({ name: 'Garden', parent_id: home })
    await createSection(home, 'Doing')
    await createTask({ title: 'Paint', project_id: home })
    await saveViewMode(home, 'board')
    const r = await render(<TaskListView route={{ view: 'project', id: home }} />)
    await waitFor(() => r.container.textContent!.includes('Paint') && r.container.textContent!.includes('Doing'))
    expect(r.container.querySelector('[data-sub-projects]')).toBeNull()
    expect(r.container.querySelector('[data-group^="tasks:"] [data-group-header]')).toBeNull()
    await r.unmount()
  })
})

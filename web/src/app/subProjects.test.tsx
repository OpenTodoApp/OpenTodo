// @vitest-environment happy-dom
// Sub-projects as a collapsible group at the top of a project (OpenSpec change
// ux-overhaul, project-organization "Sub-projects inside a project view").
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { click, flush, render, mockFetch, noPublicLinks, visibleText } from '../ui/test-utils'
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
afterEach(() => { document.body.innerHTML = '' })

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

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
    await flush(20)
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
    await flush(50)
    expect(leaf.container.innerHTML).toBe('')
    await leaf.unmount()
  })
})

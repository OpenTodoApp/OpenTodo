// @vitest-environment happy-dom
// A project's query filter (OpenSpec change project-query-filter; GitHub issue 1636):
// Filter… on a project's board narrows the cards as the query is typed and keeps every
// column; each project keeps its own filter on this device; the chip clears it.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta } from '../lib/db'
import { createLabel } from '../lib/labels'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { createSection, saveViewMode } from '../lib/sections'
import { click, render, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'
import { resetTaskPage } from './taskPage.testkit'

beforeEach(async () => {
  resetTaskPage()
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetPanel()
})

async function typeInto(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const card = (root: ParentNode, id: string) => root.querySelector(`[data-task-id="${id}"]`)
const chip = () => document.querySelector<HTMLElement>('[data-query-filter-chip]')

async function openFilter(root: ParentNode) {
  await click(root.querySelector('[data-duration-filter] button[aria-label="Filter"]')!)
  await waitFor(() => !!document.querySelector('[data-query-filter-open]'), 'Filter… in the Filter menu')
  await click(document.querySelector('[data-query-filter-open]')!)
  await waitFor(() => !!document.querySelector('[data-query-filter-input]'), 'the filter dialog')
}

async function kitchen() {
  const project = await createProject({ name: 'Kitchen' })
  await saveViewMode(project, 'board')
  const todo = await createSection(project, 'To do')
  const doing = await createSection(project, 'Doing')
  const errand = await createLabel({ name: 'errand' })
  const ids = {
    tiles: await createTask({ title: 'Order the tiles', project_id: project, section_id: todo }),
    grout: await createTask({ title: 'Grout the tile edge', project_id: project, section_id: doing, priority: 1, labels: [errand] }),
    paint: await createTask({ title: 'Paint the ceiling', project_id: project, section_id: doing }),
    sink: await createTask({ title: 'Buy a sink', project_id: project, section_id: todo, priority: 1, labels: [errand] }),
  }
  return { project, ids }
}

describe('a project\'s query filter', () => {
  it('narrows the board as the query is typed, keeps every column, and the chip clears it', async () => {
    const { project, ids } = await kitchen()
    const r = await render(<TaskListView route={{ view: 'project', id: project }} />)
    await waitFor(() => !!card(r.container, ids.paint), 'the board')
    await openFilter(r.container)
    expect(document.querySelector('[data-testid="query-filter"]')!.textContent).toContain('Filter Kitchen')

    await typeInto(document.querySelector<HTMLInputElement>('[data-query-filter-input]')!, 'search: tile')
    await waitFor(async () => (await getMeta(`project.filter.${project}`, '')) === 'search: tile', 'the stored query')
    await waitFor(() => !card(r.container, ids.paint), 'the filter applied')
    expect(card(r.container, ids.tiles)).not.toBeNull()
    expect(card(r.container, ids.grout)).not.toBeNull()
    expect(card(r.container, ids.sink)).toBeNull()
    expect(r.container.textContent).toContain('To do')
    expect(r.container.textContent).toContain('Doing')

    // An invalid edit keeps the last valid filter and shows the parser's error.
    await typeInto(document.querySelector<HTMLInputElement>('[data-query-filter-input]')!, 'search: tile &')
    await waitFor(() => !!document.querySelector('[data-testid="query-filter"] .text-danger'), 'the error')
    expect(await getMeta(`project.filter.${project}`, '')).toBe('search: tile')
    expect(card(r.container, ids.paint)).toBeNull()

    // Done closes the dialog; the active filter is one chip in the header.
    await typeInto(document.querySelector<HTMLInputElement>('[data-query-filter-input]')!, 'search: tile')
    await click(document.querySelector('[data-testid="query-filter"] button[type="submit"]')!)
    await waitFor(() => !document.querySelector('[data-testid="query-filter"]') && !!chip(), 'the chip')
    await click(document.querySelector('[data-query-filter-clear]')!)
    await waitFor(() => !!card(r.container, ids.paint), 'every card back')
    expect(await getMeta(`project.filter.${project}`, '')).toBe('')
    await r.unmount()
  })

  it('the label checkboxes and a priority narrow it, and another project keeps its own filter', async () => {
    const { project, ids } = await kitchen()
    const garden = await createProject({ name: 'Garden' })
    const hedge = await createTask({ title: 'Trim the hedge', project_id: garden })
    const r = await render(<TaskListView route={{ view: 'project', id: project }} />)
    await waitFor(() => !!card(r.container, ids.paint), 'the board')
    await openFilter(r.container)
    await click(document.querySelector('[data-query-filter-label="errand"]')!)
    const input = document.querySelector<HTMLInputElement>('[data-query-filter-input]')!
    await typeInto(input, `${input.value} & p1`)
    await waitFor(async () => (await getMeta(`project.filter.${project}`, '')) === '@errand & p1', 'the query')
    await waitFor(() => !card(r.container, ids.tiles), 'the filter applied')
    expect(card(r.container, ids.grout)).not.toBeNull()
    expect(card(r.container, ids.sink)).not.toBeNull()
    expect(card(r.container, ids.paint)).toBeNull()
    await r.unmount()

    const g = await render(<TaskListView route={{ view: 'project', id: garden }} />)
    await waitFor(() => !!card(g.container, hedge), 'Garden unfiltered')
    expect(chip()).toBeNull()
    await g.unmount()

    const k = await render(<TaskListView route={{ view: 'project', id: project }} />)
    await waitFor(() => !!chip(), 'Kitchen keeps its filter')
    expect(card(k.container, ids.tiles)).toBeNull()
    await k.unmount()
  })
})

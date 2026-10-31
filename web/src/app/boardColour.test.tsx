// @vitest-environment happy-dom
// Colour by on boards (OpenSpec change calendar-clarity, "Colour by on boards"; GitHub
// issue 554; task 3.3): Project leaves every card as it was; Label and Priority give
// each card a 3 px leading edge in the hue; the choice is in a project board's menu
// and a board view's display panel, stored once on the device for every board.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta, setMeta } from '../lib/db'
import { createLabel } from '../lib/labels'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { saveViewMode } from '../lib/sections'
import { click, mockFetch, noPublicLinks, render, spokenText, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'
import { DisplayOptionsBody } from './views/DisplayPanel'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  mockFetch(noPublicLinks)
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetPanel()
})

const card = (root: ParentNode, id: string) => root.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!

async function board() {
  const project = await createProject({ name: 'Errands' })
  await saveViewMode(project, 'board')
  const urgent = await createLabel({ name: 'urgent', color: '#ef4444' })
  const ids = {
    labelled: await createTask({ title: 'Pharmacy', project_id: project, labels: [urgent], priority: 1 }),
    plain: await createTask({ title: 'Post office', project_id: project }),
  }
  return { project, ids }
}

describe('Colour by on boards', () => {
  it('Project leaves the cards as before; Label gives a red edge to an "urgent" card and the neutral edge to one without labels', async () => {
    const { project, ids } = await board()
    const r = await render(<TaskListView route={{ view: 'project', id: project }} />)
    await waitFor(() => !!r.container.querySelector(`[data-task-id="${ids.labelled}"]`), 'the board')
    expect(card(r.container, ids.labelled).hasAttribute('data-card-edge')).toBe(false)
    expect(card(r.container, ids.labelled).className).not.toContain('border-s-3')
    const before = spokenText(card(r.container, ids.labelled))

    // The project menu's Colour by (a project board has no display panel).
    await click(r.container.querySelector('button[aria-label="Project menu"]')!)
    await waitFor(() => !!document.querySelector('[data-menu-label="Colour by…"]'), 'Colour by in the project menu')
    await click(document.querySelector('[data-menu-label="Colour by…"]')!)
    await waitFor(() => !!document.querySelector('[data-menu-label="Label"]'), 'the choices')
    await click(document.querySelector('[data-menu-label="Label"]')!)
    await waitFor(() => card(r.container, ids.labelled).hasAttribute('data-card-edge'), 'the edge')
    expect(card(r.container, ids.labelled).getAttribute('data-hue')).toBe('red')
    expect(card(r.container, ids.labelled).className).toContain('border-s-3')
    expect(card(r.container, ids.plain).getAttribute('data-hue')).toBe('slate')
    // The card's accessible text is unchanged.
    expect(spokenText(card(r.container, ids.labelled))).toBe(before)
    expect(await getMeta('board.colorBy', null)).toBe('label')
    await r.unmount()
  })

  it('is one choice for every board on the device: a view coloured by priority colours the project board too', async () => {
    const { project, ids } = await board()
    await setMeta('board.colorBy', 'priority')
    const r = await render(<TaskListView route={{ view: 'project', id: project }} />)
    await waitFor(() => card(r.container, ids.labelled)?.hasAttribute('data-card-edge'), 'the edge')
    expect(card(r.container, ids.labelled).getAttribute('data-hue')).toBe('red')
    expect(card(r.container, ids.plain).getAttribute('data-hue')).toBe('slate')
    await r.unmount()
  })

  it('a board view\'s display panel offers Colour by', async () => {
    const chosen: string[] = []
    const r = await render(<DisplayOptionsBody value={{ layout: 'board', groupBy: 'project', sortBy: 'due', sortDir: 'asc', showCompleted: false, hidden: [] }}
      onChange={() => {}} colorBy={{ mode: 'project', onChange: (m) => chosen.push(m) }} />)
    const select = r.container.querySelector<HTMLSelectElement>('[data-display-color-by]')!
    expect([...select.options].map((o) => o.textContent)).toEqual(['Project', 'Label', 'Priority'])
    select.value = 'priority'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await waitFor(() => chosen.length === 1, 'the choice')
    expect(chosen).toEqual(['priority'])
    await r.unmount()
  })
})

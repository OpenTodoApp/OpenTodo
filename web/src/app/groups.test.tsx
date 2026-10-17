// @vitest-environment happy-dom
// Group headers (OpenSpec change ux-overhaul, task-list-presentation "Group
// headers" and "Empty groups"): one header for date, section and project groups,
// collapsed per device; empty generated groups and an empty "No section" are not
// shown; a section with only completed tasks keeps its header with a reveal.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { completeTask, createProject, createTask, resetDeviceId } from '../lib/ops'
import { createSection } from '../lib/sections'
import { click, flush, render, mockFetch, noPublicLinks } from '../ui/test-utils'
import { isGroupCollapsed, resetCollapsedGroups } from './collapsedGroups'
import { TaskListView } from './TaskListView'

// The project header asks the server for its public links.
beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals() })

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  resetCollapsedGroups()
})
afterEach(() => {
  vi.useRealTimers()
  resetCollapsedGroups()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const headers = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-group-header]')]

describe('generated groups', () => {
  it('Upcoming shows one shared header per date with a count, no empty groups, and collapses per device', async () => {
    await createTask({ title: 'Dentist', due: { date: '2026-10-15' } })
    await createTask({ title: 'Taxes', due: { date: '2026-10-20' } })
    await createTask({ title: 'Audit', due: { date: '2026-10-20' } })
    const r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => r.container.textContent!.includes('Taxes'))
    expect(headers(r.container)).toHaveLength(2)
    expect(headers(r.container).map((h) => h.querySelector('[data-group-count]')?.textContent)).toEqual(['1', '2'])
    expect(headers(r.container).every((h) => h.querySelector('h2'))).toBe(true)

    await click(headers(r.container)[0].querySelector('[data-group-toggle]')!)
    await flush(20)
    expect(r.container.textContent).not.toContain('Dentist')
    expect(r.container.textContent).toContain('Taxes')
    expect(headers(r.container)[0].getAttribute('data-collapsed')).toBe('true')
    expect(isGroupCollapsed('upcoming', '2026-10-15')).toBe(true)
    expect(JSON.parse(localStorage.getItem('ot.groups.collapsed')!)).toEqual(['upcoming:2026-10-15'])
    await r.unmount()

    // Still collapsed when the view is opened again on this device.
    const again = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => again.container.textContent!.includes('Taxes'))
    expect(again.container.textContent).not.toContain('Dentist')
    expect(headers(again.container)[0].getAttribute('data-collapsed')).toBe('true')
    await click(headers(again.container)[0].querySelector('[data-group-toggle]')!)
    await waitFor(() => again.container.textContent!.includes('Dentist'))
    await again.unmount()
  })

  it('Today keeps the danger tone on Overdue and a folded Blocked group with its count', async () => {
    await createTask({ title: 'Late', due: { date: '2026-10-10' } })
    await createTask({ title: 'Now', due: { date: '2026-10-14' } })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => r.container.textContent!.includes('Now'))
    const overdue = headers(r.container).find((h) => h.textContent?.includes('Overdue'))!
    expect(overdue).toBeTruthy()
    expect(overdue.querySelector('.text-danger')).toBeTruthy()
    await r.unmount()
  })
})

describe('sections', () => {
  it('hides an empty "No section" and keeps a completed-only section as "n completed" with Show', async () => {
    const home = await createProject({ name: 'Home' })
    const backlog = await createSection(home, 'Backlog')
    const done = await createSection(home, 'Done')
    await createTask({ title: 'Quotes', project_id: home, section_id: backlog })
    const old = await createTask({ title: 'Old', project_id: home, section_id: done })
    await completeTask(old)

    const r = await render(<TaskListView route={{ view: 'project', id: home }} />)
    await waitFor(() => r.container.textContent!.includes('Quotes') && headers(r.container).length >= 2)
    expect(r.container.textContent).not.toContain('No section')
    const names = headers(r.container).map((h) => h.querySelector('h2, h3')?.textContent?.replace(/\d+ open tasks?$/, ''))
    expect(names.some((n) => n?.startsWith('Backlog'))).toBe(true)
    const doneHeader = headers(r.container).find((h) => h.textContent?.includes('Done'))!
    expect(doneHeader.querySelector('[data-group-note]')?.textContent).toContain('1 completed')
    expect(r.container.textContent).not.toContain('Old')

    await click(doneHeader.querySelector('[data-reveal-completed]')!)
    await waitFor(() => r.container.querySelector('[data-revealed-completed]') !== null)
    expect(r.container.querySelector('[data-revealed-completed]')?.textContent).toContain('Old')
    expect(doneHeader.querySelector('[data-reveal-completed]')?.textContent).toBe('Hide')
    await r.unmount()
  })
})

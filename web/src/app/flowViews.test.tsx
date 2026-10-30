// @vitest-environment happy-dom
// Steps waiting in sequence in lists and Today (OpenSpec change project-flow-modes,
// tasks 3.1 and 3.2): dimmed in place with "After <step>", in Today's Blocked group
// until the step before them is completed.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { setBlockedBy } from '../lib/dependencies'
import { createProject, createTask, resetDeviceId, setTaskCompleted, updateProject } from '../lib/ops'
import { click, mockFetch, noPublicLinks, render, spokenText, visibleText, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 30, 12, 0))
  useDatabase(`flow-views-${Date.now()}-${n++}`)
  resetDeviceId()
  mockFetch(noPublicLinks)
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: true, weekStart: 1 })
  try { localStorage.clear() } catch { /* ignore */ }
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  vi.useRealTimers()
  resetPanel()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
})

const row = (title: string) => [...document.querySelectorAll<HTMLElement>('[data-task-id]')].find((r) => r.textContent?.includes(title))

async function moveHouse(due?: string) {
  const project = await createProject({ name: 'Move house' })
  const van = await createTask({ title: 'Book van', project_id: project })
  const pack = await createTask({ title: 'Pack kitchen', project_id: project, ...(due ? { due: { date: due } } : {}) })
  const keys = await createTask({ title: 'Hand over keys', project_id: project })
  await updateProject(project, { flow_mode: 'sequential' })
  return { project, van, pack, keys }
}

describe('rows (3.1)', () => {
  it('Dimmed step with its marker: in place, "After <step>", read as the previous step', async () => {
    const { project, van, keys } = await moveHouse()
    const other = await createTask({ title: 'Measure hall', project_id: null })
    await setBlockedBy(keys, [other])
    const r = await render(<TaskListView route={{ view: 'project', id: project }} />)
    mounted.push(r)
    await waitFor(() => !!row('Pack kitchen')?.querySelector('[data-waits]'))
    const marker = row('Pack kitchen')!.querySelector('[data-waits]')!
    expect(visibleText(marker)).toBe('After Book van')
    expect(spokenText(marker)).toBe('Waits for the previous step: Book van')
    expect(row('Pack kitchen')!.querySelector('[data-row-title]')!.hasAttribute('data-waiting')).toBe(true)
    expect(row('Book van')!.querySelector('[data-waits]')).toBeNull()
    // Blocked and waiting: the explicit link is the more specific reason.
    expect(row('Hand over keys')!.querySelector('[data-blocked]')).not.toBeNull()
    expect(row('Hand over keys')!.querySelector('[data-waits]')).toBeNull()
    // The order of the rows does not change.
    expect([...document.querySelectorAll('[data-task-id]')].map((e) => e.textContent).filter((x) => x?.includes('Book') || x?.includes('Pack') || x?.includes('Hand'))).toHaveLength(3)
    // Completing the current step offers the next one at once, with no other write.
    await setTaskCompleted(van, true)
    await waitFor(() => !row('Pack kitchen')?.querySelector('[data-waits]'))
  })

  it('the marker truncates the step title on a narrow row', async () => {
    const project = await createProject({ name: 'Trip' })
    await createTask({ title: 'Renew the passport at the consulate before anything else', project_id: project })
    await createTask({ title: 'Book flights', project_id: project })
    await updateProject(project, { flow_mode: 'sequential' })
    const r = await render(<TaskListView route={{ view: 'project', id: project }} />)
    mounted.push(r)
    await waitFor(() => !!row('Book flights')?.querySelector('[data-waits]'))
    const marker = row('Book flights')!.querySelector<HTMLElement>('[data-waits]')!
    expect(marker.className).toContain('max-w-48')
    expect(marker.querySelector('.truncate')).not.toBeNull()
  })
})

describe('Today (3.2)', () => {
  it('Due today but waiting: in the folded Blocked group, then in today\'s tasks once the step before it is done', async () => {
    const { van } = await moveHouse('2026-10-30')
    await createTask({ title: 'Water plants', due: { date: '2026-10-30' } })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    mounted.push(r)
    await waitFor(() => !!document.querySelector('[data-group="blocked"]'))
    const group = document.querySelector<HTMLElement>('[data-group="blocked"]')!
    const toggle = group.querySelector('button[aria-expanded]')!
    expect(visibleText(toggle.querySelector('[data-group-count]')!)).toBe('1')
    expect(row('Pack kitchen')).toBeUndefined()
    await click(toggle)
    await waitFor(() => !!document.querySelector('[data-group="blocked"]')?.textContent?.includes('Pack kitchen'))
    await setTaskCompleted(van, true)
    await waitFor(() => !document.querySelector('[data-group="blocked"]'))
    expect(document.querySelector('[data-group="today"]')!.textContent).toContain('Pack kitchen')
  })
})

// @vitest-environment happy-dom
// Row layouts (OpenSpec change row-layouts, issue #367): One line and Detailed rows,
// the account's choice and a list's own, and the priority mark that is never colour
// alone.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { rowLayoutOf, setAccountRowLayout } from '../lib/rowLayout'
import type { Label, Task } from '../lib/types'
import { createView } from '../lib/views'
import { click, flush, mockFetch, noPublicLinks, render, spokenText, visibleText, waitFor } from '../ui/test-utils'
import { SavedViewRoute } from './SavedViewView'
import { TaskListView } from './TaskListView'
import { TaskRow } from './TaskRow'

beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

const task = (over: Partial<Task>): Task => ({
  id: 't', title: 'Task', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0,
  created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, _clock: {}, ...over,
} as Task)
const label = (id: string, name: string) => ({ id, name, color: '#888', position: 0, created_at: 0, deleted_at: null }) as Label
const noop = () => {}

describe('rowLayoutOf', () => {
  it('reads "" and unknown values as the fallback', () => {
    expect(rowLayoutOf('detailed')).toBe('detailed')
    expect(rowLayoutOf('')).toBe('line')
    expect(rowLayoutOf('cards', 'detailed')).toBe('detailed')
  })
})

describe('the priority mark', () => {
  it('shows bars beside the title of a one-line row, read as the priority, and none for priority 4', async () => {
    const r = await render(<ul>
      <TaskRow task={task({ id: 'a', title: 'Urgent', priority: 1 })} selected={false} showProject={false} onToggle={noop} onOpen={noop} layout="line" />
      <TaskRow task={task({ id: 'b', title: 'Plain', priority: 4 })} selected={false} showProject={false} onToggle={noop} onOpen={noop} layout="line" />
    </ul>)
    const urgent = r.container.querySelector('[data-task-id="a"]')!
    const mark = urgent.querySelector('[data-row-head] [data-priority-mark="1"]')!
    expect(mark.querySelector('svg')).toBeTruthy()
    expect(spokenText(mark)).toBe('Priority 1')
    expect(r.container.querySelector('[data-task-id="b"] [data-priority-mark]')).toBeNull()
    await r.unmount()
  })
})

describe('a detailed row', () => {
  it('has the title, the parent, then the date, the priority as text, the project and every label', async () => {
    const labels = [label('l1', 'call'), label('l2', 'errand'), label('l3', 'waiting')]
    const project = { id: 'p', name: 'Home', color: '#f59e0b' } as never
    const r = await render(<ul>
      <TaskRow task={task({ title: 'Book flights', priority: 2, due: { date: '2026-10-20', time: '09:30' }, deadline: '2026-10-25', labels: ['l1', 'l2', 'l3'], project_id: 'p' })}
        labels={labels} project={project} breadcrumb="Plan trip" selected={false} showProject onToggle={noop} onOpen={noop} layout="detailed" timeColumn />
    </ul>)
    const li = r.container.querySelector('li')!
    expect(li.getAttribute('data-row-layout')).toBe('detailed')
    // No time column on a detailed row: the time is in the details line with the date.
    expect(li.querySelector('[data-row-time]')).toBeNull()
    const meta = li.querySelector('[data-row-meta="detailed"]')!
    expect(visibleText(meta.querySelector('[data-breadcrumb]')!)).toBe('Plan trip')
    const details = meta.querySelector('[data-row-details]')!
    expect(details.querySelector('[data-date]')!.textContent).toContain('09:30')
    expect(visibleText(details.querySelector('[data-priority-mark="2"]')!)).toBe('P2')
    expect(spokenText(details.querySelector('[data-priority-mark="2"]')!)).toBe('Priority 2')
    expect(details.querySelector('[data-deadline]')).toBeTruthy()
    expect(details.textContent).toContain('Home')
    // Without a measured width every label fits: no "+n".
    expect([...details.querySelectorAll('[data-label-chip]')].map((c) => c.textContent)).toEqual(['call', 'errand', 'waiting'])
    expect(details.querySelector('[data-label-more]')).toBeNull()
    await r.unmount()
  })

  it('follows the account choice in a list without its own, and a project can choose its own', async () => {
    const pid = await createProject({ name: 'Home' })
    await createTask({ title: 'Paint', project_id: pid, priority: 1 })
    await createTask({ title: 'Inbox thing', priority: 3 })
    await setAccountRowLayout('detailed')
    const inbox = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!document.querySelector('[data-task-id] [data-row-title]'), 'inbox rows')
    await waitFor(() => !!document.querySelector('li[data-row-layout="detailed"]'), 'detailed by the account')
    await inbox.unmount()

    const proj = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => !!document.querySelector('li[data-row-layout="detailed"]'), 'project follows the account')
    await click(document.querySelector('[data-display-trigger]')!)
    const one = document.querySelector<HTMLButtonElement>('[data-display-row-layout] [data-row-layout="line"]')!
    expect(document.querySelector('[data-display-row-layout] [aria-checked="true"]')!.getAttribute('data-row-layout')).toBe('detailed')
    await click(one)
    await waitFor(() => !document.querySelector('li[data-row-layout="detailed"]'), 'one line in this project')
    expect(await db.prefs.get(pid)).toMatchObject({ row_layout: 'line' })
    await proj.unmount()
  })

  it('a saved view stores its own choice', async () => {
    await createTask({ title: 'Call bank', priority: 1 })
    const id = await createView({ name: 'Urgent', query: 'p1' })
    const r = await render(<SavedViewRoute id={id} />)
    await waitFor(() => !!document.querySelector('[data-task-id]'), 'view rows')
    await click(document.querySelector('[data-display-trigger]')!)
    await click(document.querySelector('[data-display-row-layout] [data-row-layout="detailed"]')!)
    await waitFor(() => !!document.querySelector('li[data-row-layout="detailed"]'), 'detailed view')
    expect((await db.views.get(id))?.row_layout).toBe('detailed')
    await act(async () => { await flush(10) })
    await r.unmount()
  })
})

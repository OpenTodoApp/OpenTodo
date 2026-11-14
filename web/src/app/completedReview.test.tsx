// @vitest-environment happy-dom
// The Completed view for reviews (OpenSpec change completed-view-review): narrowed to
// projects, grouped by day or by project, searched, and done rows without a strikethrough.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { completedDisplay, filterCompleted, parseCompletedDisplay, setCompletedDisplay } from '../lib/completedDisplay'
import { db } from '../lib/db'
import { LOGBOOK_PAGE, logbookGroups } from '../lib/logbook'
import { resetModuleState } from '../lib/moduleState'
import { mutateMany, resetDeviceId, type Change } from '../lib/ops'
import type { Task } from '../lib/types'
import { render, type as typeInto, waitFor } from '../ui/test-utils'
import { resetCollapsedGroups } from './collapsedGroups'
import { TaskListView } from './TaskListView'

const at = (iso: string, hour = 12) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d, hour).getTime()
}

function task(id: string, completed_at: number | null, extra: Partial<Task> = {}): Task {
  return {
    id, title: id, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0, created_at: 0,
    completed_at, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null, assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...extra,
  }
}

describe('completed display options', () => {
  beforeEach(() => { localStorage.clear(); resetModuleState() })

  it('reads a missing or unknown value as every completion by day', () => {
    expect(parseCompletedDisplay(null)).toEqual({ groupBy: 'day', projects: [] })
    expect(parseCompletedDisplay('{nope')).toEqual({ groupBy: 'day', projects: [] })
    expect(parseCompletedDisplay('{"groupBy":"week","projects":["a",1,"a"]}')).toEqual({ groupBy: 'day', projects: ['a'] })
  })

  it('keeps the choice on this device', () => {
    setCompletedDisplay({ groupBy: 'project', projects: ['work'] })
    expect(completedDisplay()).toEqual({ groupBy: 'project', projects: ['work'] })
    expect(parseCompletedDisplay(localStorage.getItem('completed.display'))).toEqual({ groupBy: 'project', projects: ['work'] })
  })

  it('narrows to projects (the Inbox as "") and to every word of the search, in title or notes, ignoring accents', () => {
    const tasks = [
      task('a', 1, { title: 'Café invoice', project_id: 'work' }),
      task('b', 2, { title: 'Dentist', description: 'call the clinic' }),
      task('c', 3, { title: 'Garden', project_id: 'home' }),
    ]
    const ids = (xs: Task[]) => xs.map((x) => x.id)
    expect(ids(filterCompleted(tasks, { groupBy: 'day', projects: ['work', ''] }, ''))).toEqual(['a', 'b'])
    expect(ids(filterCompleted(tasks, { groupBy: 'day', projects: [] }, 'cafe'))).toEqual(['a'])
    expect(ids(filterCompleted(tasks, { groupBy: 'day', projects: [] }, 'CALL clinic'))).toEqual(['b'])
    expect(ids(filterCompleted(tasks, { groupBy: 'day', projects: ['home'] }, 'invoice'))).toEqual([])
  })

  it('groups by project in the order of each project’s newest completion', () => {
    const tasks = [
      task('w1', at('2026-10-10'), { project_id: 'work' }),
      task('i1', at('2026-10-12'), {}),
      task('w2', at('2026-10-14'), { project_id: 'work' }),
    ]
    const { groups } = logbookGroups(tasks, LOGBOOK_PAGE, 'project')
    expect(groups.map((g) => [g.project, g.tasks.map((x) => x.id)])).toEqual([['work', ['w2', 'w1']], [null, ['i1']]])
  })
})

describe('Completed view', () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 16, 12, 0))
    await db.delete()
    await db.open()
    resetDeviceId()
    localStorage.clear()
    resetModuleState()
    resetCollapsedGroups()
  })
  afterEach(() => {
    vi.useRealTimers()
    resetCollapsedGroups()
  })

  const headings = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-group-header] h2')].map((h) => h.textContent)
  const titles = (root: ParentNode) => [...root.querySelectorAll('[data-task-id]')].map((r) => r.getAttribute('data-task-id'))

  async function seed(): Promise<void> {
    const changes: Change[] = [
      { entity: 'project', entityId: 'work', patch: { name: 'Work', position: 0, color: '#3b82f6', deleted_at: null } },
      ...[['report', 'Send the report', 'work', at('2026-10-16', 9)], ['plants', 'Water the plants', null, at('2026-10-15', 18)], ['slides', 'Draft the slides', 'work', at('2026-10-14', 10)]]
        .map(([id, title, project, ms], i): Change => ({
          entity: 'task', entityId: id as string,
          patch: { title, project_id: project, priority: 4, labels: [], position: i, created_at: (ms as number) - 1000, completed_at: ms, deleted_at: null },
        })),
    ]
    await mutateMany(changes)
  }

  it('shows done titles muted without a strikethrough', async () => {
    await seed()
    const r = await render(<TaskListView route={{ view: 'completed' }} />)
    await waitFor(() => titles(r.container).length === 3)
    expect(r.container.querySelector('[data-task-id] .line-through')).toBeNull()
    expect(r.container.querySelector('[data-task-id] [data-check-mark] svg')).toBeTruthy()
    await r.unmount()
  })

  it('searches the completed tasks and clears from the empty state', async () => {
    await seed()
    const r = await render(<TaskListView route={{ view: 'completed' }} />)
    await waitFor(() => titles(r.container).length === 3)
    const search = r.container.querySelector<HTMLInputElement>('[data-completed-search] input')!
    await typeInto(search, 'slides')
    await waitFor(() => titles(r.container).join() === 'slides')
    await typeInto(search, 'nothing like this')
    await waitFor(() => titles(r.container).length === 0 && !!r.container.textContent?.includes('Clear'))
    await r.unmount()
  })

  it('groups by project and narrows to the chosen projects', async () => {
    await seed()
    setCompletedDisplay({ groupBy: 'project' })
    const r = await render(<TaskListView route={{ view: 'completed' }} />)
    await waitFor(() => headings(r.container).join() === 'Work,Inbox')
    expect(titles(r.container)).toEqual(['report', 'slides', 'plants'])
    setCompletedDisplay({ projects: [''] })
    await waitFor(() => headings(r.container).join() === 'Inbox')
    expect(titles(r.container)).toEqual(['plants'])
    expect(r.container.querySelector('[data-display-trigger][data-narrowed]')).toBeTruthy()
    await r.unmount()
  })
})

// @vitest-environment happy-dom
// OpenSpec change inbox-means-unplaced: the Inbox lists only unscheduled tasks
// without a project (tasks 2.1, 3.2-3.4): the sidebar count follows scheduling,
// the others are not listed there at all (inbox-only-inbox), quick add in the Inbox
// announces where a dated task went, and pickers name the choice "No project".
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId, updateTask } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import type { User } from '../lib/types'
import { click, flush, render, spokenText, type, waitFor } from '../ui/test-utils'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { resetPanel } from './panel'
import { ProjectPickerField } from './ProjectPickerField'
import { selectTask } from './signals'
import { Sidebar } from './Sidebar'
import { resetSidebarLayout } from './sidebarLayout'
import { TaskListView } from './TaskListView'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 9, 0)) // Wednesday 14 October 2026
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  resetSidebarLayout()
  await setCurrentUserId('u1')
  history.pushState(null, '', '/')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  hideBulkToast()
  resetPanel()
})

// The title alone: an Inbox row also carries its source line (inbox-split D4).
const rowTitles = (root: ParentNode) => [...root.querySelectorAll('[data-task-id]')].map((r) => r.querySelector('[data-row-title]')?.textContent?.trim() ?? r.textContent?.trim())

describe('the Inbox view', () => {
  it('Where planned tasks went: the Inbox lists only its own task, with nothing after it for the planned ones', async () => {
    await createTask({ title: 'Undated' })
    for (const [title, date] of [['Sat task', '2026-10-17'], ['Thu task', '2026-10-15'], ['Fri task', '2026-10-16']]) await createTask({ title, due: { date } })
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length === 1)
    await flush()
    expect(rowTitles(r.container)).toEqual(['Undated'])
    expect(r.container.querySelector('[data-group="planned"]')).toBeNull()
    expect(r.container.querySelector('[data-planned-filter]')).toBeNull()
    expect(r.container.querySelector('[data-planned-line]')).toBeNull()
    await r.unmount()
  })

  it('The group remembers being opened: a device that had opened it shows only the Inbox', async () => {
    localStorage.setItem('opentodo.collapsed', JSON.stringify(['inbox:planned:open']))
    await createTask({ title: 'Undated' })
    await createTask({ title: 'Fri task', due: { date: '2026-10-16' } })
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length === 1)
    await flush()
    expect(rowTitles(r.container)).toEqual(['Undated'])
    expect(r.container.querySelector('[data-group="planned"]')).toBeNull()
    await r.unmount()
  })

  it('Inbox zero with planned tasks: the full empty state with the illustration, and Process is not offered', async () => {
    await createTask({ title: 'Fri task', due: { date: '2026-10-16' } })
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!r.container.querySelector('[data-empty-state="inbox"]'))
    expect(r.container.querySelector('[data-triage-start]')).toBeNull()
    const empty = r.container.querySelector('[data-empty-state="inbox"]')!
    expect(empty.querySelector('[data-illustration="inbox-zero"]')).not.toBeNull()
    expect(empty.textContent).toContain('Inbox zero: every task has a place.')
    expect(r.container.querySelector('[data-group="planned"]')).toBeNull()
    expect(r.container.querySelectorAll('[data-task-id]').length).toBe(0)
    await r.unmount()
  })

  it('Quick add with a date in the Inbox: "Added to Friday" with an Open control, and the task is not listed', async () => {
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    // The list shows once its tasks are read (ux-fixes-phone D5).
    await waitFor(() => !!r.container.querySelector('form input'))
    const input = r.container.querySelector<HTMLInputElement>('form input')!
    await type(input, 'Call the bank friday')
    await act(async () => { r.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => !!bulkToast())
    const toast = bulkToast()!
    expect(toast.label).toMatch(/^Added to Fri/)
    expect(toast.action?.label).toBe('Open')
    const task = (await db.tasks.toArray()).find((x) => x.title === 'Call the bank')!
    expect(task.due).toEqual({ date: '2026-10-16' })
    expect(task.project_id).toBeNull()
    expect(r.container.querySelectorAll('[data-task-id]').length).toBe(0)
    act(() => toast.action!.run())
    expect(location.pathname).toBe('/upcoming')
    expect(selectTask.take()).toBe(task.id)
    await r.unmount()
  })

  it('an undated line in the Inbox quick add announces nothing', async () => {
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!r.container.querySelector('form input'))
    await type(r.container.querySelector<HTMLInputElement>('form input')!, 'Think about it')
    await act(async () => { r.container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => r.container.querySelectorAll('[data-task-id]').length === 1)
    expect(bulkToast()).toBeNull()
    await r.unmount()
  })
})

describe('Inbox zero (design-system "Illustrations")', () => {
  it('Not read by a screen reader: the empty Inbox and the end of Process the Inbox read only the sentence (and the way back from triage)', async () => {
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!r.container.querySelector('[data-empty-state="inbox"] [data-illustration="inbox-zero"]'))
    const empty = r.container.querySelector('[data-empty-state="inbox"]')!
    expect(empty.querySelector('svg')!.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(spokenText(empty)).toMatch(/^Inbox zero: every task has a place\.$/)
    await r.unmount()

    const { TriageView } = await import('./TriageView')
    const t = await render(<TriageView />)
    await waitFor(() => !!document.querySelector('[data-empty-state="triage"] [data-illustration="inbox-zero"]'))
    expect(spokenText(document.querySelector('[data-empty-state="triage"]')!)).toMatch(/^Inbox zero: every task has a place\.\s*Back to the Inbox$/)
    await t.unmount()
  })

  it('Follows the theme: the drawing uses only currentColor and colour tokens', async () => {
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!r.container.querySelector('[data-illustration="inbox-zero"]'))
    const svg = r.container.querySelector('[data-illustration="inbox-zero"]')!
    const colours = [svg, ...svg.querySelectorAll('*')].flatMap((el) => ['stroke', 'fill'].map((a) => el.getAttribute(a)).filter((v): v is string => !!v))
    // The accent shape's outline is the accent text token (illustrations-v2 D3).
    for (const c of colours) expect(c).toMatch(/^(none|currentColor|var\(--color-[a-z-]+\)|var\(--text-color-accent\))$/)
    await r.unmount()
  })
})

describe('the sidebar count', () => {
  it('Inbox count follows scheduling: dating a task takes it out of the count, clearing the date brings it back', async () => {
    const a = await createTask({ title: 'One' })
    await createTask({ title: 'Two' })
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    const count = () => r.container.querySelector('[data-destination="inbox"] [data-count]')?.textContent
    await waitFor(() => count() === '2')
    await act(async () => { await updateTask(a, { due: { date: '2026-10-20' } }) })
    await waitFor(() => count() === '1')
    await act(async () => { await updateTask(a, { due: null }) })
    await waitFor(() => count() === '2')
    await r.unmount()
  })
})

describe('project pickers', () => {
  it('No project found by typing inbox: the "No project" option is offered first', async () => {
    const home = await createProject({ name: 'Home' })
    const projects = await db.projects.toArray()
    const r = await render(<ProjectPickerField label="Project" projects={projects} value={home} rankContext="task.project" onChange={() => {}} />)
    await click(r.container.querySelector('button')!)
    await waitFor(() => !!document.querySelector('[role="dialog"] input'))
    await type(document.querySelector<HTMLInputElement>('[role="dialog"] input')!, 'inb')
    await waitFor(() => !!document.querySelector('[role="option"]')?.textContent?.includes('No project'), 'No project ranked first')
    const options = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent?.trim())
    expect(options[0]).toContain('No project')
    await r.unmount()
  })
})

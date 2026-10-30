// @vitest-environment happy-dom
// OpenSpec change add-position: "Add new tasks" at the top or the bottom (tasks 1.3,
// 2.2), the quick add that sticks from 768 px (3.1) and the toast for a task added out
// of sight (3.2).
import 'fake-indexeddb/auto'
import { act, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createTask, resetDeviceId } from '../../lib/ops'
import { createSection } from '../../lib/sections'
import { setCurrentUserId } from '../../lib/sharing'
import type { Project } from '../../lib/types'
import { readAddPosition, setAddPosition, USER_PREFS_ID } from '../../lib/userPrefs'
import { click, flush, render, type, waitFor } from '../../ui/test-utils'
import { bulkToast, hideBulkToast } from '../bulk/toastStore'
import { listState } from '../listActions'
import { addFromBar } from '../palette/addFromBar'
import { resetPanel } from '../panel'
import { AddPositionSection } from '../QuickAddSettings'
import { QuickAddSheet } from '../QuickAddSheet'
import { SectionQuickAdd } from '../Sections'
import { TaskListView } from '../TaskListView'
import { announceIfOutOfSight } from './announceAdded'
import { STICKY_QUICK_ADD, useStickyQuickAdd } from './stickyQuickAdd'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  await setCurrentUserId('u1')
  history.pushState(null, '', '/')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  hideBulkToast()
  resetPanel()
})

const rowTitles = (root: ParentNode) => [...root.querySelectorAll('li[data-task-id]')].map((r) => r.querySelector('[data-row-title]')?.textContent?.trim())
const ordered = async (filter: (t: { project_id: string | null; section_id?: string | null }) => boolean) =>
  (await db.tasks.toArray()).filter(filter).sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1)).map((t) => t.title)

async function submitQuickAdd(root: ParentNode, text: string) {
  const input = root.querySelector<HTMLInputElement>('form input')!
  await type(input, text)
  await act(async () => { input.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
}

describe('Settings → Capture → Quick add → Add new tasks (1.3)', () => {
  it('choosing "top" writes the op and survives a reload', async () => {
    const r = await render(<AddPositionSection />)
    const radio = (v: string) => r.container.querySelector<HTMLInputElement>(`input[name="add-position"][value="${v}"]`)!
    await waitFor(() => !!radio('bottom'))
    expect(radio('bottom').checked).toBe(true)
    expect(r.container.textContent).toContain('Lists sorted by date or priority keep their order.')
    await click(radio('top'))
    await waitFor(async () => readAddPosition(await db.userPrefs.get(USER_PREFS_ID)) === 'top')
    const queued = (await db.outbox.toArray()).filter((o) => o.entity === 'user_prefs' && o.field === 'add_position')
    expect(queued.map((o) => o.value)).toEqual(['top'])
    await r.unmount()
    // Read again from the stored row, as after a reload.
    const again = await render(<AddPositionSection />)
    await waitFor(() => again.container.querySelector<HTMLInputElement>('input[value="top"]')?.checked === true)
    await again.unmount()
  })
})

describe('entry points follow the preference (2.2)', () => {
  it('a project\'s quick add puts the task first with "top", last by default', async () => {
    const p = await createProject({ name: 'House' })
    for (const title of ['One', 'Two', 'Three']) await createTask({ title, project_id: p })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => rowTitles(r.container).length === 3)
    await submitQuickAdd(r.container, 'At the end')
    await waitFor(() => rowTitles(r.container).length === 4)
    expect(rowTitles(r.container).at(-1)).toBe('At the end')
    await setAddPosition('top')
    await submitQuickAdd(r.container, 'Call the plumber')
    await waitFor(() => rowTitles(r.container).length === 5)
    expect(rowTitles(r.container)[0]).toBe('Call the plumber')
    await r.unmount()
  })

  it('the Inbox\'s quick add with "top"', async () => {
    await createTask({ title: 'Old' })
    await setAddPosition('top')
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => rowTitles(r.container).length === 1)
    await submitQuickAdd(r.container, 'New')
    await waitFor(() => rowTitles(r.container).length === 2)
    expect(rowTitles(r.container)).toEqual(['New', 'Old'])
    await r.unmount()
  })

  it('a section\'s add row (list and board column) puts the task first in that section only', async () => {
    const p = await createProject({ name: 'Work' })
    const doing = await createSection(p, 'Doing')
    const later = await createSection(p, 'Later')
    await createTask({ title: 'd1', project_id: p, section_id: doing })
    await createTask({ title: 'l1', project_id: p, section_id: later })
    await setAddPosition('top')
    const project = (await db.projects.get(p)) as Project
    const r = await render(<SectionQuickAdd project={project} sectionId={doing} sectionName="Doing" projects={[project]} labels={[]} onClose={() => undefined} />)
    await submitQuickAdd(r.container, 'd-top')
    await waitFor(async () => (await db.tasks.count()) === 3)
    expect(await ordered((t) => t.section_id === doing)).toEqual(['d-top', 'd1'])
    expect(await ordered((t) => t.section_id === later)).toEqual(['l1'])
    await r.unmount()
  })

  it('the command bar follows it too', async () => {
    await createTask({ title: 'Old' })
    await setAddPosition('top')
    await addFromBar({ title: 'From the bar' }, { view: 'inbox' })
    expect(await ordered((t) => t.project_id === null)).toEqual(['From the bar', 'Old'])
  })

  it('the phone\'s add sheet follows it too', async () => {
    await createTask({ title: 'Old' })
    await setAddPosition('top')
    const onClose = vi.fn()
    const r = await render(<QuickAddSheet open onClose={onClose} anchor={{ current: null }} route={{ view: 'inbox' }} />)
    await waitFor(() => !!document.querySelector('[data-quick-add-sheet] form input'))
    await submitQuickAdd(document.querySelector('[data-quick-add-sheet]')!, 'From the sheet')
    await waitFor(() => onClose.mock.calls.length > 0)
    expect(await ordered((t) => t.project_id === null)).toEqual(['From the sheet', 'Old'])
    await r.unmount()
  })

  it('`o` still inserts after the anchor with "top"', async () => {
    const p = await createProject({ name: 'Trip' })
    for (const title of ['A', 'B', 'C']) await createTask({ title, project_id: p })
    await setAddPosition('top')
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => rowTitles(r.container).length === 3)
    const a = (await db.tasks.toArray()).find((t) => t.title === 'A')!
    await act(async () => { listState()!.focusQuickAdd(a.id) })
    await submitQuickAdd(r.container, 'After A')
    await waitFor(() => rowTitles(r.container).length === 4)
    await waitFor(() => rowTitles(r.container)[1] === 'After A')
    expect(rowTitles(r.container)).toEqual(['A', 'After A', 'B', 'C'])
    await r.unmount()
  })
})

describe('the quick add stays reachable (3.1)', () => {
  it('the list page\'s quick add row carries the sticky classes from 768 px; Completed has none', async () => {
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!r.container.querySelector('[data-quick-add-row]'))
    const row = r.container.querySelector<HTMLElement>('[data-quick-add-row]')!
    for (const c of STICKY_QUICK_ADD.split(' ')) expect(row.classList.contains(c)).toBe(true)
    // Only from md: below 768 px it scrolls with the list.
    expect(row.classList.contains('sticky')).toBe(false)
    await r.unmount()
  })

  it('sticks just below the sticky page header', async () => {
    function Harness() {
      const el = useRef<HTMLDivElement>(null)
      const top = useStickyQuickAdd(el, true)
      return (
        <div data-page-body>
          <header data-page-header style={{ position: 'sticky' }} />
          <div ref={el} data-top={top} />
        </div>
      )
    }
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(47)
    const r = await render(<Harness />)
    await waitFor(() => r.container.querySelector('[data-top]')?.getAttribute('data-top') === '47')
    await r.unmount()
  })
})

describe('a new task out of sight is announced (3.2)', () => {
  /** Puts rows whose title matches far below the window (out of sight). */
  function farDown(title: string) {
    const original = Element.prototype.getBoundingClientRect
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this.matches('[data-task-id]') && this.textContent?.includes(title)) return { top: 2000, bottom: 2040, left: 0, right: 100, width: 100, height: 40, x: 0, y: 2000, toJSON: () => ({}) } as DOMRect
      return original.call(this)
    })
  }

  it('Added at the bottom of a long Inbox: the toast names it, Show selects the task', async () => {
    for (let i = 0; i < 5; i++) await createTask({ title: `Task ${i}` })
    farDown('Late arrival')
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => rowTitles(r.container).length === 5)
    await submitQuickAdd(r.container, 'Late arrival')
    await waitFor(() => !!bulkToast())
    const toast = bulkToast()!
    expect(toast.label).toBe('Added to the bottom of Inbox')
    expect(toast.action?.label).toBe('Show')
    const id = (await db.tasks.toArray()).find((t) => t.title === 'Late arrival')!.id
    act(() => toast.action!.run())
    await waitFor(() => r.container.querySelector(`li[data-task-id="${id}"]`)?.getAttribute('aria-current') === 'true', 'the new row selected')
    await r.unmount()
  })

  it('a visible row is not announced', async () => {
    const p = await createProject({ name: 'Small' })
    for (let i = 0; i < 5; i++) await createTask({ title: `Task ${i}`, project_id: p })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => rowTitles(r.container).length === 5)
    await submitQuickAdd(r.container, 'Fits')
    await waitFor(() => rowTitles(r.container).length === 6)
    await flush()
    expect(bulkToast()).toBeNull()
    await r.unmount()
  })

  it('says "top" for a top placement and nothing for a row that never shows', async () => {
    document.body.innerHTML = '<ul><li data-task-id="t1">One</li></ul>'
    const select = vi.fn()
    expect(await announceIfOutOfSight('t1', { list: 'Work', placement: 'top', select, inSight: () => false })).toBe(true)
    expect(bulkToast()!.label).toBe('Added to the top of Work')
    bulkToast()!.action!.run()
    expect(select).toHaveBeenCalledWith('t1')
    hideBulkToast()
    expect(await announceIfOutOfSight('missing', { list: 'Work', placement: 'top', select, inSight: () => false })).toBe(false)
    expect(bulkToast()).toBeNull()
    document.body.innerHTML = ''
  })
})

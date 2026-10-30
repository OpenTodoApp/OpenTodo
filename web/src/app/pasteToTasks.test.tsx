// @vitest-environment happy-dom
// OpenSpec change paste-to-tasks, task 3.3: a pasted list in a screen's quick add
// becomes one task per line with that screen's defaults, in one batch with one Undo.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, resetDeviceId } from '../lib/ops'
import { createSection } from '../lib/sections'
import { setCurrentUserId } from '../lib/sharing'
import { undoBatch } from '../lib/undo'
import { compareByPosition } from '../lib/ordering'
import { flush, render, waitFor } from '../ui/test-utils'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { resetPanel } from './panel'
import { SectionQuickAdd } from './Sections'
import { TaskListView } from './TaskListView'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 9, 0)) // Wednesday 14 October 2026
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
  vi.useRealTimers()
  vi.unstubAllGlobals()
  hideBulkToast()
  resetPanel()
})

async function paste(input: HTMLInputElement, text: string) {
  const e = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(e, 'clipboardData', { value: { files: [], getData: (kind: string) => (kind === 'text/plain' ? text : '') } })
  await act(async () => { input.dispatchEvent(e) })
  await flush()
}
async function confirm() {
  await waitFor(() => !!document.querySelector('[data-paste-add]'), 'the offer')
  await act(async () => { document.querySelector<HTMLButtonElement>('[data-paste-add]')!.click() })
}
const live = async () => (await db.tasks.toArray()).filter((x) => !x.deleted_at).sort(compareByPosition)

describe('a pasted list in a list page', () => {
  it('Today: every line is due today unless it names its own date; one batch', async () => {
    const work = await createProject({ name: 'Work' })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => !!r.container.querySelector('form input'))
    await paste(r.container.querySelector<HTMLInputElement>('form input')!, 'Call Anna tomorrow 10am\nSend invoice #Work p1\n- Water plants')
    await confirm()
    await waitFor(() => !!bulkToast(), 'the toast')
    expect(bulkToast()!.label).toBe('3 tasks added')
    expect(bulkToast()!.undoId).not.toBeNull()
    const tasks = await live()
    expect(tasks.map((x) => [x.title, x.due, x.project_id, x.priority])).toEqual([
      ['Call Anna', { date: '2026-10-15', time: '10:00' }, null, 4],
      ['Send invoice', { date: '2026-10-14' }, work, 1],
      ['Water plants', { date: '2026-10-14' }, null, 4],
    ])
    // One batch: one clock for every op of the paste.
    const ops = (await db.outbox.toArray()).filter((o) => o.entity === 'task' && tasks.some((x) => x.id === o.entityId))
    expect(new Set(ops.map((o) => o.ts)).size).toBe(1)
    await r.unmount()
  })

  it('Inbox: the tasks in the pasted order, one toast with Undo that removes them all', async () => {
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!r.container.querySelector('form input'))
    await paste(r.container.querySelector<HTMLInputElement>('form input')!, '- Milk\n- Eggs\n\n- Bread')
    await confirm()
    await waitFor(() => !!bulkToast(), 'the toast')
    expect((await live()).map((x) => x.title)).toEqual(['Milk', 'Eggs', 'Bread'])
    expect(bulkToast()!.label).toBe('3 tasks added')
    await act(async () => { await undoBatch(bulkToast()!.undoId!) })
    expect(await live()).toEqual([])
    await r.unmount()
  })

  it('Inbox: lines that schedule their task are counted once in the toast', async () => {
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => !!r.container.querySelector('form input'))
    await paste(r.container.querySelector<HTMLInputElement>('form input')!, 'Milk\nCall the bank friday\nPay rent friday')
    await confirm()
    await waitFor(() => !!bulkToast(), 'the toast')
    expect(bulkToast()!.label).toBe('3 tasks added, 2 not in the Inbox')
    await r.unmount()
  })
})

describe('a pasted list in a section', () => {
  it('every line lands in the section, in order; a #project line leaves it', async () => {
    const home = await createProject({ name: 'Home' })
    const work = await createProject({ name: 'Work' })
    const garden = await createSection(home, 'Garden')
    const project = (await db.projects.get(home))!
    const projects = await db.projects.toArray()
    const r = await render(<SectionQuickAdd project={project} sectionId={garden} sectionName="Garden" projects={projects} labels={[]} onClose={() => {}} />)
    await paste(r.container.querySelector('input')!, '1. Mow\n2. Rake\n3. Email Bob #Work')
    await confirm()
    await waitFor(() => !!bulkToast(), 'the toast')
    expect((await live()).map((x) => [x.title, x.project_id, x.section_id ?? null])).toEqual([
      ['Mow', home, garden],
      ['Rake', home, garden],
      ['Email Bob', work, null],
    ])
    await r.unmount()
  })
})

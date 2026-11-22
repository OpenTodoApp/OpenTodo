// @vitest-environment happy-dom
// Ticked items suggested while typing in a reusable list (OpenSpec change reusable-suggest,
// #1839): a few letters list the matching ticked items, the most recent first; picking one
// reopens it; Enter without moving into the list still adds what was typed.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId, setTaskCompleted, updateProject } from '../lib/ops'
import { tickedMatches } from '../lib/tickedItems'
import { render, mockFetch, noPublicLinks, type, waitFor } from '../ui/test-utils'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { TaskListView } from './TaskListView'

beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals(); hideBulkToast() })
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

async function groceries(reusable = true) {
  const pid = await createProject({ name: 'Groceries' })
  if (reusable) await updateProject(pid, { reusable: true })
  const milk = await createTask({ title: 'Milk', project_id: pid })
  const oat = await createTask({ title: 'Oat milk', project_id: pid })
  const bread = await createTask({ title: 'Bread', project_id: pid })
  await createTask({ title: 'Milk chocolate', project_id: pid }) // open: never suggested
  await setTaskCompleted(milk, true)
  await new Promise((r) => setTimeout(r, 5))
  await setTaskCompleted(oat, true) // ticked last: listed first
  await setTaskCompleted(bread, true)
  return { pid, milk, oat, bread }
}

const key = (el: Element, k: string) => act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })
const options = (root: ParentNode) => [...root.querySelectorAll('[data-ticked-suggestion]')].map((o) => o.textContent)

async function open(pid: string) {
  const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
  await waitFor(() => !!r.container.querySelector('textarea[aria-label="Add a task"]'), 'quick add')
  const quick = r.container.querySelector('textarea[aria-label="Add a task"]') as HTMLTextAreaElement
  await act(async () => { quick.focus() })
  return { r, quick }
}

describe('suggesting ticked items in a reusable list', () => {
  it('lists the ticked items that contain what is typed, the most recently ticked first, and no open item', async () => {
    const { pid } = await groceries()
    const { r, quick } = await open(pid)
    await type(quick, 'mil')
    await waitFor(() => options(r.container).length === 2, 'two suggestions')
    expect(options(r.container)).toEqual(['Oat milk', 'Milk'])
    expect(quick.getAttribute('aria-expanded')).toBe('true')
    expect(quick.getAttribute('aria-activedescendant')).toBeNull()
    await type(quick, 'm')
    await waitFor(() => options(r.container).length === 0, 'one letter suggests nothing')
    await r.unmount()
  })

  it('Enter without choosing adds what was typed; ArrowDown then Enter reopens the item', async () => {
    const { pid, oat } = await groceries()
    const { r, quick } = await open(pid)
    await type(quick, 'mil')
    await waitFor(() => options(r.container).length === 2, 'suggestions')
    await key(quick, 'Enter')
    await waitFor(async () => (await db.tasks.where('project_id').equals(pid).toArray()).some((x) => x.title === 'mil' && !x.completed_at), 'a new item "mil"')
    await type(quick, 'milk')
    await waitFor(() => options(r.container).length === 2, 'suggestions again')
    await key(quick, 'ArrowDown')
    expect(quick.getAttribute('aria-activedescendant')).not.toBeNull()
    await key(quick, 'Enter')
    await waitFor(async () => (await db.tasks.get(oat))!.completed_at === null, 'Oat milk reopened')
    await waitFor(() => bulkToast()?.label === 'Oat milk is back on the list', 'the toast')
    expect(quick.value).toBe('')
    expect((await db.tasks.where('project_id').equals(pid).toArray()).filter((x) => x.title === 'Oat milk')).toHaveLength(1)
    await r.unmount()
  })

  it('a click on a suggestion reopens it; Esc closes the list and keeps the text', async () => {
    const { pid, milk } = await groceries()
    const { r, quick } = await open(pid)
    await type(quick, 'mil')
    await waitFor(() => options(r.container).length === 2, 'suggestions')
    await key(quick, 'Escape')
    expect(options(r.container)).toEqual([])
    expect(quick.value).toBe('mil')
    await type(quick, 'milk')
    await waitFor(() => options(r.container).length === 2, 'back with new text')
    const item = r.container.querySelector(`[data-ticked-suggestion="${milk}"]`)!
    await act(async () => { item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })) })
    await waitFor(async () => (await db.tasks.get(milk))!.completed_at === null, 'Milk reopened')
    await r.unmount()
  })

  it('an ordinary project suggests nothing', async () => {
    const { pid } = await groceries(false)
    const { r, quick } = await open(pid)
    await type(quick, 'mil')
    await act(async () => { await new Promise((res) => setTimeout(res, 50)) })
    expect(options(r.container)).toEqual([])
    await r.unmount()
  })

  it('matching ignores case, accents and spaces at the ends, and keeps at most eight', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, title: `Crème ${i}` }))
    expect(tickedMatches(items, ' CREME ')).toHaveLength(8)
    expect(tickedMatches(items, 'x')).toEqual([])
  })
})

// @vitest-environment happy-dom
// Ticked items suggested while typing in a reusable list (OpenSpec change reusable-suggest,
// #1839): a few letters list the matching ticked items, the most recent first; picking one
// reopens it; Enter without moving into the list still adds what was typed.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, mutate, resetDeviceId, updateProject } from '../lib/ops'
import { tickedMatches } from '../lib/tickedItems'
import { render, mockFetch, noPublicLinks, type, waitFor } from '../ui/test-utils'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { TaskListView } from './TaskListView'
import { QuickAddSheet } from './QuickAddSheet'
import type { Route } from './router'

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
  await mutate('task', milk, { completed_at: 1_000 })
  await mutate('task', oat, { completed_at: 3_000 }) // ticked last: listed first
  await mutate('task', bread, { completed_at: 2_000 })
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

  it('a pick keeps the tokens typed with it, and closes notes and Esc memory with the field', async () => {
    const { pid, oat } = await groceries()
    const { r, quick } = await open(pid)
    await type(quick, 'milk p1')
    await waitFor(() => options(r.container).length === 2, 'suggestions')
    await key(quick, 'ArrowDown')
    await key(quick, 'Enter')
    await waitFor(async () => (await db.tasks.get(oat))!.completed_at === null, 'Oat milk reopened')
    expect((await db.tasks.get(oat))!.priority).toBe(1)
    await waitFor(() => quick.value === '', 'the field is empty')
    // Esc is forgotten once the field empties: the same text suggests again.
    await type(quick, 'mil')
    await waitFor(() => options(r.container).length === 1, 'Milk suggested')
    await key(quick, 'Escape')
    expect(options(r.container)).toEqual([])
    await type(quick, '')
    await type(quick, 'mil')
    await waitFor(() => options(r.container).length === 1, 'suggested again')
    await r.unmount()
  })

  it('hover does not choose, and the list closes when the field loses focus', async () => {
    const { pid } = await groceries()
    const { r, quick } = await open(pid)
    await type(quick, 'mil')
    await waitFor(() => options(r.container).length === 2, 'suggestions')
    const first = r.container.querySelector('[data-ticked-suggestion]')!
    await act(async () => { first.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); first.dispatchEvent(new MouseEvent('mouseenter')) })
    expect(quick.getAttribute('aria-activedescendant')).toBeNull()
    await act(async () => { quick.blur() })
    await waitFor(() => options(r.container).length === 0, 'closed on blur')
    await r.unmount()
  })

  it('one suggestion per name, the one an add reopens; none for a name that is open, nor for occurrence records', async () => {
    const pid = await createProject({ name: 'Groceries' })
    await updateProject(pid, { reusable: true })
    const a = await createTask({ title: 'Eggs', project_id: pid })
    const b = await createTask({ title: 'eggs.', project_id: pid })
    await mutate('task', a, { completed_at: 1_000 })
    await mutate('task', b, { completed_at: 2_000 })
    const tea = await createTask({ title: 'Tea', project_id: pid })
    await mutate('task', tea, { completed_at: 1_500 })
    await createTask({ title: 'tea', project_id: pid }) // open twin
    const record = await createTask({ title: 'Eggnog', project_id: pid })
    await mutate('task', record, { completed_at: 1_200, series_id: 'series-1' })
    const { r, quick } = await open(pid)
    await type(quick, 'eg')
    await waitFor(() => options(r.container).length === 1, 'one Eggs')
    expect(r.container.querySelector(`[data-ticked-suggestion="${b}"]`)).toBeTruthy()
    await type(quick, 'tea')
    await waitFor(() => quick.value === 'tea', 'typed')
    expect(options(r.container)).toEqual([])
    await r.unmount()
  })

  it('an ordinary project suggests nothing', async () => {
    const { pid } = await groceries(false)
    const { r, quick } = await open(pid)
    await type(quick, 'mil')
    await waitFor(() => quick.value === 'mil', 'typed')
    expect(options(r.container)).toEqual([])
    await r.unmount()
  })

  // The phone's add sheet in a reusable list suggests the same items (reusable-suggest-sheet).
  async function sheet(route: Route, onClose = () => {}) {
    const r = await render(<QuickAddSheet open onClose={onClose} anchor={{ current: null }} route={route} />)
    await waitFor(() => !!document.querySelector('[data-quick-add-sheet] textarea'), 'the sheet')
    const quick = document.querySelector('[data-quick-add-sheet] textarea') as HTMLTextAreaElement
    await act(async () => { quick.focus() })
    return { r, quick }
  }

  it('the add sheet of a reusable list suggests and reopens, and other views suggest nothing', async () => {
    const { pid, oat } = await groceries()
    const onClose = vi.fn()
    const { r, quick } = await sheet({ view: 'project', id: pid }, onClose)
    await type(quick, 'mil')
    await waitFor(() => options(document).length === 2, 'suggestions in the sheet')
    expect(options(document)).toEqual(['Oat milk', 'Milk'])
    // Under the line, in the sheet's flow, so the sheet grows to show it.
    expect(document.querySelector('[data-sheet-suggestions] [data-ticked-suggestions]')).toBeTruthy()
    // Esc closes the list and keeps the sheet open.
    await key(quick, 'Escape')
    expect(options(document)).toEqual([])
    expect(onClose).not.toHaveBeenCalled()
    await type(quick, 'milk')
    await waitFor(() => options(document).length === 2, 'back with new text')
    await key(quick, 'ArrowDown')
    await key(quick, 'Enter')
    await waitFor(async () => (await db.tasks.get(oat))!.completed_at === null, 'Oat milk reopened')
    expect(quick.value).toBe('')
    await r.unmount()
    const inbox = await sheet({ view: 'inbox' })
    await type(inbox.quick, 'mil')
    await waitFor(() => inbox.quick.value === 'mil', 'typed')
    expect(options(document)).toEqual([])
    await inbox.r.unmount()
  })

  it('matching ignores case, accents and spaces at the ends, and keeps at most eight', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, title: `Crème ${i}` }))
    expect(tickedMatches(items, ' CREME ')).toHaveLength(8)
    expect(tickedMatches(items, 'x')).toEqual([])
  })
})

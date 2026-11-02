// @vitest-environment happy-dom
// Quick add in a reusable list (OpenSpec reusable-lists, tasks 4.2–4.4): an item
// already on the list is reopened in place or pointed at, with a toast offering
// Add anyway; the ticked items always show as "Got it"; duplicates converge.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, mutate, resetDeviceId, setTaskCompleted, updateProject } from '../lib/ops'
import { createSection, loadShowCompleted, moveTaskToSection } from '../lib/sections'
import { collapseDuplicates } from '../lib/reuseAdd'
import { undoBatch } from '../lib/undo'
import { render, mockFetch, noPublicLinks, type, waitFor } from '../ui/test-utils'
import { bulkToast, hideBulkToast } from './bulk/toastStore'
import { addManyToList, addToList } from './reuseAdd'
import { TaskListView } from './TaskListView'

beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals(); hideBulkToast() })
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

async function groceries() {
  const pid = await createProject({ name: 'Groceries' })
  await updateProject(pid, { reusable: true })
  const dairy = await createSection(pid, 'Dairy')
  const milk = await createTask({ title: 'Milk', project_id: pid, description: 'semi-skimmed' })
  await moveTaskToSection(milk, dairy)
  const bread = await createTask({ title: 'Bread', project_id: pid })
  await setTaskCompleted(milk, true)
  return { pid, dairy, milk, bread }
}

const live = async (pid: string) => (await db.tasks.where('project_id').equals(pid).toArray()).filter((x) => !x.deleted_at)
const create = (x: Parameters<typeof createTask>[0]) => createTask(x)

describe('adding to a reusable list', () => {
  it('reopens a ticked-off match in its section with its notes, offline, and Undo ticks it off again', async () => {
    const { pid, dairy, milk } = await groceries()
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    const id = await addToList({ title: 'milk ', project_id: pid, priority: 1, due: { date: '2026-11-03' } }, create)
    expect(id).toBe(milk)
    const row = (await db.tasks.get(milk))!
    expect(row.completed_at).toBeNull()
    expect(row.section_id).toBe(dairy)
    expect(row.description).toBe('semi-skimmed')
    // The tokens typed with the add are applied to the item.
    expect(row.priority).toBe(1)
    expect(row.due).toEqual({ date: '2026-11-03' })
    expect((await live(pid)).length).toBe(2)
    const toast = bulkToast()!
    expect(toast.label).toBe('Milk is back on the list')
    expect(toast.ttl).toBe(4000)
    expect(toast.action?.label).toBe('Add anyway')
    await undoBatch(toast.undoId!)
    expect((await db.tasks.get(milk))!.completed_at).not.toBeNull()
  })

  it('points at an open match without writing; Add anyway creates a second one', async () => {
    const { pid, bread } = await groceries()
    const before = await db.outbox.count()
    expect(await addToList({ title: 'BREAD', project_id: pid }, create)).toBe(bread)
    expect(await db.outbox.count()).toBe(before)
    const toast = bulkToast()!
    expect(toast.label).toBe('Bread is already on the list')
    expect(toast.undoId).toBeNull()
    await act(async () => { toast.action!.run() })
    await waitFor(async () => (await live(pid)).filter((x) => x.title === 'BREAD').length === 1, 'the new Bread')
  })

  it('creates as before outside a reusable list, for subtasks and when nothing matches', async () => {
    const { pid, bread } = await groceries()
    const other = await createProject({ name: 'Work' })
    await createTask({ title: 'Report', project_id: other })
    expect(await addToList({ title: 'Report', project_id: other }, create)).not.toBe(bread)
    expect((await db.tasks.where('project_id').equals(other).toArray()).length).toBe(2)
    expect(await addToList({ title: 'Bread', project_id: pid, parent_id: bread }, create)).not.toBe(bread)
    const eggs = await addToList({ title: 'Eggs', project_id: pid }, create)
    expect((await db.tasks.get(eggs))!.title).toBe('Eggs')
  })

  it('handles a pasted list line by line with one summary', async () => {
    const { pid, milk, bread } = await groceries()
    const created: string[][] = []
    await addManyToList([{ title: 'Milk', project_id: pid }, { title: 'Bread', project_id: pid }, { title: 'Eggs', project_id: pid }], async (fresh) => {
      created.push(fresh.map((x) => x.title))
      for (const x of fresh) await createTask(x)
    })
    expect(created).toEqual([['Eggs']])
    expect((await db.tasks.get(milk))!.completed_at).toBeNull()
    expect((await db.tasks.get(bread))!.completed_at).toBeNull()
    expect(bulkToast()!.label).toBe('1 back on the list, 1 already there, 1 added')
  })

  it('reopens from the list’s own quick add and keeps the Got it group whatever the device preference', async () => {
    const { pid, milk } = await groceries()
    expect(await loadShowCompleted(pid)).toBe(false)
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    const group = () => r.container.querySelector<HTMLElement>('[data-completed-group]')
    await waitFor(() => group() !== null, 'the Got it group')
    expect(group()!.textContent).toContain('Got it')
    expect(group()!.querySelector('[data-group-count] .sr-only')?.textContent).toBe('1 item ticked off')
    // No "hidden by display options" line in a reusable list.
    expect(r.container.textContent).not.toContain('hidden by display options')
    const quick = r.container.querySelector('input[aria-label="Add a task"]') as HTMLInputElement
    await type(quick, 'Milk')
    await act(async () => { quick.form!.requestSubmit() })
    await waitFor(async () => (await db.tasks.get(milk))!.completed_at === null, 'Milk reopened')
    await waitFor(() => group() === null, 'the group empties')
    expect((await live(pid)).filter((x) => x.title === 'Milk').length).toBe(1)
    await r.unmount()
  })
})

describe('sorting into aisles', () => {
  it('places a new item in the section keyed with its aisle, even renamed; a section token wins; a reopened item stays', async () => {
    const pid = await createProject({ name: 'Groceries' })
    await updateProject(pid, { reusable: true, aisles: true })
    const fridge = await createSection(pid, 'Fridge')
    await mutate('section', fridge, { aisle: 'dairy' })
    const yoghurt = await addToList({ title: 'Greek yoghurt', project_id: pid }, create)
    expect((await db.tasks.get(yoghurt))!.section_id).toBe(fridge)
    const other = await createSection(pid, 'Other')
    const explicit = await addToList({ title: 'Butter', project_id: pid, section_id: other }, create)
    expect((await db.tasks.get(explicit))!.section_id).toBe(other)
    const candles = await addToList({ title: 'Birthday card', project_id: pid }, create)
    expect((await db.tasks.get(candles))!.section_id ?? null).toBeNull()
    await moveTaskToSection(yoghurt, other)
    await setTaskCompleted(yoghurt, true)
    await addToList({ title: 'Greek yoghurt', project_id: pid }, create)
    expect((await db.tasks.get(yoghurt))!.section_id).toBe(other)
  })

  it('leaves new items unsorted while aisles is off', async () => {
    const pid = await createProject({ name: 'Groceries' })
    await updateProject(pid, { reusable: true })
    const fridge = await createSection(pid, 'Fridge')
    await mutate('section', fridge, { aisle: 'dairy' })
    const id = await addToList({ title: 'Milk', project_id: pid }, create)
    expect((await db.tasks.get(id))!.section_id ?? null).toBeNull()
  })
})

describe('duplicate collapse', () => {
  it('keeps the smallest id and moves the rest to the Trash; an item with a note is kept', async () => {
    const pid = await createProject({ name: 'Groceries' })
    await updateProject(pid, { reusable: true })
    const ids = ['a1', 'b2', 'c3']
    for (const id of ids) await mutate('task', id, { title: 'Eggs', project_id: pid, parent_id: null, completed_at: null, deleted_at: null, labels: [], priority: 4, position: 1, created_at: 1, description: '' })
    await mutate('task', 'd4', { title: 'Milk', project_id: pid, parent_id: null, completed_at: null, deleted_at: null, labels: [], priority: 4, position: 1, created_at: 1, description: '' })
    await mutate('task', 'e5', { title: 'milk', project_id: pid, parent_id: null, completed_at: null, deleted_at: null, labels: [], priority: 4, position: 1, created_at: 1, description: 'oat' })
    expect(await collapseDuplicates()).toBe(2)
    const kept = (await live(pid)).map((x) => x.id).sort()
    expect(kept).toEqual(['a1', 'd4', 'e5'])
    // A second run (another device with the same data) changes nothing.
    expect(await collapseDuplicates()).toBe(0)
  })

  it('never runs where the role is viewer', async () => {
    const pid = await createProject({ name: 'Shared groceries' })
    await updateProject(pid, { reusable: true })
    for (const id of ['a1', 'b2']) await mutate('task', id, { title: 'Eggs', project_id: pid, parent_id: null, completed_at: null, deleted_at: null, labels: [], priority: 4, position: 1, created_at: 1, description: '' })
    await db.memberships.put({ projectId: pid, role: 'viewer', ownerId: 'someone', members: [] } as never)
    expect(await collapseDuplicates()).toBe(0)
    expect((await live(pid)).length).toBe(2)
  })
})

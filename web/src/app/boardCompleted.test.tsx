// @vitest-environment happy-dom
// The Completed column of a project board (OpenSpec change board-completed-column;
// GitHub issue 1291): with Show completed tasks on, the board ends with a folded
// Completed column; a card moved there is completed as its checkbox does, a completed
// card moved to a section reopens there in one undoable batch.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId, setTaskCompleted } from '../lib/ops'
import { COMPLETED_COLUMN } from '../lib/listGroups'
import { createSection, saveShowCompleted, saveViewMode, setSectionCollapsed } from '../lib/sections'
import { undoBatch } from '../lib/undo'
import { click, flush, key, render, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function renovation(opts: { show?: boolean } = {}) {
  const p = await createProject({ name: 'Renovation' })
  const backlog = await createSection(p, 'Backlog')
  const doing = await createSection(p, 'Doing')
  const paint = await createTask({ title: 'Paint the hall', project_id: p, section_id: doing })
  const tiles = await createTask({ title: 'Order tiles', project_id: p, section_id: backlog })
  const quotes = await createTask({ title: 'Get quotes', project_id: p, section_id: backlog })
  await setTaskCompleted(tiles, true)
  const at = Date.now()
  await waitFor(() => Date.now() > at, 'the next millisecond')
  await setTaskCompleted(quotes, true)
  await saveViewMode(p, 'board')
  if (opts.show !== false) await saveShowCompleted(p, true)
  return { p, backlog, doing, paint, tiles, quotes }
}

async function open(p: string, ready: string) {
  const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
  await waitFor(() => r.container.querySelector(ready) !== null, ready)
  return r
}

const strip = (root: ParentNode) => root.querySelector<HTMLButtonElement>(`[data-column-strip="${COMPLETED_COLUMN}"]`)
const column = (root: ParentNode) => root.querySelector<HTMLElement>(`[data-column="${COMPLETED_COLUMN}"]`)
const titlesIn = (el: Element | null) => [...(el?.querySelectorAll('[data-task-id]') ?? [])].map((e) => e.textContent?.match(/Paint the hall|Order tiles|Get quotes|Water the plants/)?.[0])
const pointer = (type: string, x: number, y: number) => new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y })

async function dragOnto(li: HTMLElement, target: HTMLElement) {
  document.elementFromPoint = () => target
  await act(async () => {
    li.dispatchEvent(pointer('pointerdown', 10, 10))
    window.dispatchEvent(pointer('pointermove', 300, 80))
  })
  await flush()
  await act(async () => { window.dispatchEvent(pointer('pointerup', 300, 80)) })
}

describe('the Completed column on a project board', () => {
  it('ends the board folded by default, named with its count; unfolded it lists the newest completion first', async () => {
    const { p } = await renovation()
    const r = await open(p, `[data-column-strip="${COMPLETED_COLUMN}"]`)
    const cols = [...r.container.querySelectorAll('[data-column]')].map((c) => c.getAttribute('data-column'))
    expect(cols[cols.length - 1]).toBe(COMPLETED_COLUMN)
    expect(strip(r.container)!.getAttribute('aria-label')).toBe('Completed, 2 completed tasks, folded')
    await click(strip(r.container)!)
    await waitFor(() => titlesIn(column(r.container)).length === 2, 'the unfolded column')
    expect(titlesIn(column(r.container))).toEqual(['Get quotes', 'Order tiles'])
    expect(column(r.container)!.querySelector('[data-column-add]')).toBeNull()
    await r.unmount()
  })

  it('a card dropped on the folded strip is completed, the strip reads 3 and stays folded', async () => {
    const { p, paint } = await renovation()
    const r = await open(p, `[data-task-id="${paint}"]`)
    await dragOnto(r.container.querySelector<HTMLElement>(`[data-task-id="${paint}"]`)!, column(r.container)!)
    await waitFor(async () => !!(await db.tasks.get(paint))!.completed_at, 'completed')
    await waitFor(() => strip(r.container)?.getAttribute('aria-label') === 'Completed, 3 completed tasks, folded', 'the count')
    await r.unmount()
  })

  it('a completed card dragged onto Doing is reopened there in one batch that one Undo takes back', async () => {
    const { p, doing, tiles } = await renovation()
    await setSectionCollapsed(p, COMPLETED_COLUMN, true)
    const r = await open(p, `[data-column="${COMPLETED_COLUMN}"] [data-task-id="${tiles}"]`)
    const target = r.container.querySelector<HTMLElement>(`[data-column="${doing}"]`)!
    const before = await db.assistantUndo.count()
    await dragOnto(r.container.querySelector<HTMLElement>(`[data-task-id="${tiles}"]`)!, target)
    await waitFor(async () => { const x = (await db.tasks.get(tiles))!; return !x.completed_at && x.section_id === doing }, 'reopened in Doing')
    expect(await db.assistantUndo.count()).toBe(before + 1)
    const entry = (await db.assistantUndo.toArray()).at(-1)!
    await undoBatch(entry.id)
    const back = (await db.tasks.get(tiles))!
    expect(!!back.completed_at).toBe(true)
    expect(back.section_id).not.toBe(doing)
    await r.unmount()
  })

  it('Shift+→ from the last section moves the card into the Completed column and completes it', async () => {
    const { p, paint } = await renovation()
    const r = await open(p, `[data-task-id="${paint}"]`)
    await click(r.container.querySelector(`[data-task-id="${paint}"] [data-row-open]`)!)
    await waitFor(() => r.container.querySelector(`[data-task-id="${paint}"]`)?.getAttribute('aria-current') === 'true', 'selected')
    await key(document.activeElement ?? document.body, 'ArrowRight', { shiftKey: true })
    await waitFor(async () => !!(await db.tasks.get(paint))!.completed_at, 'completed')
    expect(r.container.querySelector('[data-board-announce]')!.textContent).toBe('Moved to Completed')
    await r.unmount()
  })

  it('a repeating card completes its occurrence and stays in its section with the next date', async () => {
    const { p, doing } = await renovation()
    const today = new Date().toISOString().slice(0, 10)
    const water = await createTask({ title: 'Water the plants', project_id: p, section_id: doing, recurrence: 'every week', due: { date: today } })
    const r = await open(p, `[data-task-id="${water}"]`)
    await dragOnto(r.container.querySelector<HTMLElement>(`[data-task-id="${water}"]`)!, column(r.container)!)
    await waitFor(async () => (await db.tasks.get(water))!.due?.date !== today, 'the series moved on')
    const series = (await db.tasks.get(water))!
    expect(series.completed_at ?? null).toBeNull()
    expect(series.section_id).toBe(doing)
    await waitFor(() => strip(r.container)?.getAttribute('aria-label') === 'Completed, 3 completed tasks, folded', 'the occurrence in the column')
    await r.unmount()
  })

  it('with the preference off the board has no Completed column', async () => {
    const { p, paint } = await renovation({ show: false })
    const r = await open(p, `[data-task-id="${paint}"]`)
    expect(column(r.container)).toBeNull()
    await r.unmount()
  })

  it('a viewer drags a card over the strip and nothing is written', async () => {
    const { p, paint } = await renovation()
    await db.memberships.put({ projectId: p, role: 'viewer', ownerId: 'someone', members: [] })
    const r = await open(p, `[data-task-id="${paint}"]`)
    const before = await db.outbox.count()
    await dragOnto(r.container.querySelector<HTMLElement>(`[data-task-id="${paint}"]`)!, column(r.container)!)
    await flush()
    expect((await db.tasks.get(paint))!.completed_at ?? null).toBeNull()
    expect(await db.outbox.count()).toBe(before)
    await r.unmount()
  })
})

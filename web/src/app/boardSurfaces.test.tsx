// @vitest-environment happy-dom
// Board surfaces (OpenSpec change surfaces-v2, design D6-D8; sections-and-boards
// "Board columns", "Move tasks between sections"): the column surface, a drop
// placeholder of the dragged card's height in the column under the pointer, the
// faded origin card, nothing written on a release outside, no placeholder for
// Shift+→, the lift on cards only, and "Add a task" inside an empty column.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { createSection, saveViewMode } from '../lib/sections'
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
  document.body.innerHTML = ''
})

async function board() {
  const p = await createProject({ name: 'Garden' })
  const todo = await createSection(p, 'To do')
  const doing = await createSection(p, 'Doing')
  const done = await createSection(p, 'Done')
  const card = await createTask({ title: 'Plant tomatoes', project_id: p, section_id: todo })
  await createTask({ title: 'Water', project_id: p, section_id: todo })
  await saveViewMode(p, 'board')
  const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
  await waitFor(() => r.container.querySelector(`[data-column="${todo}"] [data-task-id="${card}"]`) !== null)
  return { r, p, todo, doing, done, card }
}

const pointer = (type: string, x: number, y: number) => new PointerEvent(type, { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: x, clientY: y })

describe('board surfaces', () => {
  it('columns use the column surface without a ring; cards lift, list rows do not', async () => {
    const { r, todo, done } = await board()
    for (const c of r.container.querySelectorAll('[data-column]')) {
      expect(c.className).toContain('ui-column')
      expect(c.className).not.toContain('ring-')
    }
    const cards = r.container.querySelector(`[data-column="${todo}"] ul`)!
    expect(cards.className).toContain('ui-cards--lift')
    // An empty column offers "Add a task" inside its surface.
    const add = r.container.querySelector(`[data-column="${done}"] [data-column-add]`)
    expect(add?.textContent).toContain('Add a task')
    expect(r.container.querySelector(`[data-column="${todo}"] [data-column-add]`)).toBeNull()
    // The count is muted with tabular figures.
    const count = r.container.querySelector(`[data-column="${todo}"] [data-group-count]`)!
    expect(count.className).toContain('text-muted')
    expect(count.className).toContain('tabular-nums')
    await r.unmount()
  })

  it('dragging over Doing shows one placeholder of the card\'s height there; releasing outside writes nothing', async () => {
    const { r, todo, doing, card } = await board()
    const li = r.container.querySelector<HTMLElement>(`[data-task-id="${card}"]`)!
    Object.defineProperty(li, 'offsetHeight', { value: 52, configurable: true })
    const column = r.container.querySelector<HTMLElement>(`[data-column="${doing}"]`)!
    document.elementFromPoint = () => column
    await act(async () => {
      li.dispatchEvent(pointer('pointerdown', 10, 10))
      window.dispatchEvent(pointer('pointermove', 300, 80))
    })
    await flush()
    const placeholders = r.container.querySelectorAll<HTMLElement>('[data-drop-placeholder]')
    expect(placeholders).toHaveLength(1)
    expect(placeholders[0].closest('[data-column]')!.getAttribute('data-column')).toBe(doing)
    expect(placeholders[0].className).toContain('ui-drop-placeholder')
    expect(placeholders[0].style.height).toBe('52px')
    expect(r.container.querySelector(`[data-task-id="${card}"]`)!.hasAttribute('data-dragging')).toBe(true)
    // Out of every column, then released: no placeholder and no write.
    document.elementFromPoint = () => document.body
    await act(async () => {
      window.dispatchEvent(pointer('pointermove', 900, 900))
      window.dispatchEvent(pointer('pointerup', 900, 900))
    })
    await flush()
    expect(r.container.querySelector('[data-drop-placeholder]')).toBeNull()
    expect((await db.tasks.get(card))!.section_id).toBe(todo)
    await r.unmount()
  })

  it('Shift+→ moves the selected card to the next column without a placeholder', async () => {
    const { r, doing, card } = await board()
    await click(r.container.querySelector(`[data-task-id="${card}"] [data-row-open]`)!)
    await waitFor(() => r.container.querySelector(`[data-task-id="${card}"]`)?.getAttribute('aria-current') === 'true')
    await key(document.activeElement ?? document.body, 'ArrowRight', { shiftKey: true })
    expect(r.container.querySelector('[data-drop-placeholder]')).toBeNull()
    await waitFor(() => r.container.querySelector(`[data-column="${doing}"] [data-task-id="${card}"]`) !== null)
    expect(r.container.querySelector('[data-drop-placeholder]')).toBeNull()
    await r.unmount()
  })
})

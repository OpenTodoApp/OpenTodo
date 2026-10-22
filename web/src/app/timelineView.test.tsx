// @vitest-environment happy-dom
// A project's timeline (OpenSpec change month-and-timeline-views, tasks 3.2 and
// 4.1-4.3): the v cycle, bars from start, due and deadline, Unscheduled, keyboard
// shifts and deadlines, a drag that keeps the time, the right edge creating a
// deadline, dependency arrows and dimming, and viewers who cannot move dates.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { completeTask, createProject, createTask, resetDeviceId, updateTask } from '../lib/ops'
import { loadViewMode, nextViewMode, saveViewMode } from '../lib/sections'
import { flush, key, render, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 1, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})


async function timeline() {
  const project = await createProject({ name: 'Trip' })
  await saveViewMode(project, 'timeline')
  return project
}

describe('layout cycle', () => {
  it('cycles list → board → timeline → list and reads unknown values as the list', async () => {
    expect(nextViewMode('list')).toBe('board')
    expect(nextViewMode('board')).toBe('timeline')
    expect(nextViewMode('timeline')).toBe('list')
    const p = await createProject({ name: 'P' })
    await db.meta.put({ key: `view-mode:${p}`, value: 'gantt' } as never)
    expect(await loadViewMode(p)).toBe('list')
  })

  it('v twice from the board lands on the list', async () => {
    const p = await createProject({ name: 'P' })
    await saveViewMode(p, 'board')
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await flush(80)
    await key(document.body, 'v')
    await waitFor(() => r.container.querySelector('[data-timeline]') !== null)
    await key(document.body, 'v')
    await waitFor(() => r.container.querySelector('[data-timeline]') === null && r.container.querySelector('[role="group"][aria-label="Project layout"] [aria-pressed="true"]')?.textContent === 'List')
    expect(await loadViewMode(p)).toBe('list')
    await r.unmount()
  })
})

describe('timeline', () => {
  it('draws bars from start, due and deadline, and lists undated and someday tasks as Unscheduled', async () => {
    const p = await timeline()
    const all = await createTask({ title: 'All three', project_id: p, start: '2026-11-03', due: { date: '2026-11-10' }, deadline: '2026-11-14' })
    const due = await createTask({ title: 'Due only', project_id: p, due: { date: '2026-11-05' } })
    const later = await createTask({ title: 'Someday', project_id: p, start: 'someday', due: { date: '2026-11-06' } })
    const none = await createTask({ title: 'No dates', project_id: p })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelectorAll('[data-timeline-row]').length === 4)
    const bar = (id: string) => r.container.querySelector<HTMLElement>(`[data-bar="${id}"]`)
    // 32 px a day: the 3rd to the 14th is 12 days wide, with the due marker inside.
    expect(bar(all)!.style.width).toBe(`${12 * 32}px`)
    expect(bar(all)!.querySelector('[data-due-marker]')).toBeTruthy()
    expect(bar(all)!.querySelector('[data-deadline-marker]')).toBeTruthy()
    expect(bar(due)!.style.width).toBe('32px')
    expect(bar(later)).toBeNull()
    expect(bar(none)).toBeNull()
    const rows = [...r.container.querySelectorAll('[data-timeline-row]')].map((e) => e.getAttribute('data-timeline-row'))
    expect(rows.slice(-2).sort()).toEqual([later, none].sort())
    expect(r.container.textContent).toContain('Unscheduled')
    await r.unmount()
  })

  it('fills bars in the project hue, dims the part before today and gives a late bar the danger edge (surfaces-v2)', async () => {
    const p = await createProject({ name: 'Garden', color: '#16a34a' })
    await saveViewMode(p, 'timeline')
    // Today is 1 November: the first bar crosses it, the second ended, the third missed its deadline.
    const across = await createTask({ title: 'Across', project_id: p, start: '2026-10-29', due: { date: '2026-11-04' } })
    const ended = await createTask({ title: 'Ended', project_id: p, start: '2026-10-25', due: { date: '2026-10-28' } })
    const late = await createTask({ title: 'Late', project_id: p, start: '2026-10-20', deadline: '2026-10-30' })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelectorAll('[data-bar]').length === 3)
    const bar = (id: string) => r.container.querySelector<HTMLElement>(`[data-bar="${id}"]`)!
    expect(bar(across).className).toContain('ui-block')
    expect(bar(across).getAttribute('data-hue')).toBe(bar(ended).getAttribute('data-hue'))
    expect(bar(across).getAttribute('data-hue')).toBeTruthy()
    // Two segments: the dimmed part covers the 29th to the 31st.
    const past = bar(across).querySelectorAll<HTMLElement>('[data-bar-past]')
    expect(past).toHaveLength(1)
    expect(past[0].className).toContain('ui-block--past')
    expect(past[0].style.width).toBe(`${3 * 32}px`)
    expect(bar(ended).className).toContain('ui-block--past')
    expect(bar(ended).querySelector('[data-bar-past]')).toBeNull()
    // Late wins over the hue and the dimming.
    expect(bar(late).className).toContain('ui-block--late')
    expect(bar(late).className).not.toContain('ui-block--past')
    expect(bar(late).querySelector('[data-bar-past]')).toBeNull()
    await r.unmount()
  })

  it('moves the selected task with the arrows and its deadline with Shift', async () => {
    const p = await timeline()
    const id = await createTask({ title: 'Book flights', project_id: p, due: { date: '2026-11-10', time: '09:00' } })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelector(`[data-bar="${id}"]`) !== null)
    await key(document.body, 'j')
    // One step at a time: each move starts from the rendered (live) due, so the
    // next key waits until the bar has moved.
    const left = () => r.container.querySelector<HTMLElement>(`[data-bar="${id}"]`)?.style.left
    for (const date of ['2026-11-11', '2026-11-12', '2026-11-13']) {
      const before = left()
      await key(document.body, 'ArrowRight')
      await waitFor(async () => (await db.tasks.get(id))!.due?.date === date && left() !== before, `due moved to ${date}`)
    }
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-11-13', time: '09:00' })
    await key(document.body, 'ArrowRight', { shiftKey: true })
    await waitFor(async () => (await db.tasks.get(id))!.deadline === '2026-11-14', 'deadline set')
    expect((await db.tasks.get(id))!.deadline).toBe('2026-11-14')
    await r.unmount()
  })

  it('a dragged bar keeps the due time, and the right edge creates a deadline', async () => {
    const p = await timeline()
    const id = await createTask({ title: 'Pack', project_id: p, start: '2026-11-03', due: { date: '2026-11-10', time: '09:00' } })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelector(`[data-bar="${id}"]`) !== null)
    const col = (d: string) => r.container.querySelector(`[data-drop-target="tl:${d}"]`)!
    const drag = async (el: Element, to: string, fromX: number) => {
      document.elementFromPoint = () => col(to)
      await act(async () => {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: fromX, clientY: 5 }))
        window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: fromX + 80, clientY: 5 }))
        window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: fromX + 80, clientY: 5 }))
      })
      await flush(50)
    }
    // happy-dom lays nothing out: the axis starts at x = 0, so x = 32 * n is day n of the axis.
    const axisStart = '2026-10-04'
    const dayX = (d: string) => (Math.round((Date.parse(d) - Date.parse(axisStart)) / 86400000)) * 32 + 1
    await drag(r.container.querySelector(`[data-bar="${id}"]`)!, '2026-11-12', dayX('2026-11-10'))
    let t = (await db.tasks.get(id))!
    expect(t.start).toBe('2026-11-05')
    expect(t.due).toEqual({ date: '2026-11-12', time: '09:00' })
    await drag(r.container.querySelector(`[data-bar="${id}"] [data-bar-edge="end"]`)!, '2026-11-16', dayX('2026-11-12'))
    t = (await db.tasks.get(id))!
    expect(t.deadline).toBe('2026-11-16')
    expect(t.due).toEqual({ date: '2026-11-12', time: '09:00' })
    await r.unmount()
  })

  it('draws an arrow to a blocked task and dims it until the blocker is completed', async () => {
    const p = await timeline()
    const confirm = await createTask({ title: 'Confirm dates', project_id: p, due: { date: '2026-11-04' } })
    const book = await createTask({ title: 'Book flights', project_id: p, due: { date: '2026-11-08' } })
    await updateTask(book, { blocked_by: [confirm] })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelector(`[data-arrow="${confirm}>${book}"]`) !== null)
    expect(r.container.querySelector(`[data-timeline-row="${book}"]`)!.hasAttribute('data-blocked')).toBe(true)
    expect(r.container.querySelector(`[data-timeline-row="${book}"] button`)!.getAttribute('aria-label')).toContain('waits for Confirm dates')
    await completeTask(confirm)
    await waitFor(() => r.container.querySelector('[data-arrow]') === null)
    expect(r.container.querySelector(`[data-timeline-row="${book}"]`)!.hasAttribute('data-blocked')).toBe(false)
    await r.unmount()
  })

  it('does not change dates for a viewer', async () => {
    const p = await timeline()
    await db.memberships.put({ projectId: p, role: 'viewer', ownerId: 'someone', members: [] })
    const id = await createTask({ title: 'Theirs', project_id: p, due: { date: '2026-11-10' } })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelector(`[data-bar="${id}"]`) !== null)
    expect(r.container.textContent).toContain('You can view this project but not change dates.')
    await key(document.body, 'j')
    await key(document.body, 'ArrowRight')
    await flush(50)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-11-10' })
    await r.unmount()
  })
})

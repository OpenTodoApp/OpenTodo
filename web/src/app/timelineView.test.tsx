// @vitest-environment happy-dom
// A project's timeline (OpenSpec change month-and-timeline-views, tasks 3.2 and
// 4.1-4.3): the v cycle, bars from start, due and deadline, Unscheduled, keyboard
// shifts and deadlines, a drag that keeps the time, the right edge creating a
// deadline, dependency arrows and dimming, and viewers who cannot move dates.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { undoBatch } from '../lib/undo'
import { completeTask, createProject, createTask, resetDeviceId, updateTask } from '../lib/ops'
import type { Task } from '../lib/types'
import { loadViewMode, nextViewMode, saveViewMode } from '../lib/sections'
import { click, flush, key, render, waitFor } from '../ui/test-utils'
import { panelTaskId, resetPanel } from './panel'
import { TaskListView } from './TaskListView'
import { TOUCH_HOLD_MS } from '../lib/dnd'
import { edgeStepX, notePlacement, rowMetrics } from './TimelineView'

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
})


async function timeline() {
  const project = await createProject({ name: 'Trip' })
  await saveViewMode(project, 'timeline')
  return project
}

describe('layout cycle', () => {
  it('cycles list → board → timeline → calendar → list and reads unknown values as the list', async () => {
    expect(nextViewMode('list')).toBe('board')
    expect(nextViewMode('board')).toBe('timeline')
    // Calendar joins the cycle after Timeline (calendar-clarity D5).
    expect(nextViewMode('timeline')).toBe('calendar')
    expect(nextViewMode('calendar')).toBe('list')
    const p = await createProject({ name: 'P' })
    await db.meta.put({ key: `view-mode:${p}`, value: 'gantt' } as never)
    expect(await loadViewMode(p)).toBe('list')
  })

  it('v three times from the board lands on the list, through the timeline and the calendar', async () => {
    const p = await createProject({ name: 'P' })
    await saveViewMode(p, 'board')
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelector('[role="group"][aria-label="Project layout"] [aria-pressed="true"]')?.textContent === 'Board', 'the board')
    await key(document.body, 'v')
    await waitFor(() => r.container.querySelector('[data-timeline]') !== null)
    await key(document.body, 'v')
    await waitFor(() => r.container.querySelector('[data-project-calendar]') !== null, 'the calendar layout')
    await key(document.body, 'v')
    await waitFor(() => r.container.querySelector('[data-project-calendar]') === null && r.container.querySelector('[role="group"][aria-label="Project layout"] [aria-pressed="true"]')?.textContent === 'List')
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

  it('fills bars in the project hue, dims the part before today and gives a late bar the danger edge (surfaces-v2, precision-boards-timeline D7)', async () => {
    const p = await createProject({ name: 'Garden', color: '#16a34a' })
    await saveViewMode(p, 'timeline')
    // Today is 1 November: the first bar crosses it, the second only started in the past,
    // the third missed its deadline and the fourth its due day.
    const across = await createTask({ title: 'Across', project_id: p, start: '2026-10-29', due: { date: '2026-11-04' } })
    const ended = await createTask({ title: 'Ended', project_id: p, start: '2026-10-25' })
    const late = await createTask({ title: 'Late', project_id: p, start: '2026-10-20', deadline: '2026-10-30' })
    const overdue = await createTask({ title: 'Overdue', project_id: p, start: '2026-10-25', due: { date: '2026-10-28' } })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelectorAll('[data-bar]').length === 4)
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
    // An overdue due day is late too, and every late bar says by how much (D6, D7).
    expect(bar(overdue).className).toContain('ui-block--late')
    const after = (id: string) => bar(id).nextElementSibling?.matches('[data-bar-after]') ? bar(id).nextElementSibling!.textContent : null
    expect(after(late)).toBe('2 days late')
    expect(after(overdue)).toBe('4 days late')
    // A late bar's deadline diamond is in the overdue tone.
    expect(bar(late).querySelector('[data-deadline-marker]')!.className).toContain('bg-danger')
    // A short bar is followed by its length; a bar of 96 px or more carries its title.
    expect(after(ended)).toBe('1 day')
    expect(bar(across).querySelector('[data-bar-title]')!.textContent).toBe('Across')
    expect(bar(ended).querySelector('[data-bar-title]')).toBeNull()
    // Today is an accent line with its mark on the axis (D9).
    expect(r.container.querySelector('[data-today-line]')!.className).toContain('bg-accent')
    expect(r.container.querySelector('[data-today-mark]')!.textContent).toBe('Today')
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
    // Each key press is one step of undo history (undo-calendar-moves). The test clock stands
    // still, so the steps are told apart by what each one puts back.
    await waitFor(async () => (await db.assistantUndo.count()) === 4, 'four steps')
    const steps = await db.assistantUndo.toArray()
    expect(steps.map((s) => s.label)).toEqual(['Rescheduled', 'Rescheduled', 'Rescheduled', 'Rescheduled'])
    const restoring = (field: string, value: unknown) => steps.find((s) => field in s.inverse[0].patch && JSON.stringify(s.inverse[0].patch[field] ?? null) === JSON.stringify(value))!
    await undoBatch(restoring('deadline', null).id)
    expect((await db.tasks.get(id))!.deadline ?? null).toBeNull()
    await undoBatch(restoring('due', { date: '2026-11-12', time: '09:00' }).id)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-11-12', time: '09:00' })
    await r.unmount()
  })

  it('a dragged bar keeps the due time, and the right edge creates a deadline', async () => {
    const p = await timeline()
    const id = await createTask({ title: 'Pack', project_id: p, start: '2026-11-03', due: { date: '2026-11-10', time: '09:00' } })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelector(`[data-bar="${id}"]`) !== null)
    const col = (d: string) => r.container.querySelector(`[data-drop-target="tl:${d}"]`)!
    const drag = async (el: Element, to: string, fromX: number, done: (t: Task) => boolean) => {
      document.elementFromPoint = () => col(to)
      await act(async () => {
        el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: fromX, clientY: 5 }))
        window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: fromX + 80, clientY: 5 }))
        window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: fromX + 80, clientY: 5 }))
      })
      await waitFor(async () => done((await db.tasks.get(id))!), 'the drop written')
    }
    // happy-dom lays nothing out: the axis starts at x = 0, so x = 32 * n is day n of the axis.
    const axisStart = '2026-10-04'
    const dayX = (d: string) => (Math.round((Date.parse(d) - Date.parse(axisStart)) / 86400000)) * 32 + 1
    await drag(r.container.querySelector(`[data-bar="${id}"]`)!, '2026-11-12', dayX('2026-11-10'), (t) => t.due?.date === '2026-11-12')
    let t = (await db.tasks.get(id))!
    expect(t.start).toBe('2026-11-05')
    expect(t.due).toEqual({ date: '2026-11-12', time: '09:00' })
    await drag(r.container.querySelector(`[data-bar="${id}"] [data-bar-edge="end"]`)!, '2026-11-16', dayX('2026-11-12'), (t) => t.deadline === '2026-11-16')
    t = (await db.tasks.get(id))!
    expect(t.deadline).toBe('2026-11-16')
    expect(t.due).toEqual({ date: '2026-11-12', time: '09:00' })
    // Each drop is one step of undo history with the toast (undo-calendar-moves).
    await waitFor(async () => (await db.assistantUndo.count()) === 2, 'two steps')
    const steps = await db.assistantUndo.toArray()
    expect(steps.map((s) => s.label)).toEqual(['Rescheduled', 'Rescheduled'])
    for (const s of steps.filter((s) => 'deadline' in s.inverse[0].patch)) await undoBatch(s.id)
    for (const s of steps.filter((s) => !('deadline' in s.inverse[0].patch))) await undoBatch(s.id)
    t = (await db.tasks.get(id))!
    expect(t.start).toBe('2026-11-03')
    expect(t.due).toEqual({ date: '2026-11-10', time: '09:00' })
    expect(t.deadline ?? null).toBeNull()
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
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- a viewer's key writes nothing, so there is no signal to wait for; give a wrong write time to land
    await flush(50)
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-11-10' })
    await r.unmount()
  })
})

describe('on a phone and on touch (phone-timeline-rows)', () => {
  /** matchMedia for a window of `width` px with a coarse pointer or a mouse. */
  const device = (width: number, coarse: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('min-width') ? width >= parseFloat(q.split('min-width:')[1]) * 16 : q.includes('coarse') ? coarse : false,
    media: q, addEventListener() {}, removeEventListener() {},
  }))

  it('rows are 36 px with a mouse, 44 px on touch, and 56 px with the bar at the foot below 768 px', () => {
    expect(rowMetrics(false, false)).toEqual({ row: 36, mid: 18, later: 36 })
    expect(rowMetrics(false, true)).toEqual({ row: 44, mid: 22, later: 44 })
    expect(rowMetrics(true, true)).toEqual({ row: 56, mid: 38, later: 44 })
    expect(rowMetrics(true, false)).toEqual({ row: 56, mid: 38, later: 36 })
  })

  it('below 768 px the name is a line above its bar and the row is its button; a tap opens the task', async () => {
    device(360, true)
    const p = await timeline()
    const dated = await createTask({ title: 'Get three quotes for the kitchen', project_id: p, due: { date: '2026-11-04' } })
    const blocked = await createTask({ title: 'Book the fitters', project_id: p, due: { date: '2026-11-08' } })
    await updateTask(blocked, { blocked_by: [dated] })
    const none = await createTask({ title: 'No dates', project_id: p })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelectorAll('[data-timeline-row]').length === 3)
    const row = (id: string) => r.container.querySelector<HTMLElement>(`[data-timeline-row="${id}"]`)!
    // 56 px with a bar, 44 px without; no name column beside the grid.
    expect(row(dated).style.height).toBe('56px')
    expect(row(none).style.height).toBe('44px')
    expect(r.container.querySelector('[role="columnheader"]')!.className).toBe('sr-only')
    // The name is drawn once, not truncated to a column, and the button is named by it.
    const name = row(dated).querySelector<HTMLElement>('[data-timeline-name]')!
    expect(name.textContent).toBe('Get three quotes for the kitchen')
    expect(name.className).toContain('sticky')
    expect(name.style.maxWidth).toBe('calc(100cqw - 0px)')
    expect(row(dated).querySelector('button')!.getAttribute('aria-label')).toBe('Get three quotes for the kitchen')
    expect(row(blocked).querySelector('button')!.getAttribute('aria-label')).toContain('waits for Get three quotes')
    // The arrow runs between the bars' middles: 38 px into the first row and into the second.
    expect(r.container.querySelector(`[data-arrow="${dated}>${blocked}"] path`)!.getAttribute('d')).toMatch(/^M\d+,38 H\d+ V94 H\d+$/)
    // The bar still takes its own presses over the row.
    expect(row(dated).querySelector('[data-bar]')!.className).toContain('pointer-events-auto')
    await act(async () => { row(dated).querySelector('button')!.click() })
    // A phone opens a task as its page.
    await waitFor(() => location.pathname === `/task/${dated}`, 'the task opened')
    history.replaceState(null, '', '/')
    await r.unmount()
  })

  it('with a mouse from 768 px a click on a name selects and the row is the list\'s 36 px', async () => {
    device(1280, false)
    const p = await timeline()
    const id = await createTask({ title: 'Pack', project_id: p, due: { date: '2026-11-04' } })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelector(`[data-timeline-row="${id}"]`) !== null)
    const row = r.container.querySelector<HTMLElement>(`[data-timeline-row="${id}"]`)!
    expect(row.style.height).toBe('36px')
    expect(row.querySelector('[data-timeline-name]')).toBeNull()
    expect(row.querySelector('button')!.textContent).toBe('Pack')
    await act(async () => { row.querySelector('button')!.click() })
    await waitFor(() => row.getAttribute('aria-selected') === 'true', 'the row selected')
    expect(panelTaskId()).toBeNull()
    await r.unmount()
  })

  it('the hint marks its sentence about keys, so a device without a keyboard does not draw it', async () => {
    const p = await timeline()
    await createTask({ title: 'Pack', project_id: p, due: { date: '2026-11-04' } })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelector('[data-timeline] [data-kbd-hint]') !== null)
    const keys = r.container.querySelector('[data-timeline] [data-kbd-hint]')!
    expect(keys.textContent!.trim()).toBe('← → move the selected task, Shift+← → its deadline.')
    expect(keys.parentElement!.textContent).toBe('Drag a bar to move its dates, or its ends to set the start and deadline. ← → move the selected task, Shift+← → its deadline.')
    await r.unmount()
  })
})

describe('by touch (phone-timeline)', () => {
  const device = (width: number, coarse: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({
    matches: q.includes('min-width') ? width >= parseFloat(q.split('min-width:')[1]) * 16 : q.includes('coarse') ? coarse : false,
    media: q, addEventListener() {}, removeEventListener() {},
  }))
  // happy-dom lays nothing out: the axis and every bar start at x = 0, so a press's x is
  // both its distance into the bar and, at 32 px a day, its day on the axis from the 4th of October.
  const press = (el: Element, pointerType: string, x: number) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType, button: 0, clientX: x, clientY: 5 }))
  const moveTo = (pointerType: string, x: number, y = 5) => window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType, clientX: x, clientY: y }))
  const release = (pointerType: string, x: number) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType, clientX: x, clientY: 5 }))
  const open = async (task: Parameters<typeof createTask>[0], role?: 'viewer') => {
    const p = await timeline()
    if (role) await db.memberships.put({ projectId: p, role, ownerId: 'someone', members: [] })
    const id = await createTask({ ...task, project_id: p })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelector(`[data-bar="${id}"]`) !== null)
    const col = (d: string) => r.container.querySelector(`[data-drop-target="tl:${d}"]`)!
    const bar = () => r.container.querySelector<HTMLElement>(`[data-bar="${id}"]`)!
    /** Press `x` px into the bar, hold past the interval (or not), move and drop on `day`. */
    const drag = async (pointerType: string, x: number, day: string, hold = pointerType === 'touch') => {
      document.elementFromPoint = () => col(day)
      await act(async () => { press(bar(), pointerType, x) })
      // The touch hold is a timer of the drag itself; nothing in the page says it has armed
      if (hold) await flush(TOUCH_HOLD_MS + 50)
      await act(async () => {
        moveTo(pointerType, x + 40)
        release(pointerType, x + 40)
      })
    }
    return { r, id, bar, col, drag, task: async () => (await db.tasks.get(id))! }
  }
  const five = { title: 'Pack', start: '2026-11-03', due: { date: '2026-11-05', time: '09:00' }, deadline: '2026-11-07' }

  it('a tap on a bar opens the task on a touch screen and changes no date', async () => {
    device(360, true)
    const { r, id, bar, task } = await open(five)
    await act(async () => { bar().click() })
    await waitFor(() => location.pathname === `/task/${id}`, 'the task opened')
    expect(await task()).toMatchObject(five)
    history.replaceState(null, '', '/')
    await r.unmount()
  })

  it('with a mouse a click on a bar selects its row and a double click opens the task', async () => {
    device(1280, false)
    const { r, id, bar } = await open(five)
    await act(async () => { bar().click() })
    await waitFor(() => r.container.querySelector(`[data-timeline-row="${id}"]`)!.getAttribute('aria-selected') === 'true', 'the row selected')
    expect(panelTaskId()).toBeNull()
    await act(async () => { bar().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })
    // The panel beside the list or the task's page, by the window's width.
    await waitFor(() => panelTaskId() === id || location.pathname === `/task/${id}`, 'the task opened')
    history.replaceState(null, '', '/')
    await r.unmount()
  })

  it('a finger 12 px inside the right end drags the deadline, offline as one queued op', async () => {
    device(360, true)
    const { r, id, drag, bar, task } = await open(five)
    // The bar is drawn as for a mouse: 160 px, with its 6 px handles.
    expect(bar().style.width).toBe('160px')
    expect(bar().querySelector('[data-bar-edge="end"]')!.className).toContain('w-1.5')
    const queued = await db.outbox.count()
    await drag('touch', 148, '2026-11-09')
    await waitFor(async () => (await task()).deadline === '2026-11-09', 'the deadline written')
    expect(await task()).toMatchObject({ ...five, deadline: '2026-11-09' })
    // No server answers in this test: the write is local and its one op waits in the outbox.
    const ops = (await db.outbox.toArray()).slice(queued)
    expect(ops.map((op) => [op.entityId, op.field, op.value])).toEqual([[id, 'deadline', '2026-11-09']])
    await r.unmount()
  })

  it('a finger 12 px inside the left end drags the start, and on the handle itself too', async () => {
    device(360, true)
    const { r, drag, bar, col, task } = await open(five)
    await drag('touch', 12, '2026-11-02')
    await waitFor(async () => (await task()).start === '2026-11-02', 'the start written')
    expect(await task()).toMatchObject({ ...five, start: '2026-11-02' })
    // A touch press on the 6 px handle reaches the bar: the same zone, one drag.
    document.elementFromPoint = () => col('2026-11-01')
    await act(async () => { press(bar().querySelector('[data-bar-edge="start"]')!, 'touch', 2) })
    // The touch hold is a timer of the drag itself.
    await flush(TOUCH_HOLD_MS + 50)
    await act(async () => {
      moveTo('touch', 42)
      release('touch', 42)
    })
    await waitFor(async () => (await task()).start === '2026-11-01', 'the start written again')
    expect(await task()).toMatchObject({ due: five.due, deadline: five.deadline })
    await r.unmount()
  })

  it('a finger in the middle moves every date; a mouse 12 px inside the end moves the bar too', async () => {
    device(360, true)
    const { r, drag, task } = await open(five)
    // x = 80 is the axis's third day (6 October): a drop on the 7th is one day later.
    await drag('touch', 80, '2026-10-07')
    await waitFor(async () => (await task()).start === '2026-11-04', 'the dates moved')
    expect(await task()).toMatchObject({ start: '2026-11-04', due: { date: '2026-11-06', time: '09:00' }, deadline: '2026-11-08' })
    // x = 148 is the 8th of October: a mouse there holds the bar, not its end.
    await drag('mouse', 148, '2026-10-10')
    await waitFor(async () => (await task()).start === '2026-11-06', 'the dates moved again')
    expect(await task()).toMatchObject({ start: '2026-11-06', due: { date: '2026-11-08', time: '09:00' }, deadline: '2026-11-10' })
    await r.unmount()
  })

  it('the middle of a one-day bar moves it and its last 10 px set the deadline', async () => {
    device(360, true)
    const { r, drag, bar, task } = await open({ title: 'Call', due: { date: '2026-11-10' } })
    expect(bar().style.width).toBe('32px')
    await drag('touch', 16, '2026-10-05')
    await waitFor(async () => (await task()).due?.date === '2026-11-11', 'the due day moved')
    expect((await task()).deadline ?? null).toBeNull()
    expect((await task()).start ?? null).toBeNull()
    await drag('touch', 28, '2026-11-13')
    await waitFor(async () => (await task()).deadline === '2026-11-13', 'the deadline created')
    expect((await task()).due).toEqual({ date: '2026-11-11' })
    await r.unmount()
  })

  it('a movement before the hold is a scroll, and a hold released without a movement does not open the task', async () => {
    device(360, true)
    const { r, drag, bar, task } = await open(five)
    await drag('touch', 148, '2026-11-09', false)
    // The hold alone: the click that follows the release is swallowed.
    await act(async () => { press(bar(), 'touch', 80) })
    // The touch hold is a timer of the drag itself.
    await flush(TOUCH_HOLD_MS + 50)
    await act(async () => {
      release('touch', 80)
      bar().click()
    })
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- neither gesture writes or opens anything, so there is no signal to wait for
    await flush(50)
    expect(await task()).toMatchObject(five)
    expect(location.pathname).not.toContain('/task/')
    await r.unmount()
  })

  it('a viewer cannot drag by touch', async () => {
    device(360, true)
    const { r, drag, bar, task } = await open(five, 'viewer')
    expect(bar().querySelector('[data-bar-edge]')).toBeNull()
    await drag('touch', 148, '2026-11-09')
    await drag('touch', 80, '2026-10-07')
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- a viewer's drag writes nothing, so there is no signal to wait for
    await flush(50)
    expect(await task()).toMatchObject(five)
    await r.unmount()
  })

  it('below 768 px a group bar is no wider than the axis, so the grid ends where the axis does', async () => {
    device(360, true)
    const { r } = await open({ title: 'Call', due: { date: '2026-11-10' } })
    await createTask({ title: 'No dates', project_id: (await db.projects.toArray())[0].id })
    await waitFor(() => r.container.querySelector('[data-timeline-group="unscheduled"]') !== null, 'the Unscheduled group')
    const rest = r.container.querySelector<HTMLElement>('[data-timeline-group="unscheduled"] [data-group-rest]')!
    expect(rest.style.width).toBe('')
    expect(rest.className).toBe('min-w-0 flex-1')
    await r.unmount()
  })
})

describe('the grid scrolls under a dragged bar (phone-timeline D3)', () => {
  it('steps at a quarter of the lists\' pace, faster nearer the edge, and not at all between the edges', () => {
    expect(edgeStepX(357, 0, 358)).toBe(4)
    expect(edgeStepX(1, 0, 358)).toBe(-4)
    expect(edgeStepX(180, 0, 358)).toBe(0)
    expect(edgeStepX(48, 0, 358)).toBe(0)
    expect(edgeStepX(315, 0, 358)).toBe(1)
    expect(edgeStepX(340, 0, 358)).toBeGreaterThan(edgeStepX(315, 0, 358))
    // From 768 px the left edge is after the names column.
    expect(edgeStepX(260, 256, 1000)).toBe(-4)
  })

  it('scrolls toward the edge the pointer rests at, marks the day under it, stops away from the edges and drops on the day under the pointer', async () => {
    const project = await createProject({ name: 'Trip' })
    await saveViewMode(project, 'timeline')
    const id = await createTask({ title: 'Pack', project_id: project, start: '2026-11-03', due: { date: '2026-11-05' } })
    const r = await render(<TaskListView route={{ view: 'project', id: project }} />)
    await waitFor(() => r.container.querySelector(`[data-bar="${id}"]`) !== null)
    const grid = r.container.querySelector<HTMLElement>('[data-timeline] [role="grid"]')!
    let left = 800
    Object.defineProperty(grid, 'scrollLeft', { get: () => left, set: (v: number) => { left = Math.max(0, Math.min(3258, v)) }, configurable: true })
    grid.getBoundingClientRect = () => ({ top: 0, bottom: 600, left: 0, right: 358, width: 358, height: 600, x: 0, y: 0, toJSON() {} })
    const col = (d: string) => r.container.querySelector(`[data-drop-target="tl:${d}"]`)!
    const bar = r.container.querySelector(`[data-bar="${id}"]`)!
    const moveTo = (x: number, y = 5) => act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y })) })
    document.elementFromPoint = () => col('2026-10-07')
    // Held at x = 80, the axis's third day (6 October).
    await act(async () => { bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: 80, clientY: 5 })) })
    // Across the middle: nothing scrolls.
    await moveTo(180)
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- nothing scrolls here, so there is no signal to wait for
    await flush(60)
    expect(left).toBe(800)
    // At the right edge the grid scrolls on under a still pointer.
    await moveTo(355)
    await waitFor(() => left > 820, 'the grid scrolled to later days')
    // The day now under the pointer is the marked one.
    document.elementFromPoint = () => col('2026-10-09')
    await waitFor(() => col('2026-10-09').hasAttribute('data-drop-active'), 'the day under the pointer marked')
    expect(col('2026-10-07').hasAttribute('data-drop-active')).toBe(false)
    // Outside the grid's height the pointer is not at its edge.
    await moveTo(355, 700)
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- one frame for a step already asked for
    await flush(40)
    const resting = left
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- nothing scrolls here, so there is no signal to wait for
    await flush(80)
    expect(left).toBe(resting)
    // The left edge scrolls back, to the start of the axis and no further.
    left = 30
    await moveTo(3)
    await waitFor(() => left === 0, 'the grid scrolled to the first day')
    // Released: the drop is the day under the pointer, three days after the grab, and the scroll is over.
    await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'mouse', clientX: 3, clientY: 5 })) })
    await waitFor(async () => (await db.tasks.get(id))!.start === '2026-11-06', 'the drop written')
    expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-11-08' })
    expect(r.container.querySelector('[data-drop-active]')).toBeNull()
    left = 500
    // eslint-disable-next-line test-hygiene/no-fixed-wait -- the drag is over, so nothing scrolls and there is no signal to wait for
    await flush(60)
    expect(left).toBe(500)
    await r.unmount()
  })
})

describe('notes beside short bars (precision-polish D4)', () => {
  it('sits after the bar when clear', () => {
    expect(notePlacement(0, 40, 60, 400, 1000)).toBe(48)
  })
  it('moves past the today line instead of crossing it', () => {
    expect(notePlacement(0, 40, 60, 80, 1000)).toBe(88)
  })
  it('moves before the bar at the end of the axis', () => {
    expect(notePlacement(900, 960, 60, null, 1000)).toBe(832)
  })
})

describe('the range\'s controls (touch-open-and-controls)', () => {
  /** A timeline with one bar on the 3rd; today is the 1st, so the axis starts 28 days before it. */
  async function ranged() {
    const p = await timeline()
    const id = await createTask({ title: 'Book flights', project_id: p, start: '2026-11-03', due: { date: '2026-11-05' } })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelector(`[data-bar="${id}"]`) !== null, 'the bar')
    const range = () => r.container.querySelector<HTMLElement>('[data-timeline-range]')!
    const button = (name: string) => [...range().querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === name)!
    /** The first date column's header: the day the axis starts on (a week's range in Weeks). */
    const first = () => r.container.querySelectorAll('[data-timeline] [role="columnheader"]')[1].textContent
    /** Where the bar starts, in px from the axis start: it moves left as the range moves later. */
    const left = () => parseFloat(r.container.querySelector<HTMLElement>(`[data-bar="${id}"]`)!.style.left)
    const zoom = (name: string) => [...r.container.querySelectorAll<HTMLElement>('[role="group"][aria-label="Timeline zoom"] button')].find((b) => b.textContent === name)!
    return { r, range, button, first, left, zoom }
  }

  it('has Earlier, Today and Later beside the zoom, on every device', async () => {
    const { r, range } = await ranged()
    expect(range().getAttribute('role')).toBe('group')
    expect(range().getAttribute('aria-label')).toBe('Range')
    expect([...range().querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Earlier', 'Today', 'Later'])
    const zoom = r.container.querySelector('[role="group"][aria-label="Timeline zoom"]')!
    expect(zoom.parentElement).toBe(range().parentElement)
    expect(zoom.compareDocumentPosition(range()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await r.unmount()
  })

  it('in Days, Later starts the timeline one week later, Earlier moves it back, and Today returns after a move; nothing is written', async () => {
    const { r, button, first, left } = await ranged()
    const writes = await db.outbox.count()
    // 32 px a day from 4 October: the 3rd of November is 30 days in.
    expect(first()).toBe('4')
    expect(left()).toBe(30 * 32)
    await click(button('Later'))
    expect(first()).toBe('11')
    expect(left()).toBe(23 * 32)
    await click(button('Earlier'))
    expect(first()).toBe('4')
    await click(button('Earlier'))
    expect(first()).toBe('27')
    expect(left()).toBe(37 * 32)
    await click(button('Later'))
    await click(button('Later'))
    await click(button('Later'))
    expect(first()).toBe('18')
    await click(button('Today'))
    expect(first()).toBe('4')
    expect(left()).toBe(30 * 32)
    expect(r.container.querySelector('[data-today-mark]')).not.toBeNull()
    // Opening the project marks it seen a moment later (feed_seen_at); the range itself writes nothing.
    expect((await db.outbox.toArray()).slice(writes).filter((o) => o.field !== 'feed_seen_at')).toEqual([])
    await r.unmount()
  })

  it('in Weeks, Later and Earlier move the range by four weeks, and Today returns', async () => {
    const { r, button, first, left, zoom } = await ranged()
    await click(zoom('Weeks'))
    await waitFor(() => zoom('Weeks').getAttribute('aria-pressed') === 'true', 'the Weeks zoom')
    // A week's column is seven days wide: a day's width, whatever it is, from the header.
    const day = parseFloat(r.container.querySelectorAll<HTMLElement>('[data-timeline] [role="columnheader"]')[1].style.width) / 7
    const start = { first: first(), left: left() }
    await click(button('Later'))
    expect(first()).not.toBe(start.first)
    expect(left()).toBe(start.left - 28 * day)
    await click(button('Earlier'))
    expect({ first: first(), left: left() }).toEqual(start)
    await click(button('Earlier'))
    expect(left()).toBe(start.left + 28 * day)
    await click(button('Today'))
    expect({ first: first(), left: left() }).toEqual(start)
    await r.unmount()
  })

  it('the keys still move the range: ] later, [ earlier, t back to today', async () => {
    const { r, first } = await ranged()
    await key(document.body, ']')
    expect(first()).toBe('11')
    await key(document.body, ']')
    expect(first()).toBe('18')
    await key(document.body, '[')
    expect(first()).toBe('11')
    await key(document.body, 't')
    expect(first()).toBe('4')
    await r.unmount()
  })
})

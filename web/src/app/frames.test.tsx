// @vitest-environment happy-dom
// Frames on the Day and Week grid (OpenSpec change calendar-frames, tasks 3.1 to 3.4):
// bands behind the blocks that change neither drops nor capacity, Plan from this
// frame (fit, no fit, a deleted source, keyboard only), the Frames dialog and the
// phone agenda heading.
import 'fake-indexeddb/auto'
import { act, useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createFrame, MAX_FRAMES, type FrameInput } from '../lib/frames'
import { createLabel, deleteLabel } from '../lib/labels'
import { getTask } from '../lib/localData'
import { createTask, mutate, resetDeviceId } from '../lib/ops'
import { setDateTime } from '../lib/dates'
import { click, flush, key, minWidthPx, render, type as typeInto, waitFor } from '../ui/test-utils'
import { UndoToast } from './bulk/UndoToast'
import { CalendarView } from './CalendarView'
import { FramesHost, requestFrameAt, requestFrames } from './calendar/framesRequest'
import { closePanelIfStale, resetPanel } from './panel'
import { PanelHost } from './PanelHost'
import { navigate, useRoute } from './router'

const DAY = '2026-10-14' // a Wednesday
const base: FrameInput = { title: 'Deep work', weekdays: '1,2,3,4,5', start: '09:00', end: '11:00', color: '#2563eb', source: '', from_date: null, until_date: null }

function Calendar() {
  const route = useRoute()
  useEffect(() => { closePanelIfStale(location.pathname) }, [route])
  if (route.view === 'day' || route.view === 'week') return <CalendarView mode={route.view} date={route.date} />
  return <p>elsewhere</p>
}

const original = window.matchMedia
const fromPoint = document.elementFromPoint
function viewport(px: number) {
  window.matchMedia = ((q: string) => ({
    matches: minWidthPx(q) <= px, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 8, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  viewport(1280)
  navigate({ view: 'day' }, { replace: true })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.matchMedia = original
  document.elementFromPoint = fromPoint
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  resetPanel()
  navigate({ view: 'inbox' }, { replace: true })
})

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const qa = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)]
const header = () => q('[data-page-header]')!
const planList = () => q('[data-panel-frame="calendar-plan"]')

describe('bands on the grid', () => {
  it('draws a frame on its weekdays in the Week, behind the blocks, and nothing without frames', async () => {
    navigate({ view: 'week' }, { replace: true })
    const r = await render(<Calendar />)
    await waitFor(() => qa('[data-drop-day]').length === 7, 'the week')
    expect(q('[data-frame-band]')).toBeNull()
    expect(q('[data-frame-name]')).toBeNull()
    await createFrame(base)
    await waitFor(() => qa('[data-frame-band]').length === 5, 'five weekday bands')
    const band = q(`[data-drop-day="${DAY}"] [data-frame-band]`)!
    expect(band.className).toContain('pointer-events-none')
    expect(band.className).toContain('z-0')
    expect(band.style.top).toBe(`${9 * 60 * 0.8}px`)
    // Days before today are dimmed; today's band is not.
    expect(q('[data-drop-day="2026-10-12"] [data-frame-band]')!.className).toContain('ui-frame-band--past')
    expect(band.className).not.toContain('ui-frame-band--past')
    expect(band.querySelector('[data-frame-name]')!.textContent).toBe('Deep work · 09:00–11:00')
    await r.unmount()
  })

  it('a task inside a frame keeps its block, and capacity counts the task only', async () => {
    await createFrame(base)
    await createTask({ title: 'Inside', due: { date: DAY, time: '09:30' }, estimate_minutes: 60 })
    const r = await render(<Calendar />)
    await waitFor(() => !!q('[data-frame-band]') && !!q('[data-block]'), 'band and block')
    const block = q('[data-block]')!
    expect(block.className).toContain('z-10')
    expect(block.className).toContain('ui-block')
    expect(q(`[data-day-header="${DAY}"] [data-capacity]`)!.textContent).toMatch(/^1h \/ 8h/)
    await r.unmount()
  })

  it('a task dropped onto a frame gets the slot under the pointer, as without the frame', async () => {
    await createFrame(base)
    const id = await createTask({ title: 'Move me', due: { date: DAY, time: '13:00' }, estimate_minutes: 30 })
    const r = await render(<Calendar />)
    await waitFor(() => !!q('[data-frame-band]') && !!q(`[data-block="${id}"]`), 'band and block')
    const y = (m: number) => m * 0.8
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const box = (top: number, height: number) => ({ top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON() {} }) as DOMRect
      if (this.hasAttribute('data-block')) return box(y(13 * 60), y(30))
      return box(0, y(24 * 60))
    })
    // Even the frame's title, the one part of a band that takes the pointer, sits inside the day's drop target.
    document.elementFromPoint = () => q('[data-frame-name]')
    const block = q(`[data-block="${id}"]`)!
    const init = { bubbles: true, button: 0, pointerId: 1, pointerType: 'mouse', clientX: 50 }
    const from = y(13 * 60) + 10
    await act(async () => { block.dispatchEvent(new PointerEvent('pointerdown', { ...init, clientY: from })) })
    await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientY: from - 6 })) })
    await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { ...init, clientY: y(10 * 60 + 15) + 10 })) })
    await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { ...init, clientY: y(10 * 60 + 15) + 10 })) })
    await waitFor(async () => (await getTask(id))?.due?.time === '10:15', 'dropped at 10:15')
    expect((await getTask(id))?.due).toEqual({ date: DAY, time: '10:15' })
    vi.restoreAllMocks()
    await r.unmount()
  })

  it('overlapping frames share the column side by side', async () => {
    await createFrame({ ...base, title: 'Admin', weekdays: '3', start: '16:00', end: '17:00' })
    await createFrame({ ...base, title: 'Calls', weekdays: '3', start: '16:30', end: '17:30' })
    const r = await render(<Calendar />)
    await waitFor(() => qa('[data-frame-band]').length === 2, 'two bands')
    const [a, b] = qa('[data-frame-band]')
    expect([a.style.left, a.style.width, b.style.left, b.style.width]).toEqual(['0%', '50%', '50%', '50%'])
    await r.unmount()
  })
})

async function openFrame(): Promise<void> {
  await waitFor(() => !!q('[data-frame-name]'), 'the frame title')
  await click(q('[data-frame-name]')!)
  await waitFor(() => !!q('[data-frame-details]'), 'the frame popover')
}

describe('plan from this frame', () => {
  it('opens the list on the frame source and proposes the first fitting start inside it', async () => {
    const deep = await createLabel({ name: 'deep' })
    await createFrame({ ...base, source: `label:${deep}` })
    await createTask({ title: 'Already there', due: { date: DAY, time: '09:00' }, estimate_minutes: 30 })
    const id = await createTask({ title: 'Write the essay', labels: [deep], estimate_minutes: 45 })
    await createTask({ title: 'Not deep' })
    const r = await render(<><Calendar /><PanelHost /></>)
    await openFrame()
    expect(q('[data-frame-source-name]')!.textContent).toBe('Plans from deep')
    await click(q('[data-frame-plan]')!)
    await waitFor(() => planList()?.querySelector(`[data-plan-source="label:${deep}"]`) != null, 'the list on the label')
    await waitFor(() => planList()!.querySelectorAll('[data-tray-task]').length === 1, 'the label task only')
    expect(q('[data-frame-target]')).not.toBeNull()
    const item = planList()!.querySelector<HTMLElement>(`[data-tray-task="${id}"]`)!
    item.focus()
    await key(item, 's')
    const at = () => header().textContent!.match(/at (\d\d:\d\d)/)?.[1]
    await waitFor(() => at() === '09:30', 'placing at 09:30')
    expect((await getTask(id))?.due).toBeNull()
    await key(document.activeElement!, 'Enter')
    await waitFor(async () => (await getTask(id))?.due?.time === '09:30', 'placed at 09:30')
    expect((await getTask(id))?.due).toEqual({ date: DAY, time: '09:30' })
    await r.unmount()
  })

  it('falls back to the usual proposal when nothing fits, and writes nothing before Enter', async () => {
    await createFrame(base)
    await createTask({ title: 'Fills it', due: { date: DAY, time: '09:00' }, estimate_minutes: 120 })
    const id = await createTask({ title: 'An hour', estimate_minutes: 60 })
    const r = await render(<><Calendar /><PanelHost /></>)
    await openFrame()
    await click(q('[data-frame-plan]')!)
    await waitFor(() => planList()?.querySelector(`[data-tray-task="${id}"]`) != null, 'the inbox task')
    const item = planList()!.querySelector<HTMLElement>(`[data-tray-task="${id}"]`)!
    item.focus()
    await key(item, 's')
    // The usual proposal: the next quarter hour after now (08:00).
    await waitFor(() => header().textContent!.includes('at 08:00'), 'the usual start')
    await flush()
    expect((await getTask(id))?.due).toBeNull()
    await r.unmount()
  })

  it('keeps the list on its source when the frame source was deleted, and the frame keeps its source', async () => {
    const gone = await createLabel({ name: 'gone' })
    const fid = await createFrame({ ...base, source: `label:${gone}` })
    await deleteLabel(gone)
    const r = await render(<><Calendar /><PanelHost /></>)
    await openFrame()
    expect(q('[data-frame-source-name]')).toBeNull()
    await click(q('[data-frame-plan]')!)
    await waitFor(() => planList() != null, 'the list')
    expect(planList()!.querySelector('[data-plan-source]')!.getAttribute('data-plan-source')).toBe('inbox')
    expect((await db.frames.get(fid))!.source).toBe(`label:${gone}`)
    await r.unmount()
  })

  it('keyboard only: Enter on the title, Delete, then Undo brings it back', async () => {
    await createFrame(base)
    const r = await render(<><Calendar /><UndoToast /></>)
    await waitFor(() => !!q('[data-frame-name]'), 'the title')
    const title = q('[data-frame-name]')!
    expect(title.tagName).toBe('BUTTON')
    expect(title.tabIndex).toBe(0)
    title.focus()
    await key(title, 'Enter')
    await click(title) // happy-dom does not turn Enter into a click on a button
    await waitFor(() => !!q('[data-frame-delete]'), 'the actions')
    await click(q('[data-frame-delete]')!)
    await waitFor(() => !q('[data-frame-band]'), 'the band gone')
    await waitFor(() => !!q('[data-bulk-toast]'), 'the undo toast')
    const undo = qa('[data-bulk-toast] button').find((b) => b.textContent === 'Undo')!
    await act(async () => { undo.click() })
    await waitFor(() => !!q('[data-frame-band]'), 'the band back')
    await r.unmount()
  })
})

describe('the Frames dialog', () => {
  it('creates a frame from the overflow menu and lists it', async () => {
    navigate({ view: 'week' }, { replace: true })
    const r = await render(<><Calendar /><FramesHost /></>)
    await waitFor(() => !!header().querySelector('button[aria-label="More actions"]'), 'the header')
    await click(header().querySelector<HTMLElement>('button[aria-label="More actions"]')!)
    await waitFor(() => qa('[role="menuitem"]').some((e) => e.textContent?.includes('Frames…')), 'the menu')
    await click(qa('[role="menuitem"]').find((e) => e.textContent?.includes('Frames…'))!)
    await waitFor(() => !!q('[data-testid="frames-dialog"]'), 'the dialog')
    expect(q('[data-testid="frames-dialog"]')!.textContent).toContain('Frames shade the hours you keep for one kind of work.')
    await click(q('[data-frame-add]')!)
    await waitFor(() => !!q('input[data-frame-title]'), 'the form')
    await typeInto(q<HTMLInputElement>('input[data-frame-title]')!, 'Admin')
    // Monday to Friday are on by default: turn Friday off.
    await click(q('[data-weekday="5"]')!)
    const select = (sel: string, v: string) => act(async () => {
      const el = q<HTMLSelectElement>(sel)!
      el.value = v
      el.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await select('[data-frame-start]', '16:00')
    await select('[data-frame-end]', '16:45')
    await click(q('[data-frame-save]')!)
    await waitFor(() => !!q('[data-frame-row]'), 'the list again')
    expect(q('[data-frame-row]')!.textContent).toContain('Admin')
    expect(q('[data-frame-row]')!.textContent).toContain('Mon–Thu · 16:00–16:45')
    await waitFor(() => qa('[data-frame-band]').length === 4, 'four bands')
    await r.unmount()
  })

  it('starts the weekday toggles on Sunday when the week does, storing ISO numbers', async () => {
    setDateTime({ date_format: 'system', time_format: 'system', week_start: 'sun' })
    requestFrames({ mode: 'new' })
    const r = await render(<FramesHost />)
    await waitFor(() => !!q('[data-frame-days]'), 'the form')
    expect(qa('[data-weekday]').map((b) => b.dataset.weekday)).toEqual(['7', '1', '2', '3', '4', '5', '6'])
    await r.unmount()
  })

  it('prefills New frame here… with the weekday and an hour from the slot', async () => {
    requestFrameAt(3, 14 * 60)
    const r = await render(<FramesHost />)
    await waitFor(() => !!q('[data-frame-days]'), 'the form')
    expect(qa('[data-weekday][aria-pressed="true"]').map((b) => b.dataset.weekday)).toEqual(['3'])
    expect(q<HTMLSelectElement>('[data-frame-start]')!.value).toBe('14:00')
    expect(q<HTMLSelectElement>('[data-frame-end]')!.value).toBe('15:00')
    expect(document.activeElement).toBe(q('input[data-frame-title]'))
    await r.unmount()
  })

  it('marks crossed times as needing a fix, writes nothing, and does not draw the frame', async () => {
    const id = await createFrame(base)
    await mutate('frame', id, { start: '12:00' })
    const before = await db.outbox.count()
    requestFrames()
    const r = await render(<><FramesHost /><Calendar /></>)
    await waitFor(() => !!q('[data-frame-fix]'), 'the fix note')
    expect(q('[data-frame-fix]')!.textContent).toContain('Times need fixing')
    expect(q('[data-frame-band]')).toBeNull()
    await flush()
    expect(await db.outbox.count()).toBe(before)
    await r.unmount()
  })

  it('refuses the 51st frame in the form', async () => {
    for (let i = 0; i < MAX_FRAMES; i++) await createFrame({ ...base, title: `F${i}` })
    requestFrames()
    const r = await render(<FramesHost />)
    await waitFor(() => !!q<HTMLButtonElement>('[data-frame-add]')?.disabled, 'the full list')
    expect(q<HTMLButtonElement>('[data-frame-add]')!.disabled).toBe(true)
    expect(document.body.textContent).toContain('You can keep up to 50 frames.')
    await r.unmount()
  })
})

describe('frames on a phone', () => {
  it('shows a heading above the first timed task inside the frame, and opens the sheet', async () => {
    viewport(390)
    navigate({ view: 'week' }, { replace: true })
    await createFrame({ ...base, weekdays: '2' })
    await createTask({ title: 'Early', due: { date: '2026-10-13', time: '08:00' }, estimate_minutes: 30 })
    await createTask({ title: 'Inside', due: { date: '2026-10-13', time: '09:30' }, estimate_minutes: 30 })
    const r = await render(<Calendar />)
    await waitFor(() => !!q('[data-agenda-frame]') && qa('[data-agenda-task]').length === 2, 'the heading and the tasks')
    const items = qa('[data-agenda-day="2026-10-13"] li').map((li) => li.textContent)
    expect(items).toEqual([expect.stringContaining('Early'), 'Deep work · 09:00–11:00', expect.stringContaining('Inside')])
    expect(q('[data-frame-band]')).toBeNull()
    await click(q('[data-agenda-frame] button')!)
    await waitFor(() => !!q('[data-frame-details]'), 'the sheet')
    await r.unmount()
  })
})

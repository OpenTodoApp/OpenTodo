// @vitest-environment happy-dom
// The When control (OpenSpec changes ux-overhaul and task-panel-polish): one editor
// with six segments, each now quick choices, the date in words and a calendar. Each
// writes exactly the field its previous editor wrote (checked on the queued ops),
// locally first and offline.
import 'fake-indexeddb/auto'
import { useLiveQuery } from 'dexie-react-hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { dayPartOf } from '../../lib/dayParts'
import { undoBatch } from '../../lib/undo'
import { createTask, mutate } from '../../lib/ops'
import { USER_PREFS_ID } from '../../lib/userPrefs'
import { click, key, render, type, waitFor } from '../../ui/test-utils'
import { setupTaskDetailTests } from './taskDetail.testkit'
import { WhenControl } from './WhenControl'

setupTaskDetailTests()

async function mount(id: string, focus: Parameters<typeof WhenControl>[0]['focus'] = 'due') {
  const task = (await db.tasks.get(id))!
  const onDone = vi.fn()
  const r = await render(<Live id={id} focus={focus} onDone={onDone} />)
  await waitFor(() => !!r.container.querySelector('[data-when-segment]') && r.container.contains(document.activeElement), 'the control with its focused segment')
  const seg = (name: string) => r.container.querySelector(`[data-when-segment="${name}"]`) as HTMLElement
  return { ...r, task, onDone, seg }
}

/** The control over the live task, as the chip renders it. */
function Live({ id, focus, onDone }: { id: string; focus: Parameters<typeof WhenControl>[0]['focus']; onDone: () => void }) {
  const task = useLiveQuery(() => db.tasks.get(id), [id])
  return task ? <WhenControl task={task} focus={focus} onDone={onDone} /> : null
}

/** Where the outbox stands now (the clock is frozen, so ops are counted, not timed). */
const mark = () => db.outbox.count()
/** Field names and values of the task ops queued after `from`. */
async function queuedFields(id: string, from: number): Promise<Record<string, unknown>> {
  const ops = (await db.outbox.toArray()).slice(from).filter((o) => o.entityId === id)
  return Object.fromEntries(ops.map((o) => [o.field, o.value]))
}
/** Wait until a task op is queued after `from`. */
const queued = (id: string, from: number) => waitFor(async () => Object.keys(await queuedFields(id, from)).length > 0, 'the write queued')

describe('WhenControl', () => {
  it('shows five segments under one header, focuses the asked one, and Done calls back', async () => {
    const id = await createTask({ title: 'Plan' })
    const { container, seg, onDone, unmount } = await mount(id, 'deadline')
    expect([...container.querySelectorAll('[data-when-segment]')].map((s) => s.getAttribute('data-when-segment'))).toEqual(['due', 'start', 'deadline', 'repeat', 'reminders'])
    expect(seg('deadline').contains(document.activeElement)).toBe(true)
    await click(container.querySelector<HTMLButtonElement>('[data-when-close]')!)
    expect(onDone).toHaveBeenCalled()
    await unmount()
  })

  it('Do on writes the due field only, as the due editor did', async () => {
    const id = await createTask({ title: 'Plan' })
    const { seg, unmount } = await mount(id)
    const from = await mark()
    const date = seg('due').querySelector('input') as HTMLInputElement
    await type(date, '2026-11-03')
    await key(date, 'Enter')
    await queued(id, from)
    expect(await queuedFields(id, from)).toEqual({ due: { date: '2026-11-03' } })
    await unmount()
  })

  it('Start writes start (a date, Someday parks with due cleared, a quick choice starts it again)', async () => {
    const id = await createTask({ title: 'Plan', due: { date: '2026-10-20' } })
    const { seg, unmount } = await mount(id, 'start')
    let from = await mark()
    const date = seg('start').querySelector('input') as HTMLInputElement
    expect(document.activeElement).toBe(date)
    await type(date, '2026-10-16')
    await key(date, 'Enter')
    await queued(id, from)
    expect(await queuedFields(id, from)).toEqual({ start: '2026-10-16' })

    from = await mark()
    await click([...seg('start').querySelectorAll('button')].find((b) => b.textContent?.includes('Someday'))!)
    await queued(id, from)
    expect(await queuedFields(id, from)).toMatchObject({ start: 'someday', due: null })

    from = await mark()
    await click(seg('start').querySelector('[data-choice="tomorrow"]')!)
    await queued(id, from)
    expect(await queuedFields(id, from)).toMatchObject({ start: '2026-10-15' })
    await unmount()
  })

  it('Deadline writes deadline only, typed or from a quick choice', async () => {
    const id = await createTask({ title: 'Plan', due: { date: '2026-10-15' } })
    const { seg, unmount } = await mount(id, 'deadline')
    let from = await mark()
    const input = seg('deadline').querySelector('input') as HTMLInputElement
    await type(input, 'fri')
    await key(input, 'Enter')
    await queued(id, from)
    expect(await queuedFields(id, from)).toEqual({ deadline: '2026-10-16' })
    from = await mark()
    await click(seg('deadline').querySelector('[data-choice="end-of-month"]')!)
    await queued(id, from)
    expect(await queuedFields(id, from)).toEqual({ deadline: '2026-10-31' })
    await unmount()
  })


  it('Repeat writes recurrence only, from a preset or the custom rule', async () => {
    const id = await createTask({ title: 'Plan', due: { date: '2026-10-15' } })
    const { seg, unmount } = await mount(id, 'repeat')
    let from = await mark()
    // Presets name the due date's weekday and day; the rule written is the editor's own.
    await click(seg('repeat').querySelector('[data-preset="weekly"]')!)
    await queued(id, from)
    await waitFor(() => seg('repeat').querySelector('[data-preset="weekly"]')!.getAttribute('aria-checked') === 'true', 'the preset checked')
    expect(Object.keys(await queuedFields(id, from))).toEqual(['recurrence'])
    expect((await db.tasks.get(id))!.recurrence).toBe('every thursday')
    expect(seg('repeat').querySelector('[data-preset="weekly"]')!.getAttribute('aria-checked')).toBe('true')
    expect(seg('repeat').querySelector('[data-rule-words]')!.textContent).toContain('every thursday')
    from = await mark()
    await click(seg('repeat').querySelector('[data-preset="custom"]')!)
    await waitFor(() => !!seg('repeat').querySelector('input[aria-label="Repeat rule"]'), 'the rule field')
    const input = seg('repeat').querySelector('input[aria-label="Repeat rule"]') as HTMLInputElement
    await type(input, 'every week')
    await key(input, 'Enter')
    await queued(id, from)
    const fields = await queuedFields(id, from)
    expect(Object.keys(fields)).toEqual(['recurrence'])
    expect((await db.tasks.get(id))!.recurrence).toBeTruthy()
    await unmount()
  })

  it('a custom every 2 weeks on <the due date’s weekday> is written as every 2 weeks, which 1.0 reads (recurrence-1-0-compatible)', async () => {
    // 2026-10-17 is a Saturday, 2026-10-14 a Wednesday.
    for (const [date, want] of [['2026-10-17', 'every 2 weeks'], ['2026-10-14', 'every 2 weeks on saturday']] as const) {
      const id = await createTask({ title: 'Bins', due: { date } })
      const { seg, unmount } = await mount(id, 'repeat')
      await click(seg('repeat').querySelector('[data-preset="custom"]')!)
      await waitFor(() => !!seg('repeat').querySelector('input[aria-label="Repeat rule"]'), 'the rule field')
      const input = seg('repeat').querySelector('input[aria-label="Repeat rule"]') as HTMLInputElement
      const from = await mark()
      await type(input, 'every 2 weeks on sat')
      await key(input, 'Enter')
      await queued(id, from)
      expect(await queuedFields(id, from)).toEqual({ recurrence: want })
      await waitFor(() => input.value === want, 'the field shows the stored rule')
      await unmount()
    }
  })

  it('Reminders adds a reminder record and touches no task field', async () => {
    const id = await createTask({ title: 'Plan', due: { date: '2026-10-15', time: '09:00' } })
    const { seg, unmount } = await mount(id, 'reminders')
    const from = await mark()
    const add = seg('reminders').querySelector('button[aria-label="Add reminder"]') as HTMLButtonElement
    expect(document.activeElement).toBe(add)
    await click(add)
    await waitFor(() => [...document.querySelectorAll('[role="menuitem"]')].some((i) => i.textContent?.includes('At due time')), 'the reminder menu')
    await click([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((i) => i.textContent?.includes('At due time'))!)
    await waitFor(async () => (await db.reminders.where('task_id').equals(id).count()) === 1, 'the reminder stored')
    expect(await queuedFields(id, from)).toEqual({})
    const reminders = (await db.outbox.toArray()).slice(from).filter((o) => o.entity === 'reminder')
    expect(reminders.length).toBeGreaterThan(0)
    expect(await db.reminders.where('task_id').equals(id).count()).toBe(1)
    await unmount()
  })

  it('offline: start and deadline land locally and queue for sync while the network is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const id = await createTask({ title: 'Plan', due: { date: '2026-10-20' } })
    const { seg, unmount } = await mount(id, 'start')
    const from = await mark()
    const start = seg('start').querySelector('input') as HTMLInputElement
    await type(start, '2026-10-16')
    await key(start, 'Enter')
    await waitFor(async () => (await db.tasks.get(id))!.start === '2026-10-16', 'the start date written')
    const deadline = seg('deadline').querySelector('input') as HTMLInputElement
    await type(deadline, '2026-10-22')
    await key(deadline, 'Enter')
    await waitFor(async () => (await db.tasks.get(id))!.deadline === '2026-10-22', 'the deadline written')
    expect(await db.tasks.get(id)).toMatchObject({ start: '2026-10-16', deadline: '2026-10-22' })
    expect(await queuedFields(id, from)).toEqual({ start: '2026-10-16', deadline: '2026-10-22' })
    vi.unstubAllGlobals()
    await unmount()
  })

  // OpenSpec change when-picker: web-app "Do on segment", day-parts "Setting the part of the day".
  describe('Do on: the time of day row', () => {
    const row = (seg: (n: string) => HTMLElement) => seg('due').querySelector<HTMLElement>('[data-time-of-day]')!
    const option = (seg: (n: string) => HTMLElement, id: string) => row(seg).querySelector<HTMLButtonElement>(`[data-segment="${id}"]`)!
    const checked = (seg: (n: string) => HTMLElement) => row(seg).querySelector('[aria-checked="true"]')?.getAttribute('data-segment')
    const timeLine = (seg: (n: string) => HTMLElement) => seg('due').querySelector<HTMLElement>('[data-due-time]')
    /** The task ops queued after `from` were one batch (one timestamp). */
    const oneBatch = async (id: string, from: number) => new Set((await db.outbox.toArray()).slice(from).filter((o) => o.entityId === id).map((o) => o.ts)).size === 1
    const undoLast = async () => { await undoBatch((await db.assistantUndo.toArray()).at(-1)!.id) }
    const partsOn = () => mutate('user_prefs', USER_PREFS_ID, { day_parts: 'on' })
    afterEach(() => mutate('user_prefs', USER_PREFS_ID, { day_parts: '' }))

    it('the placeholder teaches the field; Tomorrow in one click; no zone and no time-zone hint without a time', async () => {
      const id = await createTask({ title: 'Plan' })
      const { seg, unmount } = await mount(id)
      expect(seg('due').querySelector<HTMLInputElement>('[data-date-words]')!.placeholder).toBe('tomorrow 3pm, next fri')
      expect(seg('due').querySelector('[data-choice="none"]')).toBeNull()
      const from = await mark()
      await click(seg('due').querySelector('[data-choice="tomorrow"]')!)
      await queued(id, from)
      expect(await queuedFields(id, from)).toEqual({ due: { date: '2026-10-15' } })
      await waitFor(() => !option(seg, 'none').disabled, 'the row enabled')
      expect(seg('due').querySelector('[data-zone-inline]')).toBeNull()
      expect(seg('due').textContent).not.toMatch(/time zone|Floating/i)
      expect(seg('due').querySelector('button[aria-label="Clear due date"]')).toBeNull()
      await unmount()
    })

    it('without a date the row is shown disabled, named so; a day picked in the calendar enables it in place', async () => {
      const id = await createTask({ title: 'Plan' })
      const { seg, unmount } = await mount(id)
      expect(row(seg).getAttribute('aria-label')).toBe('Time of day (choose a date first)')
      expect([...row(seg).querySelectorAll('button')].every((b) => b.disabled)).toBe(true)
      const place = () => [...row(seg).parentElement!.parentElement!.children].indexOf(row(seg).parentElement!)
      const before = place()
      await click(seg('due').querySelector('[data-date="2026-10-20"]')!)
      await waitFor(() => !option(seg, 'evening').disabled, 'the row enabled')
      expect(row(seg).getAttribute('aria-label')).toBe('Time of day')
      expect(place()).toBe(before)
      await unmount()
    })

    it('day parts off: Any time, Evening and Time; Evening on a later day writes the flag and never reads "This Evening"', async () => {
      const id = await createTask({ title: 'Plan', due: { date: '2026-10-20' } })
      const { seg, unmount } = await mount(id)
      expect([...row(seg).querySelectorAll('[role="radio"]')].map((b) => b.textContent)).toEqual(['Any time', 'Evening', 'Time'])
      expect(row(seg).getAttribute('role')).toBe('radiogroup')
      expect(checked(seg)).toBe('none')
      expect(seg('due').querySelector('[role="switch"]')).toBeNull()
      const from = await mark()
      await click(option(seg, 'evening'))
      await queued(id, from)
      expect(await queuedFields(id, from)).toEqual({ evening: true, day_part: null })
      await waitFor(() => checked(seg) === 'evening', 'Evening selected')
      expect(seg('due').textContent).not.toContain('This Evening')
      await unmount()
    })

    it('day parts on: Morning in the row of a task due at 14:00 clears the time in one batch, and one Undo restores both', async () => {
      await partsOn()
      const id = await createTask({ title: 'Plan', due: { date: '2026-10-14', time: '14:00' } })
      const { seg, unmount } = await mount(id)
      await waitFor(() => row(seg).querySelectorAll('[role="radio"]').length === 5, 'five choices')
      expect([...row(seg).querySelectorAll('[role="radio"]')].map((b) => b.textContent)).toEqual(['Any time', 'Morning', 'Afternoon', 'Evening', 'Time'])
      expect(checked(seg)).toBe('time')
      const from = await mark()
      await click(option(seg, 'morning'))
      await waitFor(async () => (await db.tasks.get(id))?.day_part === 'morning', 'Morning written')
      expect(await queuedFields(id, from)).toEqual({ due: { date: '2026-10-14' }, day_part: 'morning', evening: false })
      expect(await oneBatch(id, from)).toBe(true)
      await waitFor(() => checked(seg) === 'morning' && !timeLine(seg), 'Morning selected, the time line gone')
      await undoLast()
      await waitFor(async () => (await db.tasks.get(id))?.due?.time === '14:00', 'undone')
      expect(await db.tasks.get(id)).toMatchObject({ day_part: null, evening: false })
      await waitFor(() => checked(seg) === 'time', 'Time selected again')
      await unmount()
    })

    it('adding a time: Time on a Morning task opens the line, a suggestion writes it with Any time, Floating at the line end', async () => {
      await partsOn()
      const id = await createTask({ title: 'Plan', due: { date: '2026-10-15' }, day_part: 'morning' })
      const { seg, unmount } = await mount(id)
      await waitFor(() => checked(seg) === 'morning', 'Morning selected')
      expect(timeLine(seg)).toBeNull()
      let from = await mark()
      await click(option(seg, 'time'))
      await waitFor(() => !!timeLine(seg)?.querySelector('[data-time-suggestion="09:00"]'), 'the time line')
      expect(checked(seg)).toBe('time')
      // Choosing Time writes nothing until a time is chosen.
      expect(await queuedFields(id, from)).toEqual({})
      await waitFor(() => document.activeElement === timeLine(seg)!.querySelector('input'), 'the time field focused')
      from = await mark()
      await click(timeLine(seg)!.querySelector('[data-time-suggestion="09:00"]')!)
      await waitFor(async () => (await db.tasks.get(id))?.due?.time === '09:00', 'the time written')
      expect(await queuedFields(id, from)).toEqual({ due: { date: '2026-10-15', time: '09:00' }, day_part: null, evening: false })
      expect(await oneBatch(id, from)).toBe(true)
      await waitFor(() => !!timeLine(seg)?.querySelector('[data-zone-inline]'), 'the zone at the line end')
      expect(timeLine(seg)!.querySelector('input')!.value).toBe('09:00')
      expect(timeLine(seg)!.querySelector('[data-time-suggestion]')).toBeNull()
      const zone = timeLine(seg)!.querySelector<HTMLButtonElement>('[data-zone-inline]')!
      // The visible word is in the name (WCAG 2.5.3); `z` is announced.
      expect(zone.textContent).toBe('Floating')
      expect(zone.getAttribute('aria-label')).toBe('Time zone: Floating')
      expect(zone.getAttribute('aria-keyshortcuts')).toBe('z')
      expect(seg('due').textContent).not.toMatch(/Add time|Remove time|Change/)
      await unmount()
    })

    it('a part replaces the time: Afternoon on a task due tomorrow at 19:30, Undo restores 19:30', async () => {
      await partsOn()
      const id = await createTask({ title: 'Plan', due: { date: '2026-10-15', time: '19:30' } })
      const { seg, unmount } = await mount(id)
      await waitFor(() => !!option(seg, 'afternoon'), 'Afternoon offered')
      await click(option(seg, 'afternoon'))
      await waitFor(async () => (await db.tasks.get(id))?.day_part === 'afternoon', 'Afternoon written')
      expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-15' })
      await waitFor(() => !timeLine(seg), 'the time line gone')
      await undoLast()
      await waitFor(async () => (await db.tasks.get(id))?.due?.time === '19:30', 'undone')
      expect(dayPartOf((await db.tasks.get(id))!)).toBeNull()
      await unmount()
    })

    it('Any time removes the time and writes the Any time pairing', async () => {
      const id = await createTask({ title: 'Plan', due: { date: '2026-10-15', time: '08:00' } })
      const { seg, unmount } = await mount(id)
      const from = await mark()
      await click(option(seg, 'none'))
      await queued(id, from)
      expect(await queuedFields(id, from)).toEqual({ due: { date: '2026-10-15' }, day_part: null, evening: false })
      await unmount()
    })

    it('both stored (an older client): Evening selected with the time line, nothing written until a choice', async () => {
      const id = await createTask({ title: 'Plan', due: { date: '2026-10-15', time: '08:00' }, evening: true })
      const from = await mark()
      const { seg, unmount } = await mount(id)
      expect(checked(seg)).toBe('evening')
      expect(timeLine(seg)!.querySelector('input')!.value).toBe('08:00')
      expect(await queuedFields(id, from)).toEqual({})
      // Time keeps the time and clears the part.
      await click(option(seg, 'time'))
      await queued(id, from)
      expect(await queuedFields(id, from)).toEqual({ due: { date: '2026-10-15', time: '08:00' }, day_part: null, evening: false })
      await unmount()
    })

    it('typed date and time: tomorrow 3pm on an evening task writes date, time and Any time at once; one Undo restores Evening', async () => {
      const id = await createTask({ title: 'Plan', due: { date: '2026-10-20' }, evening: true })
      const { seg, unmount } = await mount(id)
      const field = seg('due').querySelector<HTMLInputElement>('[data-date-words]')!
      const from = await mark()
      await type(field, 'tomorrow 3pm')
      await waitFor(() => seg('due').querySelector('[data-date-preview]')!.textContent!.includes('15:00'), 'the preview')
      await key(field, 'Enter')
      await waitFor(async () => (await db.tasks.get(id))?.due?.time === '15:00', 'the date and time written')
      expect(await queuedFields(id, from)).toEqual({ due: { date: '2026-10-15', time: '15:00' }, day_part: null, evening: false })
      expect(await oneBatch(id, from)).toBe(true)
      await waitFor(() => checked(seg) === 'time' && timeLine(seg)?.querySelector('input')?.value === '15:00', 'Time selected with 15:00')
      await undoLast()
      await waitFor(async () => (await db.tasks.get(id))?.evening === true, 'undone')
      expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-20' })
      await unmount()
    })

    it('keyboard: one tab stop, arrows choose (writing each choice), Time opens the line without taking focus; passes axe', async () => {
      const id = await createTask({ title: 'Plan', due: { date: '2026-10-15' } })
      const { seg, unmount } = await mount(id)
      expect([...row(seg).querySelectorAll('[role="radio"]')].filter((b) => b.getAttribute('tabindex') === '0').map((b) => b.getAttribute('data-segment'))).toEqual(['none'])
      option(seg, 'none').focus()
      await key(option(seg, 'none'), 'ArrowRight')
      await waitFor(async () => (await db.tasks.get(id))?.evening === true && checked(seg) === 'evening', 'Evening by keyboard')
      expect(document.activeElement).toBe(option(seg, 'evening'))
      await key(option(seg, 'evening'), 'ArrowRight')
      await waitFor(() => !!timeLine(seg), 'the time line')
      expect(document.activeElement).toBe(option(seg, 'time'))
      expect(checked(seg)).toBe('time')
      const axe = (await import('axe-core')).default
      const res = await axe.run(seg('due'), { rules: { 'color-contrast': { enabled: false } } })
      expect(res.violations.map((v) => v.id)).toEqual([])
      await unmount()
    })
  })

  // OpenSpec change multi-day-tasks, D2 ("Making a task multi-day").
  describe('Multi-day', () => {
    const multiDay = (seg: (n: string) => HTMLElement) => seg('start').querySelector<HTMLElement>('[data-multi-day] [role="switch"]')
    it('is offered only with a do-on date', async () => {
      const id = await createTask({ title: 'Plan' })
      const { seg, unmount } = await mount(id, 'start')
      expect(multiDay(seg)).toBeNull()
      await unmount()
    })

    it('turned on without a start writes the day before and the flag in one batch, and focuses the start date', async () => {
      const id = await createTask({ title: 'Trip', due: { date: '2026-11-05' } })
      const { seg, unmount } = await mount(id, 'start')
      const from = await mark()
      await click(multiDay(seg)!)
      await queued(id, from)
      await waitFor(async () => (await db.tasks.get(id))?.span === true, 'the flag')
      expect(await queuedFields(id, from)).toEqual({ start: '2026-11-04', span: true })
      const ops = (await db.outbox.toArray()).slice(from).filter((o) => o.entityId === id)
      expect(new Set(ops.map((o) => o.ts)).size).toBe(1)
      await waitFor(() => document.activeElement === seg('start').querySelector('input'), 'the start date focused')
      await waitFor(() => /4\s?–\s?5/.test(seg('start').querySelector('[data-multi-day]')!.textContent ?? ''), 'the range')
      await unmount()
    })

    it('turned on with an earlier start writes only the flag', async () => {
      const id = await createTask({ title: 'Trip', start: '2026-11-03', due: { date: '2026-11-05' } })
      const { seg, unmount } = await mount(id, 'start')
      const from = await mark()
      await click(multiDay(seg)!)
      await queued(id, from)
      expect(await queuedFields(id, from)).toEqual({ span: true })
      await unmount()
    })

    it('turned off writes only the flag; the start stays', async () => {
      const id = await createTask({ title: 'Trip', start: '2026-11-03', due: { date: '2026-11-05' }, span: true })
      const { seg, unmount } = await mount(id, 'start')
      const from = await mark()
      expect(multiDay(seg)!.getAttribute('aria-checked')).toBe('true')
      await click(multiDay(seg)!)
      await queued(id, from)
      expect(await queuedFields(id, from)).toEqual({ span: false })
      expect((await db.tasks.get(id))!.start).toBe('2026-11-03')
      await unmount()
    })
  })
})

// @vitest-environment happy-dom
// The When control (OpenSpec changes ux-overhaul and task-panel-polish): one editor
// with six segments, each now quick choices, the date in words and a calendar. Each
// writes exactly the field its previous editor wrote (checked on the queued ops),
// locally first and offline.
import 'fake-indexeddb/auto'
import { useLiveQuery } from 'dexie-react-hooks'
import { describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createTask } from '../../lib/ops'
import { click, key, render, type, waitFor } from '../../ui/test-utils'
import { setupTaskDetailTests, settle } from './taskDetail.testkit'
import { WhenControl } from './WhenControl'

setupTaskDetailTests()

async function mount(id: string, focus: Parameters<typeof WhenControl>[0]['focus'] = 'due') {
  const task = (await db.tasks.get(id))!
  const onDone = vi.fn()
  const r = await render(<Live id={id} focus={focus} onDone={onDone} />)
  await settle()
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

describe('WhenControl', () => {
  it('shows six segments under one header, focuses the asked one, and Done calls back', async () => {
    const id = await createTask({ title: 'Plan' })
    const { container, seg, onDone, unmount } = await mount(id, 'deadline')
    expect([...container.querySelectorAll('[data-when-segment]')].map((s) => s.getAttribute('data-when-segment'))).toEqual(['due', 'start', 'deadline', 'evening', 'repeat', 'reminders'])
    expect(seg('deadline').contains(document.activeElement)).toBe(true)
    await click([...container.querySelectorAll('button')].find((b) => b.textContent === 'Done')!)
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
    await settle()
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
    await settle()
    expect(await queuedFields(id, from)).toEqual({ start: '2026-10-16' })

    from = await mark()
    await click([...seg('start').querySelectorAll('button')].find((b) => b.textContent?.includes('Someday'))!)
    await settle()
    expect(await queuedFields(id, from)).toMatchObject({ start: 'someday', due: null })

    from = await mark()
    await click(seg('start').querySelector('[data-choice="tomorrow"]')!)
    await settle()
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
    await settle()
    expect(await queuedFields(id, from)).toEqual({ deadline: '2026-10-16' })
    from = await mark()
    await click(seg('deadline').querySelector('[data-choice="end-of-month"]')!)
    await settle()
    expect(await queuedFields(id, from)).toEqual({ deadline: '2026-10-31' })
    await unmount()
  })

  it('Evening writes evening only', async () => {
    const id = await createTask({ title: 'Plan' })
    const { seg, unmount } = await mount(id, 'evening')
    const from = await mark()
    await click(seg('evening').querySelector('[role="switch"]')!)
    await settle()
    expect(await queuedFields(id, from)).toEqual({ evening: true })
    await unmount()
  })

  it('Repeat writes recurrence only, from a preset or the custom rule', async () => {
    const id = await createTask({ title: 'Plan', due: { date: '2026-10-15' } })
    const { seg, unmount } = await mount(id, 'repeat')
    let from = await mark()
    // Presets name the due date's weekday and day; the rule written is the editor's own.
    await click(seg('repeat').querySelector('[data-preset="weekly"]')!)
    await settle()
    expect(Object.keys(await queuedFields(id, from))).toEqual(['recurrence'])
    expect((await db.tasks.get(id))!.recurrence).toBe('every thursday')
    expect(seg('repeat').querySelector('[data-preset="weekly"]')!.getAttribute('aria-checked')).toBe('true')
    expect(seg('repeat').querySelector('[data-rule-words]')!.textContent).toContain('every thursday')
    from = await mark()
    await click(seg('repeat').querySelector('[data-preset="custom"]')!)
    await settle()
    const input = seg('repeat').querySelector('input[aria-label="Repeat rule"]') as HTMLInputElement
    await type(input, 'every week')
    await key(input, 'Enter')
    await settle()
    const fields = await queuedFields(id, from)
    expect(Object.keys(fields)).toEqual(['recurrence'])
    expect((await db.tasks.get(id))!.recurrence).toBeTruthy()
    await unmount()
  })

  it('Reminders adds a reminder record and touches no task field', async () => {
    const id = await createTask({ title: 'Plan', due: { date: '2026-10-15', time: '09:00' } })
    const { seg, unmount } = await mount(id, 'reminders')
    const from = await mark()
    const add = seg('reminders').querySelector('button[aria-label="Add reminder"]') as HTMLButtonElement
    expect(document.activeElement).toBe(add)
    await click(add)
    await settle()
    await click([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((i) => i.textContent?.includes('At due time'))!)
    await settle()
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

  it('Do on: Tomorrow in one click; Add time with a suggestion; the zone line only with a time', async () => {
    const id = await createTask({ title: 'Plan' })
    const { seg, unmount } = await mount(id)
    let from = await mark()
    await click(seg('due').querySelector('[data-choice="tomorrow"]')!)
    await settle()
    expect(await queuedFields(id, from)).toEqual({ due: { date: '2026-10-15' } })
    expect(seg('due').querySelector('[data-zone-line]')).toBeNull()
    expect(seg('due').textContent).not.toContain('time zone')
    await click(seg('due').querySelector('[data-add-time]')!)
    await settle()
    from = await mark()
    await click(seg('due').querySelector('[data-time-suggestion="09:00"]')!)
    await settle()
    expect(await queuedFields(id, from)).toEqual({ due: { date: '2026-10-15', time: '09:00' } })
    await waitFor(() => !!seg('due').querySelector('[data-zone-line]'), 'the zone line')
    expect(seg('due').querySelector('[data-zone-line]')!.textContent).toContain('Floating time')
    expect(seg('due').querySelector('button[aria-label^="Time zone:"]')!.textContent).toBe('Change')
    expect(seg('due').querySelector('button[aria-label="Clear due date"]')).toBeNull()
    await unmount()
  })
})

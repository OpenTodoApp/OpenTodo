// @vitest-environment happy-dom
// The When control (OpenSpec change ux-overhaul, web-app "Task panel layout",
// design D4): one editor with six segments. Each segment writes exactly the field
// its previous editor wrote (checked on the queued ops), locally first and offline.
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

  it('Start writes start (a date, Someday parks with due cleared, Anytime unparks)', async () => {
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
    await click([...seg('start').querySelectorAll('button')].find((b) => b.textContent === 'Anytime')!)
    await settle()
    expect(await queuedFields(id, from)).toMatchObject({ start: null })
    await unmount()
  })

  it('Deadline writes deadline only and its clear writes null', async () => {
    const id = await createTask({ title: 'Plan', due: { date: '2026-10-15' } })
    const { seg, unmount } = await mount(id, 'deadline')
    let from = await mark()
    const input = seg('deadline').querySelector('input') as HTMLInputElement
    await type(input, 'fri')
    await key(input, 'Enter')
    await settle()
    expect(await queuedFields(id, from)).toEqual({ deadline: '2026-10-16' })
    from = await mark()
    await click(seg('deadline').querySelector('button[aria-label="Clear deadline"]')!)
    await settle()
    expect(await queuedFields(id, from)).toEqual({ deadline: null })
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

  it('Repeat writes recurrence only', async () => {
    const id = await createTask({ title: 'Plan', due: { date: '2026-10-15' } })
    const { seg, unmount } = await mount(id, 'repeat')
    const from = await mark()
    const input = seg('repeat').querySelector('input[aria-label="Repeat rule"]') as HTMLInputElement
    expect(document.activeElement).toBe(input)
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
})

// @vitest-environment happy-dom
// Someday, deferral and This Evening in the lists, counts and rows (OpenSpec
// change someday-and-evening, tasks 2.3, 2.4 and 3.1).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { setDateTime } from '../lib/dates'
import { applyOps, createProject, createTask, resetDeviceId } from '../lib/ops'
import { act } from 'react'
import { flush, key, mockFetch, noPublicLinks, render, type, waitFor } from '../ui/test-utils'
import { Sidebar } from './Sidebar'
import { PanelHost } from './PanelHost'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  useDatabase(`someday-views-${Date.now()}-${n++}`)
  resetDeviceId()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: true, weekStart: 1 })
})
afterEach(() => {
  vi.useRealTimers()
  resetPanel()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  document.body.innerHTML = ''
})

const text = (el: HTMLElement) => el.textContent ?? ''

describe('Today groups (2.3)', () => {
  it('evening tasks are listed under This Evening after the day', async () => {
    await createTask({ title: 'Morning run', due: { date: '2026-10-14' } })
    await createTask({ title: 'Read a chapter', due: { date: '2026-10-14' }, evening: true })
    await createTask({ title: 'Email Sam', due: { date: '2026-10-14' } })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => text(r.container).includes('Read a chapter'))
    const t = text(r.container)
    const ev = t.indexOf('This Evening')
    expect(ev).toBeGreaterThan(t.indexOf('Morning run'))
    expect(ev).toBeGreaterThan(t.indexOf('Email Sam'))
    expect(t.indexOf('Read a chapter')).toBeGreaterThan(ev)
    // Calm rows (calm-rows D3): the heading says "This Evening", so the row carries no date text.
    const row = [...r.container.querySelectorAll('[data-task-id]')].find((li) => li.textContent?.includes('Read a chapter'))!
    expect(row.querySelector('[data-date]')).toBeNull()
  })

  it('a hard date wins over deferral; a started task shows its chip', async () => {
    await createTask({ title: 'Deferred with deadline', start: '2026-10-21', deadline: '2026-10-14' })
    await createTask({ title: 'Started last week', start: '2026-10-07' })
    await createTask({ title: 'Deferred', start: '2026-10-21' })
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => text(r.container).includes('Started last week'))
    const t = text(r.container)
    expect(t).toContain('Deferred with deadline')
    expect(t).not.toMatch(/Deferred(?! with)/)
    expect(t).toContain('Started 7 Oct')
  })

  it('started and due later: in Today and in Upcoming', async () => {
    await createTask({ title: 'Prepare talk', start: '2026-10-14', due: { date: '2026-10-17' } })
    let r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => text(r.container).includes('Prepare talk'))
    await r.unmount()
    r = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => text(r.container).includes('Prepare talk'))
  })
})

describe('Later group, Upcoming and counts (2.3, 2.4)', () => {
  it('deferred and parked tasks sit under Later in their project with chips; Upcoming and the counts leave them out', async () => {
    mockFetch(noPublicLinks)
    const home = await createProject({ name: 'Home' })
    await createTask({ title: 'Renew passport', project_id: home, start: '2026-10-21', due: { date: '2026-10-24' } })
    await createTask({ title: 'Learn Italian', project_id: home, start: 'someday' })
    await createTask({ title: 'Buy milk', project_id: home })
    const r = await render(<TaskListView route={{ view: 'project', id: home }} />)
    await waitFor(() => text(r.container).includes('Learn Italian'))
    const t = text(r.container)
    const later = t.indexOf('Later')
    expect(later).toBeGreaterThan(t.indexOf('Buy milk'))
    expect(t.indexOf('Renew passport')).toBeGreaterThan(later)
    expect(t).toContain('Starts 21 Oct')
    expect(t).toContain('Someday')
    await r.unmount()
    const up = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await flush(200)
    expect(text(up.container)).not.toContain('Renew passport')
    await up.unmount()
  })

  it('Deferred until next week (inbox-means-unplaced): a deferred or parked task without a project is not in the Inbox; a deferred one is in Upcoming on its start date', async () => {
    await createTask({ title: 'Book flights', start: '2026-10-21' })
    await createTask({ title: 'Learn Italian', start: 'someday' })
    await createTask({ title: 'Buy milk' })
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => text(r.container).includes('Buy milk'))
    await flush(100)
    expect(text(r.container)).not.toContain('Book flights')
    expect(text(r.container)).not.toContain('Learn Italian')
    expect(text(r.container)).not.toContain('Later')
    await r.unmount()
    const up = await render(<TaskListView route={{ view: 'upcoming' }} />)
    await waitFor(() => text(up.container).includes('Book flights'))
    expect(text(up.container)).toContain('Starts 21 Oct')
    expect(text(up.container)).not.toContain('Learn Italian')
    await up.unmount()
    const side = await render(<Sidebar route={{ view: 'inbox' }} user={{ id: 'u1', email: 'u@example.com', name: 'U', role: 'owner' } as never} />)
    const inbox = () => [...side.container.querySelectorAll('a, button')].find((a) => text(a as HTMLElement).startsWith('Inbox')) as HTMLElement | undefined
    await waitFor(() => !!inbox() && inbox()!.querySelector('[data-count]')?.textContent === '1')
  })
})

describe('Someday and Anytime views (3.1)', () => {
  it('Someday lists parked tasks by project; capturing there parks the task', async () => {
    await createTask({ title: 'Learn Italian', start: 'someday' })
    await createTask({ title: 'Buy milk' })
    const r = await render(<TaskListView route={{ view: 'someday' }} />)
    await waitFor(() => text(r.container).includes('Learn Italian'))
    expect(text(r.container)).not.toContain('Buy milk')
    const quick = r.container.querySelector('input[aria-label="Add a task"]') as HTMLInputElement
    await type(quick, 'Learn Portuguese')
    await act(async () => { quick.form!.requestSubmit() })
    await waitFor(() => text(r.container).includes('Learn Portuguese'))
    const added = (await db.tasks.toArray()).find((t) => t.title === 'Learn Portuguese')!
    expect(added).toMatchObject({ start: 'someday', project_id: null })
    await type(quick, 'Read Proust tomorrow')
    await act(async () => { quick.form!.requestSubmit() })
    await flush(100)
    const dated = (await db.tasks.toArray()).find((t) => t.title === 'Read Proust')!
    expect(dated.due).toEqual({ date: '2026-10-15' })
    expect(dated.start ?? null).toBeNull()
  })

  it('Anytime lists only undated, unstarted, active tasks and follows sync', async () => {
    const id = await createTask({ title: 'Whenever' })
    await createTask({ title: 'Later on', start: '2026-10-21' })
    await createTask({ title: 'Tomorrow', due: { date: '2026-10-15' } })
    const r = await render(<TaskListView route={{ view: 'anytime' }} />)
    await waitFor(() => text(r.container).includes('Whenever'))
    expect(text(r.container)).not.toContain('Later on')
    expect(text(r.container)).not.toMatch(/Tomorrow(?!…)/)
    await applyOps([{ id: 'x', entity: 'task', entityId: id, field: 'due', value: { date: '2026-10-20' }, ts: Date.now() * 2, device: 'other' }])
    await waitFor(() => !text(r.container).includes('Whenever'))
    expect((await db.tasks.get(id))?.due).toEqual({ date: '2026-10-20' })
  })
})

describe('keys (3.3)', () => {
  it('Shift+N, a date and Enter defer the selected task; n parks and un-parks', async () => {
    setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
    // In a project, which keeps deferred and parked tasks in Later (in the Inbox they leave the list, inbox-means-unplaced).
    mockFetch(noPublicLinks)
    const home = await createProject({ name: 'Home' })
    const id = await createTask({ title: 'Renew passport', project_id: home })
    const r = await render(<><TaskListView route={{ view: 'project', id: home }} /><PanelHost /></>)
    await waitFor(() => text(r.container).includes('Renew passport'))
    await key(document.body, 'j')
    await key(document.body, 'N', { shiftKey: true })
    await waitFor(() => document.activeElement instanceof HTMLInputElement && !!document.activeElement.closest('[data-facet-editor] [data-when-segment="start"]'))
    const input = document.activeElement as HTMLInputElement
    await type(input, '21/10')
    await key(input, 'Enter')
    await waitFor(async () => (await db.tasks.get(id))!.start === '2026-10-21', 'the start date written')
    await key(input, 'Escape'); await key(document.body, 'Escape'); await key(document.body, 'Escape')
    await waitFor(() => text(r.container).includes('Starts 21 Oct'))
    await key(document.body, 'j')
    await key(document.body, 'n')
    // The next key acts on the rendered row, so wait for it to read Someday.
    const rowText = () => r.container.querySelector(`[data-task-id="${id}"]`)?.textContent ?? ''
    await waitFor(async () => (await db.tasks.get(id))!.start === 'someday' && rowText().includes('Someday'), 'the task parked')
    await key(document.body, 'n')
    await waitFor(async () => (await db.tasks.get(id))!.start === null, 'the task un-parked')
    expect(await db.tasks.get(id)).toMatchObject({ start: null, due: null })
  })

  it('Shift+E toggles evening; the keys type letters inside a text field', async () => {
    const id = await createTask({ title: 'Read', due: { date: '2026-10-14' } })
    const r = await render(<><input aria-label="Elsewhere" /><TaskListView route={{ view: 'today' }} /></>)
    await waitFor(() => text(r.container).includes('Read'))
    await key(document.body, 'j')
    await key(document.body, 'E', { shiftKey: true })
    await flush(60)
    expect((await db.tasks.get(id))!.evening).toBe(true)
    const other = r.container.querySelector('input[aria-label="Elsewhere"]') as HTMLInputElement
    other.focus()
    for (const k of ['n', 'N', 'E']) await key(other, k)
    await flush(60)
    const t = (await db.tasks.get(id))!
    expect(t.evening).toBe(true)
    expect(t.start ?? null).toBeNull()
  })
})

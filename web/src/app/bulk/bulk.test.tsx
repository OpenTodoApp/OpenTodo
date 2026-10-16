// @vitest-environment happy-dom
// Bulk selection, bar, Actions menu and undo toast in a list (OpenSpec change
// bulk-edit, tasks 2.1, 2.3, 2.4, 2.5, 3.3, 4.2 and 5.1).
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { createLabel } from '../../lib/labels'
import { createProject, createTask, resetDeviceId, updateTask } from '../../lib/ops'
import { flush, key, render } from '../../ui/test-utils'
import { PanelHost } from '../PanelHost'
import { resetPanel } from '../panel'
import { TaskListView } from '../TaskListView'
import { hideBulkToast } from './toastStore'
import { UndoToast } from './UndoToast'

let n = 0
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  useDatabase(`bulk-ui-${Date.now()}-${n++}`)
  resetDeviceId()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'MD', hour12: true, weekStart: 1 })
})
const mounted: { unmount: () => Promise<void> }[] = []
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount()
  vi.useRealTimers()
  hideBulkToast()
  resetPanel()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const tickedTitles = () => [...document.querySelectorAll('[data-ticked] [data-tick]')].map((e) => e.getAttribute('aria-label')!.replace('Select ', ''))
const bar = () => document.querySelector('[data-selection-bar] [role="status"]')?.textContent ?? null

async function inbox(...titles: string[]) {
  const ids: string[] = []
  for (const t of titles) ids.push(await createTask({ title: t }))
  const r = await render(<><TaskListView route={{ view: 'inbox' }} /><PanelHost /><UndoToast /></>)
  mounted.push(r)
  await waitFor(() => document.body.textContent!.includes(titles[titles.length - 1]))
  return { r, ids }
}

describe('ticking from the keyboard (2.1, 2.4)', () => {
  it('x then Shift+ArrowDown twice ticks three rows; the bar counts them; Escape clears', async () => {
    await inbox('One', 'Two', 'Three', 'Four')
    await key(document.body, 'j')
    await key(document.body, 'x')
    await waitFor(() => bar() === '1 selected')
    await key(document.body, 'ArrowDown', { shiftKey: true })
    await key(document.body, 'ArrowDown', { shiftKey: true })
    await waitFor(() => bar() === '3 selected')
    expect(tickedTitles()).toEqual(['One', 'Two', 'Three'])
    await key(document.body, 'Escape')
    await waitFor(() => bar() === null)
  })

  it('Space with no cursor and Ctrl+A with nothing ticked fall through to the browser', async () => {
    await inbox('One', 'Two')
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    await act(async () => { document.body.dispatchEvent(space) })
    expect(space.defaultPrevented).toBe(false)
    const all = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true })
    await act(async () => { document.body.dispatchEvent(all) })
    expect(all.defaultPrevented).toBe(false)
    await key(document.body, 'j')
    await key(document.body, ' ')
    await key(document.body, 'a', { ctrlKey: true })
    await waitFor(() => bar() === '2 selected')
  })

  it('Escape closes the panel first, then clears the ticks', async () => {
    await inbox('One', 'Two')
    await key(document.body, 'j')
    await key(document.body, 'x')
    await key(document.body, 'Enter')
    await waitFor(() => !!document.querySelector('aside[data-detail-for]'))
    await key(document.body, 'Escape')
    await waitFor(() => !document.querySelector('aside[data-detail-for]'))
    expect(bar()).toBe('1 selected')
    await key(document.body, 'Escape')
    await waitFor(() => bar() === null)
  })
})

describe('ticking with the pointer (2.3)', () => {
  it('Shift+click ticks a range and opens nothing; the checkbox passes axe', async () => {
    await inbox('One', 'Two', 'Three')
    const box = (title: string) => document.querySelector(`[data-tick][aria-label="Select ${title}"]`) as HTMLInputElement
    await act(async () => { box('One').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) })
    await act(async () => { box('Three').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true })) })
    await waitFor(() => bar() === '3 selected')
    expect(document.querySelector('aside[data-detail-for]')).toBeNull()
    const axe = (await import('axe-core')).default
    const res = await axe.run(document.querySelector('ul, [role="list"]') ?? document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(res.violations.filter((v) => v.id !== 'region').map((v) => v.id)).toEqual([])
  })
})

describe('actions (2.5, 3.3, 4.2)', () => {
  it('c on three ticked rows completes them in one batch, and Undo restores them', async () => {
    const { ids } = await inbox('One', 'Two', 'Three')
    await key(document.body, 'j'); await key(document.body, 'x')
    await key(document.body, 'ArrowDown', { shiftKey: true }); await key(document.body, 'ArrowDown', { shiftKey: true })
    await db.outbox.clear()
    await key(document.body, 'c')
    await waitFor(() => !!document.querySelector('[data-bulk-toast]'))
    expect(document.querySelector('[data-bulk-toast]')!.textContent).toContain('3 tasks completed')
    expect(new Set((await db.outbox.toArray()).map((o) => o.ts)).size).toBe(1)
    await act(async () => { (document.querySelector('[data-bulk-toast] button') as HTMLButtonElement).click() })
    await waitFor(() => document.querySelector('[data-bulk-toast]')!.textContent!.includes('Undone: 3 restored'))
    for (const id of ids) expect((await db.tasks.get(id))!.completed_at).toBeNull()
  })

  it('`.` with four ticked opens a menu titled "4 tasks"; two projects disable Assign with the reason', async () => {
    const a = await createProject({ name: 'A' })
    await createTask({ title: 'In A', project_id: a })
    await inbox('One', 'Two', 'Three', 'Four')
    await key(document.body, 'j'); await key(document.body, 'x')
    for (let i = 0; i < 3; i++) await key(document.body, 'ArrowDown', { shiftKey: true })
    await key(document.body, '.')
    await waitFor(() => document.querySelectorAll('[role="menuitem"]').length > 0)
    expect(document.querySelector('[aria-label="Actions for 4 tasks"]')!.getAttribute('aria-expanded')).toBe('true')
    const assign = [...document.querySelectorAll('[role="menuitem"]')].find((m) => m.textContent?.includes('Assign'))!
    expect((assign as HTMLButtonElement).disabled).toBe(true)
    expect(document.body.textContent).toContain('Tasks must be in one shared project')
  })

  it('Date → Tomorrow reschedules the ticked tasks', async () => {
    const { ids } = await inbox('One', 'Two', 'Three')
    await key(document.body, 'j'); await key(document.body, 'x')
    await key(document.body, 'ArrowDown', { shiftKey: true }); await key(document.body, 'ArrowDown', { shiftKey: true })
    await key(document.body, '.')
    await waitFor(() => document.querySelectorAll('[role="menuitem"]').length > 0)
    await act(async () => { ([...document.querySelectorAll('[role="menuitem"]')].find((m) => m.textContent?.startsWith('Tomorrow')) as HTMLElement).click() })
    await waitFor(() => !!document.querySelector('[data-bulk-toast]'))
    for (const id of ids) expect((await db.tasks.get(id))!.due).toEqual({ date: '2026-10-15' })
  })

  it('L then "errand" adds it to the tasks lacking it and the picker stays open', async () => {
    const l = await createLabel({ name: 'errand' })
    const { ids } = await inbox('One', 'Two', 'Three')
    await updateTask(ids[0], { labels: [l] })
    await key(document.body, 'j'); await key(document.body, 'x')
    await key(document.body, 'ArrowDown', { shiftKey: true }); await key(document.body, 'ArrowDown', { shiftKey: true })
    await key(document.body, 'L', { shiftKey: true })
    await waitFor(() => !!document.querySelector('[data-picker-step]'))
    await act(async () => { ([...document.querySelectorAll('[data-picker-step] [role="option"]')].find((o) => o.textContent?.includes('errand')) as HTMLElement).click() })
    await waitFor(() => !!document.querySelector('[data-bulk-toast]'))
    for (const id of ids) expect((await db.tasks.get(id))!.labels).toEqual([l])
    expect(document.querySelector('[data-picker-step]')).not.toBeNull()
  })

  it('Ctrl+Z undoes outside text fields, never inside a textarea', async () => {
    const { ids } = await inbox('One', 'Two')
    await key(document.body, 'j'); await key(document.body, 'x')
    await key(document.body, '1')
    await waitFor(() => !!document.querySelector('[data-bulk-toast]'))
    const ta = document.createElement('textarea')
    document.body.append(ta)
    const inField = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
    await act(async () => { ta.dispatchEvent(inField) })
    expect(inField.defaultPrevented).toBe(false)
    expect((await db.tasks.get(ids[0]))!.priority).toBe(1)
    await key(document.body, 'z', { ctrlKey: true })
    await waitFor(() => document.querySelector('[data-bulk-toast]')!.textContent!.includes('Undone'))
    expect((await db.tasks.get(ids[0]))!.priority).toBe(4)
  })
})

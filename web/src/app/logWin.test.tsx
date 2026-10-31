// @vitest-environment happy-dom
// Log a win (OpenSpec change today-closed-list, task 3.4): quick add's "Log as done"
// refuses recurrence and reminder phrases with a note, and the win is created
// completed now by the user in one batch, listed among today's completions.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { completedOn } from '../lib/dayLists'
import { resetDeviceId } from '../lib/ops'
import { render, type, waitFor } from '../ui/test-utils'
import { AddPanel } from './palette/BarParts'
import { logWinFromBar } from './palette/addFromBar'
import { QuickAdd } from './QuickAdd'

let n = 0
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 30, 12, 0))
  useDatabase(`log-win-${Date.now()}-${n++}`)
  resetDeviceId()
  await db.meta.put({ key: 'userId', value: 'u-ana' })
})
afterEach(() => { vi.useRealTimers() })

const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)

describe('Log as done', () => {
  it('a recurrence or reminder phrase is refused with a note and stays in the title', async () => {
    const onAdd = vi.fn()
    const r = await render(<QuickAdd layout="palette" placeholder="What did you get done?" label="Log a win" logDone onAdd={onAdd} escape={{ label: 'Close', run: () => {} }} />)
    const input = q<HTMLInputElement>('input[aria-label="Log a win"]')!
    await type(input, 'Water the plants every day')
    expect(q('[data-win-refused]')!.textContent).toContain('A win does not repeat or remind')
    await act(async () => { input.form!.requestSubmit() })
    await waitFor(() => onAdd.mock.calls.length > 0, 'the win added')
    expect(onAdd.mock.calls[0][0].title).toBe('Water the plants every day')
    expect(onAdd.mock.calls[0][0].recurrence).toBeUndefined()
    await r.unmount()
  })

  it('the bar opened by Log a win shows the switch, on', async () => {
    const onLog = vi.fn(async () => {})
    const r = await render(<AddPanel onAdd={async () => {}} onAddAndOpen={async () => {}} escape={{ label: 'Close', run: () => {} }} win={{ onLog }} />)
    expect(q('[data-bar-add]')!.hasAttribute('data-log-done')).toBe(true)
    expect(q('#log-done-switch')!.getAttribute('aria-checked')).toBe('true')
    await r.unmount()
  })
})

describe('the win', () => {
  it('is created completed now by the user, in one batch, and counts as done today', async () => {
    const id = await logWinFromBar({ title: 'Helped Ana with the release', recurrence: 'every day' }, { view: 'today' })
    const task = await db.tasks.get(id)
    expect(task?.completed_at).toBe(Date.now())
    expect(task?.completed_by).toBe('u-ana')
    expect(task?.recurrence ?? null).toBeNull()
    // No "due today" default from the Today screen: only a typed date sets one.
    expect(task?.due).toBeNull()
    const ops = (await db.outbox.toArray()).filter((o) => o.entityId === id)
    expect(ops.map((o) => o.field)).toEqual(expect.arrayContaining(['title', 'created_at', 'completed_at', 'completed_by']))
    expect(completedOn(await db.tasks.toArray(), '2026-10-30').map((t) => t.id)).toEqual([id])
  })
})

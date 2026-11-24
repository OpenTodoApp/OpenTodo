// @vitest-environment happy-dom
// A calendar in quick add on the web (OpenSpec change quick-add-calendar, issue #1964):
// the palette's When row and the line's calendar button open the phone sheet's date
// picker; a pick writes the date into the line as words, as on the phone.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDaysISO, todayISO } from '../lib/dates'
import { db, useDatabase } from '../lib/db'
import { saveQuickAddSettings } from '../lib/nlp/settings'
import { resetDeviceId } from '../lib/ops'
import { click, key, render, type, waitFor } from '../ui/test-utils'
import { QuickAdd } from './QuickAdd'

let n = 0
beforeEach(async () => {
  useDatabase(`quick-add-calendar-${Date.now()}-${n++}`)
  resetDeviceId()
  await db.meta.put({ key: 'userId', value: 'u-ana' })
  saveQuickAddSettings({ enabled: true, languages: null })
})
afterEach(() => { saveQuickAddSettings({ enabled: true, languages: null }) })

const q = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const field = () => q<HTMLTextAreaElement>('textarea[aria-label="Add a task"]')!

describe('the calendar in quick add on the web', () => {
  it('the palette: the When row opens the picker, a pick writes tomorrow into the line, the field keeps focus', async () => {
    const r = await render(<QuickAdd layout="palette" placeholder="Add a task" onAdd={vi.fn()} escape={{ label: 'Close', run: () => {} }} />)
    await type(field(), 'Call the plumber')
    expect(q('[data-line-date-picker]')).toBeNull()
    await click(q('[data-field-row="when"]')!)
    await waitFor(() => !!q('[data-line-date-picker]'), 'the picker')
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    q('[data-choice="tomorrow"]')!.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    await click(q('[data-choice="tomorrow"]')!)
    await waitFor(() => field().value === 'Call the plumber tomorrow', 'the date in the line')
    await waitFor(() => q('[data-field-row="when"]')!.hasAttribute('data-set'), 'the When row set')
    await waitFor(() => document.activeElement === field(), 'the field focused')
    // A typed date still works, and the picker follows it.
    expect(q('[data-choice="tomorrow"]')!.getAttribute('aria-checked')).toBe('true')
    await r.unmount()
  })

  it('a list: the calendar button opens the picker, a day from the month is written and saved', async () => {
    const onAdd = vi.fn()
    const r = await render(<QuickAdd layout="line" placeholder="Add a task" onAdd={onAdd} />)
    await type(field(), 'Call the plumber')
    const button = () => q<HTMLButtonElement>('[data-quick-add-calendar]')!
    expect(button().getAttribute('aria-expanded')).toBe('false')
    await click(button())
    await waitFor(() => !!q('[data-line-date-picker]'), 'the picker')
    expect(button().getAttribute('aria-expanded')).toBe('true')
    const later = addDaysISO(todayISO(), 3)
    await click(q(`[data-line-date-picker] [data-date="${later}"]`)!)
    await waitFor(() => field().value.startsWith('Call the plumber ') && field().value !== 'Call the plumber ', 'the date in the line')
    await act(async () => { field().form!.requestSubmit() })
    await waitFor(() => onAdd.mock.calls.length > 0, 'the task added')
    expect(onAdd.mock.calls[0][0].title).toBe('Call the plumber')
    expect(onAdd.mock.calls[0][0].due).toEqual({ date: later })
    await waitFor(() => !q('[data-line-date-picker]'), 'the picker closed with the emptied line')
    await r.unmount()
  })

  it('the palette: Tab on the highlighted When row opens it; Clear removes the date; Escape closes only the picker', async () => {
    const escape = vi.fn()
    const r = await render(<QuickAdd layout="palette" placeholder="Add a task" onAdd={vi.fn()} escape={{ label: 'Close', run: escape }} />)
    await type(field(), 'Call the plumber tomorrow')
    await key(field(), 'ArrowDown')
    await key(field(), 'Tab')
    await waitFor(() => !!q('[data-line-date-picker]'), 'the picker')
    await click(q('[data-line-date-clear]')!)
    await waitFor(() => field().value === 'Call the plumber', 'the date removed')
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    const bubbled = vi.fn()
    document.addEventListener('keydown', bubbled)
    await act(async () => { field().dispatchEvent(esc) })
    document.removeEventListener('keydown', bubbled)
    await waitFor(() => !q('[data-line-date-picker]'), 'the picker closed')
    expect(bubbled).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(field())
    await r.unmount()
  })

  it('a someday or this-week When row is replaced by the picked day, not kept in the title', async () => {
    const onAdd = vi.fn()
    const r = await render(<QuickAdd layout="palette" placeholder="Add a task" onAdd={onAdd} escape={{ label: 'Close', run: () => {} }} />)
    await type(field(), 'Call the plumber someday')
    await click(q('[data-field-row="when"]')!)
    await waitFor(() => !!q('[data-line-date-picker]'), 'the picker')
    await click(q('[data-choice="tomorrow"]')!)
    await waitFor(() => field().value === 'Call the plumber tomorrow', 'someday replaced')
    await act(async () => { field().form!.requestSubmit() })
    await waitFor(() => onAdd.mock.calls.length > 0, 'the task added')
    expect(onAdd.mock.calls[0][0].title).toBe('Call the plumber')
    await r.unmount()
  })

  it('a pick on an empty line leaves the caret in front of the date, for the title', async () => {
    const r = await render(<QuickAdd layout="line" placeholder="Add a task" onAdd={vi.fn()} />)
    await click(q('[data-quick-add-calendar]')!)
    await waitFor(() => !!q('[data-line-date-picker]'), 'the picker')
    await click(q('[data-choice="tomorrow"]')!)
    await waitFor(() => field().value === 'tomorrow' && field().selectionStart === 0, 'the caret in front')
    // Escape on the line closes the picker too.
    await key(field(), 'Escape')
    await waitFor(() => !q('[data-line-date-picker]'), 'the picker closed')
    await r.unmount()
  })

  it('recognition off: no calendar button, and the palette When row opens nothing', async () => {
    saveQuickAddSettings({ enabled: false, languages: null })
    const r = await render(<QuickAdd layout="line" placeholder="Add a task" onAdd={vi.fn()} />)
    await type(field(), 'Call the plumber')
    expect(q('[data-quick-add-calendar]')).toBeNull()
    await r.unmount()
    const p = await render(<QuickAdd layout="palette" placeholder="Add a task" onAdd={vi.fn()} escape={{ label: 'Close', run: () => {} }} />)
    await type(field(), 'Call the plumber')
    const row = q('[data-field-row="when"]')
    if (row) await click(row)
    expect(q('[data-line-date-picker]')).toBeNull()
    await p.unmount()
  })
})

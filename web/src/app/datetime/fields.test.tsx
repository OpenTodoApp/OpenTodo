// @vitest-environment happy-dom
// Date and time fields (date-time-preferences 3.2, 3.3): typed input in the user's
// format, the keyboard-operable calendar and the quarter-hour suggestions.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setDateTime } from '../../lib/dates'
import { flush, key, render, type } from '../../ui/test-utils'
import { CalendarGrid, DateField } from './DateField'
import { TimeField } from './TimeField'

const SYS = { order: 'MD' as const, hour12: true, weekStart: 1 }
const dm24 = () => setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, SYS)
afterEach(() => { setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' }) })

const textInput = (c: HTMLElement) => c.querySelector('input') as HTMLInputElement
const grid = () => document.querySelector('[role="grid"]') as HTMLElement | null

describe('DateField', () => {
  it('shows the value in the user format and writes a typed day-month date', async () => {
    dm24()
    const onChange = vi.fn()
    const { container, unmount } = await render(<DateField label="Due date" value="2026-10-14" onChange={onChange} />)
    expect(textInput(container).value).toBe('14/10/2026')
    await type(textInput(container), '2026-11-03')
    await key(textInput(container), 'Enter')
    expect(onChange).toHaveBeenCalledWith('2026-11-03')
    await unmount()
  })

  it('rejects an invalid date with a visible message and keeps the value', async () => {
    dm24()
    const onChange = vi.fn()
    const { container, unmount } = await render(<DateField label="Due date" value="2026-10-14" onChange={onChange} />)
    await type(textInput(container), '31/02')
    await key(textInput(container), 'Enter')
    expect(onChange).not.toHaveBeenCalled()
    const input = textInput(container)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const msg = document.getElementById(input.getAttribute('aria-describedby')!.split(' ').pop()!)
    expect(msg?.textContent).toMatch(/Not a valid date/)
    await unmount()
  })

  it('picks by keyboard: open on 14 Oct, Right, Right, Enter → 16 Oct and closed', async () => {
    dm24()
    const onChange = vi.fn()
    const { container, unmount } = await render(<DateField label="Due date" value="2026-10-14" onChange={onChange} />)
    await key(textInput(container), 'ArrowDown', { altKey: true })
    await flush(20)
    expect(grid()).not.toBeNull()
    const focused = () => document.activeElement as HTMLElement
    expect(focused().dataset.date).toBe('2026-10-14')
    await key(focused(), 'ArrowRight')
    await key(focused(), 'ArrowRight')
    expect(focused().dataset.date).toBe('2026-10-16')
    await key(focused(), 'Enter')
    await flush(20)
    expect(onChange).toHaveBeenCalledWith('2026-10-16')
    expect(grid()).toBeNull()
    await unmount()
  })
})

describe('CalendarGrid', () => {
  const r = (week: 'sun' | 'mon') => setDateTime({ date_format: 'day-month', time_format: '24h', week_start: week }, SYS)
  it('starts weeks on the preferred day and marks today and the selection', async () => {
    const { container, unmount } = await render(<CalendarGrid value="2026-10-16" prefs={r('sun')} today="2026-10-14" onPick={() => {}} />)
    expect(container.querySelector('[role="grid"]')?.getAttribute('aria-labelledby')).toBeTruthy()
    const firstRow = [...container.querySelectorAll('tbody tr')][0].querySelectorAll('button')
    expect(firstRow[0].dataset.date).toBe('2026-09-27') // a Sunday
    expect(container.querySelector('[aria-current="date"]')?.getAttribute('data-date')).toBe('2026-10-14')
    expect(container.querySelector('[aria-selected="true"] button')?.getAttribute('data-date')).toBe('2026-10-16')
    expect([...container.querySelectorAll('[role="gridcell"]')].length).toBe(42)
    await unmount()
  })
  it('moves by week, month and to the week edges', async () => {
    const { container, unmount } = await render(<CalendarGrid value="2026-10-14" prefs={r('mon')} today="2026-10-14" onPick={() => {}} />)
    const cell = (iso: string) => container.querySelector(`[data-date="${iso}"]`) as HTMLElement
    const at = () => (document.activeElement as HTMLElement).dataset.date
    cell('2026-10-14').focus()
    await key(cell('2026-10-14'), 'ArrowDown')
    expect(at()).toBe('2026-10-21')
    await key(document.activeElement!, 'Home')
    expect(at()).toBe('2026-10-19') // Monday
    await key(document.activeElement!, 'End')
    expect(at()).toBe('2026-10-25')
    await key(document.activeElement!, 'PageDown')
    expect(at()).toBe('2026-11-25')
    await key(document.activeElement!, 'PageUp')
    await key(document.activeElement!, 'ArrowUp')
    expect(at()).toBe('2026-10-18')
    await unmount()
  })
})

describe('TimeField', () => {
  const field = async (value: string | null) => {
    dm24()
    const onChange = vi.fn()
    const view = await render(<TimeField label="Due time" value={value} onChange={onChange} />)
    return { ...view, onChange, input: textInput(view.container) }
  }
  it('reads 1530 and 3:30 pm whatever the format', async () => {
    const { input, onChange, unmount } = await field(null)
    await type(input, '1530')
    await key(input, 'Enter')
    expect(onChange).toHaveBeenLastCalledWith('15:30')
    await type(input, '3:30 pm')
    await key(input, 'Enter')
    expect(onChange).toHaveBeenLastCalledWith('15:30')
    expect(input.value).toBe('15:30')
    await type(input, '3pm')
    await key(input, 'Enter')
    expect(onChange).toHaveBeenLastCalledWith('15:00')
    await unmount()
  })
  it('picks a quarter hour with the arrows', async () => {
    const { input, onChange, unmount } = await field('09:00')
    expect(input.value).toBe('09:00')
    await key(input, 'ArrowDown')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(input.getAttribute('aria-activedescendant')!)?.textContent).toBe('09:00')
    await key(input, 'ArrowDown')
    await key(input, 'ArrowDown')
    expect(document.getElementById(input.getAttribute('aria-activedescendant')!)?.textContent).toBe('09:30')
    await key(input, 'Enter')
    expect(onChange).toHaveBeenCalledWith('09:30')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    await unmount()
  })
  it('rejects nonsense with a message', async () => {
    const { input, onChange, unmount } = await field('09:00')
    await type(input, '25:99')
    await key(input, 'Enter')
    expect(onChange).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    await unmount()
  })
})

describe('accessibility (axe-core in happy-dom)', () => {
  it('the open calendar and the date field have no serious violations', async () => {
    dm24()
    const axe = (await import('axe-core')).default
    const { container, unmount } = await render(<DateField label="Due date" value="2026-10-14" onChange={() => {}} />)
    await key(textInput(container), 'ArrowDown', { altKey: true })
    await flush(20)
    // Colour contrast needs layout and computed colours that happy-dom does not provide.
    const res = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
    expect(res.passes.some((p) => p.id === 'aria-required-children')).toBe(true) // the grid was checked
    const serious = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
    await unmount()
  })
})

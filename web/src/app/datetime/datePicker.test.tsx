// @vitest-environment happy-dom
// The When popover's date picker (OpenSpec change task-panel-polish, web-app "Do on
// segment", design D2): quick choices with their dates, the date in words, a typed
// phrase previewed before Enter, and the calendar always visible.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { quickChoices, setDateTime } from '../../lib/dates'
import { click, flush, key, render, type } from '../../ui/test-utils'
import { DatePicker } from './DatePicker'

const SYS = { order: 'DM', hour12: false, weekStart: 1 } as const
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 21, 12, 0))
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, SYS)
})
afterEach(() => {
  vi.useRealTimers()
  setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' })
  document.body.innerHTML = ''
})

const field = (root: ParentNode) => root.querySelector<HTMLInputElement>('[data-date-words]')!

describe('DatePicker', () => {
  it('a quick choice sets its date in one click and shows the date it means', async () => {
    const onChange = vi.fn()
    const r = await render(<DatePicker label="Due date" value={null} choices={quickChoices('due')} onChange={onChange} />)
    const tomorrow = r.container.querySelector('[data-choice="tomorrow"]')!
    expect(tomorrow.textContent).toContain('22 Oct')
    expect(r.container.querySelector('[data-choice="none"]')!.getAttribute('aria-checked')).toBe('true')
    await click(tomorrow)
    expect(onChange).toHaveBeenCalledWith('2026-10-22')
    await r.unmount()
  })

  it('shows the date in words, never 10/22/2026', async () => {
    const r = await render(<DatePicker label="Due date" value="2026-10-22" choices={quickChoices('due')} onChange={() => {}} />)
    expect(field(r.container).value).toBe('Thu 22 Oct')
    expect(r.container.querySelector('[data-choice="tomorrow"]')!.getAttribute('aria-checked')).toBe('true')
    expect(r.container.querySelector('[role="grid"]')).toBeTruthy()
    await r.unmount()
  })

  it('the placeholder example follows the date format: month-day shows 10/22/2026, never 22/10 (ux-feedback-2)', async () => {
    setDateTime({ date_format: 'month-day', time_format: '12h', week_start: 'sun' }, SYS)
    const r = await render(<DatePicker label="Due date" value={null} choices={quickChoices('due')} onChange={() => {}} />)
    expect(field(r.container).placeholder).toContain('10/22/2026')
    expect(field(r.container).placeholder).not.toContain('22/10')
    await r.unmount()
  })

  it('previews a typed phrase before Enter, then sets it', async () => {
    const onChange = vi.fn()
    const r = await render(<DatePicker label="Due date" value={null} choices={quickChoices('due')} onChange={onChange} />)
    field(r.container).focus()
    await type(field(r.container), 'fri')
    await flush()
    expect(r.container.querySelector('[data-date-preview]')!.textContent).toContain('Fri 23 Oct')
    expect(onChange).not.toHaveBeenCalled()
    await key(field(r.container), 'Enter')
    expect(onChange).toHaveBeenCalledWith('2026-10-23')
    await r.unmount()
  })

  it('refuses a date the caller does not allow, with its message, and writes nothing', async () => {
    const onChange = vi.fn()
    const r = await render(<DatePicker label="Start date" value={null} choices={quickChoices('start')} onChange={onChange}
      validate={(iso) => (iso > '2026-10-25' ? 'The start must be on or before the due date.' : null)} />)
    field(r.container).focus()
    await type(field(r.container), '2026-10-30')
    await key(field(r.container), 'Enter')
    expect(r.container.querySelector('[role="alert"]')!.textContent).toContain('on or before')
    expect(onChange).not.toHaveBeenCalled()
    await r.unmount()
  })

  it('a day picked in the calendar commits', async () => {
    const onChange = vi.fn()
    const r = await render(<DatePicker label="Deadline" value={null} choices={quickChoices('deadline')} onChange={onChange} />)
    await click(r.container.querySelector('[data-date="2026-10-28"]')!)
    expect(onChange).toHaveBeenCalledWith('2026-10-28')
    await r.unmount()
  })
})

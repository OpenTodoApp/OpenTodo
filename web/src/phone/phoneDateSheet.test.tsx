// @vitest-environment happy-dom
// The date sheet's panel (OpenSpec change phone-ui-trial, "Phone date sheet"): quick
// choices, a month of 44 px days that starts on the person's first day of the week,
// and the month one tap away.
import { describe, expect, it, vi } from 'vitest'
import { click, render } from '../ui/test-utils'
import { PhoneDatePanel, type DateChoice } from './components/PhoneDateSheet'

const choices: DateChoice[] = [
  { id: 'today', label: 'Today', icon: 'sun', hint: 'Wed 14 Oct', date: '2026-10-14' },
  { id: 'tomorrow', label: 'Tomorrow', icon: 'sunrise', hint: 'Thu 15 Oct', date: '2026-10-15' },
  { id: 'someday', label: 'Someday', icon: 'moon', hint: '', date: 'someday' },
]
const month = (anchor: string) => anchor.slice(0, 7)
const days = () => [...document.querySelectorAll<HTMLElement>('[data-date-day]')].map((el) => el.dataset.dateDay!)

async function panel(props: Partial<Parameters<typeof PhoneDatePanel>[0]> = {}) {
  const onPick = vi.fn()
  const r = await render(<PhoneDatePanel value={null} today="2026-10-14" choices={choices} weekStart={1} weekdays={['M', 'T', 'W', 'T', 'F', 'S', 'S']} monthName={month} onPick={onPick} {...props} />)
  return { onPick, r }
}

describe('the date panel', () => {
  it('a quick choice and a day both pick, Someday too', async () => {
    const { onPick, r } = await panel()
    await click(document.querySelector('[data-date-choice="tomorrow"]')!)
    await click(document.querySelector('[data-date-day="2026-10-20"]')!)
    await click(document.querySelector('[data-date-choice="someday"]')!)
    expect(onPick.mock.calls.map((c) => c[0])).toEqual(['2026-10-15', '2026-10-20', 'someday'])
    await r.unmount()
  })

  it('shows only the weeks of the month, starting on the first day of the week', async () => {
    // October 2026 from Monday: 28 Sep to 1 Nov, five weeks.
    const a = await panel()
    expect(days()).toHaveLength(35)
    expect(days()[0]).toBe('2026-09-28')
    await a.r.unmount()
    // From Sunday: 27 Sep to 31 Oct, five weeks.
    const b = await panel({ weekStart: 0 })
    expect(days()[0]).toBe('2026-09-27')
    expect(days()).toHaveLength(35)
    await b.r.unmount()
    // August 2026 from Monday needs six.
    const c = await panel({ value: '2026-08-31' })
    expect(days()).toHaveLength(42)
    await c.r.unmount()
  })

  it('marks today and the chosen day, and every day is a 44 px target', async () => {
    const { r } = await panel({ value: '2026-10-15' })
    expect(document.querySelector('[data-date-day="2026-10-14"]')!.getAttribute('aria-current')).toBe('date')
    expect(document.querySelector('[data-date-day="2026-10-15"]')!.getAttribute('aria-selected')).toBe('true')
    expect(document.querySelector('[data-date-choice="tomorrow"]')!.getAttribute('aria-pressed')).toBe('true')
    for (const el of document.querySelectorAll('[data-date-day]')) expect(el.className).toContain('h-11')
    for (const el of document.querySelectorAll('[data-date-choice]')) expect(el.className).toContain('min-h-12')
    await r.unmount()
  })

  it('opens on the chosen day\'s month and steps a month at a time', async () => {
    const { r } = await panel({ value: '2026-12-24' })
    expect(document.querySelector('[data-date-month]')!.getAttribute('data-date-month')).toBe('2026-12')
    await click(document.querySelector('[data-date-next]')!)
    expect(document.querySelector('[data-date-month]')!.getAttribute('data-date-month')).toBe('2027-01')
    await click(document.querySelector('[data-date-prev]')!)
    await click(document.querySelector('[data-date-prev]')!)
    expect(document.querySelector('[data-date-month]')!.getAttribute('data-date-month')).toBe('2026-11')
    await r.unmount()
  })
})

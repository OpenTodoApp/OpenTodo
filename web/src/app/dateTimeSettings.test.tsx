// @vitest-environment happy-dom
// Settings → Preferences → Date and time (date-time-preferences 6.1).
import 'fake-indexeddb/auto'
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { resolveDateTime, setDateTime, setDayStart } from '../lib/dates'
import { resetDeviceId } from '../lib/ops'
import { render } from '../ui/test-utils'
import { DateTimeSection, DateTimeView } from './DateTimeSettings'
import { DateTimePrefsProvider, useDateTimeFormat } from './DateTimePrefsProvider'
import { useToday } from './useViews'

/** The card's markup without its Learn more link, the one help link a card may carry (settings-copy D3). */
const withoutLearnMore = (html: string) => html.replace(/<button[^>]*data-learn-more[^>]*>Learn more<\/button>/g, '')


const SYSTEM = { date_format: 'system', time_format: 'system', week_start: 'system' } as const
const sys = { order: 'MD' as const, hour12: false, weekStart: 1 }
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 20)) })

/** Another screen showing a due time, to prove open views follow without a reload. */
function OpenList() {
  const f = useDateTimeFormat()
  return <p data-testid="open-list">Due {f.formatTime('15:00')}</p>
}

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/** Another screen that asks which day it is. */
function TodayProbe() {
  return <p data-testid="today-probe">{useToday()}</p>
}

let n = 0
beforeEach(() => {
  useDatabase(`dtsettings-${Date.now()}-${n++}`)
  resetDeviceId()
})
afterEach(() => { setDateTime(SYSTEM); setDayStart(0) })

describe('DateTimeView', () => {
  it('labels each option with today in that format, has a Help link and the three selects', () => {
    const html = renderToStaticMarkup(<DateTimeView prefs={SYSTEM} resolved={resolveDateTime(SYSTEM, sys)} onChange={() => {}} today="2026-10-14" />)
    expect(html).toContain('Date and time')
    expect(withoutLearnMore(html)).not.toContain('data-help-screen')
    expect(html).toContain('Day-month (14/10/2026)')
    expect(html).toContain('Month-day (10/14/2026)')
    expect(html).toContain('ISO (2026-10-14)')
    expect(html).toContain('12-hour (3:00 PM)')
    expect(html).toContain('24-hour (15:00)')
    expect(html).toMatch(/<option value="sun">Sunday<\/option>/)
  })

  it('starts the preview week on the chosen day and marks today', () => {
    const sunday = { ...SYSTEM, week_start: 'sun' } as const
    const html = renderToStaticMarkup(<DateTimeView prefs={sunday} resolved={resolveDateTime(sunday, sys)} onChange={() => {}} today="2026-10-14" />)
    const days = [...html.matchAll(/<span class="font-medium">(\d+)<\/span>/g)].map((m) => m[1])
    expect(days).toEqual(['11', '12', '13', '14', '15', '16', '17'])
    expect(html).toContain('aria-current="date"')
  })
})

describe('day start control (day-boundary D7)', () => {
  it('offers midnight to 06:00 in the user\'s time format, explains the rule, and names today in the preview', () => {
    const twelve = { ...SYSTEM, time_format: '12h' } as const
    const html = renderToStaticMarkup(<DateTimeView prefs={twelve} resolved={resolveDateTime(twelve, sys)} onChange={() => {}} today="2026-10-14" dayStart={240} />)
    expect(html).toContain('My day starts at')
    expect(html).toContain('Work done before this time counts for the previous day.')
    const options = [...html.matchAll(/<option value="(\d\d:\d\d)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]])
    expect(options).toEqual([
      ['00:00', 'Midnight (default)'], ['01:00', '1:00 AM'], ['02:00', '2:00 AM'], ['03:00', '3:00 AM'], ['04:00', '4:00 AM'], ['05:00', '5:00 AM'], ['06:00', '6:00 AM'],
    ])
    expect(html).toMatch(/<option value="04:00" selected="">/)
    expect(html).toContain('Wednesday, October 14')
  })

  it('shows a value with minutes from a newer client as it is', () => {
    const html = renderToStaticMarkup(<DateTimeView prefs={SYSTEM} resolved={resolveDateTime({ ...SYSTEM, time_format: '24h' }, sys)} onChange={() => {}} today="2026-10-14" dayStart={210} />)
    expect(html).toMatch(/<option value="03:30" selected="">03:30<\/option>/)
  })

  it('at 01:30 choosing 04:00 writes one op, names Wednesday in the preview, moves an open view, and passes axe', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 15, 1, 30))
    try {
      const view = await render(<DateTimePrefsProvider><DateTimeSection /><TodayProbe /></DateTimePrefsProvider>)
      await settle()
      const preview = () => view.container.querySelector('[data-testid="preview-today"]')!.textContent
      const probe = () => view.container.querySelector('[data-testid="today-probe"]')!.textContent
      expect(preview()).toMatch(/15/)
      expect(probe()).toBe('2026-10-15')
      const select = view.container.querySelector('#day-start-select') as HTMLSelectElement
      // Reachable by keyboard: a labelled native select in the tab order; arrow keys fire change events.
      expect(select.tabIndex).toBe(0)
      expect(view.container.querySelector('label[for="day-start-select"]')!.textContent).toBe('My day starts at')
      await choose(select, '04:00')
      await settle()
      expect(preview()).toMatch(/14/)
      expect(probe()).toBe('2026-10-14')
      expect((await db.userPrefs.get('me'))?.day_start).toBe('04:00')
      const ops = (await db.outbox.toArray()).filter((o) => o.entity === 'user_prefs').map((o) => [o.field, o.value])
      expect(ops).toEqual([['day_start', '04:00']])
      await choose(select, '03:00')
      await settle()
      expect(select.value).toBe('03:00')
      expect(probe()).toBe('2026-10-14')
      const axe = (await import('axe-core')).default
      const res = await axe.run(view.container, { rules: { 'color-contrast': { enabled: false } } })
      expect(res.violations.map((v) => v.id)).toEqual([])
      await view.unmount()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('DateTimeSection', () => {
  it('switching to 12h updates the preview and an open view without a reload, and writes one op', async () => {
    const view = await render(<DateTimePrefsProvider><DateTimeSection /><OpenList /></DateTimePrefsProvider>)
    await settle()
    const time = () => view.container.querySelector('[data-testid="preview-time"]')!.textContent
    const list = () => view.container.querySelector('[data-testid="open-list"]')!.textContent
    await choose(view.container.querySelector('#time-format-select') as HTMLSelectElement, '24h')
    await settle()
    expect(time()).toBe('15:00')
    await choose(view.container.querySelector('#time-format-select') as HTMLSelectElement, '12h')
    await settle()
    expect(time()).toBe('3:00 PM')
    expect(list()).toBe('Due 3:00 PM')
    expect((await db.userPrefs.get('me'))?.time_format).toBe('12h')
    const ops = (await db.outbox.toArray()).filter((o) => o.entity === 'user_prefs').map((o) => o.value)
    expect(ops).toEqual(['24h', '12h'])

    const full = () => view.container.querySelector('[data-testid="preview-full"]')!.textContent
    await choose(view.container.querySelector('#date-format-select') as HTMLSelectElement, 'month-day')
    await settle()
    const monthDay = full()
    await choose(view.container.querySelector('#date-format-select') as HTMLSelectElement, 'day-month')
    await settle()
    expect(full()).not.toBe(monthDay)
    await view.unmount()
  })
})

// @vitest-environment happy-dom
// Settings → Preferences → Date and time (date-time-preferences 6.1).
import 'fake-indexeddb/auto'
import { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { resolveDateTime, setDateTime } from '../lib/dates'
import { resetDeviceId } from '../lib/ops'
import { render } from '../ui/test-utils'
import { DateTimeSection, DateTimeView } from './DateTimeSettings'
import { DateTimePrefsProvider, useDateTimeFormat } from './DateTimePrefsProvider'

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

let n = 0
beforeEach(() => {
  useDatabase(`dtsettings-${Date.now()}-${n++}`)
  resetDeviceId()
})
afterEach(() => { setDateTime(SYSTEM) })

describe('DateTimeView', () => {
  it('labels each option with today in that format, has a Help link and the three selects', () => {
    const html = renderToStaticMarkup(<DateTimeView prefs={SYSTEM} resolved={resolveDateTime(SYSTEM, sys)} onChange={() => {}} today="2026-10-14" />)
    expect(html).toContain('Date and time')
    expect(html).toContain('data-help-screen="settings/date-time"')
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

    await choose(view.container.querySelector('#date-format-select') as HTMLSelectElement, 'iso')
    await settle()
    expect(view.container.querySelector('[data-testid="preview-numeric"]')!.textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await view.unmount()
  })
})

// @vitest-environment happy-dom
// The weekly digest card in Settings → Notifications (OpenSpec change
// stats-and-review, task 4.5): every "Digest card in Settings" scenario plus the
// offline state and the captured browser values.
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDateTime } from '../lib/dates'
import type { EmailDigest } from '../lib/types'
import { flush, render } from '../ui/test-utils'
import { browserDigestLanguage, DigestCard, digestSummary } from './DigestCard'

const base: EmailDigest = {
  available: true, encryption: false, enabled: false, weekday: 5, hour: 7, timeZone: 'UTC', language: 'en',
  nextSendAt: null, lastAttemptAt: null,
}

let puts: Record<string, unknown>[] = []
function server(get: Partial<EmailDigest> | 'offline') {
  puts = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (get === 'offline') throw new TypeError('Failed to fetch')
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body))
      puts.push(body)
      const next = { ...base, ...get, ...body, nextSendAt: body.enabled ? new Date(2026, 9, 23, 7).getTime() : null }
      return new Response(JSON.stringify(next), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({ ...base, ...get }), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
}

beforeEach(() => {
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
  const real = Intl.DateTimeFormat.prototype.resolvedOptions
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...real.call(this), timeZone: 'Europe/Zurich' }
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const summary = (root: ParentNode) => root.querySelector('[data-testid="digest-summary"]')?.textContent ?? ''
const buttonNamed = (root: ParentNode, name: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === name)!

describe('DigestCard', () => {
  it('turn on: picks Friday 07:00, captures zone and language, and reads the state with the next send', async () => {
    server({})
    const r = await render(<DigestCard />)
    await waitFor(() => summary(r.container).includes('Off'))
    await act(async () => r.container.querySelector<HTMLButtonElement>('[role="switch"]')!.click())
    // Turning on opens the day and time first.
    expect(r.container.querySelector('[data-testid="digest-editor"]')).toBeTruthy()
    expect(r.container.textContent).toContain('Time zone Europe/Zurich and language English, from this browser')
    await act(async () => buttonNamed(r.container, 'Save').click())
    await waitFor(() => summary(r.container).includes('On, Fridays at 07:00 (Europe/Zurich)'))
    expect(puts).toEqual([{ enabled: true, weekday: 5, hour: 7, timeZone: 'Europe/Zurich', language: 'en' }])
    expect(summary(r.container)).toContain('Next: Fri 23 Oct, 07:00')
    await r.unmount()
  })

  it('unavailable without outgoing email: explains and offers no switch', async () => {
    server({ available: false })
    const r = await render(<DigestCard />)
    await waitFor(() => r.container.textContent!.includes('owner has to configure first'))
    expect(r.container.querySelector('[role="switch"]')).toBeNull()
    await r.unmount()
  })

  it('encrypted account: not available because it would contain task titles', async () => {
    server({ encryption: true })
    const r = await render(<DigestCard />)
    await waitFor(() => r.container.textContent!.includes('not available for accounts with end-to-end encryption'))
    expect(r.container.textContent).toContain('task titles')
    expect(r.container.querySelector('[role="switch"]')).toBeNull()
    await r.unmount()
  })

  it('offline: says it needs a connection', async () => {
    server('offline')
    const r = await render(<DigestCard />)
    await waitFor(() => r.container.textContent!.includes('needs a connection'))
    await r.unmount()
  })

  it('shows the last outcome and turns off with the switch', async () => {
    server({ enabled: true, lastOutcome: 'sent', lastSentFor: '2026-10-16', timeZone: 'Europe/Zurich' })
    const r = await render(<DigestCard />)
    await waitFor(() => r.container.textContent!.includes('Last sent Fri 16 Oct'))
    await act(async () => r.container.querySelector<HTMLButtonElement>('[role="switch"]')!.click())
    await waitFor(() => summary(r.container).startsWith('Off'))
    expect(puts[0]).toMatchObject({ enabled: false })
    await r.unmount()
  })
})

describe('helpers', () => {
  it('language from the browser and the state line', () => {
    expect(browserDigestLanguage(['de-CH', 'en'])).toBe('de')
    expect(browserDigestLanguage(['ja', 'pt-BR'])).toBe('pt')
    expect(browserDigestLanguage(['ja'])).toBe('en')
    expect(digestSummary({ enabled: true, weekday: 0, hour: 18, timeZone: 'America/New_York' }, '18:00')).toBe('On, Sundays at 18:00 (America/New_York)')
  })
})

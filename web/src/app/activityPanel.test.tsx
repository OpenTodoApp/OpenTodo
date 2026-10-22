// @vitest-environment happy-dom
// Recent activity as a compact list (OpenSpec change settings-refresh D4; audit-log
// "Compact recent activity"): days, folded sign-ins, ten lines and Show all.
import { afterEach, describe, expect, it } from 'vitest'
import type { AuditEvent } from '../lib/types'
import { click, render } from '../ui/test-utils'
import { ActivityView } from './ActivityPanel'

const chrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const now = new Date(2026, 9, 14, 18, 0).getTime()
const HOUR = 3_600_000
let n = 0
const ev = (name: AuditEvent['name'], hoursAgo: number, over: Partial<AuditEvent> = {}): AuditEvent => ({
  id: ++n, ts: now - hoursAgo * HOUR, name, outcome: 'success', actorId: 'm', actorEmail: 'me@example.com',
  targetId: null, targetEmail: null, ip: '192.0.2.10', userAgent: chrome, details: {}, ...over,
})
const lines = () => [...document.querySelectorAll('[data-activity-line]')].map((e) => e.textContent)

afterEach(() => { document.body.innerHTML = '' })

describe('Recent activity', () => {
  it('Compact recent activity: "Signed in ×4 · Chrome on Linux" today and the token yesterday, one line each', async () => {
    const r = await render(<ActivityView status="ready" now={now} events={[
      ev('login.succeeded', 1), ev('login.succeeded', 3), ev('login.succeeded', 5), ev('login.succeeded', 7),
      ev('token.created', 24),
    ]} />)
    const days = [...document.querySelectorAll('[data-activity-day]')]
    expect(days.map((d) => d.querySelector('h3')!.textContent)).toEqual(['Today', 'Yesterday'])
    expect(lines()).toEqual(['Signed in ×4 · Chrome on Linux', 'API token created · Chrome on Linux'])
    await r.unmount()
  })

  it('shows ten lines, then Show all; failed sign-ins in the warning tone', async () => {
    const events = Array.from({ length: 30 }, (_, i) => i % 5 === 0 ? ev('login.failed', i * 3, { outcome: 'failure' }) : ev('token.created', i * 3))
    const r = await render(<ActivityView status="ready" now={now} events={events} />)
    expect(lines()).toHaveLength(10)
    expect(document.querySelector('[data-event="login.failed"]')!.hasAttribute('data-activity-warn')).toBe(true)
    expect(document.querySelector('[data-event="token.created"]')!.hasAttribute('data-activity-warn')).toBe(false)
    const more = document.querySelector<HTMLButtonElement>('[data-activity-show-all]')!
    expect(more.textContent).toBe('Show all (30)')
    await click(more)
    expect(lines()).toHaveLength(30)
    expect(more.getAttribute('aria-expanded')).toBe('true')
    await r.unmount()
  })

  it('offline shows no events', async () => {
    const r = await render(<ActivityView status="offline" now={now} events={[ev('logout', 1)]} />)
    expect(lines()).toEqual([])
    await r.unmount()
  })
})

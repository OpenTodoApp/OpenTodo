// Component tests for the Settings → Security panel. Rendered to static markup
// with react-dom/server so no DOM library is needed (no new dependency).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Passkey } from '../lib/types'
import { relativeTime, SecurityPanelView, type SecurityPanelViewProps } from './SecurityPanel'

/** The card's markup without its Learn more link, the one help link a card may carry (settings-copy D3). */
const withoutLearnMore = (html: string) => html.replace(/<button[^>]*data-learn-more[^>]*>Learn more<\/button>/g, '')


const now = Date.UTC(2026, 9, 10, 12, 0, 0)
const keys: Passkey[] = [
  { id: 'a', name: 'Phone', createdAt: now - 86_400_000, lastUsedAt: now - 5_000, suspiciousAt: null, backedUp: true },
  { id: 'b', name: 'Old key', createdAt: now - 3 * 86_400_000, lastUsedAt: null, suspiciousAt: now - 60_000, backedUp: false },
]

function render(overrides: Partial<SecurityPanelViewProps>): string {
  const props: SecurityPanelViewProps = {
    available: true, supported: true, online: true, passkeys: keys, busy: false, error: null,
    onAdd: () => {}, onRename: () => {}, onDelete: () => {}, now, ...overrides,
  }
  return renderToStaticMarkup(createElement(SecurityPanelView, props))
}

const disabledButtons = (html: string) => (html.match(/<button[^>]*disabled=""/g) ?? []).length

describe('SecurityPanelView', () => {
  it('is hidden when passkeys are unavailable on the server', () => {
    expect(render({ available: false })).toBe('')
  })

  it('leads with the count, then a row per passkey with created, last use, a suspicious badge and a menu', () => {
    const html = render({})
    expect(html).toContain('>Passkeys</h2>')
    expect(withoutLearnMore(html)).not.toContain('data-help-screen')
    expect(html).toContain('2 passkeys')
    expect(html).toContain('Phone')
    expect(html).toContain('used just now')
    expect(html).toContain('used never')
    expect(html.match(/>Suspicious</g)?.length).toBe(1)
    expect(html).toContain('aria-label="Actions for Phone"')
    expect(html).toContain('aria-label="Actions for Old key"')
    expect(html).toContain('Add passkey')
    expect(disabledButtons(html)).toBe(0)
  })

  it('shows the last fetched list read-only while offline', () => {
    const html = render({ online: false })
    expect(html).toContain('Managing passkeys needs a connection')
    expect(html).toContain('Phone')
    // Add passkey is disabled; the row menus stay openable, their items are disabled.
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Add passkey/)
  })

  it('shows the offline message even before anything was fetched', () => {
    const html = render({ online: false, passkeys: null })
    expect(html).toContain('Managing passkeys needs a connection')
    expect(disabledButtons(html)).toBe(1)
  })

  it('disables adding in a browser without passkey support', () => {
    const html = render({ supported: false })
    expect(html).toContain('does not support passkeys')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Add passkey/)
  })

  it('shows an empty state with what passkeys are for and the primary action', () => {
    const html = render({ passkeys: [] })
    expect(html).toContain('No passkeys yet')
    expect(html).toContain('cannot be phished')
    expect(html).toContain('Add passkey')
  })
})

describe('relativeTime', () => {
  it('formats recent times', () => {
    expect(relativeTime(null, now)).toBe('never')
    expect(relativeTime(now - 10_000, now)).toBe('just now')
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago')
  })
})

describe('passkey domain hint', () => {
  it('shows the domain and warns when the page is open at another host', () => {
    const ok = render({ domain: 'todo.example.com', pageHost: 'todo.example.com' })
    expect(ok).toContain('data-passkey-domain')
    expect(ok).not.toContain('role="alert"')
    const bad = render({ domain: 'todo.example.com', pageHost: 'abc.sslip.io' })
    expect(bad).toContain('role="alert"')
    expect(bad).toContain('abc.sslip.io')
    expect(bad).toContain('https://todo.example.com')
  })
})

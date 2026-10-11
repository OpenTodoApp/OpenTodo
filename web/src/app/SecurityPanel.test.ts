// Component tests for the Settings → Security panel. Rendered to static markup
// with react-dom/server so no DOM library is needed (no new dependency).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Passkey } from '../lib/types'
import { relativeTime, SecurityPanelView, type SecurityPanelViewProps } from './SecurityPanel'

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
// The Help link (user-documentation) stays usable offline: help ships with the app.
const allButtons = (html: string) => (html.match(/<button(?![^>]*data-help-screen)/g) ?? []).length

describe('SecurityPanelView', () => {
  it('is hidden when passkeys are unavailable on the server', () => {
    expect(render({ available: false })).toBe('')
  })

  it('lists passkeys with last use and a suspicious badge', () => {
    const html = render({})
    expect(html).toContain('Security')
    expect(html).toContain('Phone')
    expect(html).toContain('used just now')
    expect(html).toContain('used never')
    expect(html.match(/Suspicious/g)?.length).toBe(1)
    expect(html).toContain('Add passkey')
    expect(disabledButtons(html)).toBe(0)
  })

  it('shows the last fetched list read-only while offline', () => {
    const html = render({ online: false })
    expect(html).toContain('Managing passkeys needs a connection')
    expect(html).toContain('Phone')
    // Add, and Rename + Delete for each of the two passkeys: all disabled.
    expect(allButtons(html)).toBe(5)
    expect(disabledButtons(html)).toBe(5)
  })

  it('shows the offline message even before anything was fetched', () => {
    const html = render({ online: false, passkeys: null })
    expect(html).toContain('Managing passkeys needs a connection')
    expect(disabledButtons(html)).toBe(1)
  })

  it('disables actions in a browser without passkey support', () => {
    const html = render({ supported: false })
    expect(html).toContain('does not support passkeys')
    expect(disabledButtons(html)).toBe(5)
  })

  it('shows an empty state', () => {
    expect(render({ passkeys: [] })).toContain('No passkeys yet.')
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

// Component tests without a DOM: static markup is enough to assert who sees
// which panel and what each state shows. Effects do not run here, so nothing is fetched.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ActivityView, SecuritySettings } from './ActivityPanel'
import { AuditTable } from './AuditPanel'
import { EMPTY_FORM, eventSummary, shortAgent, toFilters } from './auditFormat'
import type { AuditEvent, User } from '../lib/types'

const owner: User = { id: 'o', email: 'owner@example.com', name: 'Owner', role: 'owner', createdAt: 0 }
const member: User = { id: 'm', email: 'member@example.com', name: 'Member', role: 'member', createdAt: 0 }

const ev = (over: Partial<AuditEvent>): AuditEvent => ({
  id: 1, ts: 1_760_000_000_000, name: 'login.failed', outcome: 'failure', actorId: null, actorEmail: null,
  targetId: 'm', targetEmail: 'member@example.com', ip: null, userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0',
  details: { reason: 'wrong_password', email: 'member@example.com' }, ...over,
})

describe('Security settings visibility', () => {
  it('shows the owner both the audit log and their recent activity', () => {
    const html = renderToStaticMarkup(createElement(SecuritySettings, { user: owner }))
    expect(html).toContain('Audit log')
    expect(html).toContain('Recent activity')
  })

  it('hides the audit log from members but keeps their recent activity', () => {
    const html = renderToStaticMarkup(createElement(SecuritySettings, { user: member }))
    expect(html).not.toContain('Audit log')
    expect(html).not.toContain('/api/v1/audit')
    expect(html).toContain('Recent activity')
  })
})

describe('AuditTable', () => {
  it('renders events with label, account, details and client', () => {
    const html = renderToStaticMarkup(createElement(AuditTable, {
      status: 'ready',
      events: [ev({}), ev({ id: 2, name: 'token.created', outcome: 'success', actorId: 'o', actorEmail: 'owner@example.com', targetId: null, targetEmail: null, ip: '192.0.2.1', details: { token_id: 't', token_name: 'laptop script' } })],
    }))
    expect(html).toContain('Sign-in failed')
    expect(html).toContain('wrong password')
    expect(html).toContain('member@example.com')
    expect(html).toContain('API token created')
    expect(html).toContain('laptop script')
    expect(html).toContain('192.0.2.1')
    expect(html).toContain('Firefox on Linux x86_64')
    expect(html).toContain('tabindex="0"')
  })

  it('shows a connection notice and no events when offline', () => {
    const html = renderToStaticMarkup(createElement(AuditTable, { status: 'offline', events: [ev({})] }))
    expect(html).toContain('needs a connection')
    expect(html).not.toContain('Sign-in failed')
    expect(html).not.toContain('<table')
  })

  it('says when nothing matches', () => {
    expect(renderToStaticMarkup(createElement(AuditTable, { status: 'ready', events: [] }))).toContain('No events match')
  })
})

describe('ActivityView', () => {
  it('lists own events with time and agent', () => {
    const html = renderToStaticMarkup(createElement(ActivityView, { status: 'ready', events: [ev({ name: 'login.succeeded', outcome: 'success', details: { method: 'password' } })] }))
    expect(html).toContain('Signed in')
    expect(html).toContain('Firefox')
  })

  it('shows a connection notice and no events when offline', () => {
    const html = renderToStaticMarkup(createElement(ActivityView, { status: 'offline', events: [ev({})] }))
    expect(html).toContain('needs a connection')
    expect(html).not.toContain('Sign-in failed')
  })
})

describe('audit filters', () => {
  it('turns the last-day preset into a from bound and keeps the event filter', () => {
    const now = 1_760_000_000_000
    expect(toFilters({ ...EMPTY_FORM, name: 'login.failed', range: '1d' }, now)).toEqual({ name: 'login.failed', from: now - 86_400_000 })
    expect(toFilters(EMPTY_FORM, now)).toEqual({})
  })

  it('makes a custom range inclusive of whole local days', () => {
    const f = toFilters({ ...EMPTY_FORM, range: 'custom', fromDate: '2026-10-01', toDate: '2026-10-02' })
    expect(f.from).toBe(new Date(2026, 9, 1).getTime())
    expect(f.to).toBe(new Date(2026, 9, 3).getTime() - 1)
  })

  it('summarises settings changes and shortens agents', () => {
    expect(eventSummary(ev({ name: 'settings.changed', details: { setting: 'audit.log_ip', from: 'true', to: 'false' } }))).toBe('Address logging: true → false')
    expect(eventSummary(ev({ name: 'settings.changed', details: { setting: 'mcp.enabled', from: 'false', to: 'true' } }))).toBe('AI assistants (MCP): false → true')
    expect(eventSummary(ev({ name: 'token.created', details: { token_id: 't', token_name: 'AI assistant', token_scope: 'read' } }))).toBe('“AI assistant” (read-only)')
    expect(shortAgent('')).toBe('unknown client')
    expect(shortAgent('curl/8.5.0')).toBe('curl/8.5.0')
  })
})

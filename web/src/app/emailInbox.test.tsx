// Settings → Email to task (OpenSpec `email-to-task`) without a DOM: the pure
// EmailInboxView is rendered to static markup for each state, and the API
// client is checked against the documented routes.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import type { EmailInbox } from '../lib/types'
import { EmailInboxView, parseAllowlist, type EmailInboxViewProps } from './EmailInboxPanel'

const noop = () => {}
const inbox = (over: Partial<EmailInbox> = {}): EmailInbox => ({
  enabledByOperator: true, address: 'todo+k3f9abc@example.com', enabled: true, allowlist: [], hourlyLimit: 60, ...over,
})

function render(over: Partial<EmailInboxViewProps> = {}) {
  const props: EmailInboxViewProps = {
    inbox: inbox(), draft: '', copied: false, error: null, busy: false,
    onCopy: noop, onRotate: noop, onToggle: noop, onDraftChange: noop, onSaveAllowlist: noop, ...over,
  }
  return renderToStaticMarkup(<EmailInboxView {...props} />)
}

describe('EmailInboxView', () => {
  it('shows the address with copy, rotate, the switch and the allowlist editor', () => {
    const html = render()
    expect(html).toContain('todo+k3f9abc@example.com')
    expect(html).toContain('Copy address')
    expect(html).toContain('New address')
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('>On<')
    expect(html).toContain('<textarea')
    expect(html).toContain('at most 60 per hour')
  })

  it('says when the operator has not enabled the feature, with no controls', () => {
    const html = render({ inbox: inbox({ enabledByOperator: false, address: null }) })
    expect(html).toContain('operator has not enabled')
    // Only the Help link (user-documentation) remains.
    expect(html.replace(/<button[^>]*data-help-screen[\s\S]*?<\/button>/g, '')).not.toContain('<button')
    expect(html).not.toContain('role="switch"')
  })

  it('needs a connection to load', () => {
    expect(render({ inbox: null })).toContain('available when you are online')
  })

  it('keeps the controls native and in tab order: copy, rotate, switch, allowlist, save', () => {
    const html = render({ draft: 'me@example.org' })
    const order = ['Copy address', 'New address', 'role="switch"', '<textarea', 'Save senders'].map((s) => html.indexOf(s))
    expect(order.every((i) => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).not.toMatch(/tabindex="-1"/)
    expect(html).not.toMatch(/<div[^>]*onclick/i)
    expect(html).toContain('for="email-inbox-allowlist"')
  })

  it('enables saving only when the allowlist changed, and shows errors', () => {
    expect(render({ draft: '' })).toMatch(/<button[^>]*disabled=""[^>]*>Save senders/)
    expect(render({ draft: 'me@example.org' })).not.toMatch(/<button[^>]*disabled=""[^>]*>Save senders/)
    expect(render({ error: 'allowlist: bad' })).toContain('role="alert"')
  })

  it('splits allowlist text on lines, commas and spaces', () => {
    expect(parseAllowlist(' a@x.org\nb@y.org, c@z.org ;\n\n')).toEqual(['a@x.org', 'b@y.org', 'c@z.org'])
  })
})

describe('email inbox API client', () => {
  afterEach(() => vi.restoreAllMocks())

  it('calls the documented routes', async () => {
    const calls: [string, string, unknown][] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      calls.push([init?.method ?? 'GET', String(input), init?.body ? JSON.parse(String(init.body)) : undefined])
      return new Response(JSON.stringify(inbox()), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    expect((await api.emailInbox()).address).toBe('todo+k3f9abc@example.com')
    await api.updateEmailInbox({ enabled: false })
    await api.updateEmailInbox({ allowlist: ['me@example.org'] })
    await api.rotateEmailInbox()
    expect(calls.map(([m, u]) => `${m} ${u}`)).toEqual([
      'GET /api/v1/email-inbox', 'PATCH /api/v1/email-inbox', 'PATCH /api/v1/email-inbox', 'POST /api/v1/email-inbox/rotate',
    ])
    expect(calls[1][2]).toEqual({ enabled: false })
    expect(calls[2][2]).toEqual({ allowlist: ['me@example.org'] })
  })
})

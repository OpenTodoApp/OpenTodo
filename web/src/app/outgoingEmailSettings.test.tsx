// @vitest-environment happy-dom
// Outgoing email in Settings (OpenSpec change outgoing-email, tasks 3.2, 4.2 and
// 6.2): the owner's panel (not configured, a failed auth test, env-locked fields,
// offline), no panel for admins, the Users reset choice with its fallback, and
// "Send by email" on invitations.
import 'fake-indexeddb/auto'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setOutgoingEmail } from '../lib/outgoingEmail'
import type { SmtpSettings, User } from '../lib/types'
import { click, flush, render, type } from '../ui/test-utils'
import { NewInvitationDialog } from './MembersPanel'
import { draftFrom, inputFrom, OutgoingEmailPanel, OutgoingEmailView, type OutgoingEmailViewProps } from './OutgoingEmailPanel'
import { SettingsView } from './SettingsView'
import { AdministrationSections } from './UsersPanel'

const noop = () => {}
const off: SmtpSettings = { configured: false, host: '', port: 0, security: '', username: '', passwordSet: false, from: '', managedBy: {}, lastTest: null }
const on: SmtpSettings = {
  configured: true, host: 'smtp.example.com', port: 587, security: 'starttls', username: 'todo@example.com', passwordSet: true,
  from: 'OpenTodo <todo@example.com>', managedBy: { host: 'env', port: 'env' }, lastTest: null,
}
const owner: User = { id: 'o', email: 'owner@example.com', name: 'Robin', role: 'owner', createdAt: 1 }
const admin: User = { ...owner, id: 'a', role: 'admin' }
let calls: { key: string; body: unknown }[] = []

function view(over: Partial<OutgoingEmailViewProps> = {}) {
  return renderToStaticMarkup(<OutgoingEmailView settings={on} offline={false} busy={false} error={null} draft={null} test={null}
    onConfigure={noop} onDraft={noop} onSave={noop} onTest={noop} {...over} />)
}

function serve(routes: Record<string, [number, unknown]>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${new URL(url, 'http://x').pathname}`
    calls.push({ key, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const hit = routes[key]
    if (!hit) return new Response(JSON.stringify({ error: { code: 'not_found', message: 'not found' } }), { status: 404 })
    return new Response(JSON.stringify(hit[1]), { status: hit[0], headers: { 'Content-Type': 'application/json' } })
  }))
}
async function waitFor(ok: () => boolean, ms = 2000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const button = (root: ParentNode, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)

beforeEach(() => { calls = []; setOutgoingEmail(false) })
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('Outgoing email panel', () => {
  it('says what it enables when not configured and offers Configure', () => {
    const html = view({ settings: off })
    expect(html).toContain('Not configured')
    for (const t of ['reset a password', 'invitation by email']) expect(html).toContain(t)
    expect(html).toContain('>Configure<')
    expect(html).not.toContain('Send test email')
  })

  it('leads with host, From and a failed auth test with the reply, never "sent"', () => {
    const html = view({ test: { outcome: 'failed', to: 'owner@example.com', stage: 'auth', reply: '535 5.7.8 Username and Password not accepted' } })
    expect(html).toContain('smtp.example.com:587')
    expect(html).toContain('OpenTodo &lt;todo@example.com&gt;')
    expect(html).toContain('Authentication failed')
    expect(html).toContain('535 5.7.8')
    expect(html).not.toContain('Test sent')
    expect(html).toContain('>Configure<')
  })

  it('locks fields set in the environment and keeps the password write-only', () => {
    const html = view({ draft: draftFrom(on) })
    expect(html).toMatch(/aria-label="SMTP server"[^>]*readOnly|readOnly[^>]*aria-label="SMTP server"/i)
    expect(html).toContain('Set by OPENTODO_SMTP_HOST')
    expect(html).toContain('Leave empty to keep the saved password.')
    expect(inputFrom(on, { ...draftFrom(on), host: 'other', from: 'me@example.com' })).toEqual({ from: 'me@example.com' })
    expect(inputFrom(on, { ...draftFrom(on), clearPassword: true })).toEqual({ password: '' })
  })

  it('needs a connection offline and shows neither state nor form', () => {
    const html = view({ offline: true, draft: draftFrom(on) })
    expect(html).toContain('need a connection')
    expect(html).not.toContain('smtp.example.com')
    expect(html).not.toContain('data-smtp-form')
  })

  it('runs a test and shows the outcome', async () => {
    serve({
      'GET /api/v1/settings/smtp': [200, on],
      'POST /api/v1/settings/smtp/test': [200, { outcome: 'sent', to: 'owner@example.com' }],
    })
    const r = await render(<OutgoingEmailPanel />)
    await waitFor(() => !!button(r.container, 'Send test email'))
    await click(button(r.container, 'Send test email')!)
    await waitFor(() => r.container.querySelector('[data-smtp-test="sent"]') !== null)
    expect(r.container.textContent).toContain('to owner@example.com')
    await r.unmount()
  })

  it('is mounted on the Server page, for the owner only', () => {
    // Settings → Server is the owner's section (settings-navigation "Sections follow the user's role"); an admin opening it lands on Account.
    const page = (user: User) => renderToStaticMarkup(<SettingsView user={user} onLogout={noop} section="server" page="outgoing-email" />)
    expect(page(owner)).toContain('data-testid="outgoing-email-panel"')
    expect(page(admin)).not.toContain('outgoing-email-panel')
    expect(renderToStaticMarkup(<SettingsView user={owner} onLogout={noop} section="people" />)).not.toContain('outgoing-email-panel')
    expect(renderToStaticMarkup(<AdministrationSections user={owner} />)).not.toContain('outgoing-email-panel')
  })
})

describe('Users reset with outgoing email', () => {
  const member = { id: 'm', email: 'kim@example.com', name: 'Kim', role: 'member', createdAt: 1, status: 'active', lastLoginAt: null }

  it('sends the reset email, and offers the link when sending fails', async () => {
    setOutgoingEmail(true)
    serve({
      'GET /api/v1/users': [200, { users: [{ ...owner, status: 'active', lastLoginAt: null }, member] }],
      'GET /api/v1/invitations': [200, { invitations: [] }],
      'GET /api/v1/settings/smtp': [200, on],
      'POST /api/v1/users/m/password-reset': [502, { error: { code: 'email_failed', message: 'the mail server refused the message' } }],
    })
    const r = await render(<AdministrationSections user={owner} />)
    await waitFor(() => !!r.container.querySelector('button[aria-label^="Actions for Kim"]'))
    await click(r.container.querySelector('button[aria-label^="Actions for Kim"]')!)
    await flush(20)
    await click([...document.querySelectorAll('[role="menuitem"]')].find((e) => /reset/i.test(e.textContent ?? ''))!)
    await waitFor(() => document.querySelector('[data-reset-choice]') !== null)
    expect(button(document, 'Create reset link')).toBeTruthy()
    await click(button(document, 'Send reset email')!)
    await waitFor(() => calls.some((c) => c.key === 'POST /api/v1/users/m/password-reset'))
    expect(calls.find((c) => c.key === 'POST /api/v1/users/m/password-reset')!.body).toEqual({ send: true })
    await waitFor(() => document.body.textContent!.includes('Create a password reset link for Kim?'))
    expect(document.body.textContent).toContain('refused the message')
    await r.unmount()
  })
})

describe('Send by email on invitations', () => {
  it('appears only with outgoing email and a typed address, and reports where it went', async () => {
    const onCreate = vi.fn()
    let r = await render(<NewInvitationDialog busy={false} offline={false} error={null} link={null} copied={false} onCreate={onCreate} onCopy={noop} onClose={noop} />)
    await type(document.querySelector<HTMLInputElement>('input[type="email"]')!, 'bob@example.com')
    expect(document.querySelector('[data-send-by-email]')).toBeNull()
    await r.unmount()
    document.body.innerHTML = ''

    r = await render(<NewInvitationDialog mail busy={false} offline={false} error={null} link={null} copied={false} onCreate={onCreate} onCopy={noop} onClose={noop} />)
    expect(document.querySelector('[data-send-by-email]')).toBeNull()
    await type(document.querySelector<HTMLInputElement>('input[type="email"]')!, 'bob@example.com')
    expect(document.querySelector<HTMLInputElement>('[data-send-by-email]')!.checked).toBe(true)
    await click(button(document, 'Create invitation')!)
    expect(onCreate).toHaveBeenCalledWith({ email: 'bob@example.com', hours: 168, send: true })
    await r.unmount()
    document.body.innerHTML = ''

    r = await render(<NewInvitationDialog mail sentTo="bob@example.com" busy={false} offline={false} error={null} link="https://x/invite/oti_1" copied={false} onCreate={noop} onCopy={noop} onClose={noop} />)
    expect(document.body.textContent).toContain('The invitation was sent to bob@example.com.')
    expect(document.body.textContent).toContain('https://x/invite/oti_1')
    await r.unmount()
  })
})

describe('Send by email in the share dialog', () => {
  it('offers the option with an address and says where the link went', async () => {
    const { InviteLinksView } = await import('./InviteLinksSection')
    const base = {
      roles: ['viewer', 'editor'] as const, open: true, role: 'editor' as const, email: '', hours: 168, invites: [], created: null, copied: false,
      offline: false, busy: false, error: null, onToggle: noop, onRole: noop, onEmail: noop, onHours: noop, onCreate: noop, onCopy: noop, onRevoke: noop,
    }
    expect(renderToStaticMarkup(<InviteLinksView {...base} roles={[...base.roles]} email="bob@example.com" />)).not.toContain('data-send-by-email')
    expect(renderToStaticMarkup(<InviteLinksView {...base} roles={[...base.roles]} mail />)).not.toContain('data-send-by-email')
    expect(renderToStaticMarkup(<InviteLinksView {...base} roles={[...base.roles]} mail email="bob@example.com" />)).toContain('data-send-by-email')
    const sent = renderToStaticMarkup(<InviteLinksView {...base} roles={[...base.roles]} mail created={{ link: 'https://x/invite/p/otp_1', newAccounts: true, sentTo: 'bob@example.com' }} />)
    expect(sent).toContain('The link was sent to bob@example.com.')
    expect(sent).toContain('https://x/invite/p/otp_1')
  })
})

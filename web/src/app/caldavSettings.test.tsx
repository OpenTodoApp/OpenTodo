// Settings → Calendar apps (OpenSpec `caldav`) without a DOM: the pure CaldavView
// is rendered to static markup for each state, and the API client is checked.
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../lib/api'
import type { AppPassword } from '../lib/types'
import { CaldavView, type CaldavViewProps } from './CaldavPanel'

const noop = () => {}
const pw = (over: Partial<AppPassword> = {}): AppPassword => ({ id: 'a1', name: 'iPhone', createdAt: 1, lastUsedAt: null, revokedAt: null, ...over })

function render(over: Partial<CaldavViewProps> = {}) {
  const props: CaldavViewProps = {
    isOwner: true, email: 'me@example.com', setting: { enabled: true, url: 'https://todo.example.com/dav/', secure: true },
    passwords: [], newName: '', secret: null, error: null, busy: false,
    onToggle: noop, onNameChange: noop, onCreate: noop, onRevoke: noop, onDismissSecret: noop, ...over,
  }
  return renderToStaticMarkup(<CaldavView {...props} />)
}

describe('CaldavView', () => {
  it('gives the owner a toggle and shows the address, user name and client hints when on', () => {
    const html = render()
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('checked=""')
    expect(html).toContain('https://todo.example.com/dav/')
    expect(html).toContain('me@example.com')
    for (const client of ['Apple Reminders', 'Thunderbird', 'DAVx⁵']) expect(html).toContain(client)
    expect(html).not.toContain('plain http')
  })

  it('tells members whether CalDAV is on, without a toggle', () => {
    const off = render({ isOwner: false, setting: { enabled: false, url: 'https://x/dav/', secure: true } })
    expect(off).not.toContain('type="checkbox"')
    expect(off).toContain('Ask the server owner')
    expect(off).not.toContain('https://x/dav/')
    expect(render({ isOwner: false })).toContain('CalDAV is on for this server.')
  })

  it('warns when the address is not https', () => {
    const html = render({ setting: { enabled: true, url: 'http://192.168.1.10:8080/dav/', secure: false } })
    expect(html).toContain('role="alert"')
    expect(html).toContain('plain http')
  })

  it('shows a new app password once, lists active and revoked ones with revoke buttons', () => {
    const html = render({
      secret: 'otap_secret123',
      passwords: [pw({ lastUsedAt: 2 }), pw({ id: 'a2', name: 'Old laptop', revokedAt: 3 })],
    })
    expect(html).toContain('otap_secret123')
    expect(html).toContain('will not be shown again')
    expect(html).toContain('iPhone')
    expect(html).toContain('Old laptop')
    expect((html.match(/>Revoke</g) ?? []).length).toBe(1)
    expect(render({ passwords: [pw()] })).not.toContain('otap_')
    expect(render()).toContain('No app passwords yet.')
  })

  it('keeps every control a native, keyboard-reachable element', () => {
    const html = render({ passwords: [pw()] })
    expect(html).toContain('aria-label="App password name"')
    expect(html).not.toMatch(/<div[^>]*onclick/i)
    expect(html).toContain('<button')
  })

  it('says the status needs a connection while offline', () => {
    const html = render({ setting: null, passwords: null })
    expect(html).toContain('available when you are online')
    expect(html).toMatch(/<button class="btn-primary" disabled="">Create app password/)
  })
})

describe('caldav API client', () => {
  afterEach(() => vi.restoreAllMocks())

  it('calls the documented routes', async () => {
    const calls: [string, string, unknown][] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      calls.push([init?.method ?? 'GET', String(input), init?.body ? JSON.parse(String(init.body)) : undefined])
      const body = String(input).includes('app-passwords') && init?.method === 'POST' ? { appPassword: pw(), secret: 'otap_x' } : { enabled: true, url: 'u', secure: true, appPasswords: [] }
      return init?.method === 'DELETE' ? new Response(null, { status: 204 }) : new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    await api.caldavSetting()
    await api.setCaldavEnabled(true)
    await api.listAppPasswords()
    expect((await api.createAppPassword('iPhone')).secret).toBe('otap_x')
    await api.revokeAppPassword('a1')
    expect(calls.map(([m, u]) => `${m} ${u}`)).toEqual([
      'GET /api/v1/settings/caldav', 'PUT /api/v1/settings/caldav', 'GET /api/v1/app-passwords', 'POST /api/v1/app-passwords', 'DELETE /api/v1/app-passwords/a1',
    ])
    expect(calls[1][2]).toEqual({ enabled: true })
    expect(calls[3][2]).toEqual({ name: 'iPhone' })
  })
})

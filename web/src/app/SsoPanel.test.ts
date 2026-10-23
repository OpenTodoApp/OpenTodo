// Component tests for Settings → Single sign-on and Linked accounts (OpenSpec
// `oidc-login`), rendered to static markup (no DOM library).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { LinkedIdentity, OidcSettings } from '../lib/types'
import { formFrom, LinkedAccountsView, type LinkedAccountsViewProps, saveInput, SsoPanelView, type SsoPanelViewProps } from './SsoPanel'

const settings: OidcSettings = {
  enabled: true, issuer: 'https://sso.example.com', clientId: 'opentodo', clientSecret: '••••1234', clientSecretSet: true,
  displayName: 'Home SSO', scopes: 'openid email profile', allowProvision: false, ssoOnly: false, providerLogout: false, syncPictures: false,
  redirectUri: 'https://todo.example.com/api/v1/auth/oidc/callback', baseUrlConfigured: true,
  managedBy: { issuer: 'settings', clientId: 'settings', clientSecret: 'settings', displayName: 'settings', ssoOnly: 'settings' },
}

function panel(overrides: Partial<SsoPanelViewProps> & { configuring?: boolean } = {}): string {
  const s = overrides.settings ?? settings
  const props: SsoPanelViewProps = {
    settings: s, form: formFrom(s), online: true, busy: false, error: null, notice: null, test: null,
    onChange: () => {}, onSave: () => {}, onTest: () => {}, onRemoveSecret: () => {}, ...overrides,
  }
  return renderToStaticMarkup(createElement(SsoPanelView, { configuring: true, ...props, ...('configuring' in overrides ? { configuring: overrides.configuring } : {}) }))
}

const disabledCount = (html: string) => (html.match(/disabled=""/g) ?? []).length

describe('SsoPanelView', () => {
  it('leads with the provider and its status; the configuration stays closed until Configure', () => {
    const html = panel({ configuring: false })
    expect(html).toContain('>Single sign-on</h2>')
    expect(html).toMatch(/data-status="ok"[^>]*><span[^>]*><\/span><span[^>]*>On<\/span>/)
    expect(html).toContain('Sign in with Home SSO')
    expect(html).toContain('sso.example.com')
    expect(html).toContain('>Configure</button>')
    expect(html).not.toContain('Issuer URL')
    const off = panel({ configuring: false, settings: { ...settings, enabled: false } })
    expect(off).toContain('Off until you save an issuer and client id')
  })

  it('shows the redirect URI, masked secret and the three switches', () => {
    const html = panel()
    expect(html).toContain('https://todo.example.com/api/v1/auth/oidc/callback')
    expect(html).toContain('Taken from OPENTODO_BASE_URL')
    expect(html).toContain('••••1234 (stored; type to replace)')
    expect(html).not.toContain('value="••••1234"')
    expect(html).toContain('Allow new accounts via SSO')
    expect(html).toContain('Require single sign-on (SSO only)')
    expect(html).toContain('/?owner=1')
    expect(html).toContain('Sign out of Home SSO too')
    expect(html).toContain('Test connection')
    expect(disabledCount(html)).toBe(0)
  })

  it('warns when the redirect URI comes from the request', () => {
    expect(panel({ settings: { ...settings, baseUrlConfigured: false } })).toContain('set OPENTODO_BASE_URL')
  })

  it('locks fields managed by the environment', () => {
    const s: OidcSettings = { ...settings, managedBy: { ...settings.managedBy, issuer: 'env', ssoOnly: 'env' } }
    const html = panel({ settings: s })
    expect(html.match(/set by environment/g)?.length).toBe(2)
    expect(html).toMatch(/readOnly=""[^>]*value="https:\/\/sso.example.com"/i)
    // The PUT body leaves locked fields out and keeps the secret unless a new one was typed.
    const body = saveInput(s, { ...formFrom(s), displayName: ' Office ' })
    expect(body).not.toHaveProperty('issuer')
    expect(body).not.toHaveProperty('ssoOnly')
    expect(body).not.toHaveProperty('clientSecret')
    expect(body.displayName).toBe('Office')
    expect(saveInput(settings, { ...formFrom(settings), clientSecret: 'new-secret' }).clientSecret).toBe('new-secret')
  })

  it('is read-only offline', () => {
    const html = panel({ online: false })
    expect(html).toContain('Offline')
    // Every input, checkbox and button except the read-only redirect URI field.
    expect(disabledCount(html)).toBeGreaterThanOrEqual(10)
  })

  it('reports test results and errors', () => {
    const ok = panel({ test: { ok: true, issuer: settings.issuer, authorizationHost: 'sso.example.com', tokenHost: 'sso.example.com', endSessionSupported: true } })
    expect(ok).toContain('Provider reachable: sign-in at sso.example.com')
    expect(panel({ error: 'discovery failed: …' })).toContain('role="alert"')
  })
})

const now = Date.UTC(2026, 9, 10, 12)
const ids: LinkedIdentity[] = [{ id: 'i1', issuer: 'https://sso.example.com', email: 'me@example.com', createdAt: now - 86_400_000, lastLoginAt: now - 1000 }]

function linked(overrides: Partial<LinkedAccountsViewProps> = {}): string {
  const props: LinkedAccountsViewProps = {
    identities: ids, provider: { enabled: true, displayName: 'Home SSO', ssoOnly: false }, online: true, busy: false,
    error: null, notice: null, onUnlink: () => {}, now, ...overrides,
  }
  return renderToStaticMarkup(createElement(LinkedAccountsView, props))
}

describe('LinkedAccountsView', () => {
  it('lists identities with unlink and a link action', () => {
    const html = linked()
    expect(html).toContain('Linked accounts')
    expect(html).toContain('me@example.com')
    expect(html).toContain('sso.example.com')
    expect(html).toContain('used just now')
    expect(html).toContain('aria-label="Actions for me@example.com"')
    expect(html).toContain('href="/api/v1/auth/oidc/start"')
    expect(html).toContain('Link Home SSO')
  })

  it('is hidden when SSO is off and nothing is linked', () => {
    expect(linked({ identities: [], provider: { enabled: false, displayName: '', ssoOnly: false } })).toBe('')
    expect(linked({ provider: { enabled: false, displayName: '', ssoOnly: false } })).toContain('Single sign-on is off on this server')
  })

  it('is read-only offline', () => {
    const html = linked({ online: false })
    expect(html).toContain('Offline')
    expect(html).not.toContain('href="/api/v1/auth/oidc/start"')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Link Home SSO/)
  })

  it('shows an empty state with the link action when nothing is linked', () => {
    const html = linked({ identities: [] })
    expect(html).toContain('Nothing linked yet')
    expect(html).toContain('href="/api/v1/auth/oidc/start"')
  })

  it('shows notices and errors from the link flow', () => {
    expect(linked({ notice: 'Linked.' })).toContain('role="status"')
    expect(linked({ error: 'That identity is already linked to another account on this server.' })).toContain('already linked')
  })
})

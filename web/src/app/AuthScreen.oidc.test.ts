// Sign-in screen with single sign-on (OpenSpec `oidc-login`), rendered to
// static markup like the other component tests (no DOM library).
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthStatus } from '../lib/types'
import { AuthScreen } from './AuthScreen'
import { oidcErrorMessage, ssoLayout, takeQueryParam } from './sso'

const base: AuthStatus = { setupRequired: false, signupAllowed: false, authenticated: false, user: null, version: 'test' }
const withSso = (ssoOnly: boolean, displayName = 'Home SSO'): AuthStatus => ({ ...base, oidc: { enabled: true, displayName, ssoOnly } })

/** Pretends the page is at `/<search>` and records history rewrites. */
function atUrl(search: string) {
  const replaced: string[] = []
  vi.stubGlobal('location', { search, pathname: '/', hash: '' })
  vi.stubGlobal('history', { state: null, replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url) })
  return replaced
}

function render(status: AuthStatus): string {
  return renderToStaticMarkup(createElement(AuthScreen, { status, onAuthenticated: () => {} }))
}

afterEach(() => vi.unstubAllGlobals())

describe('ssoLayout', () => {
  it('offers only local sign-in without a provider', () => {
    expect(ssoLayout(base, '')).toEqual({ provider: null, local: true, breakGlass: false })
    expect(ssoLayout({ ...base, oidc: { enabled: false, displayName: '', ssoOnly: false } }, '')).toEqual({ provider: null, local: true, breakGlass: false })
  })
  it('offers both next to each other when SSO is optional', () => {
    expect(ssoLayout(withSso(false), '')).toEqual({ provider: 'Home SSO', local: true, breakGlass: false })
  })
  it('hides local sign-in in SSO-only mode unless ?owner=1', () => {
    expect(ssoLayout(withSso(true), '')).toEqual({ provider: 'Home SSO', local: false, breakGlass: false })
    expect(ssoLayout(withSso(true), '?owner=1')).toEqual({ provider: 'Home SSO', local: true, breakGlass: true })
    expect(ssoLayout(withSso(false), '?owner=1').breakGlass).toBe(false)
  })
  it('never shows the provider during first-run setup', () => {
    expect(ssoLayout({ ...withSso(true), setupRequired: true }, '').provider).toBeNull()
  })
  it('defaults the button label', () => {
    expect(ssoLayout(withSso(false, ''), '').provider).toBe('SSO')
  })
})

describe('AuthScreen with single sign-on', () => {
  it('renders the password form only, without a provider', () => {
    atUrl('')
    const html = render(base)
    expect(html).toContain('type="password"')
    expect(html).not.toContain('Sign in with')
  })

  it('shows "Sign in with Home SSO" next to the password form', () => {
    atUrl('')
    const html = render(withSso(false))
    expect(html).toContain('Sign in with Home SSO')
    expect(html).toContain('href="/api/v1/auth/oidc/start"')
    expect(html).toContain('type="password"')
  })

  it('shows only the provider in SSO-only mode', () => {
    atUrl('')
    const html = render({ ...withSso(true), signupAllowed: true })
    expect(html).toContain('Sign in with Home SSO')
    expect(html).not.toContain('type="password"')
    expect(html).not.toContain('Sign up')
    expect(html).toContain('single sign-on for every account')
  })

  it('keeps the owner break-glass form at ?owner=1', () => {
    atUrl('?owner=1')
    const html = render(withSso(true))
    expect(html).toContain('type="password"')
    expect(html).toContain('Owner sign-in')
    expect(html).toContain('Sign in with Home SSO')
  })

  it('shows a callback error and removes it from the address bar', () => {
    const replaced = atUrl('?error=signup_closed&owner=1')
    const html = render(withSso(true))
    expect(html).toContain('role="alert"')
    expect(html).toContain('does not create accounts automatically')
    expect(replaced).toEqual(['/?owner=1'])
  })

  it('shows callback errors in SSO-only mode too', () => {
    atUrl('?error=oidc_failed')
    const html = render(withSso(true))
    expect(html).toContain('Signing in with Home SSO did not work')
    expect(html).not.toContain('type="password"')
  })
})

describe('oidcErrorMessage', () => {
  it('maps every callback code to a sentence', () => {
    expect(oidcErrorMessage(null)).toBeNull()
    for (const code of ['oidc_failed', 'signup_closed', 'oidc_email_unverified', 'oidc_state_invalid', 'identity_taken', 'sso_required', 'other']) {
      expect(oidcErrorMessage(code, 'Home SSO')).toMatch(/\w/)
    }
    expect(oidcErrorMessage('oidc_email_unverified', 'Home SSO')).toContain('verified email')
  })
  it('takeQueryParam returns null when absent and leaves the URL alone', () => {
    const replaced = atUrl('?x=1')
    expect(takeQueryParam('error')).toBeNull()
    expect(replaced).toEqual([])
  })
})

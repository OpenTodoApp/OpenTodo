// Single sign-on helpers for the sign-in screen and Settings (OpenSpec
// `oidc-login`). Pure functions, so the component tests need no DOM.
import type { AuthStatus } from '../lib/types'
import { t } from '../lib/i18n'

/** What the sign-in screen offers for the server's SSO state and the page URL. */
export interface SsoLayout {
  /** Provider display name for the "Sign in with …" action, or null when there is none. */
  provider: string | null
  /** Show the password form (and passkeys, sign-up). */
  local: boolean
  /** SSO-only mode with the documented `?owner=1` break-glass URL. */
  breakGlass: boolean
}

export function ssoLayout(status: AuthStatus, search: string): SsoLayout {
  const o = status.oidc
  const provider = o?.enabled && !status.setupRequired ? (o.displayName || 'SSO') : null
  const breakGlass = !!provider && !!o?.ssoOnly && new URLSearchParams(search).get('owner') === '1'
  return { provider, local: !provider || !o?.ssoOnly || breakGlass, breakGlass }
}

/** The sentence for an `?error=` code from the provider callback, or null. */
export function oidcErrorMessage(code: string | null, provider = t('the provider')): string | null {
  switch (code) {
    case null:
    case '':
      return null
    case 'oidc_failed':
      return t('Signing in with {provider} did not work. Try again; if it keeps failing, ask the server owner to check the single sign-on settings.', { provider })
    case 'signup_closed':
      return t('There is no account for this identity yet, and this server does not create accounts automatically. Ask the owner for access.')
    case 'oidc_link_required':
      return t('This account is not linked to {provider} yet. Sign in with your password (and code) first, then link {provider} in Settings → Account.', { provider })
    case 'oidc_email_unverified':
      return t('{provider} did not confirm a verified email address for you, so it cannot be matched to an account. Verify your email there, or ask the owner.', { provider })
    case 'oidc_state_invalid':
      return t('That sign-in took too long or was started in another tab. Please try again.')
    case 'identity_taken':
      return t('That identity is already linked to another account on this server.')
    case 'sso_required':
      return t('This server requires signing in with {provider}.', { provider })
    default:
      return t('Signing in did not work. Please try again.')
  }
}

/**
 * Reads a query parameter once and removes it from the address bar, so a
 * reload or a shared URL does not repeat a callback message.
 */
export function takeQueryParam(name: string): string | null {
  if (typeof location === 'undefined') return null
  const params = new URLSearchParams(location.search)
  const value = params.get(name)
  if (value === null) return null
  params.delete(name)
  const qs = params.toString()
  history.replaceState(history.state, '', location.pathname + (qs ? `?${qs}` : '') + location.hash)
  return value
}

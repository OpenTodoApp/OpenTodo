import { Icon } from '../ui/Icon'
import { useCallback, useEffect, useState } from 'react'
import { HelpHeading } from './help/HelpLink'
import { api, ApiError, OIDC_START_URL } from '../lib/api'
import { useOnline } from '../lib/online'
import type { LinkedIdentity, OidcSettings, OidcSettingsInput, OidcStatus, OidcTestResult } from '../lib/types'
import { relativeTime } from './SecurityPanel'
import { oidcErrorMessage, takeQueryParam } from './sso'

// Settings → Single sign-on (owner) and Linked accounts (everyone), OpenSpec
// `oidc-login`. Both read server state that is never cached for offline use:
// offline, the panels show what they fetched in this session, read-only.

export interface SsoForm {
  issuer: string
  clientId: string
  /** A new secret to store; empty keeps the stored one. */
  clientSecret: string
  displayName: string
  scopes: string
  allowProvision: boolean
  ssoOnly: boolean
  providerLogout: boolean
}

export function formFrom(s: OidcSettings): SsoForm {
  return {
    issuer: s.issuer, clientId: s.clientId, clientSecret: '', displayName: s.displayName, scopes: s.scopes,
    allowProvision: s.allowProvision, ssoOnly: s.ssoOnly, providerLogout: s.providerLogout,
  }
}

/** The PUT body: every field not locked by the environment, the secret only when a new one was typed. */
export function saveInput(s: OidcSettings, f: SsoForm): OidcSettingsInput {
  const locked = (k: string) => s.managedBy[k] === 'env'
  const out: OidcSettingsInput = {
    scopes: f.scopes, allowProvision: f.allowProvision, providerLogout: f.providerLogout,
  }
  if (!locked('issuer')) out.issuer = f.issuer.trim()
  if (!locked('clientId')) out.clientId = f.clientId.trim()
  if (!locked('displayName')) out.displayName = f.displayName.trim()
  if (!locked('ssoOnly')) out.ssoOnly = f.ssoOnly
  if (!locked('clientSecret') && f.clientSecret.trim()) out.clientSecret = f.clientSecret.trim()
  return out
}

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return 'Offline: single sign-on is configured on the server.'
}

/** Container for the owner's provider settings. */
export function SsoPanel() {
  const online = useOnline()
  const [settings, setSettings] = useState<OidcSettings | null>(null)
  const [form, setForm] = useState<SsoForm | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [test, setTest] = useState<OidcTestResult | null>(null)

  const apply = useCallback((s: OidcSettings) => {
    setSettings(s)
    setForm(formFrom(s))
  }, [])

  useEffect(() => {
    if (!online) return
    api.getOidcSettings().then(apply, (err) => setError(describe(err)))
  }, [online, apply])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await fn()
    } catch (err) {
      setError(describe(err))
    } finally {
      setBusy(false)
    }
  }

  if (!settings || !form) {
    return error ? (
      <section className="space-y-2" aria-labelledby="sso-heading">
        <HelpHeading screen="settings/sso" id="sso-heading" className="font-semibold">Single sign-on</HelpHeading>
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </section>
    ) : null
  }
  return (
    <SsoPanelView
      settings={settings} form={form} online={online} busy={busy} error={error} notice={notice} test={test}
      onChange={(patch) => setForm({ ...form, ...patch })}
      onSave={() => void run(async () => {
        apply(await api.saveOidcSettings(saveInput(settings, form)))
        setNotice('Saved.')
      })}
      onTest={() => void run(async () => {
        setTest(await api.testOidc(form.issuer.trim() || undefined))
      })}
      onRemoveSecret={() => void run(async () => {
        apply(await api.saveOidcSettings({ clientSecret: '' }))
        setNotice('Client secret removed.')
      })}
    />
  )
}

export interface SsoPanelViewProps {
  settings: OidcSettings
  form: SsoForm
  online: boolean
  busy: boolean
  error: string | null
  notice: string | null
  test: OidcTestResult | null
  onChange: (patch: Partial<SsoForm>) => void
  onSave: () => void
  onTest: () => void
  onRemoveSecret: () => void
}

function Lock() {
  return (
    <span className="ml-1 inline-flex items-center gap-1 text-xs text-faint" title="Set by an OPENTODO_OIDC_* environment variable">
      <Icon name="lock" size="xs" />
      set by environment
    </span>
  )
}

/** Owner form, pure for tests. */
export function SsoPanelView(p: SsoPanelViewProps) {
  const { settings: s, form: f } = p
  const locked = (k: string) => s.managedBy[k] === 'env'
  const disabled = !p.online || p.busy
  const name = f.displayName.trim() || 'SSO'
  const text = (key: keyof SsoForm, label: string, extra: { placeholder?: string; type?: string; hint?: string } = {}) => (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-600 dark:text-slate-300">{label}{locked(key) && <Lock />}</span>
      <input className="input" type={extra.type ?? 'text'} value={String(f[key])} placeholder={extra.placeholder}
        readOnly={locked(key)} aria-readonly={locked(key)} disabled={disabled}
        onChange={(e) => p.onChange({ [key]: e.target.value } as Partial<SsoForm>)} autoComplete="off" spellCheck={false} />
      {extra.hint && <span className="mt-1 block text-xs text-faint">{extra.hint}</span>}
    </label>
  )
  const toggle = (key: 'allowProvision' | 'ssoOnly' | 'providerLogout', label: string, hint: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={f[key]} disabled={disabled || locked(key)}
        onChange={(e) => p.onChange({ [key]: e.target.checked } as Partial<SsoForm>)} />
      <span>
        {label}{locked(key) && <Lock />}
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  )
  return (
    <section className="space-y-3" aria-labelledby="sso-heading" data-testid="sso-panel">
      <HelpHeading screen="settings/sso" id="sso-heading" className="font-semibold">Single sign-on</HelpHeading>
      <p className="text-sm text-muted">
        Let people sign in with an OpenID Connect provider you already run (Authentik, Keycloak, Authelia, a hosted login service).
        {s.enabled ? ` On: the sign-in screen shows "Sign in with ${name}".` : ' Off until you save an issuer and client id.'}
        {' '}The server only contacts the issuer you enter. See docs/self-hosting/sso.md.
      </p>
      {!p.online && <p className="text-sm text-amber-700 dark:text-amber-400">Offline: these settings are on the server and read-only until you reconnect.</p>}

      <label className="block text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">Redirect URI (paste into your provider)</span>
        <input className="input font-mono text-xs" readOnly value={s.redirectUri} onFocus={(e) => e.currentTarget.select()} aria-describedby="sso-redirect-hint" />
        <span id="sso-redirect-hint" className="mt-1 block text-xs text-faint">
          {s.baseUrlConfigured
            ? 'Taken from OPENTODO_BASE_URL.'
            : 'Derived from the address you are using now. Providers reject mismatches: set OPENTODO_BASE_URL so it never changes.'}
        </span>
      </label>

      {text('issuer', 'Issuer URL', { placeholder: 'https://sso.example.com/realms/home', hint: 'OpenTodo reads <issuer>/.well-known/openid-configuration.' })}
      {text('clientId', 'Client ID')}
      <div className="space-y-1">
        {text('clientSecret', 'Client secret', {
          type: 'password',
          placeholder: s.clientSecretSet ? `${s.clientSecret} (stored; type to replace)` : 'Leave empty for a public client',
        })}
        {s.clientSecretSet && !locked('clientSecret') && (
          <button type="button" className="btn-ghost text-xs" disabled={disabled} onClick={p.onRemoveSecret}>Remove stored secret</button>
        )}
      </div>
      {text('displayName', 'Button label', { placeholder: 'Home SSO', hint: 'Shown as "Sign in with …".' })}
      {text('scopes', 'Scopes', { hint: 'Must include openid; email is needed to match existing accounts.' })}

      {toggle('allowProvision', 'Allow new accounts via SSO',
        'Someone without an account, whose provider confirms their email, gets a member account on first sign-in. Off: only existing accounts (matched by verified email) and open sign-up.')}
      {toggle('ssoOnly', 'Require single sign-on (SSO only)',
        `Members can sign in only with ${name}; passwords and passkeys are refused for them. You keep your password as break-glass: open /?owner=1. API tokens keep working.`)}
      {toggle('providerLogout', `Sign out of ${name} too`,
        'After signing out here, people who signed in with the provider are sent to its sign-out page.')}

      {p.error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{p.error}</p>}
      {p.notice && <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">{p.notice}</p>}
      {p.test && (
        <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
          Provider reachable: sign-in at {p.test.authorizationHost}, tokens from {p.test.tokenHost}
          {p.test.endSessionSupported ? ', provider sign-out supported.' : ', no provider sign-out endpoint.'}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={disabled} onClick={p.onSave}>Save</button>
        <button type="button" className="btn-secondary" disabled={disabled || !f.issuer.trim()} onClick={p.onTest}>
          Test connection
        </button>
      </div>
    </section>
  )
}

// ---- linked accounts (every user) ----

/** Container for the signed-in user's linked identities. */
export function LinkedAccountsPanel() {
  const online = useOnline()
  const [identities, setIdentities] = useState<LinkedIdentity[] | null>(null)
  const [provider, setProvider] = useState<OidcStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The link flow returns to /settings/account (this panel's section) with ?linked=1, ?reauthenticated=1 or ?error=<code>.
  const [notice] = useState<string | null>(() => {
    if (takeQueryParam('linked')) return 'Linked. You can now sign in with the provider.'
    if (takeQueryParam('reauthenticated')) return 'Identity confirmed with the provider.'
    return null
  })
  const [callbackError] = useState(() => takeQueryParam('error'))

  const load = useCallback(async () => {
    try {
      const res = await api.listIdentities()
      setIdentities(res.identities)
      setProvider(res.provider)
    } catch (err) {
      if (err instanceof ApiError) setError(err.message)
    }
  }, [])

  useEffect(() => {
    if (online) void load()
  }, [online, load])

  if (!provider || !identities) return null
  return (
    <LinkedAccountsView
      identities={identities} provider={provider} online={online} busy={busy}
      error={error ?? oidcErrorMessage(callbackError, provider.displayName || undefined)} notice={notice}
      onUnlink={(id) => {
        setBusy(true)
        setError(null)
        api.unlinkIdentity(id)
          .then(load)
          .catch((err) => setError(err instanceof ApiError && err.code === 'last_credential'
            ? 'This is your only way to sign in. Add a passkey or another linked account first.'
            : describe(err)))
          .finally(() => setBusy(false))
      }}
    />
  )
}

export interface LinkedAccountsViewProps {
  identities: LinkedIdentity[]
  provider: OidcStatus
  online: boolean
  busy: boolean
  error: string | null
  notice: string | null
  onUnlink: (id: string) => void
  now?: number
}

/** Linked identities with link and unlink, pure for tests. Hidden when SSO is off and nothing is linked. */
export function LinkedAccountsView(p: LinkedAccountsViewProps) {
  if (!p.provider.enabled && p.identities.length === 0) return null
  const name = p.provider.displayName || 'SSO'
  const disabled = !p.online || p.busy
  return (
    <section className="space-y-2" aria-labelledby="linked-heading" data-testid="linked-accounts">
      <HelpHeading screen="settings/linked-accounts" id="linked-heading" className="font-semibold">Linked accounts</HelpHeading>
      <p className="text-sm text-muted">
        {p.provider.enabled
          ? `Sign in with ${name} instead of a password. Linking also lets you confirm sensitive changes with ${name}.`
          : 'Single sign-on is currently off on this server; these links are kept for when it returns.'}
      </p>
      {!p.online && <p className="text-sm text-amber-700 dark:text-amber-400">Offline: linked accounts are managed on the server.</p>}
      <ul className="divide-y divide-slate-200 dark:divide-slate-800">
        {p.identities.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              {i.email || 'Identity'} <span className="text-xs text-faint">· {hostOf(i.issuer)}</span>
            </span>
            <span className="text-xs text-faint">used {relativeTime(i.lastLoginAt, p.now)}</span>
            <button type="button" className="btn-danger text-xs" disabled={disabled} onClick={() => p.onUnlink(i.id)}
              aria-label={`Unlink ${i.email || 'identity'}`}>
              Unlink
            </button>
          </li>
        ))}
        {p.identities.length === 0 && <li className="py-2 text-sm text-faint">Nothing linked yet.</li>}
      </ul>
      {p.error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{p.error}</p>}
      {p.notice && <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">{p.notice}</p>}
      {p.provider.enabled && (disabled
        ? <button type="button" className="btn-secondary" disabled>Link {name}</button>
        : <a className="btn-ghost inline-block border border-slate-300 dark:border-slate-700" href={OIDC_START_URL}>Link {name}</a>)}
    </section>
  )
}

function hostOf(u: string): string {
  try {
    return new URL(u).host
  } catch {
    return u
  }
}

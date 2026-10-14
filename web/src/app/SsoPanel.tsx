import { Icon } from '../ui/Icon'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Card'
import { Field, Input } from '../ui/Field'
import { Checkbox } from '../ui/Switch'
import { MenuItem } from '../ui/Menu'
import { ConfirmDialog } from '../ui/patterns/ConfirmDialog'
import { EmptyState } from '../ui/patterns/EmptyState'
import { ListRow } from '../ui/patterns/ListRow'
import { Notice } from '../ui/patterns/Notice'
import { SettingRow, SettingsSection } from '../ui/patterns/SettingsSection'
import { Menu } from './overlay/Menu'
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
      <SettingsSection title="Single sign-on" helpId="settings/sso" headingId="sso-heading">
        <Notice tone="danger">{error}</Notice>
      </SettingsSection>
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

/** Owner panel, pure for tests: a summary of the provider, the configuration behind "Configure". */
export function SsoPanelView(p: SsoPanelViewProps & { configuring?: boolean }) {
  const { settings: s, form: f } = p
  const [open, setOpen] = useState(p.configuring ?? false)
  const opener = useRef<HTMLButtonElement>(null)
  const first = useRef<HTMLInputElement>(null)
  const wasOpen = useRef(open)
  useEffect(() => {
    if (open && !wasOpen.current) first.current?.focus()
    else if (!open && wasOpen.current) opener.current?.focus()
    wasOpen.current = open
  }, [open])
  const locked = (k: string) => s.managedBy[k] === 'env'
  const disabled = !p.online || p.busy
  const name = f.displayName.trim() || 'SSO'
  const text = (key: keyof SsoForm, label: string, extra: { placeholder?: string; type?: string; hint?: string; inputRef?: React.Ref<HTMLInputElement> } = {}) => (
    <Field label={<>{label}{locked(key) && <Lock />}</>} description={extra.hint}>
      <Input ref={extra.inputRef} type={extra.type ?? 'text'} value={String(f[key])} placeholder={extra.placeholder}
        readOnly={locked(key)} aria-readonly={locked(key)} disabled={disabled}
        onChange={(e) => p.onChange({ [key]: e.target.value } as Partial<SsoForm>)} autoComplete="off" spellCheck={false} />
    </Field>
  )
  const toggle = (key: 'allowProvision' | 'ssoOnly' | 'providerLogout', label: string, hint: string) => (
    <Checkbox checked={f[key]} disabled={disabled || locked(key)} label={<>{label}{locked(key) && <Lock />}</>} description={hint}
      onChange={(e) => p.onChange({ [key]: e.target.checked } as Partial<SsoForm>)} />
  )
  return (
    <SettingsSection title="Single sign-on" helpId="settings/sso" headingId="sso-heading" testId="sso-panel"
      description="Let people sign in with an OpenID Connect provider you already run (Authentik, Keycloak, Authelia, a hosted login service). The server only contacts the issuer you enter.">
      {!p.online && <Notice>Offline: these settings are on the server and read-only until you reconnect.</Notice>}
      <SettingRow label="Status" status={
        <span className="flex flex-wrap items-center gap-2" data-testid="sso-status">
          <Badge hue={s.enabled ? 'green' : 'slate'}>{s.enabled ? 'On' : 'Off'}</Badge>
          <span>{s.enabled ? `The sign-in screen shows "Sign in with ${name}"${s.issuer ? ` (${hostOf(s.issuer)})` : ''}.` : 'Off until you save an issuer and client id.'}</span>
          {s.ssoOnly && <Badge hue="orange">SSO only</Badge>}
        </span>
      } control={!open && <Button ref={opener} variant="secondary" onClick={() => setOpen(true)} aria-expanded={false}>Configure</Button>} />
      {p.notice && !open && <Notice tone="success">{p.notice}</Notice>}
      {open && (
        <div className="space-y-4 py-3" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }}>
          <Field label="Redirect URI (paste into your provider)" description={s.baseUrlConfigured
            ? 'Taken from OPENTODO_BASE_URL.'
            : 'Derived from the address you are using now. Providers reject mismatches: set OPENTODO_BASE_URL so it never changes.'}>
            <Input className="font-mono text-meta" readOnly value={s.redirectUri} onFocus={(e) => e.currentTarget.select()} />
          </Field>
          {text('issuer', 'Issuer URL', { placeholder: 'https://sso.example.com/realms/home', hint: 'OpenTodo reads <issuer>/.well-known/openid-configuration.', inputRef: first })}
          {text('clientId', 'Client ID')}
          <div className="space-y-1">
            {text('clientSecret', 'Client secret', {
              type: 'password',
              placeholder: s.clientSecretSet ? `${s.clientSecret} (stored; type to replace)` : 'Leave empty for a public client',
            })}
            {s.clientSecretSet && !locked('clientSecret') && (
              <Button variant="ghost" size="sm" disabled={disabled} onClick={p.onRemoveSecret}>Remove stored secret</Button>
            )}
          </div>
          {text('displayName', 'Button label', { placeholder: 'Home SSO', hint: 'Shown as "Sign in with …".' })}
          {text('scopes', 'Scopes', { hint: 'Must include openid; email is needed to match existing accounts.' })}
          <div className="space-y-3">
            {toggle('allowProvision', 'Allow new accounts via SSO',
              'Someone without an account, whose provider confirms their email, gets a member account on first sign-in. Off: only existing accounts (matched by verified email) and open sign-up.')}
            {toggle('ssoOnly', 'Require single sign-on (SSO only)',
              `Members can sign in only with ${name}; passwords and passkeys are refused for them. You keep your password as break-glass: open /?owner=1. API tokens keep working.`)}
            {toggle('providerLogout', `Sign out of ${name} too`,
              'After signing out here, people who signed in with the provider are sent to its sign-out page.')}
          </div>
          {p.error && <Notice tone="danger">{p.error}</Notice>}
          {p.notice && <Notice tone="success">{p.notice}</Notice>}
          {p.test && (
            <Notice tone="success">
              Provider reachable: sign-in at {p.test.authorizationHost}, tokens from {p.test.tokenHost}
              {p.test.endSessionSupported ? ', provider sign-out supported.' : ', no provider sign-out endpoint.'}
            </Notice>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            <Button variant="secondary" disabled={disabled || !f.issuer.trim()} onClick={p.onTest}>Test connection</Button>
            <Button variant="primary" disabled={disabled} onClick={p.onSave}>Save</Button>
          </div>
        </div>
      )}
      {!open && p.error && <Notice tone="danger">{p.error}</Notice>}
    </SettingsSection>
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
  // The link flow returns to /settings/security (this panel's section) with ?linked=1, ?reauthenticated=1 or ?error=<code>.
  const [notice] = useState<string | null>(() => {
    if (takeQueryParam('linked')) return 'Linked. You can now sign in with the provider.'
    if (takeQueryParam('reauthenticated')) return 'Identity confirmed with the provider.'
    return null
  })
  const [callbackError] = useState(() => takeQueryParam('error'))
  const [confirmId, setConfirmId] = useState<string | null>(null)

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
  const unlinking = identities.find((i) => i.id === confirmId)
  return (
    <>
    <LinkedAccountsView
      identities={identities} provider={provider} online={online} busy={busy}
      error={error ?? oidcErrorMessage(callbackError, provider.displayName || undefined)} notice={notice}
      onUnlink={(id) => setConfirmId(id)}
    />
    {unlinking && (
      <ConfirmDialog title={`Unlink ${unlinking.email || 'this identity'}?`} confirmLabel="Unlink"
        consequence={`You will no longer be able to sign in with ${provider.displayName || 'SSO'} using this account. Your password and passkeys keep working.`}
        onCancel={() => setConfirmId(null)} onConfirm={() => {
        const id = unlinking.id
        setBusy(true)
        setError(null)
        api.unlinkIdentity(id)
          .then(load)
          .catch((err) => setError(err instanceof ApiError && err.code === 'last_credential'
            ? 'This is your only way to sign in. Add a passkey or another linked account first.'
            : describe(err)))
          .finally(() => setBusy(false))
      }} />
    )}
    </>
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
  const link = p.provider.enabled && (disabled
    ? <Button variant="secondary" disabled>Link {name}</Button>
    : <a className="ui-btn ui-btn--secondary ui-btn--md" href={OIDC_START_URL}>Link {name}</a>)
  return (
    <SettingsSection title="Linked accounts" helpId="settings/linked-accounts" headingId="linked-heading" testId="linked-accounts"
      description={p.provider.enabled
        ? `Sign in with ${name} instead of a password. Linking also lets you confirm sensitive changes with ${name}.`
        : 'Single sign-on is currently off on this server; these links are kept for when it returns.'}>
      {!p.online && <Notice>Offline: linked accounts are managed on the server.</Notice>}
      {p.notice && <Notice tone="success">{p.notice}</Notice>}
      {p.error && <Notice tone="danger">{p.error}</Notice>}
      {p.identities.length === 0 ? (
        <EmptyState icon="link" title="Nothing linked yet" body={`Link your ${name} account to sign in with it.`} action={link || undefined} />
      ) : (
        <>
          <div className="-mx-3 py-1">
            {p.identities.map((i) => (
              <ListRow key={i.id} leading={<Icon name="link" size="md" />} label={i.email || 'Identity'}
                meta={`${hostOf(i.issuer)} · used ${relativeTime(i.lastLoginAt, p.now)}`}
                menu={(
                  <Menu label={`Actions for ${i.email || 'identity'}`} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
                    <MenuItem label={`Unlink ${i.email || 'identity'}`} icon="x" danger disabled={disabled} onSelect={() => p.onUnlink(i.id)} />
                  </Menu>
                )} />
            ))}
          </div>
          {link && <div className="pt-2">{link}</div>}
        </>
      )}
    </SettingsSection>
  )
}

function hostOf(u: string): string {
  try {
    return new URL(u).host
  } catch {
    return u
  }
}

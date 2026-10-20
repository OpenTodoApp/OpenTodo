import { Icon, Menu } from '../ui'
import { Tooltip } from '../ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../ui'
import { Badge } from '../ui'
import { Field, Input } from '../ui'
import { Checkbox } from '../ui'
import { MenuItem } from '../ui'
import { ConfirmDialog } from '../ui'
import { EmptyState } from '../ui'
import { ListRow } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { api, ApiError, OIDC_START_URL } from '../lib/api'
import { useOnline } from '../lib/online'
import type { LinkedIdentity, OidcSettings, OidcSettingsInput, OidcStatus, OidcTestResult } from '../lib/types'
import { relativeTime } from './SecurityPanel'
import { oidcErrorMessage, takeQueryParam } from './sso'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'

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
  return t('Offline: single sign-on is configured on the server.')
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
      <SettingsSection {...cardCopy('sso')}>
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
        setNotice(t('Saved.'))
      })}
      onTest={() => void run(async () => {
        setTest(await api.testOidc(form.issuer.trim() || undefined))
      })}
      onRemoveSecret={() => void run(async () => {
        apply(await api.saveOidcSettings({ clientSecret: '' }))
        setNotice(t('Client secret removed.'))
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
    <Tooltip label={t('Set by an OPENTODO_OIDC_* environment variable')}>
      <span className="ml-1 inline-flex items-center gap-1 rounded-chip text-meta text-faint" tabIndex={0}>
        <Icon name="lock" size="xs" />{t('set by environment')}
      </span>
    </Tooltip>
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
    <SettingsSection {...cardCopy('sso')} testId="sso-panel">
      {!p.online && <Notice>{noticeCopy('sso', 'offline')}</Notice>}
      <SettingRow {...rowCopy('sso', 'status')} status={
        <span className="flex flex-wrap items-center gap-2" data-testid="sso-status">
          <Badge hue={s.enabled ? 'green' : 'slate'}>{s.enabled ? t('On') : t('Off')}</Badge>
          <span>{s.enabled ? (s.issuer ? t('The sign-in screen shows "Sign in with {name}" ({host}).', { name, host: hostOf(s.issuer) }) : t('The sign-in screen shows "Sign in with {name}".', { name })) : t('Off until you save an issuer and client id.')}</span>
          {s.ssoOnly && <Badge hue="orange">{t('SSO only')}</Badge>}
        </span>
      } control={!open && <Button ref={opener} variant="secondary" onClick={() => setOpen(true)} aria-expanded={false}>{t('Configure')}</Button>} />
      {p.notice && !open && <Notice tone="success">{p.notice}</Notice>}
      {open && (
        <div className="space-y-4 py-3" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }}>
          <Field label={t('Redirect URI (paste into your provider)')} description={s.baseUrlConfigured
            ? t('Taken from OPENTODO_BASE_URL.')
            : t('Derived from the address you are using now. Providers reject mismatches: set OPENTODO_BASE_URL so it never changes.')}>
            <Input className="font-mono text-meta" readOnly value={s.redirectUri} onFocus={(e) => e.currentTarget.select()} />
          </Field>
          {text('issuer', t('Issuer URL'), { placeholder: 'https://sso.example.com/realms/home', hint: t('OpenTodo reads {path}.', { path: '<issuer>/.well-known/openid-configuration' }), inputRef: first })}
          {text('clientId', t('Client ID'))}
          <div className="space-y-1">
            {text('clientSecret', t('Client secret'), {
              type: 'password',
              placeholder: s.clientSecretSet ? t('{secret} (stored; type to replace)', { secret: s.clientSecret }) : t('Leave empty for a public client'),
            })}
            {s.clientSecretSet && !locked('clientSecret') && (
              <Button variant="ghost" size="sm" disabled={disabled} onClick={p.onRemoveSecret}>{t('Remove stored secret')}</Button>
            )}
          </div>
          {text('displayName', t('Button label'), { placeholder: t('Home SSO'), hint: t('Shown as "Sign in with …".') })}
          {text('scopes', t('Scopes'), { hint: t('Must include openid; email is needed to match existing accounts.') })}
          <div className="space-y-3">
            {toggle('allowProvision', t('Allow new accounts via SSO'),
              t('Someone without an account, whose provider confirms their email, gets a member account on first sign-in. Off: only existing accounts (matched by verified email) and open sign-up.'))}
            {toggle('ssoOnly', t('Require single sign-on (SSO only)'),
              t('Members can sign in only with {name}; passwords and passkeys are refused for them. You keep your password as break-glass: open {path}. API tokens keep working.', { name, path: '/?owner=1' }))}
            {toggle('providerLogout', t('Sign out of {name} too', { name }),
              t('After signing out here, people who signed in with the provider are sent to its sign-out page.'))}
          </div>
          {p.error && <Notice tone="danger">{p.error}</Notice>}
          {p.notice && <Notice tone="success">{p.notice}</Notice>}
          {p.test && (
            <Notice tone="success">
              {p.test.endSessionSupported
                ? t('Provider reachable: sign-in at {authHost}, tokens from {tokenHost}, provider sign-out supported.', { authHost: p.test.authorizationHost, tokenHost: p.test.tokenHost })
                : t('Provider reachable: sign-in at {authHost}, tokens from {tokenHost}, no provider sign-out endpoint.', { authHost: p.test.authorizationHost, tokenHost: p.test.tokenHost })}
            </Notice>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>{t('Close')}</Button>
            <Button variant="secondary" disabled={disabled || !f.issuer.trim()} onClick={p.onTest}>{t('Test connection')}</Button>
            <Button variant="primary" disabled={disabled} onClick={p.onSave}>{t('Save')}</Button>
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
    if (takeQueryParam('linked')) return t('Linked. You can now sign in with the provider.')
    if (takeQueryParam('reauthenticated')) return t('Identity confirmed with the provider.')
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
      <ConfirmDialog title={(unlinking.email ? t('Unlink {email}?', { email: unlinking.email }) : t('Unlink this identity?'))} confirmLabel={t('Unlink')}
        consequence={t('You will no longer be able to sign in with {provider} using this account. Your password and passkeys keep working.', { provider: provider.displayName || 'SSO' })}
        onCancel={() => setConfirmId(null)} onConfirm={() => {
        const id = unlinking.id
        setBusy(true)
        setError(null)
        api.unlinkIdentity(id)
          .then(load)
          .catch((err) => setError(err instanceof ApiError && err.code === 'last_credential'
            ? t('This is your only way to sign in. Add a passkey or another linked account first.')
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
    ? <Button variant="secondary" disabled>{t('Link {name}', { name })}</Button>
    : <a className="ui-btn ui-btn--secondary ui-btn--md" href={OIDC_START_URL}>{t('Link {name}', { name })}</a>)
  return (
    <SettingsSection {...cardCopy('linked', { variant: p.provider.enabled ? 'on' : 'off', values: { name } })} testId="linked-accounts">
      {!p.online && <Notice>{noticeCopy('linked', 'offline')}</Notice>}
      {p.notice && <Notice tone="success">{p.notice}</Notice>}
      {p.error && <Notice tone="danger">{p.error}</Notice>}
      {p.identities.length === 0 ? (
        <EmptyState icon="link" title={t('Nothing linked yet')} body={t('Link your {name} account to sign in with it.', { name })} control={link || undefined} />
      ) : (
        <>
          <div className="-mx-3 py-1">
            {p.identities.map((i) => (
              <ListRow key={i.id} leading={<Icon name="link" size="md" />} label={i.email || t('Identity')}
                meta={t('{hostOf} · used {relativeTime}', { hostOf: hostOf(i.issuer), relativeTime: relativeTime(i.lastLoginAt, p.now) })}
                menu={(
                  <Menu label={(i.email ? t('Actions for {name}', { name: i.email }) : t('Actions for this identity'))} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
                    <MenuItem label={(i.email ? t('Unlink {email}', { email: i.email }) : t('Unlink this identity'))} icon="x" danger disabled={disabled} onSelect={() => p.onUnlink(i.id)} />
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

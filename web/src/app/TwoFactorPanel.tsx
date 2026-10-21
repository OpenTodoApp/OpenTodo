import { Badge, Select, SettingRow, SettingsSection, Dialog, Menu } from '../ui'
import { Button } from '../ui'
import { Icon } from '../ui'
import { MenuItem } from '../ui'
import { ConfirmDialog } from '../ui'
import { ListRow } from '../ui'
import { Notice } from '../ui'
import { requestSettingsFocus } from './settingsIndex'
import { navigate } from './router'
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import { qrMatrix, qrPath } from '../lib/qr'
import type { MfaPolicy, MfaStatus, TrustedDevice, User } from '../lib/types'
import { relativeTime } from './SecurityPanel'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t, msg, translatedMap, currentLanguage } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'

// Settings → Two-factor authentication and the enrolment wizard (OpenSpec
// `mfa-totp`). The server is authoritative; the last known status is cached
// in localStorage (non-secret booleans and a count) so the panel can show it
// read-only while offline. The secret and recovery codes live in component
// state only and are never stored.

const STATUS_KEY = 'opentodo.mfa'

export function readCachedMfa(): MfaStatus | null {
  try {
    const raw = localStorage.getItem(STATUS_KEY)
    return raw ? (JSON.parse(raw) as MfaStatus) : null
  } catch {
    return null
  }
}

export function cacheMfa(st: MfaStatus | null) {
  try {
    if (st) localStorage.setItem(STATUS_KEY, JSON.stringify(st))
    else localStorage.removeItem(STATUS_KEY)
  } catch {
    /* storage unavailable: the status is fetched again next time */
  }
}

/** Splits a base32 secret into groups of four for typing into an app. */
export function groupKey(secret: string): string {
  return secret.replace(/(.{4})/g, '$1 ').trim()
}

/** A QR code rendered as SVG from the provisioning URI, entirely in the browser. */
export function QrCode({ text, size = 192 }: { text: string; size?: number }) {
  const { n, d } = useMemo(() => {
    const m = qrMatrix(text)
    return { n: m.length, d: qrPath(m) }
  }, [text])
  const quiet = 4
  return (
    <svg
      role="img" aria-label={t('QR code to scan with your authenticator app')} width={size} height={size}
      viewBox={`${-quiet} ${-quiet} ${n + 2 * quiet} ${n + 2 * quiet}`} shapeRendering="crispEdges" className="rounded-control"
    >
      {/* A QR code stays black on white in every theme so authenticator apps can scan it. */}
      <rect x={-quiet} y={-quiet} width={n + 2 * quiet} height={n + 2 * quiet} fill="#fff" /> {/* token-lint-allow */}
      <path d={d} fill="#000" /> {/* token-lint-allow */}
    </svg>
  )
}

export function mfaMessage(err: unknown): string {
  if (isNetworkError(err)) return t('You are offline. Two-factor settings need a connection to your server.')
  const e = err as ApiError
  switch (e.code) {
    case 'mfa_code_invalid':
      return t('That code does not match. Check that your phone sets its clock automatically and type the newest code. If more than ten minutes passed, start again.')
    case 'mfa_required_by_policy':
      return t('The server owner requires two-factor authentication for your account, so it cannot be turned off.')
    case 'reauth_required':
      return t('Confirm your password to continue.')
    default:
      return e.message
  }
}

// ---- recovery codes ----

export interface RecoveryCodesViewProps {
  codes: string[]
  acknowledged: boolean
  copied: boolean
  onAcknowledge: (v: boolean) => void
  onCopy: () => void
  onDownload: () => void
  onDone: () => void
}

/** The recovery codes, shown once, with copy, download and an acknowledgement. */
export function RecoveryCodesView(p: RecoveryCodesViewProps) {
  return (
    <div className="space-y-3 rounded-control border border-success/40 bg-success-soft p-3 text-body" data-testid="recovery-codes">
      <p className="font-medium">{t('Save these recovery codes now. They will not be shown again.')}</p>
      <p className="text-muted">
        {t('Each code signs you in once if you lose your phone. Keep them somewhere safe, away from this device.')}
      </p>
      <ol className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono">
        {p.codes.map((c) => <li key={c}>{c}</li>)}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--md" onClick={p.onCopy}>{p.copied ? t('Copied') : t('Copy codes')}</button>
        <button type="button" className="ui-btn ui-btn--secondary ui-btn--md" onClick={p.onDownload}>{t('Download as text')}</button>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={p.acknowledged} onChange={(e) => p.onAcknowledge(e.target.checked)} />
        {t('I have saved my recovery codes')}
      </label>
      <button type="button" className="ui-btn ui-btn--primary ui-btn--md" disabled={!p.acknowledged} onClick={p.onDone}>{t('Done')}</button>
    </div>
  )
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [copied, setCopied] = useState(false)
  const text = `${t('OpenTodo recovery codes ({host})', { host: location.host })}\n${t('Each code works once.')}\n\n${codes.join('\n')}\n`
  return (
    <RecoveryCodesView
      codes={codes} acknowledged={acknowledged} copied={copied} onAcknowledge={setAcknowledged} onDone={onDone}
      onCopy={() => void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false))}
      onDownload={() => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
        const a = document.createElement('a')
        a.href = url
        a.download = 'opentodo-recovery-codes.txt'
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}
    />
  )
}

// ---- enrolment wizard ----

export interface Enrollment { secret: string; uri: string; expiresAt: number }

export interface EnrolmentStepViewProps {
  enrollment: Enrollment
  code: string
  busy: boolean
  disabled: boolean
  error: string | null
  onCode: (v: string) => void
  onConfirm: () => void
  onCancel?: () => void
}

/** Scan (or type the key), then confirm with the first code. */
export function EnrolmentStepView(p: EnrolmentStepViewProps) {
  function submit(e: FormEvent) {
    e.preventDefault()
    p.onConfirm()
  }
  return (
    <div className="space-y-3" data-testid="enrolment-wizard">
      <ol className="list-decimal space-y-1 pl-5 text-body text-muted">
        <li>{t('Open an authenticator app on your phone (any app that supports time-based codes).')}</li>
        <li>{t('Scan this QR code, or enter the key by hand.')}</li>
        <li>{t('Type the six-digit code the app shows.')}</li>
      </ol>
      <div className="flex flex-wrap items-center gap-4">
        <QrCode text={p.enrollment.uri} />
        <div className="text-body">
          <p className="text-muted">{t('Key for manual entry (time-based, 6 digits, 30 s):')}</p>
          <code className="mt-1 block select-all break-all font-mono text-body" data-testid="manual-key">{groupKey(p.enrollment.secret)}</code>
        </div>
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
        <label className="text-body">
          <span className="mb-1 block text-muted">{t('Code from the app')}</span>
          <input
            className="ui-input w-36 font-mono tracking-widest" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7}
            required autoFocus value={p.code} onChange={(e) => p.onCode(e.target.value)} disabled={p.disabled} aria-label={t('Code from the app')}
          />
        </label>
        <button className="ui-btn ui-btn--primary ui-btn--md" disabled={p.disabled || p.busy}>{p.busy ? t('Checking…') : t('Turn on')}</button>
        {p.onCancel && <button type="button" className="ui-btn ui-btn--ghost ui-btn--md" onClick={p.onCancel}>{t('Cancel')}</button>}
      </form>
      {p.error && <p className="text-body text-danger" role="alert">{p.error}</p>}
    </div>
  )
}

/**
 * The whole enrolment: fetch a secret, confirm a code, show the recovery codes.
 * onEnrolled runs after the user acknowledged the codes.
 */
export function EnrolmentWizard({ online, onEnrolled, onCancel }: { online: boolean; onEnrolled: () => void; onCancel?: () => void }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = useCallback(async () => {
    setError(null)
    try {
      setEnrollment(await api.enrollTotp())
    } catch (err) {
      setError(mfaMessage(err))
    }
  }, [])
  useEffect(() => {
    if (online && !enrollment && !codes) void start()
  }, [online, enrollment, codes, start])

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const res = await api.confirmTotp(code)
      cacheMfa(res.mfa)
      setCodes(res.recoveryCodes)
    } catch (err) {
      setError(mfaMessage(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  if (codes) return <RecoveryCodes codes={codes} onDone={onEnrolled} />
  if (!enrollment) {
    return (
      <div className="space-y-2 text-body">
        {error ? <p className="text-danger" role="alert">{error}</p> : <p className="text-muted">{online ? t('Preparing…') : t('Setting up two-factor authentication needs a connection.')}</p>}
        <div className="flex gap-2">
          {error && <button type="button" className="ui-btn ui-btn--primary ui-btn--md" disabled={!online} onClick={() => void start()}>{t('Try again')}</button>}
          {onCancel && <button type="button" className="ui-btn ui-btn--ghost ui-btn--md" onClick={onCancel}>{t('Cancel')}</button>}
        </div>
      </div>
    )
  }
  return (
    <EnrolmentStepView
      enrollment={enrollment} code={code} busy={busy} disabled={!online} error={error}
      onCode={setCode} onConfirm={() => void confirm()} onCancel={onCancel}
    />
  )
}

// ---- Settings panel ----

export interface TwoFactorPanelViewProps {
  status: MfaStatus | null
  online: boolean
  isOwner: boolean
  busy: boolean
  error: string | null
  devices: TrustedDevice[] | null
  policy: MfaPolicy | null
  onStart: () => void
  onDisable: () => void
  onRegenerate: () => void
  onForgetDevice: (id: string) => void
  onForgetAll: () => void
  now?: number
}

/** A label inside a sentence: lower case in English ("required for every account"); other languages keep their own case. */
const sentenceCase = (s: string) => (currentLanguage() === 'en' ? s.toLowerCase() : s)

export const POLICY_LABEL = translatedMap<MfaPolicy>({
  none: msg('Optional for everyone'),
  owner: msg('Required for the owner'),
  all: msg('Required for every account'),
})

/** Presentational part of the Settings section, rendered without effects for tests. */
export function TwoFactorPanelView(p: TwoFactorPanelViewProps) {
  const dt = useDateTimeFormat()
  const disabled = !p.online || p.busy
  const st = p.online ? p.status : null
  const few = !!st?.enrolled && st.recoveryCodesRemaining <= 3
  return (
    <SettingsSection {...cardCopy('mfa')} testId="mfa-panel">
      {!p.online && <Notice>{noticeCopy('mfa', 'offline')}</Notice>}
      {st && (
        <SettingRow {...rowCopy('mfa', 'status')} status={
          <span className="flex flex-wrap items-center gap-2" data-testid="mfa-status">
            <Badge hue={st.enrolled ? (few ? 'orange' : 'green') : 'slate'}>{st.enrolled ? t('On') : t('Off')}</Badge>
            {st.enrolled && <span>{t('{recoveryCodesRemaining} of 10 recovery codes left', { recoveryCodesRemaining: st.recoveryCodesRemaining })}</span>}
            {st.required && <span className="text-muted">{t('Required by the server owner')}</span>}
          </span>
        } control={!st.enrolled && <Button variant="primary" disabled={disabled} onClick={p.onStart}>{t('Set up two-factor authentication')}</Button>} />
      )}
      {few && <Notice tone="warning">{noticeCopy('mfa', 'few')}</Notice>}
      {st?.enrolled && (
        <SettingRow {...rowCopy('mfa', 'recovery')}
          control={<Button variant={few ? 'primary' : 'secondary'} disabled={disabled} onClick={p.onRegenerate}>{t('New recovery codes')}</Button>} />
      )}
      {p.error && <Notice tone="danger">{p.error}</Notice>}

      {st?.enrolled && (
        <div className="space-y-1 py-3">
          <h3 className="text-body font-medium text-default">{t('Remembered browsers')}</h3>
          <p className="text-meta text-muted">{t('These browsers skip the code for 30 days after you chose "Remember this device".')}</p>
          {p.devices && p.devices.length === 0 && <p className="py-2 text-meta text-faint">{t('No remembered browsers.')}</p>}
          <div className="-mx-3">
            {p.devices?.map((d) => (
              <ListRow key={d.id} leading={<Icon name="globe" size="md" />} label={browserName(d.userAgent)}
                meta={t('Used {relativeTime} · until {instant}', { relativeTime: relativeTime(d.lastUsedAt ?? d.createdAt, p.now), instant: dt.formatInstant(d.expiresAt, 'date') })}
                menu={(
                  <Menu label={t('Actions for {browserName}', { browserName: browserName(d.userAgent) })} trigger={<Icon name="ellipsis" />} kind="menu"
                    triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
                    <MenuItem label={t('Forget this browser')} icon="x" danger disabled={disabled} onSelect={() => p.onForgetDevice(d.id)} />
                  </Menu>
                )} />
            ))}
          </div>
          {p.devices && p.devices.length > 0 && (
            <Button variant="secondary" size="sm" disabled={disabled} onClick={p.onForgetAll}>{t('Forget all browsers')}</Button>
          )}
        </div>
      )}

      {st?.enrolled && (
        <SettingRow {...rowCopy('mfa', 'off', { variant: st.required ? 'required' : 'optional' })}
          control={<Button variant="danger" disabled={disabled || st.required} onClick={p.onDisable}>{t('Turn off')}</Button>} />
      )}
      {p.isOwner && (
        <p className="pt-3 text-meta text-muted" data-testid="mfa-policy-link">
          {t.rich('Server policy: {policy}. <a>People → Access policies</a>', { policy: sentenceCase(POLICY_LABEL[p.policy ?? p.status?.policy ?? 'none']), a: (chunks) => <a className="text-accent underline" href="/settings/people" onClick={(e) => { e.preventDefault(); requestSettingsFocus('access-policies'); navigate({ view: 'settings', section: 'people' }) }}>{chunks}</a> })}
        </p>
      )}
    </SettingsSection>
  )
}

/**
 * Full-screen enrolment for a session the owner's policy restricts: the
 * account must set up a second factor before it can use anything else. Local
 * data stays on the device and its queued changes upload after enrolment.
 */
export function EnrolmentGate({ user, onEnrolled, onLogout }: { user: User; onEnrolled: () => void; onLogout: () => void }) {
  const online = useOnline()
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-lg space-y-4 rounded-card border border-default bg-surface p-6 shadow-1" data-testid="enrolment-gate">{/* surface-lint-allow: the enrolment gate replaces the page */}
        <div>
          <h1 className="text-h3 font-semibold">{t('Set up two-factor authentication')}</h1>
          <p className="mt-1 text-body text-muted">
            {t('The owner of this server requires a second sign-in step for {email}. Set it up to continue; your tasks and any changes waiting on this device are kept and sync as soon as you are done.', { email: user.email })}
          </p>
        </div>
        <EnrolmentWizard online={online} onEnrolled={onEnrolled} />
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm text-meta" onClick={onLogout}>{t('Sign out')}</button>
      </div>
    </div>
  )
}

/** A short, human name for a stored user agent. */
export function browserName(ua: string): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : t('Browser')
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} on ${os}` : browser
}

/** Container: loads status, devices and (for the owner) the policy, and runs actions. */
export function TwoFactorPanel({ user }: { user: User }) {
  const online = useOnline()
  const isOwner = user.role === 'owner'
  const [status, setStatus] = useState<MfaStatus | null>(readCachedMfa)
  const [devices, setDevices] = useState<TrustedDevice[] | null>(null)
  const [policy, setPolicy] = useState<MfaPolicy | null>(null)
  const [mode, setMode] = useState<'idle' | 'enrol' | { codes: string[] }>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { mfa } = await api.mfaStatus()
      setStatus(mfa)
      cacheMfa(mfa)
      setDevices(mfa.enrolled ? (await api.listTrustedDevices()).devices : [])
      if (isOwner) setPolicy((await api.getMfaPolicy()).required)
    } catch (err) {
      if (!isNetworkError(err)) setError(mfaMessage(err))
    }
  }, [isOwner])
  useEffect(() => {
    if (online) void load()
  }, [online, load])

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      await load()
    } catch (err) {
      // A cancelled re-authentication leaves reauth_required; nothing changed.
      if (!(err instanceof ApiError && err.code === 'reauth_required')) setError(mfaMessage(err))
    } finally {
      setBusy(false)
    }
  }, [load])

  const [confirming, setConfirming] = useState<'disable' | 'regenerate' | null>(null)
  return (
    <>
      <TwoFactorPanelView
        status={status} online={online} isOwner={isOwner} busy={busy} error={error} devices={devices} policy={policy}
        onStart={() => setMode('enrol')}
        onDisable={() => setConfirming('disable')}
        onRegenerate={() => setConfirming('regenerate')}
        onForgetDevice={(id) => void run(() => api.forgetTrustedDevice(id))}
        onForgetAll={() => void run(() => api.forgetTrustedDevices())}
      />
      {mode === 'enrol' && (
        <Dialog title={t('Set up two-factor authentication')} onClose={() => setMode('idle')} size="md" dismissable={false}>
          <EnrolmentWizard online={online} onCancel={() => setMode('idle')} onEnrolled={() => { setMode('idle'); void load() }} />
        </Dialog>
      )}
      {typeof mode === 'object' && (
        <Dialog title={t('Your new recovery codes')} onClose={() => setMode('idle')} size="md" dismissable={false}>
          <RecoveryCodes codes={mode.codes} onDone={() => setMode('idle')} />
        </Dialog>
      )}
      {confirming === 'disable' && (
        <ConfirmDialog title={t('Turn off two-factor authentication?')} confirmLabel={t('Turn off')}
          consequence={t('Sign-in will need only your password, and remembered browsers are forgotten.')}
          onConfirm={() => run(() => api.disableTotp())} onCancel={() => setConfirming(null)} />
      )}
      {confirming === 'regenerate' && (
        <ConfirmDialog title={t('Create new recovery codes?')} confirmLabel={t('Create new codes')}
          consequence={t('Your current recovery codes stop working. Store the new set somewhere safe.')}
          onConfirm={() => run(async () => setMode({ codes: (await api.regenerateRecoveryCodes()).recoveryCodes }))} onCancel={() => setConfirming(null)} />
      )}
    </>
  )
}

/** Owner: the server's two-factor policy (Settings → People; same guide section as the panel). */
export function MfaPolicyPanelView({ policy, online, busy, error, onPolicy }: {
  policy: MfaPolicy | null
  online: boolean
  busy: boolean
  error: string | null
  onPolicy: (p: MfaPolicy) => void
}) {
  return (
    <SettingsSection {...cardCopy('mfa-policy')} testId="mfa-policy-panel">
      <SettingRow {...rowCopy('mfa-policy', 'policy')} htmlFor="mfa-policy-select"
        status={policy ? <Badge hue={policy === 'none' ? 'slate' : 'green'}>{POLICY_LABEL[policy]}</Badge> : undefined}
        control={
          <Select id="mfa-policy-select" className="max-w-xs" value={policy ?? 'none'} disabled={!online || busy || policy === null}
            onChange={(e) => onPolicy(e.target.value as MfaPolicy)} aria-label={t('Two-factor policy for this server')}>
            {(Object.keys(POLICY_LABEL) as MfaPolicy[]).map((k) => <option key={k} value={k}>{POLICY_LABEL[k]}</option>)}
          </Select>
        } />
      {error && <p className="py-2 text-meta text-danger" role="alert">{error}</p>}
    </SettingsSection>
  )
}

/** Container for the owner's two-factor policy. */
export function MfaPolicyPanel() {
  const online = useOnline()
  const [policy, setPolicy] = useState<MfaPolicy | null>(null)
  const [enrolled, setEnrolled] = useState<boolean | null>(readCachedMfa()?.enrolled ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A policy that binds the owner too waits for an in-app confirmation.
  const [pending, setPending] = useState<MfaPolicy | null>(null)
  useEffect(() => {
    if (!online) return
    void (async () => {
      try {
        setPolicy((await api.getMfaPolicy()).required)
        setEnrolled((await api.mfaStatus()).mfa.enrolled)
      } catch (err) {
        if (!isNetworkError(err)) setError(mfaMessage(err))
      }
    })()
  }, [online])
  const apply = (p: MfaPolicy) => {
    setBusy(true)
    setError(null)
    void api.setMfaPolicy(p).then((r) => setPolicy(r.required), (err) => {
      if (!(err instanceof ApiError && err.code === 'reauth_required')) setError(mfaMessage(err))
    }).finally(() => setBusy(false))
  }
  return (
    <>
      <MfaPolicyPanelView policy={policy} online={online} busy={busy} error={error}
        onPolicy={(p) => { if (p !== 'none' && enrolled === false) setPending(p); else apply(p) }} />
      {pending && (
        <ConfirmDialog title={t('Require two-factor authentication?')} confirmLabel={t('Continue')} tone="default"
          consequence={t('You have not set up two-factor authentication yourself. After this change you must set it up before you can continue.')}
          onConfirm={() => apply(pending)} onCancel={() => setPending(null)} />
      )}
    </>
  )
}

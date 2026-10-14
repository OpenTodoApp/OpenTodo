import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { HelpHeading } from './help/HelpLink'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import { qrMatrix, qrPath } from '../lib/qr'
import type { MfaPolicy, MfaStatus, TrustedDevice, User } from '../lib/types'
import { relativeTime } from './SecurityPanel'

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
      role="img" aria-label="QR code to scan with your authenticator app" width={size} height={size}
      viewBox={`${-quiet} ${-quiet} ${n + 2 * quiet} ${n + 2 * quiet}`} shapeRendering="crispEdges" className="rounded"
    >
      <rect x={-quiet} y={-quiet} width={n + 2 * quiet} height={n + 2 * quiet} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  )
}

export function mfaMessage(err: unknown): string {
  if (isNetworkError(err)) return 'You are offline. Two-factor settings need a connection to your server.'
  const e = err as ApiError
  switch (e.code) {
    case 'mfa_code_invalid':
      return 'That code does not match. Check that your phone sets its clock automatically and type the newest code. If more than ten minutes passed, start again.'
    case 'mfa_required_by_policy':
      return 'The server owner requires two-factor authentication for your account, so it cannot be turned off.'
    case 'reauth_required':
      return 'Confirm your password to continue.'
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
    <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950" data-testid="recovery-codes">
      <p className="font-medium">Save these recovery codes now. They will not be shown again.</p>
      <p className="text-slate-600 dark:text-slate-300">
        Each code signs you in once if you lose your phone. Keep them somewhere safe, away from this device.
      </p>
      <ol className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono">
        {p.codes.map((c) => <li key={c}>{c}</li>)}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={p.onCopy}>{p.copied ? 'Copied' : 'Copy codes'}</button>
        <button type="button" className="btn-secondary" onClick={p.onDownload}>Download as text</button>
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={p.acknowledged} onChange={(e) => p.onAcknowledge(e.target.checked)} />
        I have saved my recovery codes
      </label>
      <button type="button" className="btn-primary" disabled={!p.acknowledged} onClick={p.onDone}>Done</button>
    </div>
  )
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false)
  const [copied, setCopied] = useState(false)
  const text = `OpenTodo recovery codes (${location.host})\nEach code works once.\n\n${codes.join('\n')}\n`
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
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
        <li>Open an authenticator app on your phone (any app that supports time-based codes).</li>
        <li>Scan this QR code, or enter the key by hand.</li>
        <li>Type the six-digit code the app shows.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-4">
        <QrCode text={p.enrollment.uri} />
        <div className="text-sm">
          <p className="text-muted">Key for manual entry (time-based, 6 digits, 30 s):</p>
          <code className="mt-1 block select-all break-all font-mono text-base" data-testid="manual-key">{groupKey(p.enrollment.secret)}</code>
        </div>
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
        <label className="text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">Code from the app</span>
          <input
            className="input w-36 font-mono tracking-widest" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7}
            required autoFocus value={p.code} onChange={(e) => p.onCode(e.target.value)} disabled={p.disabled} aria-label="Code from the app"
          />
        </label>
        <button className="btn-primary" disabled={p.disabled || p.busy}>{p.busy ? 'Checking…' : 'Turn on'}</button>
        {p.onCancel && <button type="button" className="btn-ghost" onClick={p.onCancel}>Cancel</button>}
      </form>
      {p.error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{p.error}</p>}
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
      <div className="space-y-2 text-sm">
        {error ? <p className="text-red-600 dark:text-red-400" role="alert">{error}</p> : <p className="text-muted">{online ? 'Preparing…' : 'Setting up two-factor authentication needs a connection.'}</p>}
        <div className="flex gap-2">
          {error && <button type="button" className="btn-primary" disabled={!online} onClick={() => void start()}>Try again</button>}
          {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
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
  /** Rendered in place of the actions while enrolling or showing fresh codes. */
  wizard: ReactNode | null
  onStart: () => void
  onDisable: () => void
  onRegenerate: () => void
  onForgetDevice: (id: string) => void
  onForgetAll: () => void
  onPolicy: (p: MfaPolicy) => void
  now?: number
}

const POLICY_LABEL: Record<MfaPolicy, string> = {
  none: 'Optional for everyone',
  owner: 'Required for the owner',
  all: 'Required for every account',
}

/** Presentational part of the Settings section, rendered without effects for tests. */
export function TwoFactorPanelView(p: TwoFactorPanelViewProps) {
  const disabled = !p.online || p.busy
  const st = p.status
  return (
    <section className="space-y-3" aria-labelledby="mfa-heading" data-testid="mfa-panel">
      <HelpHeading screen="settings/two-factor" id="mfa-heading" className="font-semibold">Two-factor authentication</HelpHeading>
      <p className="text-sm text-muted">
        After your password, sign-in asks for a six-digit code from an authenticator app on your phone. Signing in with a passkey that
        checks your fingerprint, face or PIN skips the code. Your server makes and checks the codes itself and sends nothing anywhere.
      </p>
      {!p.online && (
        <p role="status" className="rounded-md bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          You are offline. Two-factor settings need a connection to your server; the status below is the last one seen.
        </p>
      )}
      {st && (
        <p className="text-sm" data-testid="mfa-status">
          Status: <strong>{st.enrolled ? 'On' : 'Off'}</strong>
          {st.enrolled && <> · {st.recoveryCodesRemaining} of 10 recovery codes left</>}
          {st.required && <> · required by the server owner</>}
        </p>
      )}
      {st?.enrolled && st.recoveryCodesRemaining <= 3 && (
        <p className="text-sm text-amber-700 dark:text-amber-300">Few recovery codes left. Generate a new set and store it safely.</p>
      )}

      {p.wizard ?? (
        <div className="flex flex-wrap gap-2">
          {st && !st.enrolled && <button className="btn-primary" disabled={disabled} onClick={p.onStart}>Set up two-factor authentication</button>}
          {st?.enrolled && (
            <>
              <button className="btn-secondary" disabled={disabled} onClick={p.onRegenerate}>New recovery codes</button>
              <button className="btn-danger" disabled={disabled || st.required} onClick={p.onDisable}
                title={st.required ? 'Required by the server owner' : undefined}>
                Turn off
              </button>
            </>
          )}
        </div>
      )}
      {st?.enrolled && st.required && !p.wizard && (
        <p className="text-xs text-muted">The server owner requires two-factor authentication for your account, so it cannot be turned off.</p>
      )}
      {p.error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{p.error}</p>}

      {st?.enrolled && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Remembered browsers</h3>
          <p className="text-xs text-muted">These browsers skip the code for 30 days after you chose "Remember this device".</p>
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {p.devices?.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate" title={d.userAgent}>{browserName(d.userAgent)}</span>
                <span className="text-xs text-faint">
                  used {relativeTime(d.lastUsedAt ?? d.createdAt, p.now)} · until {new Date(d.expiresAt).toLocaleDateString()}
                </span>
                <button className="btn-ghost text-xs" disabled={disabled} aria-label={`Forget ${browserName(d.userAgent)}`} onClick={() => p.onForgetDevice(d.id)}>Forget</button>
              </li>
            ))}
            {p.devices && p.devices.length === 0 && <li className="py-2 text-sm text-faint">No remembered browsers.</li>}
          </ul>
          {p.devices && p.devices.length > 0 && (
            <button className="btn-ghost text-xs border border-slate-300 dark:border-slate-700" disabled={disabled} onClick={p.onForgetAll}>Forget all browsers</button>
          )}
        </div>
      )}

      {p.isOwner && (
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Policy for this server</span>
          <select className="input max-w-xs" value={p.policy ?? st?.policy ?? 'none'} disabled={disabled || p.policy === null}
            onChange={(e) => p.onPolicy(e.target.value as MfaPolicy)} aria-label="Two-factor policy for this server">
            {(Object.keys(POLICY_LABEL) as MfaPolicy[]).map((k) => <option key={k} value={k}>{POLICY_LABEL[k]}</option>)}
          </select>
          <span className="block text-xs text-muted">
            Accounts that must use two-factor authentication and have not set it up can still sign in, but can only set it up until
            they do. API tokens are never affected.
          </span>
        </label>
      )}
    </section>
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
    <div className="flex min-h-full items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="w-full max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900" data-testid="enrolment-gate">
        <div>
          <h1 className="text-lg font-semibold">Set up two-factor authentication</h1>
          <p className="mt-1 text-sm text-muted">
            The owner of this server requires a second sign-in step for {user.email}. Set it up to continue; your tasks and any changes
            waiting on this device are kept and sync as soon as you are done.
          </p>
        </div>
        <EnrolmentWizard online={online} onEnrolled={onEnrolled} />
        <button type="button" className="btn-ghost text-xs" onClick={onLogout}>Sign out</button>
      </div>
    </div>
  )
}

/** A short, human name for a stored user agent. */
export function browserName(ua: string): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
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

  let wizard: ReactNode | null = null
  if (mode === 'enrol') {
    wizard = <EnrolmentWizard online={online} onCancel={() => setMode('idle')} onEnrolled={() => { setMode('idle'); void load() }} />
  } else if (typeof mode === 'object') {
    wizard = <RecoveryCodes codes={mode.codes} onDone={() => setMode('idle')} />
  }

  return (
    <TwoFactorPanelView
      status={status} online={online} isOwner={isOwner} busy={busy} error={error} devices={devices} policy={policy} wizard={wizard}
      onStart={() => setMode('enrol')}
      onDisable={() => {
        if (window.confirm('Turn off two-factor authentication? Sign-in will need only your password, and remembered browsers are forgotten.')) {
          void run(() => api.disableTotp())
        }
      }}
      onRegenerate={() => {
        if (window.confirm('Create new recovery codes? Your current codes stop working.')) {
          void run(async () => setMode({ codes: (await api.regenerateRecoveryCodes()).recoveryCodes }))
        }
      }}
      onForgetDevice={(id) => void run(() => api.forgetTrustedDevice(id))}
      onForgetAll={() => void run(() => api.forgetTrustedDevices())}
      onPolicy={(p) => {
        if (p !== 'none' && status && !status.enrolled &&
          !window.confirm('You have not set up two-factor authentication yourself. After this change you must set it up before you can continue. Continue?')) return
        void run(async () => setPolicy((await api.setMfaPolicy(p)).required))
      }}
    />
  )
}

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { conditionalMediationAvailable, getPasskey, isCancellation, passkeysSupported } from '../lib/passkeys'
import type { AuthStatus, InvitationPreview, LoginResult } from '../lib/types'

/** When set, the screen is the acceptance form of an invitation (OpenSpec `invitations`). */
export interface InviteContext {
  token: string
  preview: InvitationPreview
}

export function AuthScreen({ status, invite, notice, onAuthenticated }: { status: AuthStatus; invite?: InviteContext; notice?: string; onAuthenticated: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>(status.setupRequired || invite ? 'register' : 'login')
  const [email, setEmail] = useState(invite?.preview.email ?? '')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const emailLocked = !!invite?.preview.email
  // Passkeys are offered only on plain sign-in (not setup, not invitation
  // acceptance), when the server and browser support them.
  const passkeys = mode === 'login' && !invite && !status.setupRequired && status.passkeysAvailable === true && passkeysSupported()
  const conditional = useRef<AbortController | null>(null)
  // Second step (OpenSpec `mfa-totp`): set when the first factor answered with a challenge.
  const [challenge, setChallenge] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [recovery, setRecovery] = useState(false)
  const [remember, setRemember] = useState(false)

  /** A session, or the second step when the account has a second factor. */
  const afterFirstFactor = useCallback((res: LoginResult) => {
    if (res.mfaRequired) {
      conditional.current?.abort()
      setChallenge(res.challenge)
      setCode('')
      setError(null)
      return
    }
    onAuthenticated()
  }, [onAuthenticated])

  const finishPasskey = useCallback(async (opts: { conditional: boolean; signal: AbortSignal }) => {
    const { publicKey } = await api.passkeyLoginOptions()
    const credential = await getPasskey(publicKey, opts)
    afterFirstFactor(await api.passkeyLogin(credential))
  }, [afterFirstFactor])

  // Conditional mediation: the browser lists discoverable passkeys in the email
  // field's autofill. The request stays pending until the user picks one, and
  // is aborted when they use the password form or the passkey button instead.
  const startConditional = useCallback(async () => {
    conditional.current?.abort()
    if (!(await conditionalMediationAvailable())) return
    const ac = new AbortController()
    conditional.current = ac
    try {
      await finishPasskey({ conditional: true, signal: ac.signal })
    } catch (err) {
      if (ac.signal.aborted || isCancellation(err)) return
      setError(err instanceof ApiError ? passkeyMessage(err) : null)
    }
  }, [finishPasskey])

  useEffect(() => {
    if (!passkeys || challenge) return
    void startConditional()
    return () => conditional.current?.abort()
  }, [passkeys, challenge, startConditional])

  async function signInWithPasskey() {
    conditional.current?.abort()
    setBusy(true)
    setError(null)
    try {
      await finishPasskey({ conditional: false, signal: new AbortController().signal })
    } catch (err) {
      // Cancelled prompt or no passkey on this device: back to the password form, no error.
      if (!isCancellation(err)) setError(err instanceof ApiError ? passkeyMessage(err) : null)
      void startConditional()
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    conditional.current?.abort()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'register') {
        await api.register(email, name, password, invite?.token)
        onAuthenticated()
      } else {
        afterFirstFactor(await api.login(email, password))
      }
    } catch (err) {
      setError(describeAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  async function submitCode() {
    if (!challenge) return
    setBusy(true)
    setError(null)
    try {
      await api.mfaLogin(challenge, code, { recovery, remember })
      onAuthenticated()
    } catch (err) {
      const next = mfaStepError(err)
      setError(next.message)
      setCode('')
      if (next.restart) {
        setChallenge(null)
        setPassword('')
      }
    } finally {
      setBusy(false)
    }
  }

  if (challenge) {
    return (
      <AuthCard version={status.version}>
        <MfaStepView
          code={code} recovery={recovery} remember={remember} busy={busy} error={error}
          onCode={setCode} onRecovery={(v) => { setRecovery(v); setCode(''); setError(null) }} onRemember={setRemember}
          onSubmit={() => void submitCode()}
          onBack={() => { setChallenge(null); setPassword(''); setError(null) }}
        />
      </AuthCard>
    )
  }

  return (
    <AuthCard version={status.version}>
        {notice && (
          <p className="mb-4 rounded-md bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">{notice}</p>
        )}
        {status.setupRequired && !invite && (
          <p className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            Welcome! Create the owner account for this server. Only you can do this; sign-up closes afterwards unless you open it.
          </p>
        )}
        {invite && (
          <p className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            <strong>{invite.preview.inviterName}</strong> invited you to join this server. Create your account below.
            {invite.preview.email && <> This invitation is for <strong>{invite.preview.email}</strong>.</>}
            <span className="mt-1 block text-xs opacity-80">The link expires {new Date(invite.preview.expiresAt).toLocaleString()} and works once.</span>
          </p>
        )}

        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          {mode === 'register' && (
            <label className="block text-sm">
              <span className="mb-1 block text-slate-600 dark:text-slate-300">Name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus={emailLocked} />
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Email {emailLocked && <span className="text-slate-400">(set by the invitation)</span>}</span>
            <input
              className={`input ${emailLocked ? 'bg-slate-100 text-slate-500 dark:bg-slate-800' : ''}`}
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete={passkeys ? 'username webauthn' : 'email'}
              readOnly={emailLocked} aria-readonly={emailLocked} autoFocus={!emailLocked}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600 dark:text-slate-300">Password {mode === 'register' && <span className="text-slate-400">(10+ characters)</span>}</span>
            <input className="input" type="password" required minLength={mode === 'register' ? 10 : 1} value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'register' ? (status.setupRequired ? 'Create owner account' : invite ? 'Accept invitation' : 'Create account') : 'Sign in'}
          </button>
        </form>

        {passkeys && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-slate-400" aria-hidden="true">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />or<span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            </div>
            <button type="button" className="btn-ghost w-full border border-slate-300 dark:border-slate-700" disabled={busy}
              onClick={() => void signInWithPasskey()}>
              Sign in with a passkey
            </button>
          </>
        )}

        {!status.setupRequired && status.signupAllowed && !invite && (
          <button className="btn-ghost mt-3 w-full" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
          </button>
        )}
        {invite && (
          <p className="mt-3 text-center text-xs text-slate-500">
            Already have an account here? <a className="underline" href="/">Sign in</a> instead; invitations are for new accounts only.
          </p>
        )}
    </AuthCard>
  )
}

/** The sign-in card frame shared by the password and code steps. */
export function AuthCard({ version, children }: { version: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <div>
            <h1 className="text-lg font-semibold">OpenTodo</h1>
            <p className="text-xs text-slate-500">Your tasks, your server.</p>
          </div>
        </div>
        {children}
        <p className="mt-6 text-center text-xs text-slate-400">OpenTodo {version} · AGPL-3.0 · no tracking, no telemetry</p>
      </div>
    </div>
  )
}

export interface MfaStepViewProps {
  code: string
  recovery: boolean
  remember: boolean
  busy: boolean
  error: string | null
  onCode: (v: string) => void
  onRecovery: (v: boolean) => void
  onRemember: (v: boolean) => void
  onSubmit: () => void
  onBack: () => void
}

/** Second sign-in step: a code from the app or a recovery code. Pure, for tests. */
export function MfaStepView(p: MfaStepViewProps) {
  function submit(e: FormEvent) {
    e.preventDefault()
    p.onSubmit()
  }
  return (
    <form onSubmit={submit} className="space-y-3" data-testid="mfa-step">
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {p.recovery
          ? 'Enter one of your recovery codes. Each code works once.'
          : 'Enter the six-digit code from your authenticator app.'}
      </p>
      <label className="block text-sm">
        <span className="mb-1 block text-slate-600 dark:text-slate-300">{p.recovery ? 'Recovery code' : 'Code'}</span>
        {p.recovery ? (
          <input className="input font-mono uppercase tracking-wider" autoComplete="off" autoCapitalize="characters" spellCheck={false}
            required autoFocus value={p.code} onChange={(e) => p.onCode(e.target.value)} placeholder="XXXXX-XXXXX" />
        ) : (
          <input className="input font-mono tracking-widest" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7}
            required autoFocus value={p.code} onChange={(e) => p.onCode(e.target.value)} />
        )}
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={p.remember} onChange={(e) => p.onRemember(e.target.checked)} />
        Remember this device for 30 days
      </label>
      {p.error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{p.error}</p>}
      <button className="btn-primary w-full" disabled={p.busy}>{p.busy ? 'Please wait…' : 'Verify'}</button>
      <div className="flex justify-between gap-2">
        <button type="button" className="btn-ghost text-xs" onClick={() => p.onRecovery(!p.recovery)}>
          {p.recovery ? 'Use a code from the app' : 'Use a recovery code'}
        </button>
        <button type="button" className="btn-ghost text-xs" onClick={p.onBack}>Back</button>
      </div>
    </form>
  )
}

/** What a failed second step means: retry the code, or start again from the password. */
export function mfaStepError(err: unknown): { restart: boolean; message: string } {
  if (err instanceof ApiError && err.code === 'mfa_challenge_invalid') {
    return { restart: true, message: 'Too many wrong codes, or it took too long. Enter your password again.' }
  }
  if (err instanceof ApiError && err.code === 'mfa_code_invalid') {
    return { restart: false, message: 'That code is not valid. Check your authenticator app and try again.' }
  }
  return { restart: false, message: describeAuthError(err) }
}

function passkeyMessage(err: ApiError): string {
  if (err.code === 'invalid_credentials') return 'That passkey is not registered on this server. Sign in with your password.'
  if (err.code === 'passkey_challenge_invalid') return 'That took too long. Please try again.'
  return describeAuthError(err)
}

/** Turns an API failure into a sentence a person can act on. */
export function describeAuthError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Something went wrong. Is the server reachable?'
  switch (err.code) {
    case 'invitation_invalid':
      return 'This invitation link is no longer valid. It may have expired, been revoked or already been used.'
    case 'invitation_email_mismatch':
      return 'This invitation was issued for a different email address.'
    case 'email_taken':
      return 'An account with this email already exists. Sign in instead.'
    case 'rate_limited':
      return 'Too many attempts. Wait a minute and try again.'
    case 'signup_closed':
      return 'Sign-up is closed on this server. Ask the owner for an invitation link.'
    default:
      return err.message
  }
}

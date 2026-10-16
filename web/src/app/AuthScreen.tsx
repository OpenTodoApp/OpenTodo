import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, OIDC_START_URL } from '../lib/api'
import { conditionalMediationAvailable, getPasskey, isCancellation, PasskeyDomainError, passkeysSupported } from '../lib/passkeys'
import { sandboxErrorMessage, startSandbox } from '../lib/demo'
import type { AuthStatus, InvitationPreview, LoginResult } from '../lib/types'
import { oidcErrorMessage, ssoLayout, takeQueryParam } from './sso'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { navigate } from './router'
import { t } from '../lib/i18n'
import { roleName } from '../lib/roleNames'

/** When set, the screen is the acceptance form of an invitation (OpenSpec `invitations`). */
export interface InviteContext {
  token: string
  preview: InvitationPreview
  /** Set for a project invite link (OpenSpec `project-invite-links`): the new account joins this project. */
  project?: { name: string; role: string }
  /** Project links also work with an existing account: switch to sign-in instead of registering. */
  onSignIn?: () => void
}

export function AuthScreen({ status, invite, notice, onAuthenticated }: {
  status: AuthStatus
  invite?: InviteContext
  notice?: string
  /** Called once signed in; a registration through a project link passes the project it joined. */
  onAuthenticated: (result?: { projectId?: string }) => void
}) {
  const dt = useDateTimeFormat()
  const [mode, setMode] = useState<'login' | 'register'>(status.setupRequired || invite ? 'register' : 'login')
  const [email, setEmail] = useState(invite?.preview.email ?? '')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  // First-run setup guarded by OPENTODO_SETUP_TOKEN (OpenSpec `owner-bootstrap`).
  const needsSetupToken = !!status.setupRequired && !!status.setupTokenRequired && !invite
  // A hosted service's sign-up link carries the tenant's token as ?setup= (multi-tenant-host).
  const [setupToken, setSetupToken] = useState(() => typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('setup') ?? '')
  // Single sign-on (OpenSpec `oidc-login`): the provider action on plain sign-in;
  // SSO-only mode hides local sign-in unless the owner uses `?owner=1`.
  const sso = invite ? { provider: null, local: true, breakGlass: false } : ssoLayout(status, typeof location === 'undefined' ? '' : location.search)
  // A failed provider callback returns here with ?error=<code>.
  const [error, setError] = useState<string | null>(() => oidcErrorMessage(takeQueryParam('error'), sso.provider ?? undefined))
  const [busy, setBusy] = useState(false)
  // Verified sign-up (OpenSpec outgoing-email): the address a confirmation link was mailed to.
  const [checkEmail, setCheckEmail] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const emailLocked = !!invite?.preview.email
  // Passkeys are offered only on plain sign-in (not setup, not invitation
  // acceptance), when the server and browser support them.
  const passkeys = sso.local && mode === 'login' && !invite && !status.setupRequired && status.passkeysAvailable === true && passkeysSupported()
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
      // Autofill stays quiet on a domain mismatch; the passkey button explains it.
      if (ac.signal.aborted || isCancellation(err) || err instanceof PasskeyDomainError) return
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
      if (!isCancellation(err)) setError(err instanceof ApiError ? passkeyMessage(err) : err instanceof PasskeyDomainError ? err.message : null)
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
        const res = invite?.project
          ? await api.register(email, name, password, undefined, invite.token)
          : await api.register(email, name, password, invite?.token, undefined, needsSetupToken ? setupToken.trim() : undefined)
        if (res && 'verificationRequired' in res && res.verificationRequired) {
          setCheckEmail(email.trim())
          setResent(false)
          return
        }
        onAuthenticated({ projectId: res?.projectId })
      } else {
        afterFirstFactor(await api.login(email, password))
      }
    } catch (err) {
      setError(describeAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  /** Posts the same registration again: a new link replaces the earlier one (rate limited by the server). */
  async function resend() {
    setBusy(true)
    setError(null)
    try {
      await api.register(email, name, password)
      setResent(true)
    } catch (err) {
      setError(describeAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  /** "Try the demo" (OpenSpec `demo-sandboxes`): create a private sandbox with the page's token and sign into it. */
  async function tryDemo() {
    if (!status.demo) return
    conditional.current?.abort()
    setBusy(true)
    setError(null)
    try {
      await startSandbox(status.demo.token)
      onAuthenticated()
    } catch (err) {
      setError(sandboxErrorMessage(err))
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
          <p className="mb-4 rounded-control bg-sunken dark:bg-raised p-3 text-body text-muted">{notice}</p>
        )}
        {status.demo && !invite && (
          // A demo instance has no accounts to sign into: every visitor gets a sandbox.
          <DemoPanel hours={status.demo.sandboxHours} busy={busy} error={error} onTry={() => void tryDemo()} />
        )}
        {status.setupRequired && !invite && (
          <p className="mb-4 rounded-control bg-accent-soft p-3 text-body text-on-accent-soft">
            {t('Welcome! Create the owner account for this server. Only you can do this; sign-up closes afterwards unless you open it.')}
          </p>
        )}
        {invite?.project && (
          <p className="mb-4 rounded-control bg-accent-soft p-3 text-body text-on-accent-soft" data-testid="project-invite-banner">
            {t.rich('<strong>{inviterName}</strong> invited you to <strong2>{name}</strong2> as {role}. Create your account to join.', { inviterName: invite.preview.inviterName, name: invite.project.name, role: roleName(invite.project.role), strong: (chunks) => <strong>{chunks}</strong>, strong2: (chunks) => <strong className="user-text">{chunks}</strong> })}
            {invite.preview.email && <>{' '}{t.rich('This link is for <strong>{email}</strong>.', { email: invite.preview.email, strong: (chunks) => <strong>{chunks}</strong> })}</>}
            <span className="mt-1 block text-meta opacity-80">{t('The link expires {instant} and works once.', { instant: dt.formatInstant(invite.preview.expiresAt, 'datetime') })}</span>
          </p>
        )}
        {invite && !invite.project && (
          <p className="mb-4 rounded-control bg-accent-soft p-3 text-body text-on-accent-soft">
            {t.rich('<strong>{inviterName}</strong> invited you to join this server. Create your account below.', { inviterName: invite.preview.inviterName, strong: (chunks) => <strong>{chunks}</strong> })}
            {invite.preview.email && <>{' '}{t.rich('This invitation is for <strong>{email}</strong>.', { email: invite.preview.email, strong: (chunks) => <strong>{chunks}</strong> })}</>}
            <span className="mt-1 block text-meta opacity-80">{t('The link expires {instant} and works once.', { instant: dt.formatInstant(invite.preview.expiresAt, 'datetime') })}</span>
          </p>
        )}

        {sso.provider && mode === 'login' && (
          <ProviderSignIn name={sso.provider} primary={!sso.local} />
        )}
        {sso.provider && mode === 'login' && sso.local && <OrDivider />}
        {!sso.local && error && <p className="mt-3 text-body text-danger" role="alert">{error}</p>}
        {!sso.local && <p className="mt-3 text-center text-meta text-muted">{t('This server uses single sign-on for every account.')}</p>}
        {sso.breakGlass && (
          <p className="mb-3 rounded-control bg-warning-soft p-2 text-meta text-on-warning-soft">
            {t('Owner sign-in: only the server owner can sign in with a password while single sign-on is required.')}
          </p>
        )}

        {checkEmail && (
          <div className="space-y-3" data-check-email role="status">
            <p className="text-body font-medium text-strong">{t('Check your email')}</p>
            <p className="text-meta text-muted">
              {t.rich('We sent a link to <strong>{checkEmail}</strong>. Open it within 24 hours to create your account. Nothing is created until you do.', { checkEmail, strong: (chunks) => <strong className="text-default">{chunks}</strong> })}
            </p>
            {resent && <p className="text-meta text-muted">{t('A new link is on its way; the earlier one no longer works.')}</p>}
            {error && <p className="text-meta text-danger" role="alert">{error}</p>}
            <button type="button" className="ui-btn ui-btn--secondary ui-btn--md w-full" disabled={busy} onClick={() => void resend()}>{t('Send the link again')}</button>
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--md w-full" onClick={() => { setCheckEmail(null); setMode('login') }}>{t('Back to sign-in')}</button>
          </div>
        )}
        {sso.local && !status.demo && !checkEmail && <form onSubmit={(e) => void submit(e)} className="space-y-3">
          {mode === 'register' && (
            <label className="block text-body">
              <span className="mb-1 block text-muted">{t('Name')}</span>
              <input className="ui-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus={emailLocked} />
            </label>
          )}
          <label className="block text-body">
            <span className="mb-1 block text-muted">{t('Email')}{' '}{emailLocked && <span className="text-faint">{t('(set by the invitation)')}</span>}</span>
            <input
              className={`ui-input ${emailLocked ? 'bg-sunken dark:bg-raised text-muted' : ''}`}
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete={passkeys ? 'username webauthn' : 'email'}
              readOnly={emailLocked} aria-readonly={emailLocked} autoFocus={!emailLocked}
            />
          </label>
          <label className="block text-body">
            <span className="mb-1 block text-muted">{t('Password')}{' '}{mode === 'register' && <span className="text-faint">{t('(10+ characters)')}</span>}</span>
            <input className="ui-input" type="password" required minLength={mode === 'register' ? 10 : 1} value={password} onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
          </label>
          {mode === 'login' && !invite && !status.setupRequired && !sso.breakGlass && status.outgoingEmail?.enabled && (
            <p className="-mt-1 text-right text-meta"><a href="/forgot" data-forgot-link className="text-muted underline hover:text-default"
              onClick={(e) => { e.preventDefault(); navigate({ view: 'forgot' }) }}>{t('Forgot password?')}</a></p>
          )}
          {needsSetupToken && (
            <label className="block text-body">
              <span className="mb-1 block text-muted">{t('Setup token')}</span>
              <input className="ui-input font-mono" required value={setupToken} onChange={(e) => setSetupToken(e.target.value)}
                autoComplete="off" spellCheck={false} aria-describedby="setup-token-help" />
              <span id="setup-token-help" className="mt-1 block text-meta text-muted">
                {status.hosted
                  ? t('Your provider sent this token with the address of your new server.')
                  : t.rich('This server asks for the token its operator configured. Find it in your hosting panel, for example Coolify, this service, Environment Variables, {variable}.', { variable: <code>OPENTODO_SETUP_TOKEN</code> })}
              </span>
            </label>
          )}
          {error && <p className="text-body text-danger" role="alert">{error}</p>}
          <button className="ui-btn ui-btn--primary ui-btn--md w-full" disabled={busy}>
            {busy ? t('Please wait…') : mode === 'register' ? (status.setupRequired ? t('Create owner account') : invite?.project ? t('Create account and join') : invite ? t('Accept invitation') : t('Create account')) : t('Sign in')}
          </button>
        </form>}

        {passkeys && (
          <>
            <OrDivider />
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--md w-full border border-input" disabled={busy}
              onClick={() => void signInWithPasskey()}>
              {t('Sign in with a passkey')}
            </button>
          </>
        )}

        {sso.local && !status.setupRequired && status.signupAllowed && !invite && !checkEmail && (
          <button className="ui-btn ui-btn--ghost ui-btn--md mt-3 w-full" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? t('Need an account? Sign up') : t('Have an account? Sign in')}
          </button>
        )}
        {invite && invite.onSignIn && (
          <p className="mt-3 text-center text-meta text-muted">
            {t('Already have an account here?')}{' '}<button type="button" className="underline" onClick={invite.onSignIn}>{t('Sign in to join')}</button>{' '}{t('instead.')}
          </p>
        )}
        {invite && !invite.onSignIn && (
          <p className="mt-3 text-center text-meta text-muted">
            {t.rich('Already have an account here? <a>Sign in</a> instead; invitations are for new accounts only.', { a: (chunks) => <a className="underline" href="/">{chunks}</a> })}
          </p>
        )}
    </AuthCard>
  )
}

/** Demo instance sign-in (OpenSpec `demo-sandboxes`): one click creates a private sandbox; no credentials. */
export function DemoPanel({ hours, busy, error, onTry }: { hours?: { idle: number; max: number }; busy: boolean; error: string | null; onTry: () => void }) {
  const idle = hours?.idle ?? 2
  const max = hours?.max ?? 24
  return (
    <div className="mb-4 rounded-control bg-info-soft p-3 text-body text-on-info-soft" data-testid="demo-panel">
      <p className="font-medium">{t('This is a public demo of OpenTodo.')}</p>
      <p className="mt-1 text-meta">
        {t('You get a private sandbox with sample data that only you can see. It is deleted after {idle} hours of inactivity, after {max} hours at most, and every night. No sign-up; don\'t store anything personal.', { idle, max })}
      </p>
      <button type="button" className="ui-btn ui-btn--primary ui-btn--md mt-3 w-full" disabled={busy} onClick={onTry}>{busy ? t('Preparing your sandbox…') : t('Try the demo')}</button>
      {error && <p className="mt-2 text-body text-danger" role="alert" data-testid="demo-error">{error}</p>}
    </div>
  )
}

/** "Sign in with <provider>": a plain link, so the browser navigates to the provider. */
export function ProviderSignIn({ name, primary }: { name: string; primary: boolean }) {
  return (
    <a href={OIDC_START_URL} className={`${primary ? 'ui-btn ui-btn--primary ui-btn--md' : 'ui-btn ui-btn--secondary ui-btn--md'} flex w-full justify-center`}
      data-testid="sso-sign-in">
      {t('Sign in with {name}', { name })}
    </a>
  )
}

function OrDivider() {
  return (
    <div className="my-4 flex items-center gap-3 text-meta text-faint" aria-hidden="true">
      <span className="h-px flex-1 bg-(--ot-border)" />{t('or')}<span className="h-px flex-1 bg-(--ot-border)" />
    </div>
  )
}

/** The sign-in card frame shared by the password and code steps. */
export function AuthCard({ version, children }: { version: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-card border border-default bg-surface p-6 shadow-1">
        <div className="mb-6 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <div>
            <h1 className="text-h3 font-semibold">{t('OpenTodo')}</h1>
            <p className="text-meta text-muted">{t('Your tasks, your server.')}</p>
          </div>
        </div>
        {children}
        <p className="mt-6 text-center text-meta text-faint">{t('OpenTodo {version} · AGPL-3.0 · no tracking, no telemetry', { version })}</p>
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
      <p className="text-body text-muted">
        {p.recovery
          ? t('Enter one of your recovery codes. Each code works once.')
          : t('Enter the six-digit code from your authenticator app.')}
      </p>
      <label className="block text-body">
        <span className="mb-1 block text-muted">{p.recovery ? t('Recovery code') : t('Code')}</span>
        {p.recovery ? (
          <input className="ui-input font-mono uppercase tracking-wider" autoComplete="off" autoCapitalize="characters" spellCheck={false}
            required autoFocus value={p.code} onChange={(e) => p.onCode(e.target.value)} placeholder={t('XXXXX-XXXXX')} />
        ) : (
          <input className="ui-input font-mono tracking-widest" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" maxLength={7}
            required autoFocus value={p.code} onChange={(e) => p.onCode(e.target.value)} />
        )}
      </label>
      <label className="flex items-center gap-2 text-body text-muted">
        <input type="checkbox" checked={p.remember} onChange={(e) => p.onRemember(e.target.checked)} />
        {t('Remember this device for 30 days')}
      </label>
      {p.error && <p className="text-body text-danger" role="alert">{p.error}</p>}
      <button className="ui-btn ui-btn--primary ui-btn--md w-full" disabled={p.busy}>{p.busy ? t('Please wait…') : t('Verify')}</button>
      <div className="flex justify-between gap-2">
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm text-meta" onClick={() => p.onRecovery(!p.recovery)}>
          {p.recovery ? t('Use a code from the app') : t('Use a recovery code')}
        </button>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm text-meta" onClick={p.onBack}>{t('Back')}</button>
      </div>
    </form>
  )
}

/** What a failed second step means: retry the code, or start again from the password. */
export function mfaStepError(err: unknown): { restart: boolean; message: string } {
  if (err instanceof ApiError && err.code === 'mfa_challenge_invalid') {
    return { restart: true, message: t('Too many wrong codes, or it took too long. Enter your password again.') }
  }
  if (err instanceof ApiError && err.code === 'mfa_code_invalid') {
    return { restart: false, message: t('That code is not valid. Check your authenticator app and try again.') }
  }
  return { restart: false, message: describeAuthError(err) }
}

function passkeyMessage(err: ApiError): string {
  if (err.code === 'invalid_credentials') return t('That passkey is not registered on this server. Sign in with your password.')
  if (err.code === 'passkey_challenge_invalid') return t('That took too long. Please try again.')
  return describeAuthError(err)
}

/** Turns an API failure into a sentence a person can act on. */
export function describeAuthError(err: unknown): string {
  if (!(err instanceof ApiError)) return t('Something went wrong. Is the server reachable?')
  switch (err.code) {
    case 'invitation_invalid':
      return t('This invitation link is no longer valid. It may have expired, been revoked or already been used.')
    case 'invitation_email_mismatch':
      return t('This invitation was issued for a different email address.')
    case 'email_taken':
      return t('An account with this email already exists. Sign in instead.')
    case 'rate_limited':
      return t('Too many attempts. Wait a minute and try again.')
    case 'setup_token_invalid':
      return t('That setup token is not right. Copy OPENTODO_SETUP_TOKEN from your hosting panel and try again.')
    case 'signup_closed':
      return t('Sign-up is closed on this server. Ask the owner for an invitation link.')
    case 'account_deactivated':
      return t('This account has been deactivated. Ask the server owner or an admin to reactivate it.')
    case 'sso_required':
      return t('This server requires single sign-on for your account. Use the "Sign in with" button instead.')
    // A hosted server's limits (OpenSpec `multi-tenant-host`).
    case 'limit_members':
      return t('This server has as many members as its plan allows. Ask the owner to make room or upgrade.')
    case 'limit_requests':
      return t('This server is receiving too many requests. Wait a minute and try again.')
    default:
      return err.message
  }
}

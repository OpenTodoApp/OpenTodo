import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react'
import { Button, Field, Input, Notice } from '../ui'
import { api, ApiError, isNetworkError } from '../lib/api'
import { formatInstant } from '../lib/dates'
import { useOnline } from '../lib/online'
import type { PendingSignup, User } from '../lib/types'
import { navigate } from './router'
import { t } from '../lib/i18n'

// The anonymous screens of outgoing email (OpenSpec change outgoing-email,
// account-access "Forgot password and verification screens"): /forgot asks for
// an address and always answers the same way; /verify/<token> completes a
// pending sign-up only when its button is pressed, so mail scanners that fetch
// the link create nothing. Both need a connection and never queue anything.

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm space-y-3 rounded-card border border-default bg-surface p-6 shadow-1">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <p className="text-h3 font-semibold">{t('OpenTodo')}</p>
        </div>
        <h1 className="text-body font-medium text-strong">{title}</h1>
        {children}
      </div>
    </div>
  )
}

const toSignIn = () => navigate({ view: 'inbox' }, { replace: true })

export type ForgotState = 'form' | 'sent' | 'offline' | 'rate-limited' | 'disabled'

/** /forgot. `enabled` is the server's outgoing email flag; signed-in visitors are pointed to Settings. */
export function ForgotScreen({ enabled, user }: { enabled: boolean; user: User | null }) {
  const online = useOnline()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<ForgotState>(enabled ? 'form' : 'disabled')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api.requestPasswordReset(email.trim())
      setState('sent')
    } catch (err) {
      if (isNetworkError(err)) setState('offline')
      else if (err instanceof ApiError && err.code === 'rate_limited') setState('rate-limited')
      else if (err instanceof ApiError && err.code === 'smtp_disabled') setState('disabled')
      else setError(err instanceof ApiError ? err.message : t('Something went wrong.'))
    } finally {
      setBusy(false)
    }
  }

  if (user) {
    return (
      <Card title={t('You are signed in')}>
        <p className="text-meta text-muted">{t('Change your password in Settings → Account → Password. To reset the password of another account, sign out first.')}</p>
        <Button variant="secondary" onClick={() => navigate({ view: 'settings', section: 'account', anchor: 'security' })}>{t('Open Account settings')}</Button>
      </Card>
    )
  }
  switch (state) {
    case 'disabled':
      return (
        <Card title={t('Reset your password')}>
          <p className="text-meta text-muted">{t('This server does not send email. Password resets go through an administrator: ask the server owner or an admin for a reset link.')}</p>
          <Button variant="secondary" onClick={toSignIn}>{t('Back to sign-in')}</Button>
        </Card>
      )
    case 'sent':
      return (
        <Card title={t('Check your email')}>
          <p className="text-meta text-muted" role="status">
            {t.rich('If an account exists for <strong>{trim}</strong>, a message with a reset link is on its way. The link works once, for 24 hours.', { trim: email.trim(), strong: (chunks) => <strong className="text-default">{chunks}</strong> })}
          </p>
          <Button variant="secondary" onClick={toSignIn}>{t('Back to sign-in')}</Button>
        </Card>
      )
    case 'offline':
      return (
        <Card title={t('You seem to be offline')}>
          <p className="text-meta text-muted">{t('Requesting a reset link needs a connection to the server.')}</p>
          <Button variant="primary" disabled={!online} onClick={() => setState('form')}>{t('Try again')}</Button>
        </Card>
      )
    case 'rate-limited':
      return (
        <Card title={t('Too many requests')}>
          <p className="text-meta text-muted">{t('Wait a minute, then try again.')}</p>
          <Button variant="primary" onClick={() => setState('form')}>{t('Try again')}</Button>
        </Card>
      )
    case 'form':
      return (
        <Card title={t('Reset your password')}>
          <form className="space-y-3" onSubmit={(e) => void submit(e)}>
            <p className="text-meta text-muted">{t('Enter the email address of your account. We will send you a link to choose a new password.')}</p>
            <Field label={t('Email')}>
              <Input type="email" required autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {!online && <Notice>{t('Requesting a reset link needs a connection to the server.')}</Notice>}
            {error && <Notice tone="danger">{error}</Notice>}
            <Button variant="primary" type="submit" className="w-full" busy={busy} disabled={!online}>{t('Send reset link')}</Button>
          </form>
          <Button variant="ghost" className="w-full" onClick={toSignIn}>{t('Back to sign-in')}</Button>
        </Card>
      )
  }
}

export type VerifyState =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'invalid' }
  | { kind: 'rate-limited' }
  | { kind: 'closed' }
  | { kind: 'taken' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; pending: PendingSignup }

function verifyState(err: unknown): VerifyState {
  if (isNetworkError(err)) return { kind: 'offline' }
  const e = err as ApiError
  if (e.code === 'verification_invalid') return { kind: 'invalid' }
  if (e.code === 'rate_limited') return { kind: 'rate-limited' }
  if (e.code === 'signup_closed') return { kind: 'closed' }
  if (e.code === 'email_taken') return { kind: 'taken' }
  return { kind: 'error', message: e.message }
}

/** /verify/<token>: shows the pending address; "Create my account" completes it. */
export function VerifyScreen({ token, user, onDone, onLogout }: { token: string; user: User | null; onDone: () => void; onLogout: () => void }) {
  const online = useOnline()
  const [state, setState] = useState<VerifyState>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      setState({ kind: 'ready', pending: await api.verifyPreview(token) })
    } catch (err) {
      setState(verifyState(err))
    }
  }, [token])

  useEffect(() => {
    if (user) return
    if (online) void load()
    else setState({ kind: 'offline' })
  }, [user, online, load])

  async function complete() {
    setBusy(true)
    try {
      await api.verifyComplete(token)
      onDone()
    } catch (err) {
      setState(verifyState(err))
    } finally {
      setBusy(false)
    }
  }

  return <VerifyView state={state} user={user} busy={busy} online={online} onCreate={() => void complete()} onRetry={() => void load()} onLogout={onLogout} />
}

/** Pure rendering of every verification state, for tests. */
export function VerifyView({ state, user, busy, online, onCreate, onRetry, onLogout }: {
  state: VerifyState
  user: User | null
  busy: boolean
  online: boolean
  onCreate: () => void
  onRetry: () => void
  onLogout: () => void
}) {
  const register = <Button variant="secondary" onClick={toSignIn}>{t('Register again')}</Button>
  if (user) {
    return (
      <Card title={t('You are already signed in')}>
        <p className="text-meta text-muted">{t('This device is signed in as')}{' '}<strong className="text-default">{user.name || user.email}</strong>{t('. Sign out first to confirm another account.')}</p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={onLogout}>{t('Sign out and continue')}</Button>
          <Button variant="secondary" onClick={() => navigate({ view: 'inbox' })}>{t('Back to my tasks')}</Button>
        </div>
      </Card>
    )
  }
  switch (state.kind) {
    case 'loading':
      return <Card title={t('Checking your link…')}><p className="text-meta text-muted">{t('One moment.')}</p></Card>
    case 'offline':
      return (
        <Card title={t('You seem to be offline')}>
          <p className="text-meta text-muted">{t('Creating your account needs a connection to the server. The page will retry when the network returns.')}</p>
          <Button variant="primary" onClick={onRetry}>{t('Retry now')}</Button>
        </Card>
      )
    case 'invalid':
      return (
        <Card title={t('This link is no longer valid')}>
          <p className="text-meta text-muted">{t('It may have expired (links work for 24 hours), been replaced by a newer sign-up, or already been used.')}</p>
          {register}
        </Card>
      )
    case 'rate-limited':
      return (
        <Card title={t('Too many attempts')}>
          <p className="text-meta text-muted">{t('Wait a minute, then try again.')}</p>
          <Button variant="primary" onClick={onRetry}>{t('Retry')}</Button>
        </Card>
      )
    case 'closed':
      return (
        <Card title={t('Sign-up is closed')}>
          <p className="text-meta text-muted">{t('The server owner closed sign-up after you registered, so no account was created.')}</p>
          <Button variant="secondary" onClick={toSignIn}>{t('Go to sign-in')}</Button>
        </Card>
      )
    case 'taken':
      return (
        <Card title={t('This address already has an account')}>
          <p className="text-meta text-muted">{t('Sign in with it, or reset its password if you forgot it.')}</p>
          <Button variant="secondary" onClick={toSignIn}>{t('Go to sign-in')}</Button>
        </Card>
      )
    case 'error':
      return (
        <Card title={t('Something went wrong')}>
          <Notice tone="danger">{state.message}</Notice>
          <Button variant="primary" onClick={onRetry}>{t('Retry')}</Button>
        </Card>
      )
    case 'ready':
      return (
        <Card title={t('Confirm your account')}>
          <p className="text-meta text-muted">
            {t.rich('Create the account for <strong>{email}</strong> with the name and password you chose. This link works until {instant}.', { email: state.pending.email, instant: formatInstant(state.pending.expiresAt, 'datetime'), strong: (chunks) => <strong className="text-default">{chunks}</strong> })}
          </p>
          <Button variant="primary" className="w-full" busy={busy} disabled={!online} onClick={onCreate} data-verify-create>{t('Create my account')}</Button>
        </Card>
      )
  }
}

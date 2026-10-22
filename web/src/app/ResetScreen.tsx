import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import type { ResetPreview, User } from '../lib/types'
import { t } from '../lib/i18n'
import { BrandMark, BrandWordmark } from '../ui'

export type ResetState =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'invalid' }
  | { kind: 'rate-limited' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; preview: ResetPreview }

interface Props {
  token: string
  /** The signed-in user, if any: they are offered to sign out first. */
  user: User | null
  /** Called after the new password was set; the app shows sign-in with a confirmation. */
  onDone: () => void
  onLogout: () => void
}

/**
 * Screen behind /reset/<token> (OpenSpec `user-management`): shows the
 * account's email and a new-password form. Nothing is cached; offline it waits
 * and retries when the network returns, and the change is never queued.
 */
export function ResetScreen({ token, user, onDone, onLogout }: Props) {
  const online = useOnline()
  const [state, setState] = useState<ResetState>({ kind: 'loading' })
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      setState({ kind: 'ready', preview: await api.previewPasswordReset(token) })
    } catch (err) {
      setState(stateFor(err))
    }
  }, [token])

  useEffect(() => {
    if (user) return
    if (online) void load()
    else setState({ kind: 'offline' })
  }, [user, online, load])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 10) {
      setError(t('The new password needs at least 10 characters.'))
      return
    }
    setBusy(true)
    try {
      await api.resetPassword(token, password)
      onDone()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'invalid_input') setError(err.message)
      else setState(stateFor(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ResetView
      state={user ? { kind: 'loading' } : state}
      user={user}
      onRetry={() => void load()}
      onLogout={onLogout}
      form={state.kind === 'ready' && !user ? (
        <form onSubmit={(e) => void submit(e)} className="space-y-3" id="reset-form">
          <p className="text-body text-muted">{t.rich('Choose a new password for <strong>{email}</strong>. You will be signed out everywhere and can then sign in with it.', { email: state.preview.email, strong: (chunks) => <strong>{chunks}</strong> })}</p>
          <input type="text" name="username" autoComplete="username" value={state.preview.email} hidden readOnly />
          <label className="block text-body">
            <span className="mb-1 block text-muted">{t('New password')}</span>
            <input className="ui-input" type="password" autoComplete="new-password" autoFocus minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="text-body text-danger" role="alert">{error}</p>}
          <button className="ui-btn ui-btn--primary ui-btn--md w-full" disabled={busy || !online}>{busy ? t('Saving…') : t('Set new password')}</button>
        </form>
      ) : null}
    />
  )
}

function stateFor(err: unknown): ResetState {
  if (isNetworkError(err)) return { kind: 'offline' }
  const e = err as ApiError
  if (e.code === 'reset_invalid') return { kind: 'invalid' }
  if (e.code === 'rate_limited') return { kind: 'rate-limited' }
  return { kind: 'error', message: e.message }
}

/** Pure rendering of every reset-screen state, for tests. */
export function ResetView({ state, user, form, onRetry, onLogout }: {
  state: ResetState
  user: User | null
  form: ReactNode
  onRetry: () => void
  onLogout: () => void
}) {
  if (user) {
    return (
      <Card title={t('You are already signed in')}>
        <p className="text-body text-muted">
          {t.rich('This device is signed in as <b>{name}</b>. Sign out first to use this password reset link.', { name: user.name || user.email, b: (chunks) => <strong>{chunks}</strong> })}
        </p>
        <div className="flex gap-2">
          <button className="ui-btn ui-btn--primary ui-btn--md" onClick={onLogout}>{t('Sign out and continue')}</button>
          <a className="ui-btn ui-btn--secondary ui-btn--md" href="/">{t('Back to my tasks')}</a>
        </div>
      </Card>
    )
  }
  switch (state.kind) {
    case 'loading':
      return <Card title={t('Checking your reset link…')}><p className="text-body text-muted">{t('One moment.')}</p></Card>
    case 'offline':
      return (
        <Card title={t('You seem to be offline')}>
          <p className="text-body text-muted">{t('Setting a new password needs a connection to the server. The page will retry when the network returns.')}</p>
          <button className="ui-btn ui-btn--primary ui-btn--md" onClick={onRetry}>{t('Retry now')}</button>
        </Card>
      )
    case 'invalid':
      return (
        <Card title={t('This reset link is no longer valid')}>
          <p className="text-body text-muted">{t('It may have expired, been replaced by a newer link, or already been used. Ask the server owner or an admin for a new one.')}</p>
          <a className="ui-btn ui-btn--secondary ui-btn--md" href="/">{t('Go to sign-in')}</a>
        </Card>
      )
    case 'rate-limited':
      return (
        <Card title={t('Too many attempts')}>
          <p className="text-body text-muted">{t('Wait a minute, then try again.')}</p>
          <button className="ui-btn ui-btn--primary ui-btn--md" onClick={onRetry}>{t('Retry')}</button>
        </Card>
      )
    case 'error':
      return (
        <Card title={t('Something went wrong')}>
          <p className="text-body text-danger">{state.message}</p>
          <button className="ui-btn ui-btn--primary ui-btn--md" onClick={onRetry}>{t('Retry')}</button>
        </Card>
      )
    case 'ready':
      return <Card title={t('Set a new password')}>{form}</Card>
  }
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm space-y-3 rounded-card border border-default bg-surface p-6 shadow-1">
        <div className="flex items-center gap-3">
          <BrandMark size={32} />
          <h1 className="text-h3 font-semibold"><BrandWordmark /></h1>
        </div>
        <h2 className="font-medium">{title}</h2>
        {children}
      </div>
    </div>
  )
}

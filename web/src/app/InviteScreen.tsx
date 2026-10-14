import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import type { AuthStatus, InvitationPreview, User } from '../lib/types'
import { AuthScreen } from './AuthScreen'

export type InviteState =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'invalid' }
  | { kind: 'rate-limited' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; preview: InvitationPreview }

interface Props {
  token: string
  /** The signed-in user, if any: an invitation is never attached to an existing account. */
  user: User | null
  status: AuthStatus | null
  onAccepted: () => void
  onLogout: () => void
}

/**
 * Screen behind /invite/<token>: previews the invitation, then renders the
 * registration form with the invitation attached. The preview is never cached;
 * while offline the screen waits and retries when the network returns.
 */
export function InviteScreen({ token, user, status, onAccepted, onLogout }: Props) {
  const online = useOnline()
  const [state, setState] = useState<InviteState>({ kind: 'loading' })

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      setState({ kind: 'ready', preview: await api.previewInvitation(token) })
    } catch (err) {
      if (isNetworkError(err)) setState({ kind: 'offline' })
      else if ((err as ApiError).code === 'invitation_invalid') setState({ kind: 'invalid' })
      else if ((err as ApiError).code === 'rate_limited') setState({ kind: 'rate-limited' })
      else setState({ kind: 'error', message: (err as ApiError).message })
    }
  }, [token])

  useEffect(() => {
    if (user) return
    if (online) void load()
    else setState({ kind: 'offline' })
  }, [user, online, load])

  return (
    <InviteView
      state={user ? { kind: 'loading' } : state}
      user={user}
      onRetry={() => void load()}
      onLogout={onLogout}
      form={state.kind === 'ready' && !user ? (
        <AuthScreen
          status={status ?? { setupRequired: false, signupAllowed: false, authenticated: false, user: null, version: '' }}
          invite={{ token, preview: state.preview }}
          onAuthenticated={onAccepted}
        />
      ) : null}
    />
  )
}

/** Pure rendering of every invite-screen state; kept free of effects so it can be rendered in tests. */
export function InviteView({ state, user, form, onRetry, onLogout }: {
  state: InviteState
  user: User | null
  form: ReactNode
  onRetry: () => void
  onLogout: () => void
}) {
  if (user) {
    return (
      <Card title="You are already signed in">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This device is signed in as <strong>{user.name || user.email}</strong>. An invitation creates a new account; it cannot be added to an existing one.
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300">Sign out first to accept it, or keep using your current account.</p>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={onLogout}>Sign out and continue</button>
          <a className="btn-secondary" href="/">Back to my tasks</a>
        </div>
      </Card>
    )
  }
  switch (state.kind) {
    case 'loading':
      return <Card title="Checking your invitation…"><p className="text-sm text-muted">One moment.</p></Card>
    case 'offline':
      return (
        <Card title="You seem to be offline">
          <p className="text-sm text-slate-600 dark:text-slate-300">Accepting an invitation needs a connection to the server. The page will retry when the network returns.</p>
          <button className="btn-primary" onClick={onRetry}>Retry now</button>
        </Card>
      )
    case 'invalid':
      return (
        <Card title="This invitation link is no longer valid">
          <p className="text-sm text-slate-600 dark:text-slate-300">It may have expired, been revoked, or already been used. Ask the person who invited you for a new link.</p>
          <a className="btn-secondary" href="/">Go to sign-in</a>
        </Card>
      )
    case 'rate-limited':
      return (
        <Card title="Too many attempts">
          <p className="text-sm text-slate-600 dark:text-slate-300">Wait a minute, then try again.</p>
          <button className="btn-primary" onClick={onRetry}>Retry</button>
        </Card>
      )
    case 'error':
      return (
        <Card title="Something went wrong">
          <p className="text-sm text-red-600 dark:text-red-400">{state.message}</p>
          <button className="btn-primary" onClick={onRetry}>Retry</button>
        </Card>
      )
    case 'ready':
      return <>{form}</>
  }
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="w-full max-w-sm space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <h1 className="text-lg font-semibold">OpenTodo</h1>
        </div>
        <h2 className="font-medium">{title}</h2>
        {children}
      </div>
    </div>
  )
}

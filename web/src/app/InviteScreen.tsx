import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import type { AuthStatus, InvitationPreview, User } from '../lib/types'
import { AuthScreen } from './AuthScreen'
import { t } from '../lib/i18n'
import { LinkCard as Card, LinkStateCard, type LinkState } from './LinkCard'

export type InviteState = LinkState<InvitationPreview>

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
      <Card title={t('You are already signed in')}>
        <p className="text-body text-muted">
          {t.rich('This device is signed in as <b>{name}</b>. An invitation creates a new account; it cannot be added to an existing one.', { name: user.name || user.email, b: (chunks) => <strong>{chunks}</strong> })}
        </p>
        <p className="text-body text-muted">{t('Sign out first to accept it, or keep using your current account.')}</p>
        <div className="flex gap-2">
          <button className="ui-btn ui-btn--primary ui-btn--md" onClick={onLogout}>{t('Sign out and continue')}</button>
          <a className="ui-btn ui-btn--secondary ui-btn--md" href="/">{t('Back to my tasks')}</a>
        </div>
      </Card>
    )
  }
  if (state.kind === 'ready') return <>{form}</>
  return <LinkStateCard state={state} onRetry={onRetry}
    checking={t('Checking your invitation…')}
    offline={t('Accepting an invitation needs a connection to the server. The page will retry when the network returns.')}
    invalidTitle={t('This invitation link is no longer valid')}
    invalid={t('It may have expired, been revoked, or already been used. Ask the person who invited you for a new link.')} />
}

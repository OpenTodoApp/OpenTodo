import { useCallback, useEffect, useState } from 'react'
import { api, onEnrolmentRequired } from '../lib/api'
import { clearLocalData } from '../lib/db'
import { startSync, stopSync } from '../lib/sync'
import type { AuthStatus, User } from '../lib/types'
import { AuthScreen } from './AuthScreen'
import { InviteScreen } from './InviteScreen'
import { ReauthHost } from './ReauthDialog'
import { ENROLMENT_EVENT } from './SyncStatus'
import { cacheMfa, EnrolmentGate } from './TwoFactorPanel'
import { navigate, useRoute } from './router'
import { ShareCapture } from './ShareCapture'
import { Shell } from './Shell'

type Phase =
  | { kind: 'loading' }
  | { kind: 'offline-unknown' }
  | { kind: 'anonymous'; status: AuthStatus }
  | { kind: 'ready'; user: User }
  // The owner's policy requires a second factor this account lacks (OpenSpec `mfa-totp`).
  | { kind: 'restricted'; user: User }

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const route = useRoute()

  const refresh = useCallback(async () => {
    try {
      const status = await api.authStatus()
      if (status.authenticated && status.user) {
        localStorage.setItem('opentodo.user', JSON.stringify(status.user))
        cacheMfa(status.mfa ?? null)
        setPhase({ kind: status.mfa?.restricted ? 'restricted' : 'ready', user: status.user })
      } else {
        localStorage.removeItem('opentodo.user')
        cacheMfa(null)
        setPhase({ kind: 'anonymous', status })
      }
    } catch {
      // Server unreachable: trust the last known account so the app still opens offline.
      const cached = localStorage.getItem('opentodo.user')
      if (cached) setPhase({ kind: 'ready', user: JSON.parse(cached) as User })
      else setPhase({ kind: 'offline-unknown' })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // A request refused with mfa_enrolment_required (policy changed while signed
  // in), or a click on the sync status, re-reads the status and shows the gate.
  useEffect(() => {
    const again = () => void refresh()
    window.addEventListener(ENROLMENT_EVENT, again)
    const off = onEnrolmentRequired(again)
    return () => {
      window.removeEventListener(ENROLMENT_EVENT, again)
      off()
    }
  }, [refresh])

  useEffect(() => {
    if (phase.kind === 'ready' && route.view !== 'invite') startSync()
    else stopSync()
  }, [phase.kind, route.view])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      stopSync()
      await clearLocalData()
      localStorage.removeItem('opentodo.user')
      cacheMfa(null)
      await refresh()
    }
  }, [refresh])

  // ReauthHost answers `reauth_required` on any screen (OpenSpec `mfa-totp`).
  return (
    <>
      <ReauthHost />
      {screen()}
    </>
  )

  // The screen for the current phase and route; ReauthHost above serves all of them.
  function screen() {
    if (phase.kind === 'loading') {
      return <Centered>Loading…</Centered>
    }
    if (phase.kind === 'restricted' && route.view !== 'invite') {
      return <EnrolmentGate user={phase.user} onEnrolled={() => void refresh()} onLogout={() => void logout()} />
    }
    if (route.view === 'invite') {
      // The invite link works for anonymous visitors, offline visitors (it waits for
      // the network) and signed-in users (who are asked to sign out first).
      return (
        <InviteScreen
          token={route.token}
          user={phase.kind === 'ready' || phase.kind === 'restricted' ? phase.user : null}
          status={phase.kind === 'anonymous' ? phase.status : null}
          onAccepted={() => {
            navigate({ view: 'inbox' })
            void refresh()
          }}
          onLogout={() => void logout()}
        />
      )
    }
    if (phase.kind === 'offline-unknown') {
      return (
        <Centered>
          <p className="font-medium">OpenTodo can't reach the server.</p>
          <p className="text-sm text-slate-500">Sign in once while online; after that the app works offline.</p>
          <button className="btn-primary mt-4" onClick={() => void refresh()}>Retry</button>
        </Centered>
      )
    }
    if (phase.kind === 'anonymous') {
      // On /share the payload waits in memory; after sign-in the route is still /share.
      const notice = route.view === 'share' ? 'Sign in to add the shared page to OpenTodo. It is kept on this screen until then.' : undefined
      return <AuthScreen status={phase.status} notice={notice} onAuthenticated={() => void refresh()} />
    }
    if (route.view === 'share') {
      return <ShareCapture />
    }
    return <Shell user={phase.user} onLogout={() => void logout()} />
  }
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center p-6 text-center">{children}</div>
}

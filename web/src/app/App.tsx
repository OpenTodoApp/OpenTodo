import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { clearLocalData } from '../lib/db'
import { startSync, stopSync } from '../lib/sync'
import type { AuthStatus, User } from '../lib/types'
import { AuthScreen } from './AuthScreen'
import { InviteScreen } from './InviteScreen'
import { navigate, useRoute } from './router'
import { Shell } from './Shell'

type Phase = { kind: 'loading' } | { kind: 'offline-unknown' } | { kind: 'anonymous'; status: AuthStatus } | { kind: 'ready'; user: User }

export function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const route = useRoute()

  const refresh = useCallback(async () => {
    try {
      const status = await api.authStatus()
      if (status.authenticated && status.user) {
        localStorage.setItem('opentodo.user', JSON.stringify(status.user))
        setPhase({ kind: 'ready', user: status.user })
      } else {
        localStorage.removeItem('opentodo.user')
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
      await refresh()
    }
  }, [refresh])

  if (phase.kind === 'loading') {
    return <Centered>Loading…</Centered>
  }
  if (route.view === 'invite') {
    // The invite link works for anonymous visitors, offline visitors (it waits for
    // the network) and signed-in users (who are asked to sign out first).
    return (
      <InviteScreen
        token={route.token}
        user={phase.kind === 'ready' ? phase.user : null}
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
    return <AuthScreen status={phase.status} onAuthenticated={() => void refresh()} />
  }
  return <Shell user={phase.user} onLogout={() => void logout()} />
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center p-6 text-center">{children}</div>
}

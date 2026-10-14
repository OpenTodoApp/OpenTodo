import { useCallback, useEffect, useState } from 'react'
import { DateTimePrefsProvider } from './DateTimePrefsProvider'
import { api, onEnrolmentRequired } from '../lib/api'
import { consumeRestored, RESTORED_NOTICE } from '../lib/restore'
import { clearLocalData } from '../lib/db'
import { adoptProfile, forgetMemoryKeys, loadEncryptionState, useEncryption } from '../lib/e2ee'
import { UnlockScreen } from './UnlockScreen'
import { unsubscribeOnSignOut } from '../lib/push'
import { startSync, stopSync, useSyncStatus } from '../lib/sync'
import type { AuthStatus, User } from '../lib/types'
import { AuthScreen } from './AuthScreen'
import { InviteScreen } from './InviteScreen'
import { ProjectInviteScreen, takePendingInvite } from './ProjectInviteScreen'
import { ResetScreen } from './ResetScreen'
import { ACCOUNT_CHANGED_EVENT } from './UsersPanel'
import { ReauthHost } from './ReauthDialog'
import { ENROLMENT_EVENT } from './SyncStatus'
import { cacheMfa, EnrolmentGate } from './TwoFactorPanel'
import { navigate, useRoute } from './router'
import { ShareCapture } from './ShareCapture'
import { Shell } from './Shell'
import { clearVimPref } from './vim/prefs'
import { DEMO_BANNER, DEMO_LIMIT_NOTICE, expireSandboxIfGone, sandboxErrorMessage, setDemo, startSandbox, useDemo } from '../lib/demo'

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
  const sync = useSyncStatus()
  const enc = useEncryption()
  const demo = useDemo()
  // Shown on the sign-in screen after a password reset (OpenSpec `user-management`).
  const [signInNotice, setSignInNotice] = useState<string | undefined>(undefined)
  // The demo sandbox of this browser was deleted (OpenSpec `demo-sandboxes`).
  const [demoExpired, setDemoExpired] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const status = await api.authStatus()
      setDemo(status.demo)
      if (status.authenticated && status.user) {
        localStorage.setItem('opentodo.user', JSON.stringify(status.user))
        cacheMfa(status.mfa ?? null)
        // End-to-end encryption (OpenSpec e2ee): learn the account mode before the
        // first sync, so a new device unlocks before anything is pulled.
        await adoptProfile(status.encryption, status.minClientVersion).catch(() => undefined)
        setPhase({ kind: status.mfa?.restricted ? 'restricted' : 'ready', user: status.user })
      } else {
        const hadSession = localStorage.getItem('opentodo.user') !== null
        localStorage.removeItem('opentodo.user')
        cacheMfa(null)
        // A demo sandbox that is gone takes its local copy with it (the sign-out path).
        if (await expireSandboxIfGone(status, hadSession, clearDeviceData)) setDemoExpired(true)
        // The session ended because the server was restored from a backup in this tab.
        if (consumeRestored()) setSignInNotice(RESTORED_NOTICE)
        setPhase({ kind: 'anonymous', status })
      }
    } catch {
      // Server unreachable: trust the last known account so the app still opens offline.
      const cached = localStorage.getItem('opentodo.user')
      await loadEncryptionState().catch(() => undefined)
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

  // Ownership moved (Settings → Users): re-read the profile so the role is current.
  useEffect(() => {
    const again = () => void refresh()
    window.addEventListener(ACCOUNT_CHANGED_EVENT, again)
    return () => window.removeEventListener(ACCOUNT_CHANGED_EVENT, again)
  }, [refresh])

  // The server refused this device's session (deactivated, deleted, password
  // reset elsewhere): show the signed-out screen. Local data is left alone, as
  // on any expired session; signing out explicitly clears it.
  useEffect(() => {
    if (sync.state === 'unauthenticated' && phase.kind === 'ready') void refresh()
  }, [sync.state, phase.kind, refresh])

  useEffect(() => {
    if (phase.kind === 'ready' && route.view !== 'invite' && route.view !== 'reset') startSync()
    else stopSync()
  }, [phase.kind, route.view])

  // A visitor who went to sign in from a project invite link (possibly through
  // the identity provider, which returns to /) comes back to the link.
  useEffect(() => {
    if (phase.kind !== 'ready' || route.view === 'project-invite') return
    const token = takePendingInvite()
    if (token) navigate({ view: 'project-invite', token }, { replace: true })
  }, [phase.kind, route.view])

  const logout = useCallback(async () => {
    let redirect: string | undefined
    try {
      // Remove this device's push subscription first (the server also drops it with the session).
      await unsubscribeOnSignOut()
      redirect = (await api.logout())?.redirect
    } finally {
      await clearDeviceData()
      clearVimPref()
      // Provider sign-out (OpenSpec `oidc-login`): the local session and data are
      // gone; the provider's end-session page sends the browser back to sign-in.
      if (redirect && /^https:\/\//.test(redirect)) window.location.assign(redirect)
      else await refresh()
    }
  }, [refresh])

  // ReauthHost answers `reauth_required` on any screen (OpenSpec `mfa-totp`).
  return (
    <DateTimePrefsProvider>
      <ReauthHost />
      {screen()}
    </DateTimePrefsProvider>
  )

  // The screen for the current phase and route; ReauthHost above serves all of them.
  function screen() {
    if (phase.kind === 'loading') {
      return <Centered>Loading…</Centered>
    }
    if (route.view === 'reset') {
      return (
        <ResetScreen
          token={route.token}
          user={phase.kind === 'ready' || phase.kind === 'restricted' ? phase.user : null}
          onDone={() => {
            setSignInNotice('Your password was changed. Sign in with the new one.')
            navigate({ view: 'inbox' }, { replace: true })
            void refresh()
          }}
          onLogout={() => void logout()}
        />
      )
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
    if (route.view === 'project-invite') {
      // Project invite links (OpenSpec `project-invite-links`) work signed in
      // (join) and signed out (sign in, or create an account when allowed).
      return (
        <ProjectInviteScreen
          token={route.token}
          user={phase.kind === 'ready' ? phase.user : null}
          status={phase.kind === 'anonymous' ? phase.status : null}
          onAuthenticated={() => void refresh()}
          onLogout={() => void logout()}
        />
      )
    }
    if (phase.kind === 'offline-unknown') {
      return (
        <Centered>
          <p className="font-medium">OpenTodo can't reach the server.</p>
          <p className="text-sm text-muted">Sign in once while online; after that the app works offline.</p>
          <button className="btn-primary mt-4" onClick={() => void refresh()}>Retry</button>
        </Centered>
      )
    }
    if (phase.kind === 'anonymous' && phase.status.demo && demoExpired) {
      return <DemoExpiredScreen onStarted={() => { setDemoExpired(false); void refresh() }} />
    }
    if (phase.kind === 'anonymous') {
      // On /share the payload waits in memory; after sign-in the route is still /share.
      const notice = route.view === 'share' ? 'Sign in to add the shared page to OpenTodo. It is kept on this screen until then.' : signInNotice
      return <AuthScreen status={phase.status} notice={notice} onAuthenticated={() => void refresh()} />
    }
    // Encrypted account without the key on this device (OpenSpec e2ee, design D5).
    if (enc.enabled && !enc.unlocked) {
      return <UnlockScreen onLogout={() => void logout()} />
    }
    if (route.view === 'share') {
      return <ShareCapture />
    }
    return (
      <>
        {enc.updateRequired && (
          <div role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
            A newer version of OpenTodo is required to read your data. <button className="underline" onClick={() => window.location.reload()}>Reload to update</button>
          </div>
        )}
        {demo ? (
          // The banner takes its own row so the shell still fills the rest of the screen.
          <div className="flex h-full flex-col">
            <DemoBanner notice={sync.state === 'limited' ? DEMO_LIMIT_NOTICE : undefined} />
            <div className="min-h-0 flex-1"><Shell user={phase.user} onLogout={() => void logout()} /></div>
          </div>
        ) : (
          <Shell user={phase.user} onLogout={() => void logout()} />
        )}
      </>
    )
  }
}

/** Clears everything this device holds for the signed-in account (sign-out and an expired demo sandbox). */
async function clearDeviceData() {
  stopSync()
  await clearLocalData()
  forgetMemoryKeys()
  localStorage.removeItem('opentodo.user')
  cacheMfa(null)
}

/** Shown on every screen of a demo instance (OpenSpec `demo-mode`, `demo-sandboxes`), with the write-limit notice when it applies. */
export function DemoBanner({ notice }: { notice?: string }) {
  return (
    <div role="status" data-testid="demo-banner" className="border-b border-sky-200 bg-sky-50 px-4 py-1.5 text-center text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
      {DEMO_BANNER}
      {notice && <span className="mt-0.5 block font-medium text-amber-800 dark:text-amber-200" data-testid="demo-limit">{notice}</span>}
    </div>
  )
}

/** The sandbox of this browser was deleted; the local copy is already gone (OpenSpec `demo-sandboxes`). */
export function DemoExpiredScreen({ onStarted }: { onStarted: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function start() {
    setBusy(true)
    setError(null)
    try {
      await startSandbox()
      onStarted()
    } catch (err) {
      setError(sandboxErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Centered>
      <div data-testid="demo-expired" className="max-w-sm">
        <p className="font-medium">Your demo sandbox has expired</p>
        <p className="mt-1 text-sm text-muted">Sandboxes are deleted after 2 hours of inactivity, a day after they were created, and every night. Its data is gone from the server and from this browser.</p>
        <button className="btn-primary mt-4" disabled={busy} onClick={() => void start()}>{busy ? 'Please wait…' : 'Start a new sandbox'}</button>
        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}
      </div>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center p-6 text-center">{children}</div>
}

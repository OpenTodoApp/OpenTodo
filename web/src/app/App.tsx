import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { clearOwnAvatar } from '../lib/avatars'
import { Skeleton } from '../ui'
import { AppearanceProvider } from './AppearanceProvider'
import { DateTimePrefsProvider } from './DateTimePrefsProvider'
import { LanguageProvider } from './LanguageProvider'
import { useLanguageVersion, t } from '../lib/i18n'
import { api, onEnrolmentRequired } from '../lib/api'
import { consumeRestored, RESTORED_NOTICE } from '../lib/restore'
import { clearLocalData, requestPersistentStorage } from '../lib/db'
import { adoptProfile, forgetMemoryKeys, loadEncryptionState, useEncryption } from '../lib/e2ee'
import { clearInbox } from '../lib/shareInbox'
import { RecordMissingScreen, UnlockScreen } from './UnlockScreen'
import { unsubscribeOnSignOut } from '../lib/push'
import { announceSignOut, onSignOutElsewhere, startSync, stopSync, stopSyncAndWait, syncNow, useSyncStatus, withSyncLock } from '../lib/sync'
import { startRelay } from '../lib/relay'
import { RelayConfirm } from './RelayConfirm'
import type { AuthStatus, User } from '../lib/types'
import { AuthScreen } from './AuthScreen'
import { InviteScreen } from './InviteScreen'
import { ProjectInviteScreen, takePendingInvite } from './ProjectInviteScreen'
import { WorkspaceInviteScreen } from './WorkspaceInviteScreen'
import { ResetScreen } from './ResetScreen'
import { ConfirmEmailScreen, ForgotScreen, VerifyScreen } from './EmailScreens'
import { setOutgoingEmail } from '../lib/outgoingEmail'
import { PublicListScreen } from './PublicListScreen'
import { ACCOUNT_CHANGED_EVENT } from './UsersPanel'
import { ReauthHost } from './ReauthDialog'
import { ENROLMENT_EVENT } from './SyncStatus'
import { cacheMfa, EnrolmentGate } from './TwoFactorPanel'
import { navigate, useRoute } from './router'
import { ShareCapture } from './ShareCapture'
import { Shell } from './Shell'
import { clearVimPref } from './vim/prefs'
import { DEMO_LIMIT_NOTICE, expireSandboxIfGone, sandboxErrorMessage, setDemo, startSandbox, useDemo } from '../lib/demo'
import { setHosted } from '../lib/hosted'
import { setBranding } from '../lib/branding'
import { PanelBoundary } from './PanelBoundary'
import { UpdateBanner } from './UpdateBanner'
import { DemoBanner } from './DemoBanner'

export { DemoBanner }

// Display mode (display-mode): its own chunk, fetched when a display route opens.
const DisplayScreen = lazy(() => import('./display/DisplayScreen').then((m) => ({ default: m.DisplayScreen })))

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
  // A language change re-renders the whole tree from here (app-localization D3).
  useLanguageVersion()

  const refresh = useCallback(async () => {
    try {
      const status = await api.authStatus()
      setDemo(status.demo)
      setHosted(status.hosted)
      setBranding(status.branding)
      setOutgoingEmail(status.outgoingEmail?.enabled)
      if (status.authenticated && status.user) {
        localStorage.setItem('opentodo.user', JSON.stringify(status.user))
        cacheMfa(status.mfa ?? null)
        // End-to-end encryption (OpenSpec e2ee): learn the account mode before the
        // first sync, so a new device unlocks before anything is pulled.
        await adoptProfile(status.encryption, status.minClientVersion).catch(() => undefined)
        // Ask the browser not to evict the local copy (Safari drops unpersisted
        // storage after weeks without a visit); its answer changes nothing else.
        void requestPersistentStorage()
        setPhase({ kind: status.mfa?.restricted ? 'restricted' : 'ready', user: status.user })
      } else {
        const hadSession = localStorage.getItem('opentodo.user') !== null
        localStorage.removeItem('opentodo.user')
        cacheMfa(null)
        // A demo sandbox that is gone takes its local copy with it (the sign-out path).
        if (await expireSandboxIfGone(status, hadSession, clearDeviceData)) setDemoExpired(true)
        // The session ended because the server was restored from a backup in this tab.
        if (consumeRestored()) setSignInNotice(t(RESTORED_NOTICE))
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

  // Ownership moved (Settings → People → Users): re-read the profile so the role is current.
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

  // Sync runs while signed in, except on the screens that work without it. The
  // effect depends on that one boolean, so moving between lists does not start
  // a new exchange (client-sync-robustness).
  const syncWanted = phase.kind === 'ready' && route.view !== 'invite' && route.view !== 'reset' && route.view !== 'verify' && route.view !== 'public'
  useEffect(() => {
    if (syncWanted) startSync()
    else stopSync()
  }, [syncWanted])
  // The device relay answers AI connectors from the syncing tab while this
  // device is opted in and unlocked (mcp-device-relay).
  useEffect(() => (syncWanted ? startRelay() : undefined), [syncWanted])

  // Another tab signed out and cleared the local data: this one reloads to the sign-in screen.
  useEffect(() => onSignOutElsewhere(() => window.location.reload()), [])

  // A visitor who went to sign in from a project invite link (possibly through
  // the identity provider, which returns to /) comes back to the link.
  useEffect(() => {
    if (phase.kind !== 'ready' || route.view === 'project-invite' || route.view === 'workspace-invite') return
    const token = takePendingInvite()
    if (token) navigate(token.startsWith('otw_') ? { view: 'workspace-invite', token } : { view: 'project-invite', token }, { replace: true })
  }, [phase.kind, route.view])

  const logout = useCallback(async () => {
    let redirect: string | undefined
    try {
      // Unsynced changes are uploaded first when online (as Settings promises),
      // for at most ten seconds; the exchange is then stopped before the clear.
      if (navigator.onLine !== false) await Promise.race([syncNow().catch(() => undefined), new Promise((r) => setTimeout(r, 10_000))])
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
    <AppearanceProvider>
      <LanguageProvider>
        <DateTimePrefsProvider>
          <ReauthHost />
          <UpdateBanner />
          {screen()}
        </DateTimePrefsProvider>
      </LanguageProvider>
    </AppearanceProvider>
  )

  // The screen for the current phase and route; ReauthHost above serves all of them.
  function screen() {
    // A public link (public-links) needs no account and never syncs: it renders
    // before the sign-in state is even known.
    if (route.view === 'public') return <PublicListScreen token={route.token} />
    if (phase.kind === 'loading') {
      // Cold start (task-list-presentation "Skeleton loading"): rows in the row's shape until the local database answers.
      return <div className="w-full max-w-[62rem] px-4 py-5 md:max-w-[64rem] md:px-8"><Skeleton shape="row" count={8} label={t('Loading your tasks')} /></div>
    }
    if (route.view === 'reset') {
      return (
        <ResetScreen
          token={route.token}
          user={phase.kind === 'ready' || phase.kind === 'restricted' ? phase.user : null}
          onDone={() => {
            setSignInNotice(t('Your password was changed. Sign in with the new one.'))
            navigate({ view: 'inbox' }, { replace: true })
            void refresh()
          }}
          onLogout={() => void logout()}
        />
      )
    }
    if (route.view === 'forgot') {
      const user = phase.kind === 'ready' || phase.kind === 'restricted' ? phase.user : null
      // Unknown while the server is unreachable: show the form, which says it needs a connection.
      return <ForgotScreen enabled={phase.kind === 'anonymous' ? phase.status.outgoingEmail?.enabled === true : true} user={user} />
    }
    if (route.view === 'verify') {
      return (
        <VerifyScreen
          token={route.token}
          user={phase.kind === 'ready' || phase.kind === 'restricted' ? phase.user : null}
          onDone={() => {
            navigate({ view: 'inbox' }, { replace: true })
            void refresh()
          }}
          onLogout={() => void logout()}
        />
      )
    }
    // Signed out, the sign-in screen shows first and the link's screen after it.
    if (route.view === 'confirm-email' && phase.kind === 'ready') {
      return <ConfirmEmailScreen token={route.token} onDone={() => void refresh()} />
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
    if (route.view === 'workspace-invite') {
      return <WorkspaceInviteScreen token={route.token} user={phase.kind === 'ready' ? phase.user : null}
        status={phase.kind === 'anonymous' ? phase.status : null} onAuthenticated={() => void refresh()} />
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
          <p className="font-medium">{t('OpenTodo can\'t reach the server.')}</p>
          <p className="text-body text-muted">{t('Sign in once while online; after that the app works offline.')}</p>
          <button className="ui-btn ui-btn--primary ui-btn--md mt-4" onClick={() => void refresh()}>{t('Retry')}</button>
        </Centered>
      )
    }
    if (phase.kind === 'anonymous' && phase.status.demo && demoExpired) {
      return <DemoExpiredScreen onStarted={() => { setDemoExpired(false); void refresh() }} />
    }
    if (phase.kind === 'anonymous') {
      // On /share the payload waits in memory; after sign-in the route is still /share.
      const notice = route.view === 'share' ? t('Sign in to add the shared page to OpenTodo. It is kept on this screen until then.') : signInNotice
      return <AuthScreen status={phase.status} notice={notice} onAuthenticated={() => void refresh()} />
    }
    // The server lost the key record of an encrypted account (encryption-state-integrity).
    if (enc.enabled && enc.recordMissing) {
      return <RecordMissingScreen unlocked={enc.unlocked} onLogout={() => void logout()} />
    }
    // Encrypted account without the key on this device (OpenSpec e2ee, design D5).
    if (enc.enabled && !enc.unlocked) {
      return <UnlockScreen onLogout={() => void logout()} />
    }
    if (route.view === 'share') {
      return <ShareCapture />
    }
    if (route.view === 'display') {
      // Display mode (display-mode D3): the display replaces the shell; sync keeps
      // running (started above for every signed-in route), so it stays live.
      return <PanelBoundary><Suspense fallback={null}><DisplayScreen route={route} /></Suspense></PanelBoundary>
    }
    return (
      <>
        {enc.updateRequired && (
          <div role="alert" className="border-b border-warning bg-warning-soft px-4 py-2 text-body text-on-warning-soft">
            {t('A newer version of OpenTodo is required to read your data.')}{' '}<button className="underline" onClick={() => window.location.reload()}>{t('Reload to update')}</button>
          </div>
        )}
        {demo ? (
          // The banner takes its own row so the shell still fills the rest of the screen.
          <div className="flex h-full flex-col">
            <DemoBanner notice={sync.state === 'limited' ? t(DEMO_LIMIT_NOTICE) : undefined} />
            <div className="min-h-0 flex-1"><Shell user={phase.user} onLogout={() => void logout()} /></div>
          </div>
        ) : (
          <Shell user={phase.user} onLogout={() => void logout()} />
        )}
        <RelayConfirm />
      </>
    )
  }
}

/** Clears everything this device holds for the signed-in account (sign-out and an expired demo sandbox). */
async function clearDeviceData() {
  // Other tabs stop syncing and reload; the exchange running here stops and is
  // awaited, and the data is cleared while no tab can sync (client-sync-robustness).
  announceSignOut()
  await stopSyncAndWait()
  await withSyncLock(() => clearLocalData())
  // Files shared to the app and not saved yet (OpenSpec attachments D9).
  await clearInbox().catch(() => undefined)
  forgetMemoryKeys()
  localStorage.removeItem('opentodo.user')
  // The profile's last loaded values and picture version (settings-refresh D10).
  localStorage.removeItem('opentodo.profile')
  clearOwnAvatar()
  cacheMfa(null)
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
        <p className="font-medium">{t('Your demo sandbox has expired')}</p>
        <p className="mt-1 text-body text-muted">{t('Sandboxes are deleted after 2 hours of inactivity, a day after they were created, and every night. Its data is gone from the server and from this browser.')}</p>
        <button className="ui-btn ui-btn--primary ui-btn--md mt-4" disabled={busy} onClick={() => void start()}>{busy ? t('Please wait…') : t('Start a new sandbox')}</button>
        {error && <p className="mt-3 text-body text-danger" role="alert">{error}</p>}
      </div>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center p-6 text-center">{children}</div>
}

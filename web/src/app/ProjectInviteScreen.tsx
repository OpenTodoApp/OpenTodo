import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import { requestSync } from '../lib/sync'
import type { AuthStatus, ProjectInvitePreview, User } from '../lib/types'
import { AuthScreen } from './AuthScreen'
import { navigate } from './router'

// Screen behind /invite/p/<token> (OpenSpec `project-invite-links`): previews a
// project invite link, lets a signed-in person join, and offers a visitor
// sign-in (then join) or, when the link allows it, a new account that joins in
// the same step. The preview is never cached; offline, the screen waits.

/** sessionStorage key holding a link whose visitor went to sign in (the provider round trip leaves the page). */
export const PENDING_PROJECT_INVITE = 'opentodo.pendingProjectInvite'

export function rememberPendingInvite(token: string) {
  try { sessionStorage.setItem(PENDING_PROJECT_INVITE, token) } catch { /* storage blocked: sign-in still works, the link must be opened again */ }
}

/** Reads and clears a remembered link. */
export function takePendingInvite(): string | null {
  try {
    const t = sessionStorage.getItem(PENDING_PROJECT_INVITE)
    if (t) sessionStorage.removeItem(PENDING_PROJECT_INVITE)
    return t
  } catch {
    return null
  }
}

export type ProjectInviteState =
  | { kind: 'loading' }
  | { kind: 'offline' }
  | { kind: 'invalid' }
  | { kind: 'rate-limited' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; preview: ProjectInvitePreview }

export type JoinState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'already-member' }
  | { kind: 'error'; message: string }

/** What an anonymous visitor is doing: choosing, signing in, or creating an account. */
export type VisitorStep = 'choose' | 'signin' | 'register'

interface Props {
  token: string
  user: User | null
  status: AuthStatus | null
  /** Called after a new account was created and joined, or after sign-in. */
  onAuthenticated: () => void
  onLogout: () => void
}

export function ProjectInviteScreen({ token, user, status, onAuthenticated, onLogout }: Props) {
  const online = useOnline()
  const [state, setState] = useState<ProjectInviteState>({ kind: 'loading' })
  const [join, setJoin] = useState<JoinState>({ kind: 'idle' })
  const [step, setStep] = useState<VisitorStep>('choose')

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      setState({ kind: 'ready', preview: await api.previewProjectInvite(token) })
    } catch (err) {
      if (isNetworkError(err)) setState({ kind: 'offline' })
      else if ((err as ApiError).code === 'invitation_invalid') setState({ kind: 'invalid' })
      else if ((err as ApiError).code === 'rate_limited') setState({ kind: 'rate-limited' })
      else setState({ kind: 'error', message: (err as ApiError).message })
    }
  }, [token])

  // Reload whenever the signed-in account changes: alreadyMember depends on it.
  useEffect(() => {
    if (online) void load()
    else setState({ kind: 'offline' })
  }, [online, load, user?.id])

  // Back on the link after signing in: nothing is pending any more.
  useEffect(() => {
    if (user) takePendingInvite()
  }, [user])

  async function accept() {
    setJoin({ kind: 'busy' })
    try {
      const res = await api.acceptProjectInvite(token)
      requestSync(0)
      navigate({ view: 'project', id: res.projectId }, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'already_member') setJoin({ kind: 'already-member' })
      else if (err instanceof ApiError && err.code === 'invitation_invalid') setState({ kind: 'invalid' })
      else if (isNetworkError(err)) setJoin({ kind: 'error', message: 'The server could not be reached. Joining needs a connection; try again when you are online.' })
      else setJoin({ kind: 'error', message: (err as ApiError).message })
    }
  }

  let form: ReactNode = null
  if (state.kind === 'ready' && !user && status && step !== 'choose') {
    const preview = state.preview
    form = step === 'signin' ? (
      <AuthScreen status={status} notice={`Sign in to join “${preview.projectName}”. You come back to this link afterwards.`} onAuthenticated={() => onAuthenticated()} />
    ) : (
      <AuthScreen
        status={status}
        invite={{ token, preview, project: { name: preview.projectName, role: preview.role }, onSignIn: () => { rememberPendingInvite(token); setStep('signin') } }}
        onAuthenticated={(res) => {
          if (res?.projectId) navigate({ view: 'project', id: res.projectId }, { replace: true })
          onAuthenticated()
        }}
      />
    )
  }

  return (
    <ProjectInviteView
      state={state} user={user} join={join} step={step} form={form}
      onRetry={() => void load()}
      onJoin={() => void accept()}
      onSignIn={() => { rememberPendingInvite(token); setStep('signin') }}
      onRegister={() => setStep('register')}
      onLogout={onLogout}
    />
  )
}

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Pure rendering of every state; kept free of effects so tests can render it to markup. */
export function ProjectInviteView({ state, user, join, step, form, onRetry, onJoin, onSignIn, onRegister, onLogout }: {
  state: ProjectInviteState
  user: User | null
  join: JoinState
  step: VisitorStep
  form: ReactNode
  onRetry: () => void
  onJoin: () => void
  onSignIn: () => void
  onRegister: () => void
  onLogout: () => void
}) {
  switch (state.kind) {
    case 'loading':
      return <Card title="Checking your invite link…"><p className="text-sm text-muted">One moment.</p></Card>
    case 'offline':
      return (
        <Card title="You seem to be offline">
          <p className="text-sm text-slate-600 dark:text-slate-300">Joining a project needs a connection to the server. The page will retry when the network returns.</p>
          <button className="btn-primary" onClick={onRetry}>Retry now</button>
        </Card>
      )
    case 'invalid':
      return (
        <Card title="This invite link is no longer valid">
          <p className="text-sm text-slate-600 dark:text-slate-300">It may have expired, been revoked or already been used, or the project is gone. Ask the person who invited you for a new link.</p>
          <a className="btn-ghost border border-slate-300 dark:border-slate-700" href="/">{user ? 'Back to my tasks' : 'Go to sign-in'}</a>
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
  }
  const p = state.preview
  if (!user && step !== 'choose' && form) return <>{form}</>
  const summary = (
    <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" data-testid="project-invite-summary">
      <p><strong>{p.inviterName}</strong> invited you to the project <strong className="user-text">{p.projectName}</strong> as <strong>{p.role}</strong>.</p>
      {p.email && <p className="mt-1">This link is for <strong>{p.email}</strong>.</p>}
      <p className="mt-1 text-xs opacity-80">It expires {when(p.expiresAt)} and works once.</p>
    </div>
  )
  if (user) {
    const already = p.alreadyMember || join.kind === 'already-member'
    const mismatch = !!p.email && p.email.toLowerCase() !== user.email.toLowerCase()
    return (
      <Card title={already ? 'You are already a member' : <>Join <span className="user-text">{p.projectName}</span></>}>
        {summary}
        <p className="text-sm text-slate-600 dark:text-slate-300">Signed in as <strong>{user.name || user.email}</strong>.</p>
        {already ? (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300" role="status">You are on this project already, so the link stays unused. Forward it to the person it was meant for, or ignore it.</p>
            <a className="btn-primary" href="/">Back to my tasks</a>
          </>
        ) : mismatch ? (
          <>
            <p className="text-sm text-amber-700 dark:text-amber-300" role="alert">This link was issued for {p.email}, but you are signed in as {user.email}. Sign out and sign in with that address to join.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={onLogout}>Sign out</button>
              <a className="btn-ghost border border-slate-300 dark:border-slate-700" href="/">Back to my tasks</a>
            </div>
          </>
        ) : (
          <>
            {join.kind === 'error' && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{join.message}</p>}
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" autoFocus disabled={join.kind === 'busy'} onClick={onJoin}>{join.kind === 'busy' ? 'Joining…' : 'Join project'}</button>
              <a className="btn-ghost border border-slate-300 dark:border-slate-700" href="/">Not now</a>
            </div>
            <p className="text-xs text-muted">Not you? <button type="button" className="underline" onClick={onLogout}>Sign out</button> and use another account.</p>
          </>
        )}
      </Card>
    )
  }
  return (
    <Card title={<>Join <span className="user-text">{p.projectName}</span></>}>
      {summary}
      <div className="flex flex-col gap-2">
        <button className="btn-primary w-full" autoFocus onClick={onSignIn}>I have an account: sign in to join</button>
        {p.canCreateAccount && (
          <button className="btn-ghost w-full border border-slate-300 dark:border-slate-700" onClick={onRegister}>Create an account</button>
        )}
      </div>
      {!p.canCreateAccount && (
        <p className="text-sm text-slate-600 dark:text-slate-300" data-testid="account-needed">
          You need an account on this server first. Ask {p.inviterName} or the server owner for one, then open this link again and sign in.
        </p>
      )}
    </Card>
  )
}

function Card({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 p-4 sm:p-6 dark:bg-slate-950">
      <main className="w-full max-w-sm space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-9 w-9" />
          <p className="text-lg font-semibold">OpenTodo</p>
        </div>
        <h1 className="font-medium">{title}</h1>
        {children}
      </main>
    </div>
  )
}

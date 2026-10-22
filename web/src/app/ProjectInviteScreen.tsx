import { type ReactNode, useCallback, useEffect, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import { requestSync } from '../lib/sync'
import type { AuthStatus, ProjectInvitePreview, User } from '../lib/types'
import { AuthScreen } from './AuthScreen'
import { navigate } from './router'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { formatInstant } from '../lib/dates'
import { t } from '../lib/i18n'
import { InstanceMark, InstanceWordmark } from './InstanceBrand'
import { roleName } from '../lib/roleNames'

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
    const item = sessionStorage.getItem(PENDING_PROJECT_INVITE)
    if (item) sessionStorage.removeItem(PENDING_PROJECT_INVITE)
    return item
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
  /** The project is in a workspace this account is not in (workspaces 6.3). */
  | { kind: 'not-in-workspace' }
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
      else if (err instanceof ApiError && err.code === 'not_in_workspace') setJoin({ kind: 'not-in-workspace' })
      else if (err instanceof ApiError && err.code === 'invitation_invalid') setState({ kind: 'invalid' })
      else if (isNetworkError(err)) setJoin({ kind: 'error', message: t('The server could not be reached. Joining needs a connection; try again when you are online.') })
      else setJoin({ kind: 'error', message: (err as ApiError).message })
    }
  }

  let form: ReactNode = null
  if (state.kind === 'ready' && !user && status && step !== 'choose') {
    const preview = state.preview
    form = step === 'signin' ? (
      <AuthScreen status={status} notice={t('Sign in to join “{projectName}”. You come back to this link afterwards.', { projectName: preview.projectName })} onAuthenticated={() => onAuthenticated()} />
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

const when = (ms: number) => formatInstant(ms, 'datetime')

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
  useDateTimeFormat()
  switch (state.kind) {
    case 'loading':
      return <CheckingCard />
    case 'offline':
      return (
        <Card title={t('You seem to be offline')}>
          <p className="text-body text-muted">{t('Joining a project needs a connection to the server. The page will retry when the network returns.')}</p>
          <button className="ui-btn ui-btn--primary ui-btn--md" onClick={onRetry}>{t('Retry now')}</button>
        </Card>
      )
    case 'invalid':
      return (
        <Card title={t('This invite link is no longer valid')}>
          <p className="text-body text-muted">{t('It may have expired, been revoked or already been used, or the project is gone. Ask the person who invited you for a new link.')}</p>
          <a className="ui-btn ui-btn--secondary ui-btn--md" href="/">{user ? t('Back to my tasks') : t('Go to sign-in')}</a>
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
  }
  const p = state.preview
  if (!user && step !== 'choose' && form) return <>{form}</>
  const summary = (
    <div className="rounded-control bg-accent-soft p-3 text-body text-on-accent-soft" data-testid="project-invite-summary">
      <p>{t.rich('<strong>{inviterName}</strong> invited you to the project <strong2>{projectName}</strong2> as <strong3>{role}</strong3>.', { inviterName: p.inviterName, projectName: p.projectName, role: roleName(p.role), strong: (chunks) => <strong>{chunks}</strong>, strong2: (chunks) => <strong className="user-text">{chunks}</strong>, strong3: (chunks) => <strong>{chunks}</strong> })}</p>
      {p.email && <p className="mt-1">{t.rich('This link is for <strong>{email}</strong>.', { email: p.email, strong: (chunks) => <strong>{chunks}</strong> })}</p>}
      <p className="mt-1 text-meta">{t('It expires {when} and works once.', { when: when(p.expiresAt) })}</p>
    </div>
  )
  if (user) {
    const already = p.alreadyMember || join.kind === 'already-member'
    const mismatch = !!p.email && p.email.toLowerCase() !== user.email.toLowerCase()
    return (
      <Card title={already ? t('You are already a member') : <>{t.rich('Join <span>{projectName}</span>', { projectName: p.projectName, span: (chunks) => <span className="user-text">{chunks}</span> })}</>}>
        {summary}
        <p className="text-body text-muted">{t.rich('Signed in as <b>{name}</b>.', { name: user.name || user.email, b: (chunks) => <strong>{chunks}</strong> })}</p>
        {already ? (
          <>
            <p className="text-body text-muted" role="status">{t('You are on this project already, so the link stays unused. Forward it to the person it was meant for, or ignore it.')}</p>
            <a className="ui-btn ui-btn--primary ui-btn--md" href="/">{t('Back to my tasks')}</a>
          </>
        ) : join.kind === 'not-in-workspace' ? (
          <>
            <p className="text-body text-warning" role="alert" data-not-in-workspace>{t('This project belongs to a workspace you are not part of. Ask the workspace owner to add you first, then open the link again.')}</p>
            <a className="ui-btn ui-btn--secondary ui-btn--md" href="/">{t('Back to my tasks')}</a>
          </>
        ) : mismatch ? (
          <>
            <p className="text-body text-warning" role="alert">{t('This link was issued for {email}, but you are signed in as {email2}. Sign out and sign in with that address to join.', { email: p.email, email2: user.email })}</p>
            <div className="flex flex-wrap gap-2">
              <button className="ui-btn ui-btn--primary ui-btn--md" onClick={onLogout}>{t('Sign out')}</button>
              <a className="ui-btn ui-btn--secondary ui-btn--md" href="/">{t('Back to my tasks')}</a>
            </div>
          </>
        ) : (
          <>
            {join.kind === 'error' && <p className="text-body text-danger" role="alert">{join.message}</p>}
            <div className="flex flex-wrap gap-2">
              <button className="ui-btn ui-btn--primary ui-btn--md" autoFocus disabled={join.kind === 'busy'} onClick={onJoin}>{join.kind === 'busy' ? t('Joining…') : t('Join project')}</button>
              <a className="ui-btn ui-btn--secondary ui-btn--md" href="/">{t('Not now')}</a>
            </div>
            <p className="text-meta text-muted">{t.rich('Not you? <a>Sign out</a> and use another account.', { a: (chunks) => <button type="button" className="underline" onClick={onLogout}>{chunks}</button> })}</p>
          </>
        )}
      </Card>
    )
  }
  return (
    <Card title={<>{t.rich('Join <span>{projectName}</span>', { projectName: p.projectName, span: (chunks) => <span className="user-text">{chunks}</span> })}</>}>
      {summary}
      <div className="flex flex-col gap-2">
        <button className="ui-btn ui-btn--primary ui-btn--md w-full" autoFocus onClick={onSignIn}>{t('I have an account: sign in to join')}</button>
        {p.canCreateAccount && (
          <button className="ui-btn ui-btn--ghost ui-btn--md w-full border border-input" onClick={onRegister}>{t('Create an account')}</button>
        )}
      </div>
      {!p.canCreateAccount && (
        <p className="text-body text-muted" data-testid="account-needed">
          {t('You need an account on this server first. Ask {inviterName} or the server owner for one, then open this link again and sign in.', { inviterName: p.inviterName })}
        </p>
      )}
    </Card>
  )
}

/**
 * The checking card shows only when the answer takes a while: a quick answer would
 * otherwise swap a small centred card for a taller one and move it (motion-polish D2).
 */
function CheckingCard() {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), 400)
    return () => clearTimeout(timer)
  }, [])
  if (!shown) return <div className="min-h-full bg-canvas" aria-busy="true" />
  return <Card title={t('Checking your invite link…')}><p className="text-body text-muted">{t('One moment.')}</p></Card>
}

function Card({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-4 sm:p-6">
      <main className="w-full max-w-sm space-y-3 rounded-card border border-default bg-surface p-5 shadow-1 sm:p-6">
        <div className="flex items-center gap-3">
          <InstanceMark size={32} />
          <p className="text-h3 font-semibold"><InstanceWordmark /></p>
        </div>
        <h1 className="font-medium">{title}</h1>
        {children}
      </main>
    </div>
  )
}

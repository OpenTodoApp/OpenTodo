// Screen behind /invite/w/<token> (OpenSpec change workspaces, task 7.2): a
// workspace invite link, built like the project invite screen. Signed in, the
// person joins; signed out, they sign in (and come back) or, when the link
// allows it, create an account that joins in the same step.
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react'
import { ApiError, isNetworkError } from '../lib/api'
import { formatInstant } from '../lib/dates'
import { t } from '../lib/i18n'
import { useOnline } from '../lib/online'
import { roleName } from '../lib/roleNames'
import { inviterName } from '../lib/inviterName'
import type { AuthStatus, User } from '../lib/types'
import { workspaceApi, type WorkspaceInvitePreview } from '../lib/workspaceApi'
import { switchTo } from '../lib/workspaces'
import { Field, Input } from '../ui'
import { InviteCard as Card, LinkStateCard } from './LinkCard'
import { AuthScreen } from './AuthScreen'
import { rememberPendingInvite } from './pendingInvite'
import { navigate } from './router'
import { messageOf } from '../lib/errorText'

export type WorkspaceInviteState =
  | { kind: 'loading' } | { kind: 'offline' } | { kind: 'invalid' } | { kind: 'error'; message: string }
  | { kind: 'ready'; preview: WorkspaceInvitePreview }

function errorState(err: unknown): WorkspaceInviteState {
  if (isNetworkError(err)) return { kind: 'offline' }
  if (err instanceof ApiError && err.code === 'invitation_invalid') return { kind: 'invalid' }
  return { kind: 'error', message: messageOf(err) }
}

export function WorkspaceInviteScreen({ token, user, status, onAuthenticated }: { token: string; user: User | null; status: AuthStatus | null; onAuthenticated: () => void }) {
  const online = useOnline()
  const [state, setState] = useState<WorkspaceInviteState>({ kind: 'loading' })
  const [step, setStep] = useState<'choose' | 'signin' | 'register'>('choose')
  const [joinError, setJoinError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      setState({ kind: 'ready', preview: await workspaceApi.previewInvite(token) })
    } catch (err) {
      setState(errorState(err))
    }
  }, [token])
  useEffect(() => { if (online) void load(); else setState({ kind: 'offline' }) }, [online, load, user?.id])

  async function join() {
    setJoinError(null)
    try {
      const res = await workspaceApi.acceptInvite(token)
      await switchTo(res.workspaceId)
      navigate({ view: 'inbox' }, { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'already_member') setJoinError(t('You are a member of this workspace already.'))
      else setJoinError(messageOf(err))
    }
  }

  if (state.kind !== 'ready') return <WorkspaceInviteView state={state} onRetry={() => void load()} />
  const p = state.preview
  if (!user && status && step === 'signin') {
    return <AuthScreen status={status} notice={t('Sign in to join “{name}”. You come back to this link afterwards.', { name: p.workspaceName })} onAuthenticated={() => onAuthenticated()} />
  }
  if (!user && step === 'register') return <RegisterForm token={token} preview={p} onDone={onAuthenticated} />
  return (
    <WorkspaceInviteView state={state} onRetry={() => void load()}>
      {user
        ? <>
          {joinError && <p role="alert" className="text-body text-danger">{joinError}</p>}
          <div className="flex flex-wrap gap-2">
            <button className="ui-btn ui-btn--primary ui-btn--md" autoFocus disabled={!!p.alreadyMember} onClick={() => void join()}>{t('Join workspace')}</button>
            <a className="ui-btn ui-btn--secondary ui-btn--md" href="/">{t('Not now')}</a>
          </div>
          {p.alreadyMember && <p role="status" className="text-body text-muted">{t('You are a member of this workspace already.')}</p>}
        </>
        : <div className="flex flex-col gap-2">
          <button className="ui-btn ui-btn--primary ui-btn--md w-full" autoFocus onClick={() => { rememberPendingInvite(token); setStep('signin') }}>{t('I have an account: sign in to join')}</button>
          {p.canCreateAccount && <button className="ui-btn ui-btn--ghost ui-btn--md w-full border border-input" onClick={() => setStep('register')}>{t('Create an account')}</button>}
        </div>}
    </WorkspaceInviteView>
  )
}

function RegisterForm({ token, preview, onDone }: { token: string; preview: WorkspaceInvitePreview; onDone: () => void }) {
  const [email, setEmail] = useState(preview.email ?? '')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      const res = await workspaceApi.registerWithInvite(email.trim(), name.trim(), password, token)
      await switchTo(res.workspaceId)
      onDone()
    } catch (err) {
      setError(messageOf(err))
    }
  }
  return (
    <Card title={t('Create an account to join {name}', { name: preview.workspaceName })}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        {/* Named for password managers and autofill (WCAG 1.3.5, 3.3.8). */}
        <Field label={t('Email')}><Input type="email" autoComplete="username" required value={email} readOnly={!!preview.email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label={t('Name')}><Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('Password')} error={error ?? undefined}><Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <button className="ui-btn ui-btn--primary ui-btn--md w-full">{t('Create account and join')}</button>
      </form>
    </Card>
  )
}

/** Pure rendering of the states; `children` are the actions of the ready state. */
export function WorkspaceInviteView({ state, onRetry, children }: { state: WorkspaceInviteState; onRetry: () => void; children?: ReactNode }) {
  if (state.kind !== 'ready') {
    return <LinkStateCard state={state} onRetry={onRetry} frame={Card} checking={t('Checking your invite link…')}
      offline={t('Joining a workspace needs a connection to the server. The page will retry when the network returns.')}
      invalidTitle={t('This invite link is no longer valid')}
      invalid={t('It may have expired, been revoked or already been used. Ask the person who invited you for a new link.')}
      back={t('Back to my tasks')} />
  }
  const p = state.preview
  return (
    <Card title={t('Join {name}', { name: p.workspaceName })}>
      <div className="rounded-control bg-accent-soft p-3 text-body text-on-accent-soft" data-testid="workspace-invite-summary">
        <p>{t('{inviter} invited you to the workspace {name} as {role}.', { inviter: inviterName(p.inviterName), name: p.workspaceName, role: roleName(p.role) })}</p>
        {p.email && <p className="mt-1">{t('This link is for {email}.', { email: p.email })}</p>}
        <p className="mt-1 text-meta">{t('It expires {when} and works once.', { when: formatInstant(p.expiresAt, 'datetime') })}</p>
      </div>
      {children}
    </Card>
  )
}

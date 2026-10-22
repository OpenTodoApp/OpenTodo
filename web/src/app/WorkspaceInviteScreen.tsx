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
import type { AuthStatus, User } from '../lib/types'
import { workspaceApi, type WorkspaceInvitePreview } from '../lib/workspaceApi'
import { switchTo } from '../lib/workspaces'
import { BrandMark, BrandWordmark, Field, Input } from '../ui'
import { AuthScreen } from './AuthScreen'
import { rememberPendingInvite } from './ProjectInviteScreen'
import { navigate } from './router'

export type WorkspaceInviteState =
  | { kind: 'loading' } | { kind: 'offline' } | { kind: 'invalid' } | { kind: 'error'; message: string }
  | { kind: 'ready'; preview: WorkspaceInvitePreview }

function errorState(err: unknown): WorkspaceInviteState {
  if (isNetworkError(err)) return { kind: 'offline' }
  if (err instanceof ApiError && err.code === 'invitation_invalid') return { kind: 'invalid' }
  return { kind: 'error', message: err instanceof Error ? err.message : String(err) }
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
      else setJoinError(err instanceof Error ? err.message : String(err))
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
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <Card title={t('Create an account to join {name}', { name: preview.workspaceName })}>
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <Field label={t('Email')}><Input type="email" required value={email} readOnly={!!preview.email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label={t('Name')}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t('Password')} error={error ?? undefined}><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <button className="ui-btn ui-btn--primary ui-btn--md w-full">{t('Create account and join')}</button>
      </form>
    </Card>
  )
}

/** Pure rendering of the states; `children` are the actions of the ready state. */
export function WorkspaceInviteView({ state, onRetry, children }: { state: WorkspaceInviteState; onRetry: () => void; children?: ReactNode }) {
  switch (state.kind) {
    case 'loading':
      return <Card title={t('Checking your invite link…')}><p className="text-body text-muted">{t('One moment.')}</p></Card>
    case 'offline':
      return <Card title={t('You seem to be offline')}><p className="text-body text-muted">{t('Joining a workspace needs a connection to the server. The page will retry when the network returns.')}</p>
        <button className="ui-btn ui-btn--primary ui-btn--md" onClick={onRetry}>{t('Retry now')}</button></Card>
    case 'invalid':
      return <Card title={t('This invite link is no longer valid')}><p className="text-body text-muted">{t('It may have expired, been revoked or already been used. Ask the person who invited you for a new link.')}</p>
        <a className="ui-btn ui-btn--secondary ui-btn--md" href="/">{t('Back to my tasks')}</a></Card>
    case 'error':
      return <Card title={t('Something went wrong')}><p className="text-body text-danger">{state.message}</p>
        <button className="ui-btn ui-btn--primary ui-btn--md" onClick={onRetry}>{t('Retry')}</button></Card>
  }
  const p = state.preview
  return (
    <Card title={t('Join {name}', { name: p.workspaceName })}>
      <div className="rounded-control bg-accent-soft p-3 text-body text-on-accent-soft" data-testid="workspace-invite-summary">
        <p>{t('{inviter} invited you to the workspace {name} as {role}.', { inviter: p.inviterName, name: p.workspaceName, role: roleName(p.role) })}</p>
        {p.email && <p className="mt-1">{t('This link is for {email}.', { email: p.email })}</p>}
        <p className="mt-1 text-meta">{t('It expires {when} and works once.', { when: formatInstant(p.expiresAt, 'datetime') })}</p>
      </div>
      {children}
    </Card>
  )
}

function Card({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-4 sm:p-6">
      <main className="w-full max-w-sm space-y-3 rounded-card border border-default bg-surface p-5 shadow-1 sm:p-6">
        <div className="flex items-center gap-3"><BrandMark size={32} /><p className="text-h3 font-semibold"><BrandWordmark /></p></div>
        <h1 className="font-medium">{title}</h1>
        {children}
      </main>
    </div>
  )
}

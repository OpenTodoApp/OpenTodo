import { type FormEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import { hasAnyAction, isAdministrator, rowActions, type RowActions } from '../lib/roles'
import { MembersPanel } from './MembersPanel'
import type { AdminUser, User } from '../lib/types'

/** Dispatched after the viewer's own role changed (ownership transfer): the app re-reads its profile. */
export const ACCOUNT_CHANGED_EVENT = 'opentodo:account-changed'

export type UsersDialog =
  | { kind: 'delete'; user: AdminUser }
  | { kind: 'transfer'; user: AdminUser }
  | null

export interface UsersViewProps {
  viewer: User
  users: AdminUser[] | null
  /** No connection, or the server could not be reached. */
  offline: boolean
  busy: boolean
  error: string | null
  notice: string | null
  /** A reset link created in this session, shown once. */
  resetLink: { email: string; link: string; expiresAt: number } | null
  copied: boolean
  dialog: UsersDialog
  onDeactivate: (u: AdminUser) => void
  onReactivate: (u: AdminUser) => void
  onReset: (u: AdminUser) => void
  onRole: (u: AdminUser, role: 'admin' | 'member') => void
  onMfaReset: (u: AdminUser) => void
  onOpenDialog: (d: UsersDialog) => void
  onDelete: (u: AdminUser, confirmEmail: string) => void
  onTransfer: (u: AdminUser, password: string) => void
  onCopy: () => void
  onDismissLink: () => void
}

/**
 * Settings section for the owner and admins (OpenSpec `user-management`): the
 * accounts on this server with role, status, creation and last sign-in, and
 * only the actions the viewer may take on each row. The list is fetched live
 * and kept in component state; nothing about other accounts is stored on the
 * device, and every action is disabled offline.
 */
export function UsersPanel({ user }: { user: User }) {
  const online = useOnline()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resetLink, setResetLink] = useState<UsersViewProps['resetLink']>(null)
  const [copied, setCopied] = useState(false)
  const [dialog, setDialog] = useState<UsersDialog>(null)

  const load = useCallback(async () => {
    try {
      setUsers((await api.listUsers()).users)
      setUnreachable(false)
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      else setError(describeUserError(err))
    }
  }, [])

  useEffect(() => {
    if (online) void load()
    // Offline: drop the list rather than show stale account data.
    else setUsers(null)
  }, [online, load])

  async function run(action: () => Promise<unknown>, done: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(done)
      await load()
      return true
    } catch (err) {
      setError(describeUserError(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  const name = (u: AdminUser) => u.name || u.email

  return (
    <UsersView
      viewer={user}
      users={online ? users : null}
      offline={!online || unreachable}
      busy={busy}
      error={error}
      notice={notice}
      resetLink={resetLink}
      copied={copied}
      dialog={dialog}
      onDeactivate={(u) => {
        if (!window.confirm(`Deactivate ${name(u)}? They are signed out everywhere, their API tokens and pending invitations are revoked, and they cannot sign in until reactivated. Their data is kept.`)) return
        void run(() => api.deactivateUser(u.id), `${name(u)} is deactivated.`)
      }}
      onReactivate={(u) => {
        if (!window.confirm(`Reactivate ${name(u)}? They can sign in again with their existing password. Revoked tokens are not restored.`)) return
        void run(() => api.reactivateUser(u.id), `${name(u)} can sign in again.`)
      }}
      onReset={(u) => {
        if (!window.confirm(`Create a password reset link for ${name(u)}? It works once and expires in 24 hours; any earlier link stops working.`)) return
        void run(async () => {
          const res = await api.issuePasswordReset(u.id)
          setCopied(false)
          setResetLink({ email: u.email, link: res.link, expiresAt: res.expiresAt })
        }, `Reset link created for ${name(u)}.`)
      }}
      onRole={(u, role) => {
        if (!window.confirm(role === 'admin' ? `Make ${name(u)} an admin? Admins can invite people and manage members.` : `Make ${name(u)} a member again?`)) return
        void run(() => api.setUserRole(u.id, role), `${name(u)} is now ${role === 'admin' ? 'an admin' : 'a member'}.`)
      }}
      onMfaReset={(u) => {
        if (!window.confirm(`Reset two-factor authentication for ${name(u)}? Their authenticator, recovery codes and remembered browsers stop working; they sign in with their password alone.`)) return
        void run(() => api.resetMemberMfa(u.id), `Two-factor authentication reset for ${name(u)}.`)
      }}
      onOpenDialog={setDialog}
      onDelete={(u, confirmEmail) => {
        void run(() => api.deleteUser(u.id, confirmEmail), `${u.email} and their data were deleted.`).then((ok) => ok && setDialog(null))
      }}
      onTransfer={(u, password) => {
        void run(() => api.transferOwnership(u.id, password), `${name(u)} is now the owner. You are an admin.`).then((ok) => {
          if (!ok) return
          setDialog(null)
          window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
        })
      }}
      onCopy={() => {
        if (!resetLink) return
        navigator.clipboard.writeText(resetLink.link).then(() => setCopied(true), () => setError('Could not access the clipboard; select the link and copy it manually.'))
      }}
      onDismissLink={() => setResetLink(null)}
    />
  )
}

/** The Users and Members sections, shown to the owner and admins only. */
export function AdministrationSections({ user }: { user: User }) {
  if (!isAdministrator(user)) return null
  return (
    <>
      <UsersPanel user={user} />
      <MembersPanel />
    </>
  )
}

const STATUS_BADGE: Record<AdminUser['status'], string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  deactivated: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
}

/** Pure rendering of the Users section; free of effects so tests can render it to markup. */
export function UsersView(p: UsersViewProps) {
  const disabled = p.offline || p.busy
  const isOwner = p.viewer.role === 'owner'

  function onRowKey(e: KeyboardEvent<HTMLLIElement>, u: AdminUser, a: RowActions) {
    if (e.target !== e.currentTarget || disabled) return
    if (e.key === 'd' && (a.deactivate || a.reactivate)) {
      e.preventDefault()
      if (a.deactivate) p.onDeactivate(u)
      else p.onReactivate(u)
    } else if (e.key === 'r' && a.reset) {
      e.preventDefault()
      p.onReset(u)
    } else if (e.key === 'Delete' && a.remove) {
      e.preventDefault()
      p.onOpenDialog({ kind: 'delete', user: u })
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="users-heading">
      <h2 id="users-heading" className="font-semibold">Users</h2>
      <p className="text-sm text-slate-500">
        Everyone with an account on this server. {isOwner
          ? 'You can manage every account and choose admins; admins manage members.'
          : 'As an admin you can deactivate, reset and delete members.'}
      </p>
      {p.offline && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200" role="status">
          You are offline. User administration needs a connection to the server; nothing about other accounts is kept on this device.
        </p>
      )}
      {p.resetLink && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950" role="status">
          <p className="mb-1 font-medium">Reset link for {p.resetLink.email}. Copy it now: it will not be shown again.</p>
          <p className="mb-1 text-xs text-slate-600 dark:text-slate-300">
            Deliver it yourself; nothing is emailed. It works once until {new Date(p.resetLink.expiresAt).toLocaleString()}.
            API tokens keep working after a reset; deactivate the account instead if it may be compromised.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all" tabIndex={0}>{p.resetLink.link}</code>
            <button type="button" className="btn-ghost border border-emerald-300 text-xs dark:border-emerald-700" onClick={p.onCopy}>{p.copied ? 'Copied' : 'Copy link'}</button>
            <button type="button" className="btn-ghost text-xs" onClick={p.onDismissLink}>Done</button>
          </div>
        </div>
      )}
      {p.notice && <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">{p.notice}</p>}
      {p.error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{p.error}</p>}

      <ul className="divide-y divide-slate-200 dark:divide-slate-800" aria-label="Users">
        {p.users?.map((u) => {
          const a = rowActions(p.viewer, u)
          return (
            <li
              key={u.id}
              tabIndex={0}
              onKeyDown={(e) => onRowKey(e, u, a)}
              aria-label={`${u.name || u.email}, ${u.role}, ${u.status}`}
              data-user={u.email}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{u.name || u.email}</span>
                {u.name && <span className="text-slate-500"> · {u.email}</span>}
                {u.id === p.viewer.id && <span className="text-slate-400"> (you)</span>}
                <span className="block text-xs text-slate-400">
                  joined {new Date(u.createdAt).toLocaleDateString()} · {u.lastLoginAt ? `last sign-in ${new Date(u.lastLoginAt).toLocaleString()}` : 'no sign-in since the upgrade'}
                </span>
              </span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">{u.role}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[u.status]}`}>{u.status}</span>
              {hasAnyAction(a) && (
                <span className="flex flex-wrap gap-1">
                  {a.role && <button type="button" className="btn-ghost text-xs" disabled={disabled} onClick={() => p.onRole(u, a.role!)}>{a.role === 'admin' ? 'Make admin' : 'Make member'}</button>}
                  {a.deactivate && <button type="button" className="btn-ghost text-xs" disabled={disabled} onClick={() => p.onDeactivate(u)}>Deactivate</button>}
                  {a.reactivate && <button type="button" className="btn-ghost text-xs" disabled={disabled} onClick={() => p.onReactivate(u)}>Reactivate</button>}
                  {a.reset && <button type="button" className="btn-ghost text-xs" disabled={disabled} onClick={() => p.onReset(u)}>Reset password</button>}
                  {a.mfaReset && <button type="button" className="btn-ghost text-xs" disabled={disabled} onClick={() => p.onMfaReset(u)}>Reset 2FA</button>}
                  {a.transfer && <button type="button" className="btn-ghost text-xs" disabled={disabled} onClick={() => p.onOpenDialog({ kind: 'transfer', user: u })}>Transfer ownership</button>}
                  {a.remove && <button type="button" className="btn-danger text-xs" disabled={disabled} onClick={() => p.onOpenDialog({ kind: 'delete', user: u })}>Delete</button>}
                </span>
              )}
            </li>
          )
        })}
        {p.users && p.users.length === 0 && <li className="py-2 text-sm text-slate-400">No accounts.</li>}
        {p.users === null && !p.offline && <li className="py-2 text-sm text-slate-400">Loading…</li>}
      </ul>
      <p className="text-xs text-slate-400">
        Keyboard: focus a row, <span className="kbd">d</span> deactivates or reactivates, <span className="kbd">r</span> creates a reset link, <span className="kbd">Delete</span> deletes; each asks for confirmation.
      </p>

      {p.dialog?.kind === 'delete' && (
        <DeleteDialog user={p.dialog.user} busy={p.busy} offline={p.offline} onCancel={() => p.onOpenDialog(null)} onConfirm={p.onDelete} />
      )}
      {p.dialog?.kind === 'transfer' && (
        <TransferDialog user={p.dialog.user} busy={p.busy} offline={p.offline} onCancel={() => p.onOpenDialog(null)} onConfirm={p.onTransfer} />
      )}
    </section>
  )
}

function Dialog({ title, children, onCancel }: { title: string; children: ReactNode; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}

export function DeleteDialog({ user, busy, offline, onCancel, onConfirm }: {
  user: AdminUser; busy: boolean; offline: boolean; onCancel: () => void; onConfirm: (u: AdminUser, email: string) => void
}) {
  const [typed, setTyped] = useState('')
  const matches = typed.trim().toLowerCase() === user.email.toLowerCase()
  function submit(e: FormEvent) {
    e.preventDefault()
    if (matches) onConfirm(user, typed.trim())
  }
  return (
    <Dialog title={`Delete ${user.email}?`} onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This permanently deletes the account and all of its data on the server: tasks, projects (including projects it shared with others), sessions and tokens.
          It cannot be undone; only a backup can bring it back. Copies on their own devices are not wiped.
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">Type <strong>{user.email}</strong> to confirm</span>
          <input className="input" autoFocus autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Email to confirm deletion" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-danger" disabled={!matches || busy || offline}>Delete account</button>
        </div>
      </form>
    </Dialog>
  )
}

export function TransferDialog({ user, busy, offline, onCancel, onConfirm }: {
  user: AdminUser; busy: boolean; offline: boolean; onCancel: () => void; onConfirm: (u: AdminUser, password: string) => void
}) {
  const [password, setPassword] = useState('')
  function submit(e: FormEvent) {
    e.preventDefault()
    if (password) onConfirm(user, password)
  }
  return (
    <Dialog title={`Transfer ownership to ${user.name || user.email}?`} onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {user.email} becomes the owner of this server with every right, including transferring it back. You become an admin. There is always exactly one owner.
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">Your password</span>
          <input className="input" type="password" autoFocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Your password" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-primary" disabled={!password || busy || offline}>Transfer ownership</button>
        </div>
      </form>
    </Dialog>
  )
}

export function describeUserError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'The server is unreachable. User administration needs a connection.'
  switch (err.code) {
    case 'forbidden':
      return 'Your role does not allow this action.'
    case 'self_action':
      return 'You cannot do this to your own account.'
    case 'account_deactivated':
      return 'This account is deactivated. Reactivate it first.'
    case 'account_active':
      return 'This account is already active.'
    case 'confirmation_mismatch':
      return 'The email you typed does not match the account.'
    case 'invalid_credentials':
      return 'Your password is not correct.'
    case 'rate_limited':
      return 'Too many administrative actions recently. Try again later.'
    case 'not_found':
      return 'This account no longer exists.'
    default:
      return err.message
  }
}

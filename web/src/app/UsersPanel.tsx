import { type FormEvent, type KeyboardEvent, type ReactNode, useCallback, useEffect, useState } from 'react'
import { Skeleton } from '../ui'
import { Kbd } from './shortcuts/Kbd'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import { useOutgoingEmail } from '../lib/outgoingEmail'
import { hasAnyAction, isAdministrator, rowActions, type RowActions } from '../lib/roles'
import { MembersPanel } from './MembersPanel'
import type { AdminUser, User } from '../lib/types'
import { Dialog as OverlayDialog } from './overlay'
import { Menu } from './overlay/Menu'
import { Avatar } from '../ui'
import { Badge } from '../ui'
import { Button } from '../ui'
import { Field, Input } from '../ui'
import { Icon } from '../ui'
import { MenuGroup, MenuItem, MenuSeparator } from '../ui'
import { ConfirmDialog } from '../ui'
import { EmptyState } from '../ui'
import { ListRow } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import type { HueName } from '../ui'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t } from '../lib/i18n'
import { ACCOUNT_ROLE_LABEL } from '../lib/roleNames'

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
  const [confirming, setConfirming] = useState<PendingAction>(null)
  // With outgoing email, a reset offers mailing the link instead of handling it (outgoing-email D6).
  const mail = useOutgoingEmail()
  const [choosing, setChoosing] = useState<AdminUser | null>(null)
  const createLink = (u: AdminUser) => run(async () => {
    const res = await api.issuePasswordReset(u.id)
    setCopied(false)
    setResetLink({ email: u.email, link: res.link, expiresAt: res.expiresAt })
  }, t('Reset link created for {name}.', { name: name(u) }))
  async function sendReset(u: AdminUser) {
    const ok = await run(async () => { await api.sendPasswordReset(u.id) }, t('A reset email was sent to {email}.', { email: u.email }))
    setChoosing(null)
    // A failed send leaves no link behind: offer the link to deliver yourself instead.
    if (!ok) setConfirming({ kind: 'reset', user: u })
  }

  return (
    <>
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
        onDeactivate={(u) => setConfirming({ kind: 'deactivate', user: u })}
        onReactivate={(u) => setConfirming({ kind: 'reactivate', user: u })}
        onReset={(u) => (mail ? setChoosing(u) : setConfirming({ kind: 'reset', user: u }))}
        onRole={(u, role) => setConfirming({ kind: 'role', user: u, role })}
        onMfaReset={(u) => setConfirming({ kind: 'mfa', user: u })}
        onOpenDialog={setDialog}
        onDelete={(u, confirmEmail) => {
          void run(() => api.deleteUser(u.id, confirmEmail), t('{email} and their data were deleted.', { email: u.email })).then((ok) => ok && setDialog(null))
        }}
        onTransfer={(u, password) => {
          void run(() => api.transferOwnership(u.id, password), t('{name} is now the owner. You are an admin.', { name: name(u) })).then((ok) => {
            if (!ok) return
            setDialog(null)
            window.dispatchEvent(new Event(ACCOUNT_CHANGED_EVENT))
          })
        }}
        onCopy={() => {
          if (!resetLink) return
          navigator.clipboard.writeText(resetLink.link).then(() => setCopied(true), () => setError(t('Could not access the clipboard; select the link and copy it manually.')))
        }}
        onDismissLink={() => setResetLink(null)}
      />
      {choosing && (
        <OverlayDialog title={t('Reset the password of {name}?', { name: name(choosing) })} onClose={() => setChoosing(null)} size="sm">
          <div className="space-y-4" data-reset-choice>
            <p className="text-meta text-muted">
              {t.rich('Send a reset link to <strong>{email}</strong>, or create one to deliver yourself. It works once and expires in 24 hours; any earlier link stops working.', { email: choosing.email, strong: (chunks) => <strong className="text-default">{chunks}</strong> })}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={() => setChoosing(null)}>{t('Cancel')}</Button>
              <Button variant="secondary" disabled={busy} onClick={() => { const u = choosing; setChoosing(null); void createLink(u) }}>{t('Create reset link')}</Button>
              <Button variant="primary" busy={busy} onClick={() => sendReset(choosing)}>{t('Send reset email')}</Button>
            </div>
          </div>
        </OverlayDialog>
      )}
      {confirming && (
        <ConfirmDialog {...confirmCopy(confirming, name(confirming.user))}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const { user: u } = confirming
            switch (confirming.kind) {
              case 'deactivate': return run(() => api.deactivateUser(u.id), t('{name} is deactivated.', { name: name(u) }))
              case 'reactivate': return run(() => api.reactivateUser(u.id), t('{name} can sign in again.', { name: name(u) }))
              case 'reset': return createLink(u)
              case 'role': return run(() => api.setUserRole(u.id, confirming.role), confirming.role === 'admin' ? t('{name} is now an admin.', { name: name(u) }) : t('{name} is now a member.', { name: name(u) }))
              case 'mfa': return run(() => api.resetMemberMfa(u.id), t('Two-factor authentication reset for {name}.', { name: name(u) }))
            }
          }} />
      )}
    </>
  )
}

/** An account action waiting for confirmation in the dialog. */
export type PendingAction =
  | { kind: 'deactivate' | 'reactivate' | 'reset' | 'mfa'; user: AdminUser }
  | { kind: 'role'; user: AdminUser; role: 'admin' | 'member' }
  | null

/** Title, consequence and button of each confirmation, naming what changes. */
export function confirmCopy(a: NonNullable<PendingAction>, name: string): { title: string; consequence: string; confirmLabel: string; tone: 'danger' | 'default' } {
  switch (a.kind) {
    case 'deactivate':
      return { title: t('Deactivate {name}?', { name }), tone: 'danger', confirmLabel: t('Deactivate'),
        consequence: t('They are signed out everywhere, their API tokens and pending invitations are revoked, and they cannot sign in until reactivated. Their data is kept.') }
    case 'reactivate':
      return { title: t('Reactivate {name}?', { name }), tone: 'default', confirmLabel: t('Reactivate'),
        consequence: t('They can sign in again with their existing password. Revoked tokens are not restored.') }
    case 'reset':
      return { title: t('Create a password reset link for {name}?', { name }), tone: 'default', confirmLabel: t('Create link'),
        consequence: t('It works once and expires in 24 hours; any earlier link stops working. You deliver it yourself; nothing is emailed.') }
    case 'role':
      return a.role === 'admin'
        ? { title: t('Make {name} an admin?', { name }), tone: 'default', confirmLabel: t('Make admin'), consequence: t('Admins can invite people and manage members.') }
        : { title: t('Make {name} a member again?', { name }), tone: 'default', confirmLabel: t('Make member'), consequence: t('They can no longer invite people or manage members.') }
    case 'mfa':
      return { title: t('Reset two-factor authentication for {name}?', { name }), tone: 'danger', confirmLabel: t('Reset two-factor'),
        consequence: t('Their authenticator, recovery codes and remembered browsers stop working; they sign in with their password alone.') }
  }
}

/** The Users and Members sections for the owner and admins (Settings → People). */
export function AdministrationSections({ user }: { user: User }) {
  if (!isAdministrator(user)) return null
  return (
    <>
      <UsersPanel user={user} />
      <MembersPanel />
    </>
  )
}

const ROLE_HUE: Record<AdminUser['role'], HueName> = { owner: 'green', admin: 'indigo', member: 'slate' }

/** Pure rendering of the Users section; free of effects so tests can render it to markup. */
export function UsersView(p: UsersViewProps) {
  const dt = useDateTimeFormat()
  const disabled = p.offline || p.busy
  const isOwner = p.viewer.role === 'owner'
  const deactivated = p.users?.filter((u) => u.status === 'deactivated').length ?? 0
  const admins = p.users?.filter((u) => u.role === 'admin').length ?? 0

  function onRowKey(e: KeyboardEvent<HTMLElement>, u: AdminUser, a: RowActions) {
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
    <SettingsSection title={t('Users')} headingId="users-heading"
      description={isOwner
        ? t('Everyone with an account on this server. You can manage every account and choose admins; admins manage members.')
        : t('Everyone with an account on this server. As an admin you can deactivate, reset and delete members.')}>
      {p.offline && <Notice>{t('You are offline. User administration needs a connection to the server; nothing about other accounts is kept on this device.')}</Notice>}
      {p.users && (
        <SettingRow label={t('Accounts')} status={
          <span data-testid="users-summary">
            {[
              t('{n, plural, one {# account} other {# accounts}}', { n: p.users.length }),
              admins > 0 ? t('{n, plural, one {# admin} other {# admins}}', { n: admins }) : '',
              deactivated > 0 ? t('{n} deactivated', { n: deactivated }) : '',
            ].filter(Boolean).join(' · ')}
          </span>
        } />
      )}
      {p.resetLink && (
        <div className="py-3">
          <Notice tone="success" action={(
            <span className="flex gap-1">
              <Button size="sm" variant="secondary" icon="copy" onClick={p.onCopy}>{p.copied ? t('Copied') : t('Copy link')}</Button>
              <Button size="sm" variant="ghost" onClick={p.onDismissLink}>{t('Done')}</Button>
            </span>
          )}>
            <p className="font-medium">{t('Reset link for {email}. Copy it now: it will not be shown again.', { email: p.resetLink.email })}</p>
            <code className="block break-all py-1" tabIndex={0}>{p.resetLink.link}</code>
            <p>
              {t('Deliver it yourself; nothing is emailed. It works once until {instant}. API tokens keep working after a reset; deactivate the account instead if it may be compromised.', { instant: dt.formatInstant(p.resetLink.expiresAt, 'datetime') })}
            </p>
          </Notice>
        </div>
      )}
      {p.notice && <Notice tone="success">{p.notice}</Notice>}
      {p.error && <Notice tone="danger">{p.error}</Notice>}

      <ul className="-mx-3 py-2" aria-label={t('Users')}>
        {p.users?.map((u) => {
          const a = rowActions(p.viewer, u)
          const label = u.name || u.email
          return (
            <li key={u.id} data-user={u.email}>
              <ListRow
                leading={<Avatar id={u.id} name={label} size="md" />}
                label={<>{label}{u.id === p.viewer.id && <span className="text-faint">{' '}{t('(you)')}</span>}</>}
                ariaLabel={`${label}, ${ACCOUNT_ROLE_LABEL[u.role]}, ${u.status === 'active' ? t('active') : t('deactivated')}`}
                meta={[u.name ? u.email : '', t('joined {date}', { date: dt.formatInstant(u.createdAt, 'date') }), u.lastLoginAt ? t('last sign-in {instant}', { instant: dt.formatInstant(u.lastLoginAt, 'datetime') }) : t('no sign-in since the upgrade')].filter(Boolean).join(' · ')}
                badges={(
                  <>
                    <Badge hue={ROLE_HUE[u.role]}>{ACCOUNT_ROLE_LABEL[u.role]}</Badge>
                    <Badge hue={u.status === 'active' ? 'green' : 'red'} tone="solid">{u.status === 'active' ? t('Active') : t('Deactivated')}</Badge>
                  </>
                )}
                onKeyDown={(e) => onRowKey(e, u, a)}
                menu={hasAnyAction(a) && (
                  <Menu label={t('Actions for {label}', { label })} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
                    <MenuGroup>
                      {a.role && <MenuItem label={a.role === 'admin' ? t('Make admin') : t('Make member')} icon="shield-check" disabled={disabled} onSelect={() => p.onRole(u, a.role!)} />}
                      {a.deactivate && <MenuItem label={t('Deactivate')} icon="lock" shortcut="D" disabled={disabled} onSelect={() => p.onDeactivate(u)} />}
                      {a.reactivate && <MenuItem label={t('Reactivate')} icon="rotate-ccw" shortcut="D" disabled={disabled} onSelect={() => p.onReactivate(u)} />}
                      {a.reset && <MenuItem label={t('Reset password')} icon="key-round" shortcut="R" disabled={disabled} onSelect={() => p.onReset(u)} />}
                      {a.mfaReset && <MenuItem label={t('Reset two-factor authentication')} icon="shield-check" disabled={disabled} onSelect={() => p.onMfaReset(u)} />}
                      {a.transfer && <MenuItem label={t('Transfer ownership')} icon="users" disabled={disabled} onSelect={() => p.onOpenDialog({ kind: 'transfer', user: u })} />}
                    </MenuGroup>
                    {a.remove && (
                      <>
                        <MenuSeparator />
                        <MenuItem label={t('Delete account')} icon="trash-2" shortcut="Del" danger disabled={disabled} onSelect={() => p.onOpenDialog({ kind: 'delete', user: u })} />
                      </>
                    )}
                  </Menu>
                )}
              />
            </li>
          )
        })}
      </ul>
      {p.users && p.users.length === 0 && <EmptyState icon="users" title={t('No accounts')} body={t('Invite someone below to give them an account on this server.')} />}
      {p.users === null && !p.offline && <Skeleton shape="row" count={3} label={t('Loading users')} />}
      <p className="pt-2 text-meta text-faint">
        {t.rich('Keyboard, with a row focused: deactivate or reactivate with {kbd}, create a reset link with {kbd2}, delete with {kbd3}; each asks for confirmation.', { kbd: <Kbd k="d" />, kbd2: <Kbd k="r" />, kbd3: <Kbd k="Delete" /> })}
      </p>

      {p.dialog?.kind === 'delete' && (
        <DeleteDialog user={p.dialog.user} busy={p.busy} offline={p.offline} onCancel={() => p.onOpenDialog(null)} onConfirm={p.onDelete} />
      )}
      {p.dialog?.kind === 'transfer' && (
        <TransferDialog user={p.dialog.user} busy={p.busy} offline={p.offline} onCancel={() => p.onOpenDialog(null)} onConfirm={p.onTransfer} />
      )}
    </SettingsSection>
  )
}

/** Destructive confirmations: a tap outside does not close them (Escape and Close do). */
function Dialog({ title, children, onCancel }: { title: string; children: ReactNode; onCancel: () => void }) {
  return <OverlayDialog title={title} onClose={onCancel} size="md" dismissable={false} role="alertdialog">{children}</OverlayDialog>
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
    <Dialog title={t('Delete {email}?', { email: user.email })} onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-body text-default">
          {t('This permanently deletes the account and all of its data on the server: tasks, projects (including projects it shared with others), sessions and tokens. It cannot be undone; only a backup can bring it back. Copies on their own devices are not wiped.')}
        </p>
        <Field label={<>{t.rich('Type <strong>{email}</strong> to confirm', { email: user.email, strong: (chunks) => <strong>{chunks}</strong> })}</>}>
          <Input data-autofocus autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label={t('Email to confirm deletion')} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{t('Cancel')}</Button>
          <Button type="submit" variant="danger" className="border border-current" disabled={!matches || busy || offline}>{t('Delete account')}</Button>
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
    <Dialog title={t('Transfer ownership to {name}?', { name: user.name || user.email })} onCancel={onCancel}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-body text-default">
          {t('{email} becomes the owner of this server with every right, including transferring it back. You become an admin. There is always exactly one owner.', { email: user.email })}
        </p>
        <Field label={t('Your password')}>
          <Input type="password" data-autofocus autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{t('Cancel')}</Button>
          <Button type="submit" variant="primary" disabled={!password || busy || offline}>{t('Transfer ownership')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

export function describeUserError(err: unknown): string {
  if (!(err instanceof ApiError)) return t('The server is unreachable. User administration needs a connection.')
  switch (err.code) {
    case 'forbidden':
      return t('Your role does not allow this action.')
    case 'self_action':
      return t('You cannot do this to your own account.')
    case 'account_deactivated':
      return t('This account is deactivated. Reactivate it first.')
    case 'account_active':
      return t('This account is already active.')
    case 'confirmation_mismatch':
      return t('The email you typed does not match the account.')
    case 'invalid_credentials':
      return t('Your password is not correct.')
    case 'rate_limited':
      return t('Too many administrative actions recently. Try again later.')
    case 'not_found':
      return t('This account no longer exists.')
    default:
      return err.message
  }
}

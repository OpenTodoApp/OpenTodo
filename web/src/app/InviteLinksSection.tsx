import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { ConfirmDialog, Select } from '../ui'
import { Tooltip } from '../ui'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import { useOutgoingEmail } from '../lib/outgoingEmail'
import { grantableRoles } from '../lib/sharing'
import type { ProjectInvite, ProjectRole } from '../lib/types'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { formatInstant } from '../lib/dates'
import { t } from '../lib/i18n'
import { roleName } from '../lib/roleNames'

// "Invite with a link" in the share dialog (OpenSpec `project-invite-links`):
// the project's owner and admins create single-use links that add whoever
// opens them with a role, and revoke pending ones. Links live on the server
// only, so every action needs a connection. InviteLinksView renders every
// state and is free of effects so tests can render it to markup.

export const LINK_EXPIRY_OPTIONS: [number, string][] = [
  [1, '1 hour'],
  [24, '1 day'],
  [72, '3 days'],
  [168, '7 days'],
  [336, '14 days'],
  [720, '30 days'],
]

/** The link just created: shown once, with whether it can create accounts. */
export interface CreatedLink {
  link: string
  newAccounts: boolean
  /** The address the link was mailed to (outgoing-email). */
  sentTo?: string
}

export interface InviteLinksViewProps {
  /** Roles the viewer may put on a link (viewer and editor; admin for the project owner). */
  roles: ProjectRole[]
  open: boolean
  role: ProjectRole
  email: string
  hours: number
  /** The server sends email: offer "Send by email" when an address is typed (outgoing-email). */
  mail?: boolean
  send?: boolean
  onSend?: (send: boolean) => void
  invites: ProjectInvite[] | null
  created: CreatedLink | null
  copied: boolean
  offline: boolean
  busy: boolean
  error: string | null
  onToggle: () => void
  onRole: (role: ProjectRole) => void
  onEmail: (email: string) => void
  onHours: (hours: number) => void
  onCreate: () => void
  onCopy: () => void
  onRevoke: (invite: ProjectInvite) => void
}

const when = (ms: number) => formatInstant(ms, 'datetime')

export function InviteLinksView(p: InviteLinksViewProps) {
  useDateTimeFormat()
  const disabled = p.offline || p.busy
  function submit(e: FormEvent) {
    e.preventDefault()
    if (!disabled) p.onCreate()
  }
  return (
    <section aria-labelledby="invite-links-heading" className="mb-4 rounded-control border border-default p-3" data-testid="invite-links">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="invite-links-heading" className="text-body font-medium">{t('Invite with a link')}</h3>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" aria-expanded={p.open} aria-controls="invite-links-form" onClick={p.onToggle}>
          {p.open ? t('Hide') : t('Create a link…')}
        </button>
      </div>
      <p className="mt-1 text-meta text-muted">{t('One link for one person: whoever opens it joins this project with the role you pick. It works once.')}</p>
      {p.offline && (
        <p role="status" className="mt-2 rounded-control bg-warning-soft p-2 text-meta text-on-warning-soft">
          {t('You are offline. Invite links live on the server, so creating and revoking them needs a connection.')}
        </p>
      )}
      {p.open && (
        <form id="invite-links-form" onSubmit={submit} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label className="col-span-2 block text-meta sm:col-span-1">
            <span className="mb-1 block text-muted">{t.rich('Email <span>(optional, only they can use it)</span>', { span: (chunks) => <span className="text-faint">{chunks}</span> })}</span>
            <input className="ui-input" type="email" autoComplete="off" placeholder={t('friend@example.com')} value={p.email}
              onChange={(e) => p.onEmail(e.target.value)} disabled={disabled} />
          </label>
          <label className="block text-meta">
            <span className="mb-1 block text-muted">{t('Role')}</span>
            <Select value={p.role} onChange={(e) => p.onRole(e.target.value as ProjectRole)} disabled={disabled}>
              {p.roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </label>
          <label className="block text-meta">
            <span className="mb-1 block text-muted">{t('Expires in')}</span>
            <Select value={p.hours} onChange={(e) => p.onHours(Number(e.target.value))} disabled={disabled}>
              {LINK_EXPIRY_OPTIONS.map(([h, label]) => <option key={h} value={h}>{label}</option>)}
            </Select>
          </label>
          {p.mail && p.email.trim() !== '' && (
            <label className="col-span-2 flex items-center gap-2 text-meta sm:col-span-3">
              <input type="checkbox" checked={p.send ?? true} onChange={(e) => p.onSend?.(e.target.checked)} disabled={disabled} data-send-by-email />
              {t('Send by email')}
            </label>
          )}
          <button className="ui-btn ui-btn--primary ui-btn--md col-span-2 sm:col-span-3 sm:justify-self-start" disabled={disabled}>{p.busy ? t('Creating…') : t('Create link')}</button>
        </form>
      )}
      {p.created && (
        <div role="status" className="mt-2 rounded-control border border-success/40 bg-success-soft p-2 text-meta" data-testid="invite-link-created">
          {p.created.sentTo && <p className="mb-1 font-medium" data-invite-sent>{t('The link was sent to {sentTo}.', { sentTo: p.created.sentTo })}</p>}
          <p className="mb-1 font-medium">{t('Copy this link now. It is shown only once.')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input className="ui-input min-w-0 flex-1 font-mono text-meta" readOnly value={p.created.link} aria-label={t('Invite link')}
              onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm border border-success/40 text-meta" onClick={p.onCopy}>
              {p.copied ? t('Copied') : t('Copy link')}
            </button>
          </div>
          <p className="mt-1 text-muted">
            {p.created.newAccounts
              ? t('People without an account can create one with this link.')
              : t('Only people who already have an account on this server can use it. The server owner can let members invite new people in Settings → People.')}
          </p>
        </div>
      )}
      {p.error && <p role="alert" className="mt-2 text-meta text-danger">{p.error}</p>}
      {p.invites && p.invites.length > 0 && (
        <ul aria-label={t('Pending invite links')} className="mt-2 space-y-1">
          {p.invites.map((inv) => (
            <li key={inv.id} className="text-meta">
              <div className="flex items-center gap-2">
                <span className="rounded-control bg-warning-soft px-1.5 py-0.5 font-medium text-on-warning-soft">{roleName(inv.role)}</span>
                {inv.email
                  ? <Tooltip label={inv.email}><span className="min-w-0 flex-1 truncate">{inv.email}</span></Tooltip>
                  : <span className="min-w-0 flex-1 truncate"><span className="text-faint">{t('Anyone with the link')}</span></span>}
                <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" disabled={disabled}
                  aria-label={(inv.email ? t('Revoke the {role} link for {email}', { role: roleName(inv.role), email: inv.email }) : t('Revoke the {role} link', { role: roleName(inv.role) }))} onClick={() => p.onRevoke(inv)}>{t('Revoke')}</button>
              </div>
              <p className="text-faint">{t('Expires {when} · created by {name}', { when: when(inv.expiresAt), name: inv.createdByName || t('a member') })}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The section with its state; rendered only for the project's owner and admins. */
export function InviteLinksSection({ projectId, myRole, onError }: { projectId: string; myRole: ProjectRole; onError?: (message: string) => void }) {
  const online = useOnline()
  const roles = grantableRoles(myRole)
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<ProjectRole>('editor')
  const [email, setEmail] = useState('')
  const [hours, setHours] = useState(168)
  const mail = useOutgoingEmail()
  const [send, setSend] = useState(true)
  const [invites, setInvites] = useState<ProjectInvite[] | null>(null)
  const [created, setCreated] = useState<CreatedLink | null>(null)
  const [copied, setCopied] = useState(false)
  const [unreachable, setUnreachable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<ProjectInvite | null>(null)

  const load = useCallback(async () => {
    try {
      setInvites((await api.listProjectInvites(projectId)).invites)
      setUnreachable(false)
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      // Not shared yet or no longer a manager: the section simply lists nothing.
      else setInvites([])
    }
  }, [projectId])

  useEffect(() => {
    if (online) void load()
  }, [online, load])

  async function create() {
    setError(null)
    setBusy(true)
    try {
      const to = email.trim()
      const res = await api.createProjectInvite(projectId, { role, expiresInHours: hours, ...(to ? { email: to } : {}), ...(to && mail && send ? { send: true } : {}) })
      setCreated({ link: res.link, newAccounts: res.newAccounts, ...(res.sent ? { sentTo: to } : {}) })
      setCopied(false)
      setEmail('')
      await load()
    } catch (err) {
      setError(describeLinkError(err))
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.link)
      setCopied(true)
    } catch {
      setError(t('Could not access the clipboard; select the link and copy it manually.'))
    }
  }

  async function revoke(inv: ProjectInvite) {
    setError(null)
    try {
      await api.revokeProjectInvite(projectId, inv.id)
      await load()
    } catch (err) {
      const msg = describeLinkError(err)
      setError(msg)
      onError?.(msg)
    }
  }

  return (
    <>
    <InviteLinksView
      roles={roles} open={open} role={role} email={email} hours={hours} mail={mail} send={send} onSend={setSend} invites={invites} created={created} copied={copied}
      offline={!online || unreachable} busy={busy} error={error}
      onToggle={() => setOpen((o) => !o)} onRole={setRole} onEmail={setEmail} onHours={setHours}
      onCreate={() => void create()} onCopy={() => void copy()} onRevoke={setRevoking}
    />
    {revoking && (
      <ConfirmDialog title={t('Revoke this invite link?')} confirmLabel={t('Revoke')}
        consequence={revoking.email ? t('The {role} link for {email} will stop working.', { role: roleName(revoking.role), email: revoking.email }) : t('The {role} link will stop working.', { role: roleName(revoking.role) })}
        onConfirm={() => revoke(revoking)} onCancel={() => setRevoking(null)} />
    )}
    </>
  )
}

export function describeLinkError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'rate_limited') return t('Too many links created recently. Try again later.')
    if (err.code === 'invitation_spent') return t('This link was already used and cannot be revoked.')
    if (err.code === 'reauth_required') return t('Confirm your password, then create the link again.')
    if (err.code === 'email_failed') return t('The email could not be sent, so no link was created ({reason}). Turn off “Send by email” to create a link to share yourself.', { reason: err.message })
    if (err.code === 'smtp_disabled') return t('This server no longer sends email. Turn off “Send by email” to create a link to share yourself.')
    return err.message
  }
  return t('The server could not be reached; invite links need a connection.')
}

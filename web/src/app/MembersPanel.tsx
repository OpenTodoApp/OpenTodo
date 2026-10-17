import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useState } from 'react'
import { Skeleton, Dialog, Menu } from '../ui'
import { Kbd } from './shortcuts/Kbd'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import { useOutgoingEmail } from '../lib/outgoingEmail'
import type { Invitation, InvitationStatus } from '../lib/types'
import { Badge } from '../ui'
import { Button } from '../ui'
import { Field, Input, Select } from '../ui'
import { Icon } from '../ui'
import { MenuItem, MenuSeparator } from '../ui'
import { ConfirmDialog } from '../ui'
import { EmptyState } from '../ui'
import { ListRow } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import type { HueName } from '../ui'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t } from '../lib/i18n'

const EXPIRY_OPTIONS: [number, string][] = [
  [1, '1 hour'],
  [24, '24 hours'],
  [72, '3 days'],
  [168, '7 days'],
  [720, '30 days'],
]

const STATUS: Record<InvitationStatus, { label: string; hue: HueName }> = {
  pending: { get label() { return t('Pending') }, hue: 'yellow' },
  accepted: { get label() { return t('Accepted') }, hue: 'green' },
  expired: { get label() { return t('Expired') }, hue: 'slate' },
  revoked: { get label() { return t('Revoked') }, hue: 'red' },
}

/**
 * Settings section for the owner and admins: create single-use invite links, see their status,
 * revoke pending ones. Invitations live on the server only, so the panel is
 * read-only while offline and shows the last fetched list.
 */
export function MembersPanel() {
  const online = useOnline()
  const [invitations, setInvitations] = useState<Invitation[] | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Links are only ever known in the session that created them (the server keeps a hash).
  const [links, setLinks] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState<{ id: string | null } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<Invitation | null>(null)
  const mail = useOutgoingEmail()
  const [sentTo, setSentTo] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setInvitations((await api.listInvitations()).invitations)
      setUnreachable(false)
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      else setError((err as ApiError).message)
    }
  }, [])

  useEffect(() => {
    if (online) void load()
  }, [online, load])

  async function create({ email, hours, send }: { email: string; hours: number; send: boolean }) {
    setDialogError(null)
    setBusy(true)
    try {
      const input: { email?: string; expiresInHours: number; send?: boolean } = { expiresInHours: hours }
      if (email.trim()) input.email = email.trim()
      if (input.email && send && mail) input.send = true
      const res = await api.createInvitation(input)
      setSentTo(res.sent ? input.email ?? null : null)
      setLinks((prev) => ({ ...prev, [res.invitation.id]: res.link }))
      setCreating({ id: res.invitation.id })
      await load()
    } catch (err) {
      setDialogError(describe(err))
    } finally {
      setBusy(false)
    }
  }

  async function copy(id: string) {
    const link = links[id]
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(id)
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500)
    } catch {
      setError(t('Could not access the clipboard; select the link and copy it manually.'))
    }
  }

  async function revoke(inv: Invitation) {
    setError(null)
    try {
      await api.revokeInvitation(inv.id)
      await load()
    } catch (err) {
      setError(describe(err))
    }
  }

  const offline = !online || unreachable
  return (
    <>
      <MembersView invitations={invitations} offline={offline} busy={busy} error={error} links={links} copied={copied}
        onNew={() => { setDialogError(null); setCreating({ id: null }) }} onCopy={(id) => void copy(id)} onRevoke={setRevoking} />
      {creating && (
        <NewInvitationDialog busy={busy} offline={offline} error={dialogError} mail={mail} sentTo={sentTo}
          link={creating.id ? links[creating.id] ?? null : null} copied={!!creating.id && copied === creating.id}
          onCreate={(input) => void create(input)} onCopy={() => { if (creating.id) void copy(creating.id) }} onClose={() => { setCreating(null); setSentTo(null) }} />
      )}
      {revoking && (
        <ConfirmDialog title={(revoking.email ? t('Revoke the invitation for {email}?', { email: revoking.email }) : t('Revoke the invitation?'))} confirmLabel={t('Revoke')}
          consequence={t('The link stops working. Nobody can create an account with it.')} onConfirm={() => revoke(revoking)} onCancel={() => setRevoking(null)} />
      )}
    </>
  )
}

export interface MembersViewProps {
  invitations: Invitation[] | null
  /** No connection or the server unreachable. */
  offline: boolean
  busy: boolean
  error: string | null
  /** Links created in this session, by invitation id (the server keeps only a hash). */
  links: Record<string, string>
  copied: string | null
  onNew: () => void
  onCopy: (id: string) => void
  onRevoke: (inv: Invitation) => void
}

/** Pure rendering of the Members section. */
export function MembersView(p: MembersViewProps) {
  const dt = useDateTimeFormat()
  const disabled = p.offline || p.busy
  const pending = p.invitations?.filter((i) => i.status === 'pending').length ?? 0

  function onRowKey(e: KeyboardEvent<HTMLElement>, inv: Invitation) {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' && p.links[inv.id] && inv.status === 'pending') {
      e.preventDefault()
      p.onCopy(inv.id)
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && inv.status === 'pending' && !disabled) {
      e.preventDefault()
      p.onRevoke(inv)
    }
  }

  return (
    <SettingsSection title={t('Members')} headingId="members-heading"
      description={t('Invite someone with a single-use link. Sign-up stays closed for everyone else.')}>
      {p.offline && <Notice>{t('You are offline. Invitations live on the server, so creating and revoking need a connection. The list below is the last one fetched.')}</Notice>}
      <SettingRow label={t('Invitations')} status={p.invitations ? <span data-testid="invitations-summary">{t('{pending} pending', { pending })}</span> : undefined}
        description={t('Optionally bind a link to someone\'s email so only they can use it.')}
        control={<Button variant="primary" icon="plus" disabled={disabled} onClick={p.onNew}>{t('New invitation')}</Button>} />
      {p.error && <Notice tone="danger">{p.error}</Notice>}

      {p.invitations && p.invitations.length > 0 && (
        <ul className="-mx-3 py-2" aria-label={t('Invitations')}>
          {p.invitations.map((inv) => {
            const who = inv.email ?? t('Anyone with the link')
            const canCopy = !!p.links[inv.id] && inv.status === 'pending'
            return (
              <li key={inv.id} data-invitation={inv.id}>
                <ListRow
                  leading={<Icon name={inv.status === 'accepted' ? 'user-check' : 'link'} size="md" />}
                  label={<>{who}{inv.acceptedBy && <span className="text-muted">{' '}{t('· joined as {name}', { name: inv.acceptedBy.name || inv.acceptedBy.email })}</span>}</>}
                  ariaLabel={t('Invitation {who}, {status}', { who: inv.email ?? t('open'), status: STATUS[inv.status].label })}
                  meta={[inv.status === 'pending' ? t('Expires {instant}', { instant: dt.formatInstant(inv.expiresAt, 'datetime') }) : t('Created {instant}', { instant: dt.formatInstant(inv.createdAt, 'date') }), inv.createdByName ? t('by {name}', { name: inv.createdByName }) : ''].filter(Boolean).join(' · ')}
                  badges={<Badge hue={STATUS[inv.status].hue}>{STATUS[inv.status].label}</Badge>}
                  onKeyDown={(e) => onRowKey(e, inv)}
                  menu={inv.status === 'pending' && (
                    <Menu label={t('Actions for the invitation {who}', { who })} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
                      {canCopy && <MenuItem label={p.copied === inv.id ? t('Copied') : t('Copy link')} icon="copy" shortcut="Enter" onSelect={() => p.onCopy(inv.id)} />}
                      {canCopy && <MenuSeparator />}
                      <MenuItem label={t('Revoke')} icon="x" shortcut="Del" danger disabled={disabled} onSelect={() => p.onRevoke(inv)} />
                    </Menu>
                  )}
                />
              </li>
            )
          })}
        </ul>
      )}
      {p.invitations && p.invitations.length === 0 && (
        <EmptyState icon="link" title={t('No invitations yet')} body={t('An invitation is a single-use link that lets one person create an account here.')}
          action={<Button variant="secondary" icon="plus" disabled={disabled} onClick={p.onNew}>{t('New invitation')}</Button>} />
      )}
      {p.invitations === null && (p.offline ? <p className="py-2 text-meta text-faint">{t('Nothing fetched yet.')}</p> : <Skeleton shape="line" count={3} label={t('Loading invitations')} />)}
      <p className="pt-2 text-meta text-faint">{t.rich('Keyboard, with a row focused: copy a link created in this session with {kbd}, revoke a pending invitation with {kbd2}.', { kbd: <Kbd k="Enter" />, kbd2: <Kbd k="Delete" /> })}</p>
    </SettingsSection>
  )
}

/** The "New invitation" dialog: the form, then the one-time link with a copy action. */
export function NewInvitationDialog({ busy, offline, error, mail = false, sentTo = null, link, copied, onCreate, onCopy, onClose }: {
  busy: boolean
  offline: boolean
  error: string | null
  /** The server sends email: offer "Send by email" when an address is typed (outgoing-email). */
  mail?: boolean
  /** The address the invitation was mailed to. */
  sentTo?: string | null
  /** Set once created: shown in the same dialog, once. */
  link: string | null
  copied: boolean
  onCreate: (input: { email: string; hours: number; send: boolean }) => void
  onCopy: () => void
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [hours, setHours] = useState(168)
  const [send, setSend] = useState(true)
  const canSend = mail && email.trim() !== ''
  function submit(e: FormEvent) {
    e.preventDefault()
    onCreate({ email, hours, send: canSend && send })
  }
  return (
    <Dialog title={link ? t('Invitation created') : t('New invitation')} onClose={onClose} size="md" dismissable={!link}>
      {link ? (
        <div className="space-y-4">
          {sentTo && <Notice tone="success">{t('The invitation was sent to {sentTo}.', { sentTo })}</Notice>}
          <Notice tone="success">{t('Copy this link now. It will not be shown again.')}</Notice>
          <code className="block break-all rounded-control bg-sunken p-3 text-meta text-default" tabIndex={0}
            onFocus={(e) => window.getSelection()?.selectAllChildren(e.currentTarget)}>{link}</code>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" icon="copy" onClick={onCopy}>{copied ? t('Copied') : t('Copy link')}</Button>
            <Button variant="primary" onClick={onClose}>{t('Done')}</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label={t('Email (optional)')} description={t('Only this person can use the link. Leave empty for anyone with the link.')}>
            <Input type="email" placeholder={t('friend@example.com')} value={email} onChange={(e) => setEmail(e.target.value)} disabled={offline || busy} autoComplete="off" data-autofocus />
          </Field>
          {canSend && (
            <label className="flex items-center gap-2 text-body text-default">
              <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} disabled={offline || busy} data-send-by-email />
              {t('Send by email')}
            </label>
          )}
          <Field label={t('Expires in')}>
            <Select value={hours} onChange={(e) => setHours(Number(e.target.value))} disabled={offline || busy}>
              {EXPIRY_OPTIONS.map(([h, label]) => <option key={h} value={h}>{label}</option>)}
            </Select>
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button>
            <Button type="submit" variant="primary" disabled={offline} busy={busy}>{t('Create invitation')}</Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

function describe(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'rate_limited') return t('Too many invitations created recently. Try again later.')
    if (err.code === 'invitation_spent') return t('This invitation was already accepted and cannot be revoked.')
    if (err.code === 'email_failed') return t('The email could not be sent, so no invitation was created ({reason}). Turn off “Send by email” to create a link to share yourself.', { reason: err.message })
    if (err.code === 'smtp_disabled') return t('This server no longer sends email. Turn off “Send by email” to create a link to share yourself.')
    return err.message
  }
  return t('The server is unreachable. Invitations need a connection.')
}

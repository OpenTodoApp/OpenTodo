import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
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
import { Dialog } from './overlay/Dialog'
import { Menu } from './overlay/Menu'
import { useDateTimeFormat } from './DateTimePrefsProvider'

const EXPIRY_OPTIONS: [number, string][] = [
  [1, '1 hour'],
  [24, '24 hours'],
  [72, '3 days'],
  [168, '7 days'],
  [720, '30 days'],
]

const STATUS: Record<InvitationStatus, { label: string; hue: HueName }> = {
  pending: { label: 'Pending', hue: 'yellow' },
  accepted: { label: 'Accepted', hue: 'green' },
  expired: { label: 'Expired', hue: 'slate' },
  revoked: { label: 'Revoked', hue: 'red' },
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

  async function create({ email, hours }: { email: string; hours: number }) {
    setDialogError(null)
    setBusy(true)
    try {
      const input: { email?: string; expiresInHours: number } = { expiresInHours: hours }
      if (email.trim()) input.email = email.trim()
      const res = await api.createInvitation(input)
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
      setError('Could not access the clipboard; select the link and copy it manually.')
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
        <NewInvitationDialog busy={busy} offline={offline} error={dialogError}
          link={creating.id ? links[creating.id] ?? null : null} copied={!!creating.id && copied === creating.id}
          onCreate={(input) => void create(input)} onCopy={() => { if (creating.id) void copy(creating.id) }} onClose={() => setCreating(null)} />
      )}
      {revoking && (
        <ConfirmDialog title={`Revoke the invitation${revoking.email ? ` for ${revoking.email}` : ''}?`} confirmLabel="Revoke"
          consequence="The link stops working. Nobody can create an account with it." onConfirm={() => revoke(revoking)} onCancel={() => setRevoking(null)} />
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
    <SettingsSection title="Members" headingId="members-heading"
      description="Invite someone with a single-use link. Sign-up stays closed for everyone else.">
      {p.offline && <Notice>You are offline. Invitations live on the server, so creating and revoking need a connection. The list below is the last one fetched.</Notice>}
      <SettingRow label="Invitations" status={p.invitations ? <span data-testid="invitations-summary">{pending} pending</span> : undefined}
        description="Optionally bind a link to someone's email so only they can use it."
        control={<Button variant="primary" icon="plus" disabled={disabled} onClick={p.onNew}>New invitation</Button>} />
      {p.error && <Notice tone="danger">{p.error}</Notice>}

      {p.invitations && p.invitations.length > 0 && (
        <ul className="-mx-3 py-2" aria-label="Invitations">
          {p.invitations.map((inv) => {
            const who = inv.email ?? 'Anyone with the link'
            const canCopy = !!p.links[inv.id] && inv.status === 'pending'
            return (
              <li key={inv.id} data-invitation={inv.id}>
                <ListRow
                  leading={<Icon name={inv.status === 'accepted' ? 'user-check' : 'link'} size="md" />}
                  label={<>{who}{inv.acceptedBy && <span className="text-muted"> · joined as {inv.acceptedBy.name || inv.acceptedBy.email}</span>}</>}
                  ariaLabel={`Invitation ${inv.email ?? 'open'}, ${inv.status}`}
                  meta={`${inv.status === 'pending' ? `Expires ${dt.formatInstant(inv.expiresAt, 'datetime')}` : `Created ${dt.formatInstant(inv.createdAt, 'date')}`}${inv.createdByName ? ` · by ${inv.createdByName}` : ''}`}
                  badges={<Badge hue={STATUS[inv.status].hue}>{STATUS[inv.status].label}</Badge>}
                  onKeyDown={(e) => onRowKey(e, inv)}
                  menu={inv.status === 'pending' && (
                    <Menu label={`Actions for the invitation ${who}`} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
                      {canCopy && <MenuItem label={p.copied === inv.id ? 'Copied' : 'Copy link'} icon="copy" shortcut="Enter" onSelect={() => p.onCopy(inv.id)} />}
                      {canCopy && <MenuSeparator />}
                      <MenuItem label="Revoke" icon="x" shortcut="Del" danger disabled={disabled} onSelect={() => p.onRevoke(inv)} />
                    </Menu>
                  )}
                />
              </li>
            )
          })}
        </ul>
      )}
      {p.invitations && p.invitations.length === 0 && (
        <EmptyState icon="link" title="No invitations yet" body="An invitation is a single-use link that lets one person create an account here."
          action={<Button variant="secondary" icon="plus" disabled={disabled} onClick={p.onNew}>New invitation</Button>} />
      )}
      {p.invitations === null && <p className="py-2 text-meta text-faint">{p.offline ? 'Nothing fetched yet.' : 'Loading…'}</p>}
      <p className="pt-2 text-meta text-faint">Keyboard: focus a row, <span className="kbd">Enter</span> copies a link created in this session, <span className="kbd">Delete</span> revokes a pending invitation.</p>
    </SettingsSection>
  )
}

/** The "New invitation" dialog: the form, then the one-time link with a copy action. */
export function NewInvitationDialog({ busy, offline, error, link, copied, onCreate, onCopy, onClose }: {
  busy: boolean
  offline: boolean
  error: string | null
  /** Set once created: shown in the same dialog, once. */
  link: string | null
  copied: boolean
  onCreate: (input: { email: string; hours: number }) => void
  onCopy: () => void
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [hours, setHours] = useState(168)
  function submit(e: FormEvent) {
    e.preventDefault()
    onCreate({ email, hours })
  }
  return (
    <Dialog title={link ? 'Invitation created' : 'New invitation'} onClose={onClose} size="md" dismissable={!link}>
      {link ? (
        <div className="space-y-4">
          <Notice tone="success">Copy this link now. It will not be shown again.</Notice>
          <code className="block break-all rounded-control bg-sunken p-3 text-meta text-default" tabIndex={0}
            onFocus={(e) => window.getSelection()?.selectAllChildren(e.currentTarget)}>{link}</code>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" icon="copy" onClick={onCopy}>{copied ? 'Copied' : 'Copy link'}</Button>
            <Button variant="primary" onClick={onClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email (optional)" description="Only this person can use the link. Leave empty for anyone with the link.">
            <Input type="email" placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={offline || busy} autoComplete="off" data-autofocus />
          </Field>
          <Field label="Expires in">
            <Select value={hours} onChange={(e) => setHours(Number(e.target.value))} disabled={offline || busy}>
              {EXPIRY_OPTIONS.map(([h, label]) => <option key={h} value={h}>{label}</option>)}
            </Select>
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={offline} busy={busy}>Create invitation</Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

function describe(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'rate_limited') return 'Too many invitations created recently. Try again later.'
    if (err.code === 'invitation_spent') return 'This invitation was already accepted and cannot be revoked.'
    return err.message
  }
  return 'The server is unreachable. Invitations need a connection.'
}

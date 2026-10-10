import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import type { Invitation, InvitationStatus } from '../lib/types'

const EXPIRY_OPTIONS: [number, string][] = [
  [1, '1 hour'],
  [24, '24 hours'],
  [72, '3 days'],
  [168, '7 days'],
  [720, '30 days'],
]

const BADGE: Record<InvitationStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  accepted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  expired: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  revoked: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200',
}

/**
 * Owner-only Settings section: create single-use invite links, see their status,
 * revoke pending ones. Invitations live on the server only, so the panel is
 * read-only while offline and shows the last fetched list.
 */
export function MembersPanel() {
  const online = useOnline()
  const [invitations, setInvitations] = useState<Invitation[] | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [hours, setHours] = useState(168)
  const [busy, setBusy] = useState(false)
  // Links are only ever known in the session that created them (the server keeps a hash).
  const [links, setLinks] = useState<Record<string, string>>({})
  const [latest, setLatest] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

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

  const disabled = !online || unreachable || busy

  async function create(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const input: { email?: string; expiresInHours: number } = { expiresInHours: hours }
      if (email.trim()) input.email = email.trim()
      const res = await api.createInvitation(input)
      setLinks((prev) => ({ ...prev, [res.invitation.id]: res.link }))
      setLatest(res.invitation.id)
      setEmail('')
      await load()
    } catch (err) {
      setError(describe(err))
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
    if (!window.confirm(`Revoke the invitation${inv.email ? ` for ${inv.email}` : ''}? The link will stop working.`)) return
    setError(null)
    try {
      await api.revokeInvitation(inv.id)
      await load()
    } catch (err) {
      setError(describe(err))
    }
  }

  function onRowKey(e: KeyboardEvent<HTMLLIElement>, inv: Invitation) {
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' && links[inv.id]) {
      e.preventDefault()
      void copy(inv.id)
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && inv.status === 'pending' && !disabled) {
      e.preventDefault()
      void revoke(inv)
    }
  }

  const latestLink = latest ? links[latest] : null

  return (
    <section className="space-y-3" aria-labelledby="members-heading">
      <h2 id="members-heading" className="font-semibold">Members</h2>
      <p className="text-sm text-slate-500">
        Invite someone with a single-use link. Sign-up stays closed for everyone else. Optionally bind the link to their email so only they can use it.
      </p>

      {(!online || unreachable) && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200" role="status">
          You are offline. Invitations live on the server, so creating and revoking need a connection. The list below is the last one fetched.
        </p>
      )}

      <form onSubmit={(e) => void create(e)} className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">Email <span className="text-slate-400">(optional)</span></span>
          <input className="input w-64" type="email" placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={disabled} autoComplete="off" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-slate-600 dark:text-slate-300">Expires in</span>
          <select className="input w-36" value={hours} onChange={(e) => setHours(Number(e.target.value))} disabled={disabled}>
            {EXPIRY_OPTIONS.map(([h, label]) => <option key={h} value={h}>{label}</option>)}
          </select>
        </label>
        <button className="btn-primary" disabled={disabled}>{busy ? 'Creating…' : 'Create invitation'}</button>
      </form>

      {latestLink && latest && (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm dark:border-emerald-800 dark:bg-emerald-950" role="status">
          <p className="mb-1 font-medium">Copy this link now. It will not be shown again.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all" onFocus={(e) => window.getSelection()?.selectAllChildren(e.currentTarget)} tabIndex={0}>{latestLink}</code>
            <button type="button" className="btn-ghost border border-emerald-300 text-xs dark:border-emerald-700" onClick={() => void copy(latest)}>
              {copied === latest ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{error}</p>}

      <ul className="divide-y divide-slate-200 dark:divide-slate-800" aria-label="Invitations">
        {invitations?.map((inv) => (
          <li
            key={inv.id}
            tabIndex={0}
            onKeyDown={(e) => onRowKey(e, inv)}
            aria-label={`Invitation ${inv.email ?? 'open'}, ${inv.status}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          >
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${BADGE[inv.status]}`}>{inv.status}</span>
            <span className="min-w-0 flex-1 truncate">
              {inv.email ?? <span className="text-slate-400">Anyone with the link</span>}
              {inv.acceptedBy && (
                <span className="text-slate-500"> · joined as {inv.acceptedBy.name || inv.acceptedBy.email}</span>
              )}
            </span>
            <span className="text-xs text-slate-400">
              {inv.status === 'pending' ? `expires ${new Date(inv.expiresAt).toLocaleString()}` : `created ${new Date(inv.createdAt).toLocaleDateString()}`}
              {inv.createdByName ? ` · by ${inv.createdByName}` : ''}
            </span>
            {links[inv.id] && (
              <button type="button" className="btn-ghost text-xs" onClick={() => void copy(inv.id)}>{copied === inv.id ? 'Copied' : 'Copy link'}</button>
            )}
            {inv.status === 'pending' && (
              <button type="button" className="btn-danger text-xs" disabled={disabled} onClick={() => void revoke(inv)}>Revoke</button>
            )}
          </li>
        ))}
        {invitations && invitations.length === 0 && <li className="py-2 text-sm text-slate-400">No invitations yet.</li>}
        {invitations === null && !unreachable && online && <li className="py-2 text-sm text-slate-400">Loading…</li>}
        {invitations === null && (unreachable || !online) && <li className="py-2 text-sm text-slate-400">Nothing fetched yet.</li>}
      </ul>
      <p className="text-xs text-slate-400">Keyboard: focus a row, <span className="kbd">Enter</span> copies a link created in this session, <span className="kbd">Delete</span> revokes a pending invitation.</p>
    </section>
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

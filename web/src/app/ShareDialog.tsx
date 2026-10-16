import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Tooltip } from '../ui'
import { Kbd } from './shortcuts/Kbd'
import { HelpLink } from './help/HelpLink'
import { api, ApiError } from '../lib/api'
import { canManage, grantableRoles } from '../lib/sharing'
import { requestSync } from '../lib/sync'
import type { Membership, Project, ProjectRole } from '../lib/types'
import { DEMO_RESTRICTED_NOTE, useDemo } from '../lib/demo'
import { Dialog } from './overlay'
import { InviteLinksSection } from './InviteLinksSection'
import { PublicLinksSection } from './PublicLinksSection'

const ROLE_HINT: Record<ProjectRole, string> = {
  owner: 'Owner',
  admin: 'Admin: edits tasks and the project, manages viewers and editors',
  editor: 'Editor: adds, edits, completes and deletes tasks',
  viewer: 'Viewer: reads only',
}

/**
 * Share dialog (OpenSpec `project-sharing`): add a member by exact email with a
 * role, change roles, remove members, leave, transfer ownership. Membership is
 * server data, so every action is a REST call followed by a sync that refreshes
 * the local cache on all devices. Owners and admins can also invite with a
 * single-use link (OpenSpec `project-invite-links`, InviteLinksSection). Fully keyboard operable: the email field has
 * focus, Enter shares, Esc closes.
 */
export function ShareDialog({ project, userId, cached, section, onPublicLinks, onClose }: {
  project: Project
  userId: string
  /** The locally cached membership, shown until the server answers (and offline). */
  cached: Membership | undefined
  /** Opened from the "Public" badge: show the public links section first in view. */
  section?: 'public'
  /** The number of active public links, after each load (the project header's badge). */
  onPublicLinks?: (active: number) => void
  onClose: () => void
}) {
  const [membership, setMembership] = useState<Membership | undefined>(cached)
  const [email, setEmail] = useState('')
  const myRole: ProjectRole = membership?.role ?? 'owner'
  // A demo instance refuses every membership change (OpenSpec `demo-mode`): the dialog only lists members.
  const locked = useDemo() !== null
  const roles = locked ? [] : grantableRoles(myRole)
  const [role, setRole] = useState<ProjectRole>('editor')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    api.listMembers(project.id).then((m) => { if (!cancelled) setMembership(m) }, () => undefined)
    return () => { cancelled = true }
  }, [project.id])

  async function run(action: () => Promise<Membership | void>, after?: () => void) {
    setError(null)
    setBusy(true)
    try {
      const m = await action()
      if (m) setMembership(m)
      after?.()
      requestSync(0)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The server could not be reached; sharing needs a connection.')
    } finally {
      setBusy(false)
    }
  }

  function share(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    void run(() => api.addMember(project.id, email.trim(), role), () => {
      setEmail('')
      emailRef.current?.focus()
    })
  }

  const members = membership?.members ?? []
  return (
    <Dialog title={<span className="user-text">Share “{project.name}”</span>} label={`Share ${project.name}`} onClose={onClose} size="md">
        {roles.length > 0 && (
          <form onSubmit={share} className="mb-4 flex flex-wrap gap-2">
            <input ref={emailRef} autoFocus type="email" className="ui-input min-w-0 flex-1" placeholder="Email of an account on this server"
              aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select className="ui-input w-auto" aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as ProjectRole)}>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button className="ui-btn ui-btn--primary ui-btn--md" disabled={busy || !email.trim()}>Share</button>
          </form>
        )}
        {roles.length > 0 && <InviteLinksSection projectId={project.id} myRole={myRole} />}
        {!locked && (myRole === 'owner' || myRole === 'admin') && <PublicLinksSection projectId={project.id} focus={section === 'public'} onChange={onPublicLinks} />}
        {locked && <p className="mb-3 text-body text-muted" data-testid="demo-share-note">Sharing changes: {DEMO_RESTRICTED_NOTE}</p>}
        {error && <p role="alert" className="mb-3 text-body text-danger">{error}</p>}
        <ul aria-label="Members" className="space-y-1">
          {members.map((m) => {
            const self = m.userId === userId
            const manage = !locked && !self && canManage(myRole, m.role)
            return (
              <li key={m.userId} className="flex items-center gap-2 rounded-control px-1 py-1 text-body">
                <Tooltip label={m.email}>
                  <span className="min-w-0 flex-1 truncate">
                    {m.name || m.email}{self ? ' (you)' : ''}
                    <span className="block truncate text-meta text-faint">{m.email}</span>
                  </span>
                </Tooltip>
                {manage ? (
                  <select className="ui-input w-auto py-1 text-meta" aria-label={`Role of ${m.name || m.email}`} value={m.role} disabled={busy}
                    onChange={(e) => void run(() => api.setMemberRole(project.id, m.userId, e.target.value as ProjectRole))}>
                    {[...new Set([...grantableRoles(myRole), m.role])].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <Tooltip label={ROLE_HINT[m.role]}><span className="rounded-chip text-meta text-muted" tabIndex={0}>{m.role}</span></Tooltip>
                )}
                {manage && (
                  <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" disabled={busy} aria-label={`Remove ${m.name || m.email}`}
                    onClick={() => void run(async () => { await api.removeMember(project.id, m.userId); return api.listMembers(project.id) })}>Remove</button>
                )}
                {!locked && myRole === 'owner' && !self && (
                  <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" disabled={busy} aria-label={`Make ${m.name || m.email} the owner`}
                    onClick={() => { if (confirm(`Make ${m.name || m.email} the owner of "${project.name}"? You become an admin.`)) void run(() => api.transferProject(project.id, m.userId)) }}>
                    Make owner
                  </button>
                )}
                {!locked && self && m.role !== 'owner' && (
                  <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" disabled={busy}
                    onClick={() => { if (confirm(`Leave "${project.name}"? It disappears from your devices.`)) void run(() => api.removeMember(project.id, 'me'), onClose) }}>
                    Leave
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-meta text-faint">
          <span>Adding by email works for accounts on this server; invite anyone else with a link. Labels stay personal.</span>
          <HelpLink screen="share-dialog" topic="Sharing projects" />
        </p>
        <button className="ui-btn ui-btn--ghost ui-btn--md mt-3 w-full" onClick={onClose}>Close <Kbd k="Esc" only className="ml-1" /></button>
    </Dialog>
  )
}

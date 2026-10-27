import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ConfirmDialog, Tooltip, TruncatedText, Dialog } from '../ui'
import { Kbd } from './shortcuts/Kbd'
import { HelpLink } from './help/HelpLink'
import { api } from '../lib/api'
import { errorText } from '../lib/errorText'
import { useAction } from '../lib/useAction'
import { canManage, grantableRoles } from '../lib/sharing'
import { requestSync } from '../lib/sync'
import type { Membership, Project, ProjectRole } from '../lib/types'
import { DEMO_RESTRICTED_NOTE, useDemo } from '../lib/demo'
import { InviteLinksSection } from './InviteLinksSection'
import { PublicLinksSection } from './PublicLinksSection'
import { AgentAccessRow } from './AgentAccessRow'
import { t, msg, translatedMap } from '../lib/i18n'
import { roleName } from '../lib/roleNames'
import { useWorkspaceGroups, useWorkspaceState } from '../lib/localData'
import { ShareDirectory } from './ShareDirectory'
import { PendingInvitations } from './PendingInvitations'

const ROLE_HINT = translatedMap<ProjectRole>({
  owner: msg('Owner'),
  admin: msg('Admin: edits tasks and the project, manages viewers and editors'),
  editor: msg('Editor: adds, edits, completes and deletes tasks'),
  viewer: msg('Viewer: reads only'),
})

/**
 * Share dialog (OpenSpec `project-sharing`): add a member by exact email with a
 * role, change roles, remove members, leave, transfer ownership. Membership is
 * server data, so every action is a REST call followed by a sync that refreshes
 * the local cache on all devices. Owners and admins can also invite with a
 * single-use link (OpenSpec `project-invite-links`, InviteLinksSection). Someone the owner shares nothing
 * with yet is asked first (OpenSpec change member-add-consent): the add answers "pending" and the address
 * waits under the members until they accept. Fully keyboard operable: the email field has
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
  const { busy, error, run: attempt } = useAction({
    describe: (err) => errorText(err, { capitalise: false, offline: t('The server could not be reached; sharing needs a connection.') }),
  })
  // Handing over the project and leaving it are confirmed in the app's own dialog.
  const [asking, setAsking] = useState<{ kind: 'transfer'; userId: string; name: string } | { kind: 'leave' } | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  // The address of the last add that became an invitation, for the note under the form.
  const [invited, setInvited] = useState<string | null>(null)
  // In a created workspace the dialog shares from its directory (workspaces "A created workspace is a closed directory").
  const wsState = useWorkspaceState()
  const directory = wsState.list.find((w) => w.id === wsState.current && !w.default)
  const groupNames = useWorkspaceGroups()
  const groupName = (id: string) => groupNames.find((g) => g.id === id)?.name ?? ''

  useEffect(() => {
    let cancelled = false
    api.listMembers(project.id).then((m) => { if (!cancelled) setMembership(m) }, () => undefined)
    return () => { cancelled = true }
  }, [project.id])

  async function run(action: () => Promise<Membership | void>, after?: () => void) {
    await attempt(async () => {
      const m = await action()
      if (m) setMembership(m)
      after?.()
      requestSync(0)
    })
  }

  function share(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    const address = email.trim()
    void run(async () => {
      const res = await api.addMember(project.id, address, role)
      if ('pending' in res) {
        setInvited(address)
        return api.listMembers(project.id)
      }
      setInvited(null)
      return res
    }, () => {
      setEmail('')
      emailRef.current?.focus()
    })
  }

  const members = membership?.members ?? []
  return (
    <Dialog title={<span className="user-text">{t('Share “{name}”', { name: project.name })}</span>} label={t('Share {name}', { name: project.name })} onClose={onClose} size="md">
        {directory && roles.length > 0 && <ShareDirectory projectId={project.id} workspace={directory} membership={membership} roles={roles} busy={busy} run={(a) => void run(a)} />}
        {!directory && roles.length > 0 && (
          <form onSubmit={share} className="mb-4 flex flex-wrap gap-2">
            <input ref={emailRef} autoFocus type="email" className="ui-input min-w-0 flex-[1_1_14rem]" placeholder={t('Email of an account on this server')}
              aria-label={t('Email')} value={email} onChange={(e) => setEmail(e.target.value)} />
            <select className="ui-input w-auto" aria-label={t('Role')} value={role} onChange={(e) => setRole(e.target.value as ProjectRole)}>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <button className="ui-btn ui-btn--primary ui-btn--md" disabled={busy || !email.trim()}>{t('Share')}</button>
          </form>
        )}
        {invited && !directory && roles.length > 0 && (
          <p role="status" className="-mt-2 mb-4 text-meta text-muted" data-invited-note>
            {t('If {email} has an account on this server, they get an invitation to accept. For someone without an account, create an invite link.', { email: invited })}
          </p>
        )}
        {roles.length > 0 && <InviteLinksSection projectId={project.id} myRole={myRole} />}
        {!locked && (myRole === 'owner' || myRole === 'admin') && <PublicLinksSection projectId={project.id} focus={section === 'public'} onChange={onPublicLinks} />}
        <AgentAccessRow projectId={project.id} projectName={project.name} canChange={!locked && (myRole === 'owner' || myRole === 'admin')} />
        {locked && <p className="mb-3 text-body text-muted" data-testid="demo-share-note">{t('Sharing changes: {note}', { note: t(DEMO_RESTRICTED_NOTE) })}</p>}
        {error && <p role="alert" className="mb-3 text-body text-danger">{error}</p>}
        <ul aria-label={t('Members')} className="space-y-1">
          {members.map((m) => {
            const self = m.userId === userId
            const manage = !locked && !self && canManage(myRole, m.role)
            return (
              <li key={m.userId} className="flex items-center gap-2 rounded-control px-1 py-1 text-body">
                {/* Each line keeps its full text when cut (ux-fixes-phone D2). */}
                <span className="min-w-0 flex-1">
                  <TruncatedText className="block" text={self ? t('{name} (you)', { name: m.name || m.email }) : m.name || m.email} />
                  <TruncatedText className="block text-meta text-faint" text={m.via?.length ? t('{email} · via {groups}', { email: m.email, groups: m.via.map((g) => g.name || groupName(g.id)).join(', ') }) : m.email} />
                </span>
                {manage ? (
                  <select className="ui-input w-auto py-1 text-meta" aria-label={t('Role of {name}', { name: m.name || m.email })} value={m.role} disabled={busy}
                    onChange={(e) => void run(() => api.setMemberRole(project.id, m.userId, e.target.value as ProjectRole))}>
                    {[...new Set([...grantableRoles(myRole), m.role])].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <Tooltip label={ROLE_HINT[m.role]}><span className="rounded-chip text-meta text-muted" tabIndex={0}>{roleName(m.role)}</span></Tooltip>
                )}
                {manage && (
                  <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" disabled={busy} aria-label={t('Remove {name}', { name: m.name || m.email })}
                    onClick={() => void run(async () => { await api.removeMember(project.id, m.userId); return api.listMembers(project.id) })}>{t('Remove')}</button>
                )}
                {!locked && myRole === 'owner' && !self && (
                  <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" disabled={busy} aria-label={t('Make owner: {name}', { name: m.name || m.email })}
                    onClick={() => setAsking({ kind: 'transfer', userId: m.userId, name: m.name || m.email })}>
                    {t('Make owner')}
                  </button>
                )}
                {!locked && self && m.role !== 'owner' && (
                  <button className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-0.5 text-meta" disabled={busy}
                    onClick={() => setAsking({ kind: 'leave' })}>
                    {t('Leave')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
        {!locked && membership?.pending && (
          <PendingInvitations pending={membership.pending} disabled={busy}
            onCancel={(p) => void run(async () => { await api.cancelProjectInvitation(project.id, p.id); return api.listMembers(project.id) })} />
        )}
        <p className="mt-3 flex flex-wrap items-center justify-between gap-2 text-meta text-faint">
          <span>{t('Adding by email works for accounts on this server; invite anyone else with a link. Labels stay personal.')}</span>
          <HelpLink screen="share-dialog" topic={t('Sharing projects')} />
        </p>
        <button className="ui-btn ui-btn--ghost ui-btn--md mt-3 w-full" onClick={onClose}>{t('Close')} <Kbd k="Esc" only className="ml-1" /></button>
        {asking?.kind === 'transfer' && (
          <ConfirmDialog title={t('Make {name} the owner?', { name: asking.name })} confirmLabel={t('Make owner')}
            consequence={t('Make {name} the owner of “{project}”? You become an admin.', { name: asking.name, project: project.name })}
            onConfirm={() => run(() => api.transferProject(project.id, asking.userId))} onCancel={() => setAsking(null)} />
        )}
        {asking?.kind === 'leave' && (
          <ConfirmDialog title={t('Leave “{project}”?', { project: project.name })} confirmLabel={t('Leave')}
            consequence={t('It disappears from your devices.')}
            onConfirm={() => run(() => api.removeMember(project.id, 'me'), onClose)} onCancel={() => setAsking(null)} />
        )}
    </Dialog>
  )
}

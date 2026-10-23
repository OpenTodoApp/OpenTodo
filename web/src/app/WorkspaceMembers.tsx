// Settings → Workspaces → Members (OpenSpec change workspaces-settings-v2): each
// person with their avatar; the owner and admins change roles, remove people and
// add them by email, everyone else reads the list.
import { type FormEvent, useState } from 'react'
import { Badge, Button, Field, Input, Select, SettingsSection } from '../ui'
import { act, actionErrorMessage } from './actionError'
import { t } from '../lib/i18n'
import { roleName } from '../lib/roleNames'
import type { User, Workspace, WorkspaceMember, WorkspaceRole } from '../lib/types'
import { workspaceApi } from '../lib/workspaceApi'
import { cardCopy } from '../lib/settingsCopy'
import { PersonAvatar } from './PersonAvatar'

export function WorkspaceMembers({ ws, members, user, canManage, online }: { ws: Workspace; members: WorkspaceMember[]; user: User; canManage: boolean; online: boolean }) {
  const copy = cardCopy('workspace-members', { variant: 'created' })
  return (
    <SettingsSection {...copy} id="workspace-members" level={3}>
      <ul className="divide-y divide-(--ot-border)" data-workspace-members>
        {members.map((m) => <MemberRow key={m.userId} ws={ws} m={m} you={m.userId === user.id} canManage={canManage} online={online} />)}
      </ul>
      {canManage && <AddMember ws={ws} online={online} />}
    </SettingsSection>
  )
}

function MemberRow({ ws, m, you, canManage, online }: { ws: Workspace; m: WorkspaceMember; you: boolean; canManage: boolean; online: boolean }) {
  const name = m.name || t('Unnamed')
  const editable = canManage && m.role !== 'owner' && !you
  const locked = ws.role === 'admin' && m.role === 'admin'
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0" data-workspace-member={m.userId}>
      <PersonAvatar id={m.userId} name={name} size="md" />
      <span className="min-w-0 flex-1">
        <span className="user-text block truncate font-medium text-default">{name}</span>
        {you && <span className="block text-meta text-muted">{t('You')}</span>}
      </span>
      {editable
        ? (
          <span className="flex basis-full items-center gap-2 sm:basis-auto">
            <Select aria-label={t('Role of {name}', { name })} value={m.role} disabled={!online || locked}
              onChange={(e) => act(workspaceApi.setRole(ws.id, m.userId, e.target.value as WorkspaceRole))}>
              <option value="member">{roleName('member')}</option>
              {(ws.role === 'owner' || m.role === 'admin') && <option value="admin">{roleName('admin')}</option>}
            </Select>
            <Button variant="ghost" icon="x" disabled={!online || locked} onClick={() => act(workspaceApi.removeMember(ws.id, m.userId))}
              aria-label={t('Remove {name}', { name })}>{t('Remove')}</Button>
          </span>
        )
        : <Badge>{roleName(m.role)}</Badge>}
    </li>
  )
}

function AddMember({ ws, online }: { ws: Workspace; online: boolean }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<WorkspaceRole>('member')
  const [error, setError] = useState<string | null>(null)
  async function add(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await workspaceApi.addMember(ws.id, email.trim(), role)
      setEmail('')
    } catch (err) {
      setError(actionErrorMessage(err))
    }
  }
  return (
    <form onSubmit={(e) => void add(e)} className="border-t border-default pt-4" data-add-workspace-member>
      <Field label={t('Add by email')} description={t('The person needs an account on this server.')} error={error ?? undefined}>
        <div className="flex flex-wrap gap-2">
          <Input type="email" value={email} disabled={!online} onChange={(e) => setEmail(e.target.value)} className="min-w-0 flex-1" />
          <Select aria-label={t('Role')} value={role} disabled={!online} onChange={(e) => setRole(e.target.value as WorkspaceRole)}>
            <option value="member">{roleName('member')}</option>
            {ws.role === 'owner' && <option value="admin">{roleName('admin')}</option>}
          </Select>
          <Button type="submit" disabled={!online || !email.trim()}>{t('Add')}</Button>
        </div>
      </Field>
    </form>
  )
}

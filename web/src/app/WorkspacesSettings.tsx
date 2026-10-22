// Settings → Workspaces (OpenSpec change workspaces, task 7.1): the account's
// workspaces with the user's role; for the selected one its name and colour,
// members, groups, invite links and a danger zone. Owners and admins manage,
// members read and may leave. Workspaces are server data: every control waits
// for a connection, the lists come from the cache.
import { type FormEvent, useEffect, useState } from 'react'
import { Badge, Button, ConfirmDialog, Field, IconPicker, Input, ListRow, Menu, MenuItem, Notice, Select, SettingRow, SettingsSection } from '../ui'
import { act, actionErrorMessage } from './actionError'
import { useDemo } from '../lib/demo'
import { useEncryption } from '../lib/e2ee'
import { t } from '../lib/i18n'
import { useWorkspaceGroups, useWorkspaceMembers, useWorkspaceState } from '../lib/localData'
import { useOnline } from '../lib/online'
import { useOutgoingEmail } from '../lib/outgoingEmail'
import { roleName } from '../lib/roleNames'
import type { User, Workspace, WorkspaceGroup, WorkspaceMember, WorkspaceRole } from '../lib/types'
import { workspaceApi, type WorkspaceInvite } from '../lib/workspaceApi'
import { requestNewWorkspace, WorkspaceColours } from './NewWorkspaceDialog'
import { WorkspaceMark } from './WorkspaceControl'
import { workspaceLabel } from './workspaceNav'
import { cardCopy, rowCopy } from '../lib/settingsCopy'

// Row lines that are data (who, who created a link), not settings copy.
const createdBy = (name: string) => t('Created by {name}', { name })

/** Whether the role may manage members, groups and links. */
const manages = (role: WorkspaceRole) => role === 'owner' || role === 'admin'

/** The page. */
export function WorkspacesSettings({ user }: { user: User }) {
  const state = useWorkspaceState()
  const [selected, setSelected] = useState<string>('')
  const id = selected || state.current
  const ws = state.list.find((w) => w.id === id) ?? state.list[0]
  const online = useOnline()
  const demo = !!useDemo()
  const encrypted = useEncryption().enabled
  return (
    <div className="space-y-6" data-workspaces-settings>
      {!online && <Notice tone="info">{t('Workspaces need a connection to your server. The lists below are from this device.')}</Notice>}
      {demo && <Notice tone="info">{t('Creating workspaces, members, groups and invite links is not available on the demo.')}</Notice>}
      {encrypted && <Notice tone="info">{t('With end-to-end encryption you can create workspaces and move things between them, but not add members, groups or invite links yet.')}</Notice>}
      <SettingsSection {...cardCopy('workspaces-list')} id="workspaces-list">
        {state.list.map((w) => (
          <ListRow key={w.id} leading={<WorkspaceMark workspace={w} />} label={workspaceLabel(w.name, w.default)} onClick={() => setSelected(w.id)}
            ariaLabel={t('{name}, {role}', { name: workspaceLabel(w.name, w.default), role: roleName(w.role) })}
            className={w.id === ws?.id ? 'bg-sunken' : ''}
            badges={<>{w.default && <Badge>{t('Default')}</Badge>}<Badge>{roleName(w.role)}</Badge></>}
            onKeyDown={(e) => { if (e.key === 'Enter') setSelected(w.id) }} />
        ))}
        <SettingRow label={t('New workspace')} control={<Button icon="plus" onClick={requestNewWorkspace} disabled={!online || demo} data-settings-new-workspace>{t('New workspace')}</Button>} />
      </SettingsSection>
      {ws && <WorkspaceDetail key={ws.id} ws={ws} user={user} online={online && !demo} encrypted={encrypted} />}
    </div>
  )
}

function WorkspaceDetail({ ws, user, online, encrypted }: { ws: Workspace; user: User; online: boolean; encrypted: boolean }) {
  const members = useWorkspaceMembers().filter((m) => m.workspaceId === ws.id)
  const groups = useWorkspaceGroups().filter((g) => g.workspaceId === ws.id)
  const canManage = manages(ws.role) && !ws.default
  return (
    <>
      {manages(ws.role) && <IdentityCard ws={ws} online={online} />}
      {ws.default
        ? <SettingsSection {...cardCopy('workspace-members', { variant: 'default' })}><span /></SettingsSection>
        : <>
          <MembersCard ws={ws} members={members} user={user} canManage={canManage} online={online && !encrypted} />
          <GroupsCard ws={ws} members={members} groups={groups} canManage={canManage} online={online && !encrypted} />
          {canManage && <InvitesCard ws={ws} online={online && !encrypted} />}
          <DangerCard ws={ws} members={members} user={user} online={online} />
        </>}
    </>
  )
}

function IdentityCard({ ws, online }: { ws: Workspace; online: boolean }) {
  const [name, setName] = useState(ws.name)
  const [error, setError] = useState<string | null>(null)
  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await workspaceApi.update(ws.id, { name: name.trim() })
    } catch (err) {
      setError(actionErrorMessage(err))
    }
  }
  return (
    <SettingsSection {...cardCopy('workspace-identity')} id="workspace-identity">
      <form onSubmit={(e) => void save(e)} className="py-3">
        <Field label={t('Name')} error={error ?? undefined}>
          <div className="flex flex-wrap gap-2">
            <Input value={name} maxLength={60} disabled={!online} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1" />
            <Button type="submit" disabled={!online || !name.trim() || name.trim() === ws.name}>{t('Save')}</Button>
          </div>
        </Field>
      </form>
      <SettingRow label={t('Colour')} control={<WorkspaceColours value={ws.color} onPick={(color) => { if (online) act(workspaceApi.update(ws.id, { color })) }} />} />
      <SettingRow label={t('Icon')} control={
        <Menu kind="dialog" label={t('Choose icon')} align="end" triggerClassName="ui-btn ui-btn--secondary ui-btn--md" triggerProps={{ disabled: !online }}
          trigger={<><WorkspaceMark workspace={ws} />{t('Choose icon')}</>}>
          {(close) => (
            <IconPicker value={ws.icon || null} onClose={close}
              onPick={(icon) => { act(workspaceApi.update(ws.id, { icon: icon ?? '' })); close() }} />
          )}
        </Menu>
      } />
    </SettingsSection>
  )
}

function MembersCard({ ws, members, user, canManage, online }: { ws: Workspace; members: WorkspaceMember[]; user: User; canManage: boolean; online: boolean }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<WorkspaceRole>('member')
  const [error, setError] = useState<string | null>(null)
  const you = t('You')
  const unnamed = t('Unnamed')
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
    <SettingsSection {...cardCopy('workspace-members', { variant: 'created' })} id="workspace-members">
      {members.map((m) => (
        <SettingRow key={m.userId} label={m.name || unnamed} description={m.userId === user.id ? you : undefined}
          control={canManage && m.role !== 'owner' && m.userId !== user.id
            ? <>
              <Select aria-label={t('Role of {name}', { name: m.name })} value={m.role} disabled={!online || (ws.role === 'admin' && m.role === 'admin')}
                onChange={(e) => act(workspaceApi.setRole(ws.id, m.userId, e.target.value as WorkspaceRole))}>
                <option value="member">{roleName('member')}</option>
                {ws.role === 'owner' && <option value="admin">{roleName('admin')}</option>}
                {ws.role !== 'owner' && m.role === 'admin' && <option value="admin">{roleName('admin')}</option>}
              </Select>
              <Button variant="ghost" icon="x" disabled={!online || (ws.role === 'admin' && m.role === 'admin')} onClick={() => act(workspaceApi.removeMember(ws.id, m.userId))}
                aria-label={t('Remove {name}', { name: m.name })}>{t('Remove')}</Button>
            </>
            : <Badge>{roleName(m.role)}</Badge>} />
      ))}
      {canManage && (
        <form onSubmit={(e) => void add(e)} className="py-3" data-add-workspace-member>
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
      )}
    </SettingsSection>
  )
}

function GroupsCard({ ws, members, groups, canManage, online }: { ws: Workspace; members: WorkspaceMember[]; groups: WorkspaceGroup[]; canManage: boolean; online: boolean }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const nameOf = (id: string) => members.find((m) => m.userId === id)?.name || t('Unnamed')
  const memberList = (ids: string[]) => (ids.length ? ids.map(nameOf).join(', ') : t('No members'))
  async function create(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await workspaceApi.createGroup(ws.id, name.trim())
      setName('')
    } catch (err) {
      setError(actionErrorMessage(err))
    }
  }
  return (
    <SettingsSection {...cardCopy('workspace-groups')} id="workspace-groups">
      {groups.length === 0 && <p className="py-3 text-meta text-muted">{t('No groups yet.')}</p>}
      {groups.map((g) => (
        <SettingRow key={g.id} label={g.name} description={memberList(g.members)}
          control={canManage && (
            <>
              <Menu kind="menu" label={t('Members of {name}', { name: g.name })} title={g.name} align="end" triggerClassName="ui-btn ui-btn--secondary ui-btn--md" trigger={t('Members')}>
                {members.map((m) => (
                  <MenuItem key={m.userId} label={m.name || t('Unnamed')} checked={g.members.includes(m.userId)} disabled={!online}
                    onSelect={() => act(workspaceApi.setGroupMember(ws.id, g.id, m.userId, !g.members.includes(m.userId)))} />
                ))}
              </Menu>
              <Button variant="ghost" icon="trash-2" disabled={!online} onClick={() => act(workspaceApi.deleteGroup(ws.id, g.id))} aria-label={t('Delete group {name}', { name: g.name })}>{t('Delete')}</Button>
            </>
          )} />
      ))}
      {canManage && (
        <form onSubmit={(e) => void create(e)} className="py-3" data-create-group>
          <Field label={t('New group')} error={error ?? undefined}>
            <div className="flex flex-wrap gap-2">
              <Input value={name} maxLength={60} disabled={!online} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1" />
              <Button type="submit" disabled={!online || !name.trim()}>{t('Create')}</Button>
            </div>
          </Field>
        </form>
      )}
    </SettingsSection>
  )
}

function InvitesCard({ ws, online }: { ws: Workspace; online: boolean }) {
  const [invites, setInvites] = useState<WorkspaceInvite[]>([])
  const [link, setLink] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mail = useOutgoingEmail()
  const load = () => act(workspaceApi.listInvites(ws.id).then((r) => setInvites(r.invites)))
  useEffect(() => { if (online) load() }, [online, ws.id]) // eslint-disable-line react-hooks/exhaustive-deps -- load once per workspace
  async function create(send: boolean) {
    setError(null)
    try {
      const res = await workspaceApi.createInvite(ws.id, { role: 'member', ...(email.trim() ? { email: email.trim() } : {}), ...(send ? { send: true } : {}) })
      setLink(res.link)
      load()
    } catch (err) {
      setError(actionErrorMessage(err))
    }
  }
  return (
    <SettingsSection {...cardCopy('workspace-invites')} id="workspace-invites">
      <div className="py-3">
        <Field label={t('Email (optional)')} description={t('Bind the link to one address.')} error={error ?? undefined}>
          <div className="flex flex-wrap gap-2">
            <Input type="email" value={email} disabled={!online} onChange={(e) => setEmail(e.target.value)} className="min-w-0 flex-1" />
            <Button disabled={!online} onClick={() => create(false)} data-create-workspace-link>{t('Create link')}</Button>
            {mail && <Button disabled={!online || !email.trim()} onClick={() => create(true)}>{t('Send by email')}</Button>}
          </div>
        </Field>
        {link && (
          <div className="mt-2 flex flex-wrap items-center gap-2" data-workspace-link>
            <Input readOnly value={link} aria-label={t('Invite link')} className="min-w-0 flex-1" onFocus={(e) => e.currentTarget.select()} />
            <Button icon="copy" onClick={() => act(navigator.clipboard.writeText(link))}>{t('Copy')}</Button>
          </div>
        )}
      </div>
      {invites.map((inv) => (
        <SettingRow key={inv.id} label={inv.email ?? t('Anyone with the link')} description={createdBy(inv.createdByName)}
          control={<Button variant="ghost" disabled={!online} onClick={() => act(workspaceApi.revokeInvite(ws.id, inv.id).then(load))}>{t('Revoke')}</Button>} />
      ))}
    </SettingsSection>
  )
}

function DangerCard({ ws, members, user, online }: { ws: Workspace; members: WorkspaceMember[]; user: User; online: boolean }) {
  const [confirm, setConfirm] = useState<'delete' | 'leave' | null>(null)
  const [target, setTarget] = useState('')
  const others = members.filter((m) => m.userId !== user.id)
  return (
    <SettingsSection {...cardCopy('workspace-danger')} id="workspace-danger">
      {ws.role === 'owner'
        ? <>
          <SettingRow {...rowCopy('workspace-danger', 'transfer')} control={<>
            <Select aria-label={t('New owner')} value={target} disabled={!online || others.length === 0} onChange={(e) => setTarget(e.target.value)}>
              <option value="">{t('Choose a member')}</option>
              {others.map((m) => <option key={m.userId} value={m.userId}>{m.name || t('Unnamed')}</option>)}
            </Select>
            <Button disabled={!online || !target} onClick={() => act(workspaceApi.transfer(ws.id, target))}>{t('Transfer')}</Button>
          </>} />
          <SettingRow {...rowCopy('workspace-danger', 'delete')}
            control={<Button variant="danger" disabled={!online} onClick={() => setConfirm('delete')}>{t('Delete')}</Button>} />
        </>
        : <SettingRow {...rowCopy('workspace-danger', 'leave')}
          control={<Button variant="danger" disabled={!online} onClick={() => setConfirm('leave')}>{t('Leave')}</Button>} />}
      {confirm && (
        <ConfirmDialog title={confirm === 'delete' ? t('Delete {name}?', { name: ws.name }) : t('Leave {name}?', { name: ws.name })}
          consequence={confirm === 'delete' ? t('The workspace is removed for everyone.') : t('Projects shared with you in this workspace leave your devices.')}
          confirmLabel={confirm === 'delete' ? t('Delete') : t('Leave')}
          onConfirm={() => { act(confirm === 'delete' ? workspaceApi.remove(ws.id) : workspaceApi.leave(ws.id)); setConfirm(null) }}
          onCancel={() => setConfirm(null)} />
      )}
    </SettingsSection>
  )
}

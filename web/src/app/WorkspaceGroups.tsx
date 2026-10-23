// Settings → Workspaces → Groups (OpenSpec change workspaces-settings-v2, D4):
// the groups with their members' avatars and count; opening one gives rename, a
// searchable member picker, each member with Remove, and Delete behind a
// confirmation naming the projects shared through the group (from the cache).
import { type FormEvent, useState } from 'react'
import { Button, Combobox, ConfirmDialog, Field, Icon, Input, SettingsSection } from '../ui'
import { act, actionErrorMessage } from './actionError'
import { formatList, t } from '../lib/i18n'
import { useMemberships, useProjectsOfEveryWorkspace, useWorkspaceGroups } from '../lib/localData'
import type { Workspace, WorkspaceGroup, WorkspaceMember } from '../lib/types'
import { workspaceApi } from '../lib/workspaceApi'
import { cardCopy } from '../lib/settingsCopy'
import { PersonAvatar } from './PersonAvatar'

const SHOWN_AVATARS = 4

export function WorkspaceGroups({ ws, members, canManage, online }: { ws: Workspace; members: WorkspaceMember[]; canManage: boolean; online: boolean }) {
  const groups = useWorkspaceGroups().filter((g) => g.workspaceId === ws.id)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = groups.find((g) => g.id === openId)
  return (
    <SettingsSection {...cardCopy('workspace-groups')} id="workspace-groups" level={3}>
      {groups.length === 0 && <p className="pb-3 text-meta text-muted">{t('No groups yet.')}</p>}
      <ul className="space-y-1" data-workspace-groups>
        {groups.map((g) => (
          <li key={g.id}>
            <GroupRow group={g} members={members} open={g.id === openId} onToggle={() => setOpenId(g.id === openId ? null : g.id)} />
            {g.id === openId && open && (
              <GroupEditor ws={ws} group={open} members={members} canManage={canManage} online={online} onDeleted={() => setOpenId(null)} />
            )}
          </li>
        ))}
      </ul>
      {canManage && <NewGroup ws={ws} online={online} onCreated={setOpenId} />}
    </SettingsSection>
  )
}

const nameOf = (members: WorkspaceMember[], id: string) => members.find((m) => m.userId === id)?.name || t('Unnamed')

function GroupRow({ group, members, open, onToggle }: { group: WorkspaceGroup; members: WorkspaceMember[]; open: boolean; onToggle: () => void }) {
  const shown = group.members.slice(0, SHOWN_AVATARS)
  const more = group.members.length - shown.length
  return (
    <button type="button" onClick={onToggle} aria-expanded={open} data-group-row={group.id}
      className={`touch-target flex w-full items-center gap-3 rounded-control px-3 py-2 text-left
        focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus
        ${open ? 'bg-sunken' : 'hover:bg-sunken dark:hover:bg-raised'}`}>
      <span className="user-text min-w-0 flex-1 truncate font-medium text-default">{group.name}</span>
      <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
        {shown.map((id) => <PersonAvatar key={id} id={id} name={nameOf(members, id)} size="sm" className="ring-2 ring-(--ot-surface)" />)}
        {more > 0 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-sunken px-1 text-hint text-muted ring-2 ring-(--ot-surface)">+{more}</span>}
      </span>
      <span className="shrink-0 text-meta text-muted">{t('{n, plural, one {# member} other {# members}}', { n: group.members.length })}</span>
      <span className="text-faint"><Icon name="chevron-down" className={open ? 'rotate-180' : ''} /></span>
    </button>
  )
}

/** Projects shared with the group, from the cached memberships (members reached through it). */
function useProjectsOfGroup(groupId: string): string[] {
  const memberships = useMemberships()
  const projects = useProjectsOfEveryWorkspace()
  const ids = memberships.filter((m) => m.grants?.some((g) => g.groupId === groupId) || m.members.some((p) => p.via?.some((v) => v.id === groupId))).map((m) => m.projectId)
  return projects.filter((p) => ids.includes(p.id)).map((p) => p.name)
}

function GroupEditor({ ws, group, members, canManage, online, onDeleted }: {
  ws: Workspace; group: WorkspaceGroup; members: WorkspaceMember[]; canManage: boolean; online: boolean; onDeleted: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const projects = useProjectsOfGroup(group.id)
  const outside = members.filter((m) => !group.members.includes(m.userId))
  return (
    <div className="mb-2 ml-3 space-y-4 border-l-2 border-default py-3 pl-4" data-group-editor={group.id}>
      {canManage && <RenameGroup ws={ws} group={group} online={online} />}
      {canManage && (
        <div data-group-picker>
          <Combobox label={t('Add to {name}', { name: group.name })} placeholder={t('Add a member…')} emptyText={outside.length ? t('No member matches.') : t('Everyone in the workspace is in this group.')}
            source={outside} getKey={(m) => m.userId} getLabel={(m) => m.name || t('Unnamed')}
            renderLeading={(m) => <PersonAvatar id={m.userId} name={m.name || t('Unnamed')} size="sm" />}
            onPick={(m) => { if (online) act(workspaceApi.setGroupMember(ws.id, group.id, m.userId, true)) }} />
        </div>
      )}
      {group.members.length === 0
        ? <p className="text-meta text-muted">{t('No members')}</p>
        : (
          <ul className="space-y-1" aria-label={t('Members of {name}', { name: group.name })}>
            {group.members.map((id) => {
              const name = nameOf(members, id)
              return (
                <li key={id} className="flex items-center gap-3" data-group-member={id}>
                  <PersonAvatar id={id} name={name} size="sm" />
                  <span className="user-text min-w-0 flex-1 truncate text-body">{name}</span>
                  {canManage && (
                    <Button variant="ghost" icon="x" disabled={!online} onClick={() => act(workspaceApi.setGroupMember(ws.id, group.id, id, false))}
                      aria-label={t('Remove {name} from {group}', { name, group: group.name })}>{t('Remove')}</Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      {canManage && (
        <Button variant="danger" icon="trash-2" disabled={!online} onClick={() => setConfirm(true)} data-delete-group>{t('Delete group')}</Button>
      )}
      {confirm && (
        <ConfirmDialog title={t('Delete {name}?', { name: group.name })}
          consequence={projects.length
            ? t('{projects} lose access through this group. People with their own access keep it.', { projects: formatList(projects) })
            : t('No project is shared with this group.')}
          confirmLabel={t('Delete group')}
          onConfirm={async () => { await workspaceApi.deleteGroup(ws.id, group.id); onDeleted() }}
          onCancel={() => setConfirm(false)} />
      )}
    </div>
  )
}

function RenameGroup({ ws, group, online }: { ws: Workspace; group: WorkspaceGroup; online: boolean }) {
  const [name, setName] = useState(group.name)
  const [error, setError] = useState<string | null>(null)
  async function save(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await workspaceApi.renameGroup(ws.id, group.id, name.trim())
    } catch (err) {
      setError(actionErrorMessage(err))
    }
  }
  return (
    <form onSubmit={(e) => void save(e)} data-rename-group>
      <Field label={t('Group name')} error={error ?? undefined}>
        <div className="flex flex-wrap gap-2">
          <Input value={name} maxLength={60} disabled={!online} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1" />
          <Button type="submit" disabled={!online || !name.trim() || name.trim() === group.name}>{t('Rename')}</Button>
        </div>
      </Field>
    </form>
  )
}

function NewGroup({ ws, online, onCreated }: { ws: Workspace; online: boolean; onCreated: (id: string) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  async function create(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const g = await workspaceApi.createGroup(ws.id, name.trim())
      setName('')
      onCreated(g.id)
    } catch (err) {
      setError(actionErrorMessage(err))
    }
  }
  return (
    <form onSubmit={(e) => void create(e)} className="mt-4 border-t border-default pt-4" data-create-group>
      <Field label={t('New group')} error={error ?? undefined}>
        <div className="flex flex-wrap gap-2">
          <Input value={name} maxLength={60} disabled={!online} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1" />
          <Button type="submit" disabled={!online || !name.trim()}>{t('Create')}</Button>
        </div>
      </Field>
    </form>
  )
}

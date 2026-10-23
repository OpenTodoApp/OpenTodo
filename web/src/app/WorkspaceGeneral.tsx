// Settings → Workspaces → General (OpenSpec change workspaces-settings-v2, D3):
// the workspace's name, colour and icon for the owner and admins, then the
// danger zone: Transfer and Delete for the owner, Leave for everyone else. The
// default workspace has the identity only.
import { type FormEvent, useState } from 'react'
import { Button, ConfirmDialog, Field, IconPicker, Input, Menu, Select, SettingRow, SettingsSection } from '../ui'
import { act, actionErrorMessage } from './actionError'
import { t } from '../lib/i18n'
import type { User, Workspace, WorkspaceMember } from '../lib/types'
import { workspaceApi } from '../lib/workspaceApi'
import { WorkspaceColours } from './NewWorkspaceDialog'
import { WorkspaceMark } from './WorkspaceControl'
import { cardCopy, rowCopy } from '../lib/settingsCopy'
import { manages } from './workspaceRoles'

export function WorkspaceGeneral({ ws, members, user, online }: { ws: Workspace; members: WorkspaceMember[]; user: User; online: boolean }) {
  return (
    <div className="space-y-8">
      {manages(ws.role)
        ? <IdentitySection ws={ws} online={online} />
        : <p className="text-meta text-muted">{t('Only the owner and admins can change the name, colour and icon.')}</p>}
      {ws.default
        ? <p className="text-meta text-muted" data-default-workspace-note>{cardCopy('workspace-members', { variant: 'default' }).description}</p>
        : <DangerSection ws={ws} members={members} user={user} online={online} />}
    </div>
  )
}

function IdentitySection({ ws, online }: { ws: Workspace; online: boolean }) {
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
    <SettingsSection {...cardCopy('workspace-identity')} id="workspace-identity" level={3}>
      <form onSubmit={(e) => void save(e)} className="pb-3">
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

function DangerSection({ ws, members, user, online }: { ws: Workspace; members: WorkspaceMember[]; user: User; online: boolean }) {
  const [confirm, setConfirm] = useState<'delete' | 'leave' | null>(null)
  const [target, setTarget] = useState('')
  const others = members.filter((m) => m.userId !== user.id)
  return (
    <SettingsSection {...cardCopy('workspace-danger')} id="workspace-danger" level={3}>
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

// Settings → Workspaces → General (OpenSpec change workspaces-settings-v2, D3):
// the workspace's name, colour and icon for the owner and admins, then the
// danger zone: Transfer and Delete for the owner, Leave for everyone else. The
// default workspace has the identity only. settings-foundation D8: the name and colour
// save together with the save bar; the icon applies when picked.
import { useState } from 'react'
import { Button, ConfirmDialog, Field, IconPicker, Input, Menu, Select, SettingRow, SettingsSection, useDraft } from '../ui'
import { SettingsSaveBar } from './SettingsSaveBar'
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

/** The name and colour are one form with the save bar (settings-foundation D8); the icon applies when picked. */
export function IdentitySection({ ws, online }: { ws: Workspace; online: boolean }) {
  const form = useDraft({ name: ws.name, color: ws.color })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = form.draft.name.trim()
  const dirty = name !== ws.name || form.draft.color !== ws.color
  async function save() {
    setBusy(true)
    setError(null)
    try {
      await workspaceApi.update(ws.id, { ...(name !== ws.name ? { name } : {}), ...(form.draft.color !== ws.color ? { color: form.draft.color } : {}) })
    } catch (err) {
      setError(actionErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <SettingsSection {...cardCopy('workspace-identity')} id="workspace-identity" level={3}>
      <div className="pb-3">
        <Field label={t('Name')} error={name ? undefined : t('A workspace needs a name.')}>
          <Input value={form.draft.name} maxLength={60} disabled={!online} onChange={(e) => form.set({ name: e.target.value })} className="min-w-0 flex-1" data-workspace-name />
        </Field>
      </div>
      <SettingRow label={t('Colour')} control={<WorkspaceColours value={form.draft.color} onPick={(color) => { if (online) form.set({ color }) }} />} />
      <SettingRow label={t('Icon')} control={
        <Menu kind="dialog" label={t('Choose icon')} align="end" triggerClassName="ui-btn ui-btn--secondary ui-btn--md" triggerProps={{ disabled: !online }}
          trigger={<><WorkspaceMark workspace={ws} />{t('Choose icon')}</>}>
          {(close) => (
            <IconPicker value={ws.icon || null} onClose={close}
              onPick={(icon) => { act(workspaceApi.update(ws.id, { icon: icon ?? '' })); close() }} />
          )}
        </Menu>
      } />
      <SettingsSaveBar dirty={dirty} invalid={!name} busy={busy} error={error}
        disabledReason={online ? undefined : t('Workspaces need a connection to your server. The lists below are from this device.')}
        onDiscard={() => { form.reset(); setError(null) }} onSave={() => void save()} />
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

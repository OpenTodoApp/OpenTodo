// Settings → Workspaces → Invites (OpenSpec change workspaces-settings-v2, D5):
// single-use links with a role (Admin only for the owner, as the API allows) and
// an expiry from 1 hour to 30 days, optionally bound to one address and sent by
// email; the pending links with their role and expiry, each revocable.
import { useEffect, useState } from 'react'
import { Badge, Button, Field, Input, Select, SettingRow, SettingsSection } from '../ui'
import { act, actionErrorMessage } from './actionError'
import { t } from '../lib/i18n'
import { formatInstant } from '../lib/dates'
import { useOutgoingEmail } from '../lib/outgoingEmail'
import { roleName } from '../lib/roleNames'
import type { Workspace, WorkspaceRole } from '../lib/types'
import { workspaceApi, type WorkspaceInvite } from '../lib/workspaceApi'
import { cardCopy } from '../lib/settingsCopy'

/** The offered expiries, in hours (the API accepts 1 to 720; 168 is its default). */
export const INVITE_EXPIRIES = [1, 24, 168, 720] as const
const DEFAULT_EXPIRY = 168

const expiryLabel = (hours: number) =>
  hours === 1 ? t('1 hour') : hours === 24 ? t('1 day') : hours === 168 ? t('7 days') : t('30 days')

// Row lines that are data (who, who created a link), not settings copy.
const createdBy = (name: string) => t('Created by {name}', { name })
const inviteLine = (inv: WorkspaceInvite) => `${createdBy(inv.createdByName)} · ${t('expires {date}', { date: formatInstant(inv.expiresAt, 'date') })}`

export function WorkspaceInvites({ ws, online }: { ws: Workspace; online: boolean }) {
  const [invites, setInvites] = useState<WorkspaceInvite[]>([])
  const [link, setLink] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<WorkspaceRole>('member')
  const [hours, setHours] = useState<number>(DEFAULT_EXPIRY)
  const [error, setError] = useState<string | null>(null)
  const mail = useOutgoingEmail()
  const load = () => act(workspaceApi.listInvites(ws.id).then((r) => setInvites(r.invites)))
  useEffect(() => { if (online) load() }, [online, ws.id]) // eslint-disable-line react-hooks/exhaustive-deps -- load once per workspace
  async function create(send: boolean) {
    setError(null)
    try {
      const res = await workspaceApi.createInvite(ws.id, { role, expiresInHours: hours, ...(email.trim() ? { email: email.trim() } : {}), ...(send ? { send: true } : {}) })
      setLink(res.link)
      load()
    } catch (err) {
      setError(actionErrorMessage(err))
    }
  }
  return (
    <SettingsSection {...cardCopy('workspace-invites')} id="workspace-invites" level={3}>
      <div className="space-y-3 pb-3" data-invite-form>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('Role')}>
            <Select value={role} disabled={!online} onChange={(e) => setRole(e.target.value as WorkspaceRole)} data-invite-role>
              <option value="member">{roleName('member')}</option>
              {ws.role === 'owner' && <option value="admin">{roleName('admin')}</option>}
            </Select>
          </Field>
          <Field label={t('Expires after')}>
            <Select value={String(hours)} disabled={!online} onChange={(e) => setHours(Number(e.target.value))} data-invite-expiry>
              {INVITE_EXPIRIES.map((h) => <option key={h} value={h}>{expiryLabel(h)}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t('Email (optional)')} description={t('Bind the link to one address.')} error={error ?? undefined}>
          <div className="flex flex-wrap gap-2">
            <Input type="email" value={email} disabled={!online} onChange={(e) => setEmail(e.target.value)} className="min-w-0 flex-1" />
            <Button disabled={!online} onClick={() => create(false)} data-create-workspace-link>{t('Create link')}</Button>
            {mail && <Button disabled={!online || !email.trim()} onClick={() => create(true)}>{t('Send by email')}</Button>}
          </div>
        </Field>
        {link && (
          <div className="flex flex-wrap items-center gap-2" data-workspace-link>
            <Input readOnly value={link} aria-label={t('Invite link')} className="min-w-0 flex-1" onFocus={(e) => e.currentTarget.select()} />
            <Button icon="copy" onClick={() => act(navigator.clipboard.writeText(link))}>{t('Copy')}</Button>
          </div>
        )}
      </div>
      {invites.map((inv) => (
        <SettingRow key={inv.id} label={inv.email ?? t('Anyone with the link')}
          description={inviteLine(inv)}
          control={<>
            <Badge>{roleName(inv.role)}</Badge>
            <Button variant="ghost" disabled={!online} onClick={() => act(workspaceApi.revokeInvite(ws.id, inv.id).then(load))}>{t('Revoke')}</Button>
          </>} />
      ))}
    </SettingsSection>
  )
}

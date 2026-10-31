// The dialogs of Settings → Integrations → Calendar sync (OpenSpec change
// calendar-two-way): connect a CalDAV account, choose its calendars, enter a new
// app password, and the owner's Google and Microsoft clients.
import { useState } from 'react'
import { Button, Combobox, Dialog, Field, hueFor, Input, LabelChip, LearnMore, Notice, Switch } from '../ui'
import type { CalendarConnection, CalendarConnectionPatch, GoogleClientSetting, MicrosoftClientSetting, SyncCalendar } from '../lib/types'
import { ago } from '../lib/dates'
import { t } from '../lib/i18n'

export interface CalDAVDraft {
  server_url: string
  username: string
  password: string
  name: string
}

export const emptyCalDAVDraft = (): CalDAVDraft => ({ server_url: '', username: '', password: '', name: '' })

interface FormProps {
  busy: boolean
  connected: boolean
  error: string | null
  onClose: () => void
}

export function CalDAVDialog({ draft, onChange, onSave, ...p }: FormProps & { draft: CalDAVDraft; onChange: (d: CalDAVDraft) => void; onSave: () => void }) {
  return (
    <Dialog title={t('Connect a CalDAV calendar')} onClose={p.onClose} size="md">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSave() }} data-testid="caldav-connect">
        <Field label={t('Server')} description={t('The CalDAV address, the server’s host name, or your email address: caldav.icloud.com, caldav.fastmail.com, your Nextcloud.')}>
          <Input aria-label={t('Server')} required autoComplete="url" value={draft.server_url}
            onChange={(e) => onChange({ ...draft, server_url: e.target.value })} data-autofocus />
        </Field>
        <Field label={t('Username')}>
          <Input aria-label={t('Username')} required autoComplete="username" value={draft.username} onChange={(e) => onChange({ ...draft, username: e.target.value })} />
        </Field>
        <Field label={t('App password')} description={t('Create an app-specific password at your provider. It is stored on your server and never shown again.')}>
          <Input aria-label={t('App password')} required type="password" autoComplete="new-password" value={draft.password}
            onChange={(e) => onChange({ ...draft, password: e.target.value })} />
        </Field>
        <Field label={t('Name')} description={t('Optional; the server’s name is used otherwise.')}>
          <Input aria-label={t('Connection name')} maxLength={100} value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
        </Field>
        {p.error && <Notice tone="danger">{p.error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={p.onClose}>{t('Cancel')}</Button>
          <Button variant="primary" type="submit" busy={p.busy} disabled={!p.connected}>{t('Find calendars')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

export function PasswordDialog({ connection, onSave, ...p }: FormProps & { connection: CalendarConnection; onSave: (password: string) => void }) {
  const [password, setPassword] = useState('')
  return (
    <Dialog title={t('Reconnect {name}', { name: connection.name })} onClose={p.onClose} size="sm">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSave(password) }}>
        <Field label={t('App password')} description={t('A new app-specific password for {user}.', { user: connection.username })}>
          <Input aria-label={t('App password')} required type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />
        </Field>
        {p.error && <Notice tone="danger">{p.error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={p.onClose}>{t('Cancel')}</Button>
          <Button variant="primary" type="submit" busy={p.busy} disabled={!p.connected}>{t('Reconnect')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

const dot = (c: SyncCalendar) => <span aria-hidden="true" className="h-2 w-2 rounded-full bg-hue-solid" data-hue={hueFor(c.color || 'slate')} />

/** Choose the calendar tasks are written into, the calendars shown, and the date-only option. */
export function CalendarsDialog({ connection, onSave, ...p }: FormProps & { connection: CalendarConnection; onSave: (patch: CalendarConnectionPatch) => void }) {
  const writable = connection.calendars.filter((c) => !c.read_only)
  const [target, setTarget] = useState(connection.target || writable[0]?.url || '')
  const [read, setRead] = useState<string[]>(connection.read)
  const [dateOnly, setDateOnly] = useState(connection.include_date_only)
  const byUrl = new Map(connection.calendars.map((c) => [c.url, c]))
  const others = connection.calendars.filter((c) => c.url !== target)
  const toggle = (url: string) => setRead((cur) => (cur.includes(url) ? cur.filter((u) => u !== url) : [...cur, url]))
  const targetCal = byUrl.get(target)
  return (
    <Dialog title={t('Calendars of {name}', { name: connection.name })} onClose={p.onClose} size="md">
      <form className="space-y-4" data-testid="calendar-choice"
        onSubmit={(e) => { e.preventDefault(); onSave({ target, read: read.filter((u) => u !== target), include_date_only: dateOnly }) }}>
        <fieldset className="space-y-2">
          <legend className="text-body font-medium text-default">{t('Write tasks into')}</legend>
          <p className="text-meta text-muted">{t('Dated tasks become events in this calendar. Choose one you use only for tasks, or your main one.')}</p>
          {targetCal && <p className="flex items-center gap-2 text-body text-default" data-target-calendar>{dot(targetCal)}{targetCal.name}</p>}
          <Combobox label={t('Write tasks into')} placeholder={t('Find a calendar…')} source={writable} getKey={(c: SyncCalendar) => c.url}
            getLabel={(c: SyncCalendar) => c.name} selected={target ? [target] : []} emptyText={t('No calendar of this account can be written.')}
            renderLeading={dot} onPick={(c: SyncCalendar) => setTarget(c.url)} />
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-body font-medium text-default">{t('Also show in Day and Week')}</legend>
          <p className="text-meta text-muted">{t('Events of these calendars appear next to your tasks, read-only.')}</p>
          {read.filter((u) => u !== target && byUrl.has(u)).length > 0 && (
            <ul className="flex flex-wrap gap-1" aria-label={t('Also show in Day and Week')}>
              {read.filter((u) => u !== target && byUrl.has(u)).map((u) => (
                <li key={u}><LabelChip name={byUrl.get(u)!.name} color={byUrl.get(u)!.color || 'var(--color-faint)'} onRemove={() => toggle(u)} /></li>
              ))}
            </ul>
          )}
          <Combobox label={t('Also show in Day and Week')} placeholder={t('Find a calendar…')} source={others} getKey={(c: SyncCalendar) => c.url}
            getLabel={(c: SyncCalendar) => c.name} multiple selected={read} emptyText={t('No other calendars.')} renderLeading={dot}
            onPick={(c: SyncCalendar) => toggle(c.url)} />
        </fieldset>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-body font-medium text-default">{t('Include tasks without a time')}</p>
            <p className="text-meta text-muted">{t('Tasks with only a date become all-day events.')}</p>
          </div>
          <Switch checked={dateOnly} onChange={setDateOnly} label={t('Include tasks without a time')} hideLabel />
        </div>
        {p.error && <Notice tone="danger">{p.error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={p.onClose}>{t('Cancel')}</Button>
          <Button variant="primary" type="submit" busy={p.busy} disabled={!p.connected || !target}>{t('Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

/** The owner's Google OAuth client. */
export function GoogleClientDialog({ setting, onSave, ...p }: FormProps & { setting: GoogleClientSetting; onSave: (id: string, secret: string | undefined) => void }) {
  const [id, setId] = useState(setting.client_id)
  const [secret, setSecret] = useState('')
  return (
    <Dialog title={t('Google client')} onClose={p.onClose} size="md">
      <form className="space-y-4" data-testid="google-client" onSubmit={(e) => { e.preventDefault(); onSave(id, secret || undefined) }}>
        <p className="text-meta text-muted">{t('In Google Cloud, create an OAuth client of type “Web application”, enable the CalDAV API, and add this authorized redirect address:')}</p>
        <Input aria-label={t('Redirect address')} readOnly value={setting.redirect_uri} onFocus={(e) => e.currentTarget.select()} />
        {setting.from_env && <Notice>{t('Set by OPENTODO_GOOGLE_CLIENT_ID and OPENTODO_GOOGLE_CLIENT_SECRET on this server.')}</Notice>}
        <Field label={t('Client ID')}>
          <Input aria-label={t('Client ID')} required disabled={setting.from_env} value={id} onChange={(e) => setId(e.target.value)} />
        </Field>
        <Field label={t('Client secret')} description={setting.secret_set ? t('A secret is stored. Enter a new one to replace it.') : undefined}>
          <Input aria-label={t('Client secret')} type="password" autoComplete="off" required={!setting.secret_set} disabled={setting.from_env} value={secret}
            onChange={(e) => setSecret(e.target.value)} />
        </Field>
        {p.error && <Notice tone="danger">{p.error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={p.onClose}>{t('Cancel')}</Button>
          <Button variant="primary" type="submit" busy={p.busy} disabled={!p.connected || setting.from_env}>{t('Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

/** Tenants Microsoft accepts by shape (outlook-calendar-sync D2); the server checks too. */
export function validTenant(value: string): boolean {
  const v = value.trim()
  return v === '' || ['common', 'organizations', 'consumers'].includes(v) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ||
    /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(v)
}

/** The owner's Microsoft app registration (outlook-calendar-sync D2, D12). */
export function MicrosoftClientDialog({ setting, onSave, now, ...p }: FormProps & { setting: MicrosoftClientSetting; now?: number
  onSave: (id: string, tenant: string, secret: string | undefined) => void }) {
  const [id, setId] = useState(setting.client_id)
  const [tenant, setTenant] = useState(setting.tenant === 'common' ? '' : setting.tenant)
  const [secret, setSecret] = useState('')
  const tenantOk = validTenant(tenant)
  return (
    <Dialog title={t('Microsoft client')} onClose={p.onClose} size="md">
      <form className="space-y-4" data-testid="microsoft-client" onSubmit={(e) => { e.preventDefault(); if (tenantOk) onSave(id, tenant.trim() || 'common', secret || undefined) }}>
        <p className="text-meta text-muted">
          {t('In Microsoft Entra ID, register an app with the delegated permissions offline_access, User.Read, Calendars.ReadWrite and MailboxSettings.Read, and add this redirect address for the Web platform:')}{' '}
          <LearnMore screen="settings/calendar-sync" topic={t('Microsoft client')} />
        </p>
        <Input aria-label={t('Redirect address')} readOnly value={setting.redirect_uri} onFocus={(e) => e.currentTarget.select()} />
        {setting.refused_at !== null && (
          <Notice tone="danger">{t('Microsoft refused the client secret {ago}; it may have expired. Save a new one to resume every Microsoft connection.', { ago: ago(setting.refused_at, now ?? Date.now()) })}</Notice>
        )}
        {setting.from_env && <Notice>{t('Set by OPENTODO_MICROSOFT_CLIENT_ID and OPENTODO_MICROSOFT_CLIENT_SECRET on this server.')}</Notice>}
        <Field label={t('Application (client) ID')}>
          <Input aria-label={t('Application (client) ID')} required disabled={setting.from_env} value={id} onChange={(e) => setId(e.target.value)} />
        </Field>
        <Field label={t('Tenant')} description={t('Empty for any Microsoft account (common), or organizations, consumers, a tenant ID or a domain.')}
          error={tenantOk ? undefined : t('Enter common, organizations, consumers, a tenant ID or a domain name.')}>
          <Input aria-label={t('Tenant')} placeholder="common" disabled={setting.from_env} value={tenant} onChange={(e) => setTenant(e.target.value)} />
        </Field>
        <Field label={t('Client secret')} description={setting.secret_set ? t('A secret is stored. Enter a new one to replace it.') : t('The secret’s value, not its ID. Note when it expires.')}>
          <Input aria-label={t('Client secret')} type="password" autoComplete="off" required={!setting.secret_set} disabled={setting.from_env} value={secret}
            onChange={(e) => setSecret(e.target.value)} />
        </Field>
        {p.error && <Notice tone="danger">{p.error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={p.onClose}>{t('Cancel')}</Button>
          <Button variant="primary" type="submit" busy={p.busy} disabled={!p.connected || setting.from_env || !tenantOk}>{t('Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

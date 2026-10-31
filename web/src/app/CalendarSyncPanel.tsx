import { useEffect, useState } from 'react'
import { Button, Card, ConfirmDialog, Icon, Menu, MenuItem, Notice, SettingRow, SettingsSection, StatusIndicator, Switch, type HueName, toneForHue } from '../ui'
import { api } from '../lib/api'
import { refreshEvents } from '../lib/calendarFeeds'
import { cacheCalendarConnections, cachedCalendarConnections } from '../lib/localData'
import { useEncryption } from '../lib/e2ee'
import { useServerList } from '../lib/useServerList'
import type { CalendarConnection, CalendarConnectionPatch, GoogleClientSetting, MicrosoftClientSetting } from '../lib/types'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'
import { CalDAVDialog, CalendarsDialog, emptyCalDAVDraft, GoogleClientDialog, MicrosoftClientDialog, PasswordDialog, type CalDAVDraft } from './CalendarSyncDialogs'
import { useSettingsPending } from './settingsPending'
import { ago } from '../lib/dates'

// Settings → Integrations → Calendar sync (OpenSpec change calendar-two-way): the
// owner's switch and Google and Microsoft clients (outlook-calendar-sync), and the
// user's calendar accounts as cards that
// lead with their state. The pure CalendarSyncView renders every state;
// CalendarSyncPanel loads and acts. Connections are server data: offline, the last
// loaded cards stay with actions off.

/** A stored reason (calendar-two-way design D11) as a sentence. */
export function syncReasonText(reason: string): string {
  switch (reason) {
    case 'unauthorized': return t('The calendar server refused the password, or the Google or Microsoft access was removed. Reconnect.')
    case 'secret_missing': return t('No password is stored, for example after a restore. Reconnect.')
    case 'google_not_configured': return t('The server owner removed the Google client.')
    case 'microsoft_not_configured': return t('The server owner removed the Microsoft client.')
    case 'microsoft_client_refused': return t('Microsoft refused the server’s client secret. The server owner must save a new one.')
    case 'calendar_read_only': return t('The calendar tasks are written into can no longer be changed. Choose another one.')
    case 'calendar_missing': return t('The calendar tasks are written into no longer exists. Choose another one.')
    case 'private_target': return t('The server is on a private network the server owner has not allowed.')
    case 'redirect_refused': return t('The server redirected to another site, which is never followed.')
    case 'too_large': return t('The calendar server sent more than 4 MB at once.')
    case 'rate_limited': return t('The calendar server asked to slow down.')
    case 'timeout': return t('The calendar server did not answer in time.')
    case 'connection_failed': return t('The calendar server could not be reached.')
    case 'invalid_response': return t('The server did not answer like a CalDAV server.')
    case 'no_calendars': return t('This account has no calendar that holds events.')
  }
  return t('Error: {reason}', { reason })
}

/** The result of a Google sign-in, from the address Google returned to. */
export function googleResultText(result: string): string | null {
  switch (result) {
    case 'connected': return null
    case 'denied': return t('Google Calendar was not connected: the permission was not granted.')
    case 'invalid_state': return t('Google Calendar was not connected: the sign-in expired or was started elsewhere. Try again.')
    case 'no_refresh_token': return t('Google did not grant lasting access. Remove OpenTodo at myaccount.google.com/permissions and connect again.')
    case 'limit_reached': return t('You already have the most calendar accounts allowed.')
  }
  return t('Google Calendar was not connected: {reason}', { reason: syncReasonText(result) })
}

/** The result of a Microsoft sign-in (outlook-calendar-sync D3). */
export function microsoftResultText(result: string): string | null {
  switch (result) {
    case 'connected': return null
    case 'denied': return t('Outlook was not connected: the permission was not granted.')
    case 'admin_consent_required': return t('Outlook was not connected: your organisation’s administrator must approve OpenTodo first. Ask them to grant admin consent, then connect again.')
    case 'authorization_failed': return t('Outlook was not connected: Microsoft did not complete the sign-in. Try again.')
    case 'invalid_state': return t('Outlook was not connected: the sign-in expired or was started elsewhere. Try again.')
    case 'no_refresh_token': return t('Microsoft did not grant lasting access. Connect again.')
    case 'limit_reached': return t('You already have the most calendar accounts allowed.')
  }
  return t('Outlook was not connected: {reason}', { reason: syncReasonText(result) })
}

const STATE: Record<CalendarConnection['state'] | 'syncing', { hue: HueName; label: () => string }> = {
  off: { hue: 'slate', label: () => t('Off') },
  choose_calendar: { hue: 'orange', label: () => t('Choose a calendar') },
  pending: { hue: 'slate', label: () => t('Waiting') },
  ok: { hue: 'green', label: () => t('Up to date') },
  failed: { hue: 'red', label: () => t('Failed') },
  reconnect: { hue: 'red', label: () => t('Reconnect') },
  stopped: { hue: 'orange', label: () => t('Stopped') },
  syncing: { hue: 'blue', label: () => t('Syncing') },
}

/** The card's first line: what the state means right now. */
export function syncStateLine(c: CalendarConnection, now = Date.now()): string {
  const last = c.last_success_at ? t('last success {ago}', { ago: ago(c.last_success_at, now) }) : t('never succeeded')
  switch (c.state) {
    case 'off': return t('Disabled; nothing is synced.')
    case 'choose_calendar': return t('Choose the calendar to write tasks into.')
    case 'reconnect': case 'stopped': return syncReasonText(c.stopped_reason)
    case 'failed': return `${syncReasonText(c.last_error)} · ${last}`
    case 'ok': return t('Synced {ago}', { ago: ago(c.last_success_at ?? now, now) })
  }
  return t('Waiting for the first sync')
}

/** The last cycle in words, or null before the first one. */
export function syncRunText(c: CalendarConnection): string | null {
  const r = c.last_run
  if (!r) return null
  return t('Last sync: {moved} tasks moved, {renamed} renamed, {unscheduled} unscheduled; {written} events written, {removed} removed', r as unknown as Record<string, number>)
}

export interface CalendarSyncViewProps {
  isOwner: boolean
  /** null while unknown (offline before the first load). */
  enabled: boolean | null
  google: boolean
  microsoft: boolean
  maxConnections: number
  googleClient: GoogleClientSetting | null
  microsoftClient: MicrosoftClientSetting | null
  connected: boolean
  encrypted: boolean
  connections: CalendarConnection[] | null
  busy: boolean
  syncing: ReadonlySet<string>
  error: string | null
  /** A message about the Google sign-in that just returned. */
  notice: string | null
  now?: number
  onToggle: (on: boolean) => void
  onSaveGoogleClient: (id: string, secret: string | undefined) => Promise<void>
  onSaveMicrosoftClient: (id: string, tenant: string, secret: string | undefined) => Promise<void>
  onCreateCalDAV: (d: CalDAVDraft) => Promise<CalendarConnection | null>
  onConnectGoogle: (c?: CalendarConnection) => void
  onConnectMicrosoft: (c?: CalendarConnection) => void
  onPatch: (c: CalendarConnection, patch: CalendarConnectionPatch) => Promise<void>
  onSync: (c: CalendarConnection) => void
  onDelete: (c: CalendarConnection) => Promise<void> | void
  /** A connection whose calendars should be chosen now (after connecting). */
  choose?: string | null
  onChoose?: (id: string | null) => void
}

function calendarName(c: CalendarConnection, url: string): string {
  return c.calendars.find((x) => x.url === url)?.name ?? t('A calendar')
}

function ConnectionCard({ c, p, disabled, onChoose, onPassword, onDelete }: { c: CalendarConnection; p: CalendarSyncViewProps; disabled: boolean
  onChoose: () => void; onPassword: () => void; onDelete: () => void }) {
  const now = p.now ?? Date.now()
  const state = p.syncing.has(c.id) ? 'syncing' : c.state
  const run = syncRunText(c)
  const host = c.provider === 'google' ? 'Google Calendar' : c.provider === 'microsoft' ? 'Outlook' : c.server_url.replace(/^https?:\/\//, '')
  const reconnect = () => (c.provider === 'google' ? p.onConnectGoogle(c) : c.provider === 'microsoft' ? p.onConnectMicrosoft(c) : onPassword())
  // Outlook has no floating times: without the mailbox's zone they are written in UTC (design D8).
  const utc = c.provider === 'microsoft' && c.calendars.length > 0 && !c.calendars.some((x) => x.time_zone)
  return (
    <Card as="article" padding="none" className="p-3" aria-label={c.name} data-calendar-connection={c.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusIndicator tone={toneForHue(STATE[state].hue)}>{STATE[state].label()}</StatusIndicator>
            <span className="text-body font-medium text-default">{c.name}</span>
          </div>
          <p className="text-meta text-default" data-calendar-state>{syncStateLine(c, now)}</p>
          <p className="text-meta text-muted">{[host, c.username].filter(Boolean).join(' · ')}</p>
          {c.target && (
            <p className="text-meta text-muted">{t('Tasks go to {calendar} · {n, plural, one {# calendar shown} other {# calendars shown}}', { calendar: calendarName(c, c.target), n: c.read.length })}</p>
          )}
          {utc && <p className="text-meta text-muted" data-calendar-utc>{t('Times in UTC: set your Outlook time zone')}</p>}
          {run && <p className="text-meta text-faint">{run}</p>}
        </div>
        <div className="flex items-center gap-1">
          {c.state === 'choose_calendar' ? (
            <Button size="sm" variant="primary" disabled={disabled} onClick={onChoose}>{t('Choose calendars')}</Button>
          ) : c.state === 'reconnect' ? (
            <Button size="sm" variant="primary" disabled={disabled} onClick={reconnect}>{t('Reconnect')}</Button>
          ) : (
            <Button size="sm" variant="ghost" icon="rotate-ccw" disabled={disabled || state === 'syncing' || !c.enabled} onClick={() => p.onSync(c)}>{t('Sync now')}</Button>
          )}
          <Menu label={t('Actions for {name}', { name: c.name })} trigger={<Icon name="ellipsis" />} kind="menu" triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ui-btn--icon">
            <MenuItem label={t('Choose calendars')} icon="calendar-days" disabled={disabled} onSelect={onChoose} />
            <MenuItem label={t('Reconnect')} icon="key-round" disabled={disabled} onSelect={reconnect} />
            <MenuItem label={c.enabled ? t('Disable') : t('Enable')} icon={c.enabled ? 'eye-off' : 'eye'} disabled={disabled} onSelect={() => void p.onPatch(c, { enabled: !c.enabled })} />
            <MenuItem label={t('Delete')} icon="trash-2" danger disabled={disabled} onSelect={onDelete} />
          </Menu>
        </div>
      </div>
    </Card>
  )
}

function OwnerRows({ p, disabled, on, onGoogle, onMicrosoft }: { p: CalendarSyncViewProps; disabled: boolean; on: boolean; onGoogle: () => void; onMicrosoft: () => void }) {
  const refused = p.microsoftClient?.refused_at != null
  return (
    <>
      {p.enabled !== null && (
        <SettingRow label={rowCopy('calendar-sync', 'server', { variant: 'owner' }).label}
          description={p.isOwner || !on ? rowCopy('calendar-sync', 'server', { variant: p.isOwner ? 'owner' : 'member' }).description : undefined}
          status={<StatusIndicator tone={toneForHue(on ? 'green' : 'slate')}>{on ? t('On') : t('Off')}</StatusIndicator>}
          control={p.isOwner && <Switch checked={on} disabled={disabled} onChange={p.onToggle} label={t('Allow calendar sync on this server')} hideLabel />} />
      )}
      {on && p.isOwner && p.googleClient && (
        <SettingRow {...rowCopy('calendar-sync', 'google')}
          status={<StatusIndicator tone={toneForHue(p.google ? 'green' : 'slate')}>{p.google ? t('Set up') : t('Not set up')}</StatusIndicator>}
          control={<Button size="sm" variant="ghost" disabled={disabled} onClick={onGoogle}>{p.google ? t('Change') : t('Set up')}</Button>} />
      )}
      {on && p.isOwner && p.microsoftClient && (
        <SettingRow {...rowCopy('calendar-sync', 'microsoft')}
          status={<StatusIndicator tone={toneForHue(refused ? 'red' : p.microsoft ? 'green' : 'slate')}>{refused ? t('Secret refused') : p.microsoft ? t('Set up') : t('Not set up')}</StatusIndicator>}
          control={<Button size="sm" variant="ghost" disabled={disabled} onClick={onMicrosoft}>{p.microsoft ? t('Change') : t('Set up')}</Button>} />
      )}
    </>
  )
}

export function CalendarSyncView(p: CalendarSyncViewProps) {
  const [deleting, setDeleting] = useState<CalendarConnection | null>(null)
  const [password, setPassword] = useState<CalendarConnection | null>(null)
  const [draft, setDraft] = useState<CalDAVDraft | null>(null)
  const [googleOpen, setGoogleOpen] = useState(false)
  const [microsoftOpen, setMicrosoftOpen] = useState(false)
  const [localChoose, setLocalChoose] = useState<string | null>(null)
  const chooseId = p.choose ?? localChoose
  const setChoose = (id: string | null) => (p.onChoose ? p.onChoose(id) : setLocalChoose(id))
  const disabled = !p.connected || p.busy
  const on = p.enabled === true
  const list = p.connections ?? []
  const choosing = list.find((c) => c.id === chooseId) ?? null
  const full = list.length >= p.maxConnections
  return (
    <SettingsSection {...cardCopy('calendar-sync')} testId="calendar-sync-panel">
      {!p.connected && <Notice>{noticeCopy('calendar-sync', 'offline')}</Notice>}
      <OwnerRows p={p} disabled={disabled} on={on} onGoogle={() => setGoogleOpen(true)} onMicrosoft={() => setMicrosoftOpen(true)} />
      {p.notice && <Notice>{p.notice}</Notice>}
      {p.error && !draft && !choosing && !password && !googleOpen && !microsoftOpen && <Notice tone="danger">{p.error}</Notice>}
      {on && (
        <>
          <SettingRow {...rowCopy('calendar-sync', 'connections', { values: { max: p.maxConnections } })}
            status={p.connections ? <span className="text-muted">{t('{n} of {max}', { n: list.length, max: p.maxConnections })}</span> : undefined}
            control={<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row" data-add-connection>
              <Button size="sm" icon="plus" className="w-full sm:w-auto" disabled={disabled || full} onClick={() => setDraft(emptyCalDAVDraft())}>{t('Connect CalDAV')}</Button>
              {p.google && <Button size="sm" icon="plus" className="w-full sm:w-auto" disabled={disabled || full} onClick={() => p.onConnectGoogle()}>{t('Connect Google')}</Button>}
              {p.microsoft && <Button size="sm" icon="plus" className="w-full sm:w-auto" disabled={disabled || full} onClick={() => p.onConnectMicrosoft()}>{t('Connect Microsoft')}</Button>}
            </div>} />
          {p.encrypted && <Notice>{noticeCopy('calendar-sync', 'encrypted')}</Notice>}
          {list.length > 0 && (
            <div className="space-y-2 py-3" data-testid="calendar-connections">
              {list.map((c) => <ConnectionCard key={c.id} c={c} p={p} disabled={disabled} onChoose={() => setChoose(c.id)} onPassword={() => setPassword(c)} onDelete={() => setDeleting(c)} />)}
            </div>
          )}
        </>
      )}
      {draft && (
        <CalDAVDialog draft={draft} busy={p.busy} connected={p.connected} error={p.error} onChange={setDraft} onClose={() => setDraft(null)}
          onSave={() => void p.onCreateCalDAV(draft).then((c) => { if (c) { setDraft(null); setChoose(c.id) } })} />
      )}
      {choosing && (
        <CalendarsDialog connection={choosing} busy={p.busy} connected={p.connected} error={p.error} onClose={() => setChoose(null)}
          onSave={(patch) => void p.onPatch(choosing, patch).then(() => setChoose(null), () => undefined)} />
      )}
      {password && (
        <PasswordDialog connection={password} busy={p.busy} connected={p.connected} error={p.error} onClose={() => setPassword(null)}
          onSave={(pw) => void p.onPatch(password, { password: pw }).then(() => setPassword(null), () => undefined)} />
      )}
      {googleOpen && p.googleClient && (
        <GoogleClientDialog setting={p.googleClient} busy={p.busy} connected={p.connected} error={p.error} onClose={() => setGoogleOpen(false)}
          onSave={(id, secret) => void p.onSaveGoogleClient(id, secret).then(() => setGoogleOpen(false), () => undefined)} />
      )}
      {microsoftOpen && p.microsoftClient && (
        <MicrosoftClientDialog setting={p.microsoftClient} busy={p.busy} connected={p.connected} error={p.error} now={p.now} onClose={() => setMicrosoftOpen(false)}
          onSave={(id, tenant, secret) => void p.onSaveMicrosoftClient(id, tenant, secret).then(() => setMicrosoftOpen(false), () => undefined)} />
      )}
      {deleting && (
        <ConfirmDialog title={t('Delete {name}?', { name: deleting.name })} confirmLabel={t('Delete')}
          consequence={t('Nothing is synced any more and the password or the Google or Microsoft access is removed from the server. Your tasks stay as they are; the {n, plural, one {# event} other {# events}} already written stay in the calendar.', { n: deleting.event_count })}
          onConfirm={async () => { await p.onDelete(deleting); setDeleting(null) }} onCancel={() => setDeleting(null)} />
      )}
    </SettingsSection>
  )
}

/** Reads (and removes) the result a Google or Microsoft sign-in left in the address. */
function takeSignInResult(): { result: string; id: string | null; provider: string | null } | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const result = url.searchParams.get('calendar-sync')
  if (!result) return null
  const id = url.searchParams.get('connection')
  const provider = url.searchParams.get('provider')
  url.searchParams.delete('calendar-sync')
  url.searchParams.delete('connection')
  url.searchParams.delete('provider')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  return { result, id, provider }
}

export function CalendarSyncPanel({ isOwner }: { isOwner: boolean }) {
  const { enabled: encrypted } = useEncryption()
  const [google, setGoogle] = useState(false)
  const [microsoft, setMicrosoft] = useState(false)
  const [microsoftClient, setMicrosoftClient] = useState<MicrosoftClientSetting | null>(null)
  const [maxConnections, setMax] = useState(3)
  const [googleClient, setGoogleClient] = useState<GoogleClientSetting | null>(null)
  const [syncing, setSyncing] = useState<ReadonlySet<string>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)
  const [choose, setChoose] = useState<string | null>(null)
  const server = useServerList({
    setting: api.calendarSyncSwitch.get,
    onSetting: (s) => {
      setGoogle(s.google)
      setMicrosoft(!!s.microsoft)
      setMax(s.max_connections || 3)
    },
    list: async () => (await api.listCalendarConnections()).connections,
    afterList: async (s) => {
      if (!s.enabled || !isOwner) return
      // A server from before outlook-calendar-sync has no Microsoft client route.
      const [g, m] = await Promise.all([api.getGoogleClient(), api.getMicrosoftClient().catch(() => null)])
      setGoogleClient(g)
      setMicrosoftClient(m)
    },
    cached: cachedCalendarConnections,
    cache: cacheCalendarConnections,
    reloadKey: isOwner,
  })
  const { enabled, setEnabled, rows: connections, upsert, connected, load, busy, error, run, act } = server
  useSettingsPending(enabled === null || (enabled && connections === null))
  useEffect(() => {
    const back = takeSignInResult()
    if (back) {
      setNotice(back.provider === 'microsoft' ? microsoftResultText(back.result) : googleResultText(back.result))
      if (back.result === 'connected' && back.id) setChoose(back.id)
    }
  }, [])

  return (
    <CalendarSyncView isOwner={isOwner} enabled={enabled} google={google} microsoft={microsoft} maxConnections={maxConnections} googleClient={googleClient}
      microsoftClient={microsoftClient}
      connected={connected} encrypted={encrypted} connections={connections} busy={busy} syncing={syncing} error={error} notice={notice}
      choose={choose} onChoose={setChoose}
      onToggle={(on) => void run(async () => {
        await api.calendarSyncSwitch.put(on)
        setEnabled(on)
        if (on) await load()
      })}
      onSaveGoogleClient={(id, secret) => act(async () => {
        const s = await api.putGoogleClient({ client_id: id, ...(secret ? { client_secret: secret } : {}) })
        setGoogleClient(s)
        setGoogle(!!s.client_id && s.secret_set)
      })}
      onSaveMicrosoftClient={(id, tenant, secret) => act(async () => {
        const s = await api.putMicrosoftClient({ client_id: id, tenant, ...(secret ? { client_secret: secret } : {}) })
        setMicrosoftClient(s)
        setMicrosoft(!!s.client_id && s.secret_set)
        if (secret) await load()
      })}
      onCreateCalDAV={(d) => act(async () => {
        const res = await api.createCalendarConnection({ server_url: d.server_url, username: d.username, password: d.password, ...(d.name.trim() ? { name: d.name.trim() } : {}) })
        upsert(res.connection)
        return res.connection
      }).catch(() => null)}
      onConnectGoogle={(c) => void run(async () => {
        const { url } = await api.startGoogleCalendar(c?.id)
        window.location.assign(url)
      })}
      onConnectMicrosoft={(c) => void run(async () => {
        const { url } = await api.startMicrosoftCalendar(c?.id)
        window.location.assign(url)
      })}
      onPatch={(c, patch) => act(async () => {
        upsert((await api.patchCalendarConnection(c.id, patch)).connection)
        if (patch.read || patch.target) void refreshEvents()
      })}
      onSync={(c) => {
        setSyncing((s) => new Set(s).add(c.id))
        void run(async () => {
          const res = await api.syncCalendarConnection(c.id)
          upsert(res.connection)
          void refreshEvents()
        }).finally(() => setSyncing((s) => { const n = new Set(s); n.delete(c.id); return n }))
      }}
      onDelete={(c) => act(async () => {
        await api.deleteCalendarConnection(c.id)
        server.remove(c.id)
        void refreshEvents()
      })} />
  )
}

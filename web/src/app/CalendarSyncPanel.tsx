import { useCallback, useEffect, useState } from 'react'
import { Button, Card, ConfirmDialog, Icon, Menu, MenuItem, Notice, SettingRow, SettingsSection, StatusIndicator, Switch, type HueName, toneForHue } from '../ui'
import { api, ApiError, isNetworkError } from '../lib/api'
import { refreshEvents } from '../lib/calendarFeeds'
import { cacheCalendarConnections, cachedCalendarConnections } from '../lib/localData'
import { useEncryption } from '../lib/e2ee'
import { useOnline } from '../lib/online'
import type { CalendarConnection, CalendarConnectionPatch, GoogleClientSetting } from '../lib/types'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'
import { ago } from './CalendarFeedsPanel'
import { CalDAVDialog, CalendarsDialog, emptyCalDAVDraft, GoogleClientDialog, PasswordDialog, type CalDAVDraft } from './CalendarSyncDialogs'
import { useSettingsPending } from './settingsPending'

// Settings → Integrations → Calendar sync (OpenSpec change calendar-two-way): the
// owner's switch and Google client, and the user's calendar accounts as cards that
// lead with their state. The pure CalendarSyncView renders every state;
// CalendarSyncPanel loads and acts. Connections are server data: offline, the last
// loaded cards stay with actions off.

/** A stored reason (calendar-two-way design D11) as a sentence. */
export function syncReasonText(reason: string): string {
  switch (reason) {
    case 'unauthorized': return t('The calendar server refused the password or the Google grant. Reconnect.')
    case 'secret_missing': return t('No password is stored, for example after a restore. Reconnect.')
    case 'google_not_configured': return t('The server owner removed the Google client.')
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
  maxConnections: number
  googleClient: GoogleClientSetting | null
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
  onCreateCalDAV: (d: CalDAVDraft) => Promise<CalendarConnection | null>
  onConnectGoogle: (c?: CalendarConnection) => void
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
  const host = c.provider === 'google' ? 'Google Calendar' : c.server_url.replace(/^https?:\/\//, '')
  const reconnect = () => (c.provider === 'google' ? p.onConnectGoogle(c) : onPassword())
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

function OwnerRows({ p, disabled, on, onGoogle }: { p: CalendarSyncViewProps; disabled: boolean; on: boolean; onGoogle: () => void }) {
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
    </>
  )
}

export function CalendarSyncView(p: CalendarSyncViewProps) {
  const [deleting, setDeleting] = useState<CalendarConnection | null>(null)
  const [password, setPassword] = useState<CalendarConnection | null>(null)
  const [draft, setDraft] = useState<CalDAVDraft | null>(null)
  const [googleOpen, setGoogleOpen] = useState(false)
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
      <OwnerRows p={p} disabled={disabled} on={on} onGoogle={() => setGoogleOpen(true)} />
      {p.notice && <Notice>{p.notice}</Notice>}
      {p.error && !draft && !choosing && !password && !googleOpen && <Notice tone="danger">{p.error}</Notice>}
      {on && (
        <>
          <SettingRow {...rowCopy('calendar-sync', 'connections', { values: { max: p.maxConnections } })}
            status={p.connections ? <span className="text-muted">{t('{n} of {max}', { n: list.length, max: p.maxConnections })}</span> : undefined}
            control={<>
              <Button size="sm" icon="plus" disabled={disabled || full} onClick={() => setDraft(emptyCalDAVDraft())}>{t('Connect CalDAV')}</Button>
              {p.google && <Button size="sm" icon="plus" disabled={disabled || full} onClick={() => p.onConnectGoogle()}>{t('Connect Google')}</Button>}
            </>} />
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
      {deleting && (
        <ConfirmDialog title={t('Delete {name}?', { name: deleting.name })} confirmLabel={t('Delete')}
          consequence={t('Nothing is synced any more and the password or Google access is removed from the server. Your tasks stay as they are; the {n, plural, one {# event} other {# events}} already written stay in the calendar.', { n: deleting.event_count })}
          onConfirm={async () => { await p.onDelete(deleting); setDeleting(null) }} onCancel={() => setDeleting(null)} />
      )}
    </SettingsSection>
  )
}

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message.charAt(0).toUpperCase() + err.message.slice(1)
  if (isNetworkError(err)) return t('The server could not be reached.')
  return t('Something went wrong.')
}

/** Reads (and removes) the result Google's sign-in left in the address. */
function takeGoogleResult(): { result: string; id: string | null } | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const result = url.searchParams.get('calendar-sync')
  if (!result) return null
  const id = url.searchParams.get('connection')
  url.searchParams.delete('calendar-sync')
  url.searchParams.delete('connection')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  return { result, id }
}

export function CalendarSyncPanel({ isOwner }: { isOwner: boolean }) {
  const online = useOnline()
  const { enabled: encrypted } = useEncryption()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [google, setGoogle] = useState(false)
  const [maxConnections, setMax] = useState(3)
  const [googleClient, setGoogleClient] = useState<GoogleClientSetting | null>(null)
  const [connections, setConnections] = useState<CalendarConnection[] | null>(null)
  useSettingsPending(enabled === null || (enabled && connections === null))
  const [unreachable, setUnreachable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [syncing, setSyncing] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [choose, setChoose] = useState<string | null>(null)

  const keep = useCallback((list: CalendarConnection[]) => {
    setConnections(list)
    void cacheCalendarConnections(list).catch(() => undefined)
  }, [])
  const load = useCallback(async () => {
    try {
      const s = await api.getCalendarSyncSetting()
      setEnabled(s.enabled)
      setGoogle(s.google)
      setMax(s.max_connections || 3)
      setUnreachable(false)
      if (s.enabled) keep((await api.listCalendarConnections()).connections)
      if (s.enabled && isOwner) setGoogleClient(await api.getGoogleClient())
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      else setError(describe(err))
    }
  }, [keep, isOwner])
  useEffect(() => {
    const back = takeGoogleResult()
    if (back) {
      setNotice(googleResultText(back.result))
      if (back.result === 'connected' && back.id) setChoose(back.id)
    }
    void cachedCalendarConnections().then((cached) => {
      if (cached.length) {
        setConnections((cur) => cur ?? cached)
        setEnabled((cur) => cur ?? true)
      }
    }).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (online) void load()
  }, [online, load])

  const connected = online && !unreachable
  const upsert = (c: CalendarConnection) => {
    const list = connections ?? []
    keep(list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c])
  }
  async function act<T>(action: () => Promise<T>): Promise<T> {
    setError(null)
    setBusy(true)
    try {
      return await action()
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      setError(describe(err))
      throw err
    } finally {
      setBusy(false)
    }
  }
  const quiet = (action: () => Promise<void>) => act(action).catch(() => undefined)

  return (
    <CalendarSyncView isOwner={isOwner} enabled={enabled} google={google} maxConnections={maxConnections} googleClient={googleClient}
      connected={connected} encrypted={encrypted} connections={connections} busy={busy} syncing={syncing} error={error} notice={notice}
      choose={choose} onChoose={setChoose}
      onToggle={(on) => void quiet(async () => {
        await api.putCalendarSyncSetting(on)
        setEnabled(on)
        if (on) await load()
      })}
      onSaveGoogleClient={(id, secret) => act(async () => {
        const s = await api.putGoogleClient({ client_id: id, ...(secret ? { client_secret: secret } : {}) })
        setGoogleClient(s)
        setGoogle(!!s.client_id && s.secret_set)
      })}
      onCreateCalDAV={(d) => act(async () => {
        const res = await api.createCalendarConnection({ server_url: d.server_url, username: d.username, password: d.password, ...(d.name.trim() ? { name: d.name.trim() } : {}) })
        upsert(res.connection)
        return res.connection
      }).catch(() => null)}
      onConnectGoogle={(c) => void quiet(async () => {
        const { url } = await api.startGoogleCalendar(c?.id)
        window.location.assign(url)
      })}
      onPatch={(c, patch) => act(async () => {
        upsert((await api.patchCalendarConnection(c.id, patch)).connection)
        if (patch.read || patch.target) void refreshEvents()
      })}
      onSync={(c) => {
        setSyncing((s) => new Set(s).add(c.id))
        void quiet(async () => {
          const res = await api.syncCalendarConnection(c.id)
          upsert(res.connection)
          void refreshEvents()
        }).finally(() => setSyncing((s) => { const n = new Set(s); n.delete(c.id); return n }))
      }}
      onDelete={(c) => act(async () => {
        await api.deleteCalendarConnection(c.id)
        keep((connections ?? []).filter((x) => x.id !== c.id))
        void refreshEvents()
      })} />
  )
}

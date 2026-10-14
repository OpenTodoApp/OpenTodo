import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { cacheBackupStatus, cachedBackupStatus, defaultBackupSettings, formatBytes, runSummary, scheduleLabel, WEEKDAYS } from '../lib/backups'
import { useOnline } from '../lib/online'
import type { BackupDestination, BackupRun, BackupSecretFlags, BackupSecretUpdate, BackupSettings, BackupStatus } from '../lib/types'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Card'
import { Field, Input, Select } from '../ui/Field'
import { Icon, type IconName } from '../ui/Icon'
import { Checkbox } from '../ui/Switch'
import { ListRow } from '../ui/patterns/ListRow'
import { Notice } from '../ui/patterns/Notice'
import { SettingRow, SettingsSection } from '../ui/patterns/SettingsSection'
import type { HueName } from '../ui/tokens/palette'
import { useDateTimeFormat } from './DateTimePrefsProvider'

const POLL_MS = 1000

export interface SecretInputs {
  s3SecretKey: string
  webdavPassword: string
  passphrase: string
  removePassphrase: boolean
  acknowledged: boolean
}

const EMPTY_SECRETS: SecretInputs = { s3SecretKey: '', webdavPassword: '', passphrase: '', removePassphrase: false, acknowledged: false }

type Busy = null | 'saving' | 'testing' | 'starting'

export interface BackupsPanelViewProps {
  draft: BackupSettings
  flags: BackupSecretFlags
  status: BackupStatus | null
  secrets: SecretInputs
  /** No connection to the server: show cached status, disable every action. */
  offline: boolean
  busy: Busy
  message: string | null
  error: string | null
  /** Open the settings form at first (tests and stories); otherwise it opens with "Change settings". */
  editing?: boolean
  onDraft: (next: BackupSettings) => void
  onSecrets: (next: SecretInputs) => void
  onSave: () => void
  onTest: () => void
  onRun: () => void
}

const RUN: Record<BackupRun['status'], { label: string; hue: HueName; icon: IconName }> = {
  succeeded: { label: 'Succeeded', hue: 'green', icon: 'check' },
  failed: { label: 'Failed', hue: 'red', icon: 'x' },
  running: { label: 'Running', hue: 'blue', icon: 'loader-circle' },
}

const DESTINATION_LABEL: Record<BackupDestination, string> = { local: 'Folder on the server', s3: 'S3-compatible', webdav: 'WebDAV' }

function destinationSummary(d: BackupSettings): string {
  if (d.destination === 'local') return d.local.dir || 'The backups folder inside the data directory'
  if (d.destination === 's3') return [d.s3.bucket, d.s3.prefix].filter(Boolean).join('/') || 'No bucket set'
  return d.webdav.url || 'No URL set'
}

/**
 * Presentational part of Settings → Backups: a summary of the schedule and the
 * last run, the settings as rows with an inline form behind "Change settings",
 * and the recent runs. Every control is native, so the page works with the keyboard alone.
 */
export function BackupsPanelView(p: BackupsPanelViewProps) {
  const dt = useDateTimeFormat()
  const { draft, flags, status, secrets, offline, busy } = p
  const [editing, setEditing] = useState(p.editing ?? false)
  const disabled = offline || busy !== null
  const running = status?.running ?? null
  const set = (patch: Partial<BackupSettings>) => p.onDraft({ ...draft, ...patch })
  const needsAck = secrets.passphrase !== '' && !secrets.acknowledged
  const schedule = draft.schedule.frequency === 'off' ? 'Off (manual backups only)' : scheduleLabel(draft.schedule)
  const retention = `Keep the last ${draft.retention.keepLast}${draft.retention.maxAgeDays > 0 ? `, delete after ${draft.retention.maxAgeDays} days` : ''}${draft.compress ? ' · compressed' : ''}`

  function submit(e: FormEvent) {
    e.preventDefault()
    p.onSave()
  }

  return (
    <SettingsSection title="Backups" helpId="settings/backups" headingId="backups-heading"
      description={<>Scheduled copies of the whole server (every account, task and the sync log), written to a folder on the server, an S3-compatible bucket or a WebDAV share. Restore with <code className="rounded-chip bg-sunken px-1 font-mono text-default">opentodo restore</code>.</>}>
      {offline && (
        <div data-testid="backups-offline" className="py-3 first:pt-0">
          <Notice tone="warning">You are offline. Backups run on the server, so changing settings and starting a backup need a connection. The status below is the last one fetched.</Notice>
        </div>
      )}

      <div className="space-y-2 py-3 first:pt-0" role="status" aria-live="polite" data-testid="backups-status">
        {status === null ? (
          <p className="text-meta text-faint">{offline ? 'No status fetched yet.' : 'Loading status…'}</p>
        ) : (
          <div className="grid gap-1 text-sm text-default">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Schedule:</span> {status.enabled ? scheduleLabel(status.schedule) : 'Off (manual backups only)'}
              {status.encrypted && <Badge hue="slate" title="Archives are encrypted with your passphrase"><Icon name="lock" size="xs" /> encrypted</Badge>}
            </p>
            {status.nextRunAt !== null && <p><span className="font-medium">Next run:</span> <span className="text-muted">{dt.formatInstant(status.nextRunAt, 'datetime')}</span></p>}
            {running && <p data-testid="backups-running"><Badge hue="blue">Backup in progress…</Badge></p>}
            {status.lastRun && (
              <p className="flex flex-wrap items-center gap-2" data-testid="backups-last">
                <span className="font-medium">Last run:</span>
                <Badge hue={RUN[status.lastRun.status].hue} tone={status.lastRun.status === 'failed' ? 'solid' : 'soft'}>{RUN[status.lastRun.status].label}</Badge>
                <span className={status.lastRun.status === 'failed' ? 'text-danger' : 'text-muted'}>{runSummary(status.lastRun)}</span>
              </p>
            )}
            {!status.lastRun && !running && <p className="text-faint">No backup has run yet.</p>}
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="primary" icon="rotate-ccw" disabled={disabled || running !== null} busy={busy === 'starting'} onClick={p.onRun}>
            {busy === 'starting' || running ? 'Backing up…' : 'Back up now'}
          </Button>
          <Button variant="secondary" disabled={disabled || needsAck} busy={busy === 'testing'} onClick={p.onTest}>
            {busy === 'testing' ? 'Testing…' : 'Test destination'}
          </Button>
        </div>
        {p.message && <Notice tone="success">{p.message}</Notice>}
        {p.error && <Notice tone="danger">{p.error}</Notice>}
      </div>

      {!editing && (
        <>
          <SettingRow label="Destination" status={<><span className="font-medium">{DESTINATION_LABEL[draft.destination]}</span> <span className="user-text text-muted">· {destinationSummary(draft)}</span></>}
            control={<Button variant="secondary" icon="pencil" disabled={offline} onClick={() => setEditing(true)}>Change settings</Button>} />
          <SettingRow label="Schedule" status={schedule} />
          <SettingRow label="Retention" status={retention} />
          <SettingRow label="Encryption" status={flags.hasPassphrase ? <Badge hue="green"><Icon name="lock" size="xs" /> Encrypted with your passphrase</Badge> : 'Not encrypted'} />
        </>
      )}

      {editing && (
        <form onSubmit={submit} className="space-y-5 py-3" aria-label="Backup settings">
          <fieldset className="space-y-3" disabled={disabled}>
            <legend className="text-sm font-medium text-default">Destination</legend>
            <div className="flex flex-wrap gap-4 text-sm text-default" role="radiogroup" aria-label="Destination type">
              {(['local', 's3', 'webdav'] as BackupDestination[]).map((d) => (
                <label key={d} className="flex items-center gap-1.5">
                  <input type="radio" className="accent-(--ot-accent)" name="backup-destination" value={d} checked={draft.destination === d} onChange={() => set({ destination: d })} />
                  {DESTINATION_LABEL[d]}
                </label>
              ))}
            </div>

            {draft.destination === 'local' && (
              <Field label="Folder" description="Absolute path on the server. Empty: the backups folder inside the data directory.">
                <Input name="local-dir" placeholder="/data/backups" value={draft.local.dir} onChange={(e) => set({ local: { dir: e.target.value } })} />
              </Field>
            )}

            {draft.destination === 's3' && (
              <div className="grid gap-3 sm:grid-cols-2" data-testid="backups-s3">
                <Field label="Endpoint"><Input name="s3-endpoint" placeholder="https://s3.eu-central-1.amazonaws.com" value={draft.s3.endpoint} onChange={(e) => set({ s3: { ...draft.s3, endpoint: e.target.value } })} /></Field>
                <Field label="Region"><Input name="s3-region" placeholder="us-east-1" value={draft.s3.region} onChange={(e) => set({ s3: { ...draft.s3, region: e.target.value } })} /></Field>
                <Field label="Bucket"><Input name="s3-bucket" value={draft.s3.bucket} onChange={(e) => set({ s3: { ...draft.s3, bucket: e.target.value } })} /></Field>
                <Field label="Prefix"><Input name="s3-prefix" placeholder="opentodo" value={draft.s3.prefix} onChange={(e) => set({ s3: { ...draft.s3, prefix: e.target.value } })} /></Field>
                <Field label="Access key"><Input name="s3-access-key" autoComplete="off" value={draft.s3.accessKey} onChange={(e) => set({ s3: { ...draft.s3, accessKey: e.target.value } })} /></Field>
                <Field label="Secret key" description={flags.hasS3SecretKey ? 'Stored. Leave empty to keep it.' : 'Not set.'}>
                  <Input type="password" name="s3-secret-key" autoComplete="new-password" value={secrets.s3SecretKey} onChange={(e) => p.onSecrets({ ...secrets, s3SecretKey: e.target.value })} />
                </Field>
                <Checkbox className="sm:col-span-2" name="s3-path-style" checked={draft.s3.pathStyle} onChange={(e) => set({ s3: { ...draft.s3, pathStyle: e.target.checked } })}
                  label="Path-style addressing (MinIO, Garage and most self-hosted stores)" />
              </div>
            )}

            {draft.destination === 'webdav' && (
              <div className="grid gap-3 sm:grid-cols-2" data-testid="backups-webdav">
                <Field label="Collection URL" className="sm:col-span-2"><Input name="webdav-url" placeholder="https://cloud.example.com/remote.php/dav/files/me/opentodo/" value={draft.webdav.url} onChange={(e) => set({ webdav: { ...draft.webdav, url: e.target.value } })} /></Field>
                <Field label="Username"><Input name="webdav-username" autoComplete="off" value={draft.webdav.username} onChange={(e) => set({ webdav: { ...draft.webdav, username: e.target.value } })} /></Field>
                <Field label="Password" description={flags.hasWebdavPassword ? 'Stored. Leave empty to keep it.' : 'Not set.'}>
                  <Input type="password" name="webdav-password" autoComplete="new-password" value={secrets.webdavPassword} onChange={(e) => p.onSecrets({ ...secrets, webdavPassword: e.target.value })} />
                </Field>
                <Checkbox className="sm:col-span-2" name="webdav-allow-http" checked={draft.webdav.allowHttp} onChange={(e) => set({ webdav: { ...draft.webdav, allowHttp: e.target.checked } })}
                  label="Allow plain http (the password is sent unencrypted; only on a trusted network)" />
              </div>
            )}
          </fieldset>

          <fieldset className="flex flex-wrap items-end gap-3" disabled={disabled}>
            <legend className="mb-1 text-sm font-medium text-default">Schedule</legend>
            <Field label="Frequency">
              <Select className="w-36" name="schedule-frequency" value={draft.schedule.frequency} onChange={(e) => set({ schedule: { ...draft.schedule, frequency: e.target.value as BackupSettings['schedule']['frequency'] } })}>
                <option value="off">Off</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </Select>
            </Field>
            {draft.schedule.frequency === 'weekly' && (
              <Field label="Day">
                <Select className="w-36" name="schedule-weekday" value={draft.schedule.weekday} onChange={(e) => set({ schedule: { ...draft.schedule, weekday: Number(e.target.value) } })}>
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </Select>
              </Field>
            )}
            {draft.schedule.frequency !== 'off' && (
              <Field label={draft.schedule.frequency === 'hourly' ? 'At (minutes count)' : 'Time (server time)'}>
                <Input className="w-32" name="schedule-time" type="time" value={draft.schedule.time} onChange={(e) => set({ schedule: { ...draft.schedule, time: e.target.value } })} />
              </Field>
            )}
          </fieldset>

          <fieldset className="flex flex-wrap items-end gap-3" disabled={disabled}>
            <legend className="mb-1 text-sm font-medium text-default">Retention</legend>
            <Field label="Keep the last">
              <Input className="w-24" name="retention-keep" type="number" min={1} value={draft.retention.keepLast} onChange={(e) => set({ retention: { ...draft.retention, keepLast: Number(e.target.value) } })} />
            </Field>
            <Field label="Delete older than (days, 0 = never)">
              <Input className="w-24" name="retention-age" type="number" min={0} value={draft.retention.maxAgeDays} onChange={(e) => set({ retention: { ...draft.retention, maxAgeDays: Number(e.target.value) } })} />
            </Field>
            <Checkbox className="pb-2" name="compress" checked={draft.compress} onChange={(e) => set({ compress: e.target.checked })} label="Compress (gzip)" />
          </fieldset>

          <fieldset className="space-y-3" disabled={disabled}>
            <legend className="text-sm font-medium text-default">Encryption</legend>
            <p className="text-meta text-muted">
              {flags.hasPassphrase ? 'Backups are encrypted with your passphrase. Enter a new one to change it (future backups only).' : 'Optional. With a passphrase, archives are encrypted (AES-256-GCM) before they leave the server.'}
            </p>
            <Field label={flags.hasPassphrase ? 'New passphrase' : 'Passphrase'} className="max-w-sm">
              <Input type="password" name="passphrase" autoComplete="new-password" value={secrets.passphrase} onChange={(e) => p.onSecrets({ ...secrets, passphrase: e.target.value, removePassphrase: false })} />
            </Field>
            {secrets.passphrase !== '' && (
              <div className="space-y-2 rounded-control bg-warning-soft p-3 text-meta text-on-warning-soft" role="alert" data-testid="backups-passphrase-warning">
                <p className="font-medium">A forgotten passphrase cannot be recovered.</p>
                <p>Without it, encrypted backups are unreadable, for you and for anyone else. Store it in a password manager.</p>
                <Checkbox name="passphrase-ack" checked={secrets.acknowledged} onChange={(e) => p.onSecrets({ ...secrets, acknowledged: e.target.checked })} label="I have stored the passphrase somewhere safe" />
              </div>
            )}
            {flags.hasPassphrase && secrets.passphrase === '' && (
              <Checkbox name="passphrase-remove" checked={secrets.removePassphrase} onChange={(e) => p.onSecrets({ ...secrets, removePassphrase: e.target.checked })} label="Stop encrypting future backups" />
            )}
          </fieldset>

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)}>Close</Button>
            <Button type="submit" variant="primary" disabled={disabled || needsAck} busy={busy === 'saving'}>{busy === 'saving' ? 'Saving…' : 'Save backup settings'}</Button>
          </div>
        </form>
      )}

      {status && status.history.length > 0 && (
        <div className="py-3 last:pb-0">
          <h3 className="mb-1 text-sm font-medium text-default">Recent runs</h3>
          <ul className="-mx-3" aria-label="Backup history" data-testid="backups-history">
            {status.history.map((r) => (
              <li key={r.id}>
                <ListRow
                  leading={<Icon name={RUN[r.status].icon} size="md" className={r.status === 'running' ? 'animate-spin motion-reduce:animate-none' : undefined} />}
                  label={`${dt.formatInstant(r.startedAt, 'datetime')} · ${r.kind}`}
                  ariaLabel={`${RUN[r.status].label} backup, ${dt.formatInstant(r.startedAt, 'datetime')}, ${r.kind}`}
                  meta={r.error || (r.status === 'succeeded' ? `${formatBytes(r.bytes)}${r.destination ? ` · ${r.destination}` : ''}` : undefined)}
                  badges={<Badge hue={RUN[r.status].hue}>{RUN[r.status].label}</Badge>}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </SettingsSection>
  )
}

function describe(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'conflict') return 'A backup is already running.'
    return err.message
  }
  return 'The server is unreachable. Backups need a connection.'
}

function secretUpdate(s: SecretInputs, destination: BackupDestination): BackupSecretUpdate {
  const u: BackupSecretUpdate = {}
  if (destination === 's3' && s.s3SecretKey) u.s3SecretKey = s.s3SecretKey
  if (destination === 'webdav' && s.webdavPassword) u.webdavPassword = s.webdavPassword
  if (s.passphrase) u.passphrase = s.passphrase
  else if (s.removePassphrase) u.passphrase = ''
  return u
}

/** Owner-only Settings section: data fetching, saving and run polling. */
export function BackupsPanel() {
  const online = useOnline()
  const [draft, setDraft] = useState<BackupSettings>(defaultBackupSettings)
  const [flags, setFlags] = useState<BackupSecretFlags>({ hasS3SecretKey: false, hasWebdavPassword: false, hasPassphrase: false })
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [secrets, setSecrets] = useState<SecretInputs>(EMPTY_SECRETS)
  const [unreachable, setUnreachable] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dirty = useRef(false)
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshStatus = useCallback(async (): Promise<BackupStatus | null> => {
    try {
      const s = await api.backupStatus()
      setStatus(s)
      setUnreachable(false)
      void cacheBackupStatus(s)
      return s
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      else setError(describe(err))
      return null
    }
  }, [])

  // Poll while a run is in progress so its outcome appears without a reload.
  const poll = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current)
    pollTimer.current = setTimeout(async () => {
      const s = await refreshStatus()
      if (s?.running) poll()
    }, POLL_MS)
  }, [refreshStatus])

  const load = useCallback(async () => {
    try {
      const res = await api.backupSettings()
      if (!dirty.current) setDraft(res.settings)
      setFlags(res.secrets)
      const s = await refreshStatus()
      if (s?.running) poll()
    } catch (err) {
      if (isNetworkError(err)) setUnreachable(true)
      else setError(describe(err))
    }
  }, [refreshStatus, poll])

  useEffect(() => {
    void cachedBackupStatus().then((s) => setStatus((cur) => cur ?? s))
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current)
    }
  }, [])
  useEffect(() => {
    if (online) void load()
  }, [online, load])

  async function save(): Promise<boolean> {
    setError(null)
    setMessage(null)
    setBusy('saving')
    try {
      const res = await api.saveBackupSettings(draft, secretUpdate(secrets, draft.destination))
      setDraft(res.settings)
      setFlags(res.secrets)
      setSecrets(EMPTY_SECRETS)
      dirty.current = false
      await refreshStatus()
      setMessage('Backup settings saved.')
      return true
    } catch (err) {
      setError(describe(err))
      return false
    } finally {
      setBusy(null)
    }
  }

  async function test() {
    // The test uses the saved settings; save pending edits first.
    if (dirty.current && !(await save())) return
    setError(null)
    setMessage(null)
    setBusy('testing')
    try {
      await api.testBackupDestination()
      setMessage('Destination works: a test file was written and deleted.')
    } catch (err) {
      setError(describe(err))
    } finally {
      setBusy(null)
    }
  }

  async function run() {
    setError(null)
    setMessage(null)
    setBusy('starting')
    try {
      await api.runBackup()
      await refreshStatus()
      poll()
    } catch (err) {
      setError(describe(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <BackupsPanelView
      draft={draft}
      flags={flags}
      status={status}
      secrets={secrets}
      offline={!online || unreachable}
      busy={busy}
      message={message}
      error={error}
      onDraft={(next) => {
        dirty.current = true
        setDraft(next)
      }}
      onSecrets={(next) => {
        dirty.current = true
        setSecrets(next)
      }}
      onSave={() => void save()}
      onTest={() => void test()}
      onRun={() => void run()}
    />
  )
}

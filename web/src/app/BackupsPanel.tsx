import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { HelpHeading } from './help/HelpLink'
import { api, ApiError, isNetworkError } from '../lib/api'
import { cacheBackupStatus, cachedBackupStatus, defaultBackupSettings, formatBytes, runSummary, scheduleLabel, WEEKDAYS } from '../lib/backups'
import { useOnline } from '../lib/online'
import type { BackupDestination, BackupSecretFlags, BackupSecretUpdate, BackupSettings, BackupStatus } from '../lib/types'

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
  onDraft: (next: BackupSettings) => void
  onSecrets: (next: SecretInputs) => void
  onSave: () => void
  onTest: () => void
  onRun: () => void
}

/**
 * Presentational part of Settings → Backups. Every control is a native input,
 * select or button, so the whole form is reachable with Tab and operable with
 * the keyboard alone.
 */
export function BackupsPanelView(p: BackupsPanelViewProps) {
  const { draft, flags, status, secrets, offline, busy } = p
  const disabled = offline || busy !== null
  const running = status?.running ?? null
  const set = (patch: Partial<BackupSettings>) => p.onDraft({ ...draft, ...patch })
  const needsAck = secrets.passphrase !== '' && !secrets.acknowledged

  function submit(e: FormEvent) {
    e.preventDefault()
    p.onSave()
  }

  return (
    <section className="space-y-3" aria-labelledby="backups-heading">
      <HelpHeading screen="settings/backups" id="backups-heading" className="font-semibold">Backups</HelpHeading>
      <p className="text-sm text-muted">
        Scheduled copies of the whole server (every account, task and the sync log), written to a folder on the server, an S3-compatible bucket or a WebDAV share. Restore with <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">opentodo restore</code>; see docs/backups.md.
      </p>

      {offline && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200" role="status" data-testid="backups-offline">
          You are offline. Backups run on the server, so changing settings and starting a backup need a connection. The status below is the last one fetched.
        </p>
      )}

      <div className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800" role="status" aria-live="polite" data-testid="backups-status">
        {status === null ? (
          <p className="text-faint">{offline ? 'No status fetched yet.' : 'Loading status…'}</p>
        ) : (
          <div className="space-y-1">
            <p>
              <span className="font-medium">Schedule:</span> {status.enabled ? scheduleLabel(status.schedule) : 'Off (manual backups only)'}
              {status.encrypted && (
                <span className="ml-2 inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800" title="Archives are encrypted with your passphrase">
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor"><path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V7H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 6H6V4.5a2 2 0 1 1 4 0V7Z" /></svg>
                  encrypted
                </span>
              )}
            </p>
            {status.nextRunAt !== null && <p><span className="font-medium">Next run:</span> {new Date(status.nextRunAt).toLocaleString()}</p>}
            {running && <p className="text-sky-700 dark:text-sky-300" data-testid="backups-running">Backup in progress…</p>}
            {status.lastRun && (
              <p className={status.lastRun.status === 'failed' ? 'text-red-600 dark:text-red-400' : ''} data-testid="backups-last">
                <span className="font-medium">Last run:</span> {runSummary(status.lastRun)}
              </p>
            )}
            {!status.lastRun && !running && <p className="text-faint">No backup has run yet.</p>}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={disabled || running !== null} onClick={p.onRun}>
          {busy === 'starting' || running ? 'Backing up…' : 'Back up now'}
        </button>
        <button type="button" className="btn-ghost border border-slate-300 dark:border-slate-700" disabled={disabled || needsAck} onClick={p.onTest}>
          {busy === 'testing' ? 'Testing…' : 'Test destination'}
        </button>
      </div>
      {p.message && <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">{p.message}</p>}
      {p.error && <p className="text-sm text-red-600 dark:text-red-400" role="alert">{p.error}</p>}

      <form onSubmit={submit} className="space-y-4">
        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-sm font-medium">Destination</legend>
          <div className="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label="Destination type">
            {(['local', 's3', 'webdav'] as BackupDestination[]).map((d) => (
              <label key={d} className="flex items-center gap-1.5">
                <input type="radio" name="backup-destination" value={d} checked={draft.destination === d} onChange={() => set({ destination: d })} />
                {d === 'local' ? 'Folder on the server' : d === 's3' ? 'S3-compatible' : 'WebDAV'}
              </label>
            ))}
          </div>

          {draft.destination === 'local' && (
            <Field label="Folder" hint="Absolute path on the server. Empty: the backups folder inside the data directory.">
              <input className="input" name="local-dir" placeholder="/data/backups" value={draft.local.dir} onChange={(e) => set({ local: { dir: e.target.value } })} />
            </Field>
          )}

          {draft.destination === 's3' && (
            <div className="grid gap-2 sm:grid-cols-2" data-testid="backups-s3">
              <Field label="Endpoint"><input className="input" name="s3-endpoint" placeholder="https://s3.eu-central-1.amazonaws.com" value={draft.s3.endpoint} onChange={(e) => set({ s3: { ...draft.s3, endpoint: e.target.value } })} /></Field>
              <Field label="Region"><input className="input" name="s3-region" placeholder="us-east-1" value={draft.s3.region} onChange={(e) => set({ s3: { ...draft.s3, region: e.target.value } })} /></Field>
              <Field label="Bucket"><input className="input" name="s3-bucket" value={draft.s3.bucket} onChange={(e) => set({ s3: { ...draft.s3, bucket: e.target.value } })} /></Field>
              <Field label="Prefix"><input className="input" name="s3-prefix" placeholder="opentodo" value={draft.s3.prefix} onChange={(e) => set({ s3: { ...draft.s3, prefix: e.target.value } })} /></Field>
              <Field label="Access key"><input className="input" name="s3-access-key" autoComplete="off" value={draft.s3.accessKey} onChange={(e) => set({ s3: { ...draft.s3, accessKey: e.target.value } })} /></Field>
              <Field label="Secret key" hint={flags.hasS3SecretKey ? 'Stored. Leave empty to keep it.' : 'Not set.'}>
                <input className="input" name="s3-secret-key" type="password" autoComplete="new-password" value={secrets.s3SecretKey} onChange={(e) => p.onSecrets({ ...secrets, s3SecretKey: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="s3-path-style" checked={draft.s3.pathStyle} onChange={(e) => set({ s3: { ...draft.s3, pathStyle: e.target.checked } })} />
                Path-style addressing (MinIO, Garage and most self-hosted stores)
              </label>
            </div>
          )}

          {draft.destination === 'webdav' && (
            <div className="grid gap-2 sm:grid-cols-2" data-testid="backups-webdav">
              <Field label="Collection URL" className="sm:col-span-2"><input className="input" name="webdav-url" placeholder="https://cloud.example.com/remote.php/dav/files/me/opentodo/" value={draft.webdav.url} onChange={(e) => set({ webdav: { ...draft.webdav, url: e.target.value } })} /></Field>
              <Field label="Username"><input className="input" name="webdav-username" autoComplete="off" value={draft.webdav.username} onChange={(e) => set({ webdav: { ...draft.webdav, username: e.target.value } })} /></Field>
              <Field label="Password" hint={flags.hasWebdavPassword ? 'Stored. Leave empty to keep it.' : 'Not set.'}>
                <input className="input" name="webdav-password" type="password" autoComplete="new-password" value={secrets.webdavPassword} onChange={(e) => p.onSecrets({ ...secrets, webdavPassword: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="webdav-allow-http" checked={draft.webdav.allowHttp} onChange={(e) => set({ webdav: { ...draft.webdav, allowHttp: e.target.checked } })} />
                Allow plain http (the password is sent unencrypted; only on a trusted network)
              </label>
            </div>
          )}
        </fieldset>

        <fieldset className="flex flex-wrap items-end gap-2" disabled={disabled}>
          <legend className="mb-1 text-sm font-medium">Schedule</legend>
          <Field label="Frequency">
            <select className="input w-36" name="schedule-frequency" value={draft.schedule.frequency} onChange={(e) => set({ schedule: { ...draft.schedule, frequency: e.target.value as BackupSettings['schedule']['frequency'] } })}>
              <option value="off">Off</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </Field>
          {draft.schedule.frequency === 'weekly' && (
            <Field label="Day">
              <select className="input w-36" name="schedule-weekday" value={draft.schedule.weekday} onChange={(e) => set({ schedule: { ...draft.schedule, weekday: Number(e.target.value) } })}>
                {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </Field>
          )}
          {draft.schedule.frequency !== 'off' && (
            <Field label={draft.schedule.frequency === 'hourly' ? 'At (minutes count)' : 'Time (server time)'}>
              <input className="input w-32" name="schedule-time" type="time" value={draft.schedule.time} onChange={(e) => set({ schedule: { ...draft.schedule, time: e.target.value } })} />
            </Field>
          )}
        </fieldset>

        <fieldset className="flex flex-wrap items-end gap-2" disabled={disabled}>
          <legend className="mb-1 text-sm font-medium">Retention</legend>
          <Field label="Keep the last">
            <input className="input w-24" name="retention-keep" type="number" min={1} value={draft.retention.keepLast} onChange={(e) => set({ retention: { ...draft.retention, keepLast: Number(e.target.value) } })} />
          </Field>
          <Field label="Delete older than (days, 0 = never)">
            <input className="input w-24" name="retention-age" type="number" min={0} value={draft.retention.maxAgeDays} onChange={(e) => set({ retention: { ...draft.retention, maxAgeDays: Number(e.target.value) } })} />
          </Field>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" name="compress" checked={draft.compress} onChange={(e) => set({ compress: e.target.checked })} /> Compress (gzip)
          </label>
        </fieldset>

        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-sm font-medium">Encryption</legend>
          <p className="text-xs text-muted">
            {flags.hasPassphrase ? 'Backups are encrypted with your passphrase. Enter a new one to change it (future backups only).' : 'Optional. With a passphrase, archives are encrypted (AES-256-GCM) before they leave the server.'}
          </p>
          <Field label={flags.hasPassphrase ? 'New passphrase' : 'Passphrase'}>
            <input className="input max-w-sm" name="passphrase" type="password" autoComplete="new-password" value={secrets.passphrase} onChange={(e) => p.onSecrets({ ...secrets, passphrase: e.target.value, removePassphrase: false })} />
          </Field>
          {secrets.passphrase !== '' && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" role="alert" data-testid="backups-passphrase-warning">
              <p className="font-medium">A forgotten passphrase cannot be recovered.</p>
              <p>Without it, encrypted backups are unreadable, for you and for anyone else. Store it in a password manager.</p>
              <label className="mt-2 flex items-center gap-2">
                <input type="checkbox" name="passphrase-ack" checked={secrets.acknowledged} onChange={(e) => p.onSecrets({ ...secrets, acknowledged: e.target.checked })} />
                I have stored the passphrase somewhere safe
              </label>
            </div>
          )}
          {flags.hasPassphrase && secrets.passphrase === '' && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="passphrase-remove" checked={secrets.removePassphrase} onChange={(e) => p.onSecrets({ ...secrets, removePassphrase: e.target.checked })} />
              Stop encrypting future backups
            </label>
          )}
        </fieldset>

        <button className="btn-primary" disabled={disabled || needsAck}>{busy === 'saving' ? 'Saving…' : 'Save backup settings'}</button>
      </form>

      {status && status.history.length > 0 && (
        <div>
          <h3 className="mb-1 text-sm font-medium">Recent runs</h3>
          <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800" aria-label="Backup history" data-testid="backups-history">
            {status.history.map((r) => (
              <li key={r.id} tabIndex={0} className="flex flex-wrap gap-x-3 py-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500">
                <span className={r.status === 'failed' ? 'text-red-600 dark:text-red-400' : r.status === 'running' ? 'text-sky-600' : 'text-emerald-700 dark:text-emerald-400'}>{r.status}</span>
                <span className="text-muted">{new Date(r.startedAt).toLocaleString()} · {r.kind}</span>
                {r.status === 'succeeded' && <span className="text-muted">{formatBytes(r.bytes)}</span>}
                {r.error && <span className="w-full break-words text-xs text-muted">{r.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block text-sm ${className ?? ''}`}>
      <span className="mb-1 block text-slate-600 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-faint">{hint}</span>}
    </label>
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

// Backups run on the server; the client only edits settings and shows status.
// The last fetched status is kept in the local meta table so the Settings
// screen still has something to show while offline.
import { getMeta, setMeta } from './db'
import type { BackupRun, BackupSettings, BackupStatus } from './types'

const STATUS_KEY = 'backupStatus'

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function defaultBackupSettings(): BackupSettings {
  return {
    destination: 'local',
    local: { dir: '' },
    s3: { endpoint: '', region: '', bucket: '', prefix: '', accessKey: '', pathStyle: false },
    webdav: { url: '', username: '', allowHttp: false },
    schedule: { frequency: 'off', time: '03:00', weekday: 0 },
    retention: { keepLast: 7, maxAgeDays: 0 },
    compress: true,
  }
}

export async function cachedBackupStatus(): Promise<BackupStatus | null> {
  return getMeta<BackupStatus | null>(STATUS_KEY, null)
}

export async function cacheBackupStatus(status: BackupStatus): Promise<void> {
  await setMeta(STATUS_KEY, status)
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function scheduleLabel(s: BackupSettings['schedule']): string {
  switch (s.frequency) {
    case 'hourly':
      return `Every hour at :${s.time.slice(3)}`
    case 'daily':
      return `Every day at ${s.time}`
    case 'weekly':
      return `Every ${WEEKDAYS[s.weekday] ?? 'week'} at ${s.time}`
    default:
      return 'Off'
  }
}

export function runSummary(r: BackupRun): string {
  const when = new Date(r.startedAt).toLocaleString()
  if (r.status === 'running') return `Running since ${when}`
  if (r.status === 'failed') return `Failed ${when}: ${r.error}`
  const secs = r.durationMs !== null ? ` in ${(r.durationMs / 1000).toFixed(1)} s` : ''
  return `Succeeded ${when} · ${formatBytes(r.bytes)}${secs}`
}

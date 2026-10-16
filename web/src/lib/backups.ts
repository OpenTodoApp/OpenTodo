// Backups run on the server; the client only edits settings and shows status.
// The last fetched status is kept in the local meta table so the Settings
// screen still has something to show while offline.
import { getMeta, setMeta } from './db'
import type { BackupRun, BackupSettings, BackupStatus } from './types'
import { formatInstant, formatTime, dateLocaleOf } from './dates'
import { t } from './i18n'

const STATUS_KEY = 'backupStatus'

/** Weekday 0 (Sunday) … 6 as the interface language writes it. */
export function weekdayName(day: number): string {
  return new Intl.DateTimeFormat(dateLocaleOf(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 11 + day)))
}

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

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
      return t('Every hour at :{minute}', { minute: s.time.slice(3) })
    case 'daily':
      return t('Every day at {time}', { time: formatTime(s.time) })
    case 'weekly':
      return s.weekday >= 0 && s.weekday <= 6 ? t('Every {weekday} at {time}', { weekday: weekdayName(s.weekday), time: formatTime(s.time) }) : t('Every week at {time}', { time: formatTime(s.time) })
    default:
      return t('Off')
  }
}

export function runSummary(r: BackupRun): string {
  const when = formatInstant(r.startedAt, 'datetime')
  if (r.status === 'running') return t('Running since {when}', { when })
  if (r.status === 'failed') return t('Failed {when}: {error}', { when, error: r.error })
  return r.durationMs !== null
    ? t('Succeeded {when} · {size} in {seconds} s', { when, size: formatBytes(r.bytes), seconds: (r.durationMs / 1000).toFixed(1) })
    : t('Succeeded {when} · {size}', { when, size: formatBytes(r.bytes) })
}

// Settings → Server → Backups → Database storage (OpenSpec op-log-compaction, design D7):
// the database file's size, the free space inside it and what the last notes compaction
// removed and reclaimed. Read from the server when the page opens; offline it says so
// and shows no numbers. Only the owner sees it (the route answers no one else).
import { useEffect, useState } from 'react'
import { api, isNetworkError } from '../lib/api'
import { formatBytes } from '../lib/backups'
import { messageOf } from '../lib/errorText'
import { t } from '../lib/i18n'
import { useOnline } from '../lib/online'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'
import type { StorageStatus } from '../lib/types'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { useDateTimeFormat } from './DateTimePrefsProvider'

export interface DatabaseStorageViewProps {
  status: StorageStatus | null
  offline: boolean
  error: string | null
}

export function DatabaseStorageView({ status, offline, error }: DatabaseStorageViewProps) {
  const dt = useDateTimeFormat()
  const last = status?.last_compaction ?? null
  return (
    <SettingsSection {...cardCopy('database-storage')} testId="database-storage">
      {offline && <div className="py-3"><Notice>{noticeCopy('database-storage', 'offline')}</Notice></div>}
      {!offline && error && <p className="py-3 text-meta text-danger" role="alert">{error}</p>}
      {!offline && status && (
        <>
          <SettingRow {...rowCopy('database-storage', 'size')}
            status={<span data-testid="database-size">{t('{size}, {free} free inside the file', { size: formatBytes(status.database_bytes), free: formatBytes(status.free_bytes) })}</span>} />
          <SettingRow {...rowCopy('database-storage', 'compaction')}
            status={<span data-testid="last-compaction">{last
              ? t('{date}, {n, plural, one {# old note version} other {# old note versions}} removed, {bytes} reclaimed', { date: dt.formatInstant(last.at, 'date'), n: last.ops_removed, bytes: formatBytes(last.file_bytes_reclaimed) })
              : t('Not yet')}</span>} />
          {status.conversion === 'no_space' && (
            <div className="py-3"><Notice tone="warning">{noticeCopy('database-storage', 'noSpace', { values: { bytes: formatBytes(status.conversion_needed_bytes ?? 0) } })}</Notice></div>
          )}
          {(status.conversion === 'waiting_for_quiet' || status.conversion === 'pending') && (
            <p className="py-3 text-meta text-muted" data-testid="storage-conversion">{noticeCopy('database-storage', 'waiting')}</p>
          )}
        </>
      )}
    </SettingsSection>
  )
}

/** Container: reads GET /api/v1/settings/storage while online; nothing for anyone but the owner. */
export function DatabaseStoragePanel({ isOwner }: { isOwner: boolean }) {
  const online = useOnline()
  const [status, setStatus] = useState<StorageStatus | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!isOwner || !online) return
    let live = true
    setError(null)
    api.storageStatus().then((s) => {
      if (!live) return
      setStatus(s)
      setUnreachable(false)
    }, (err) => {
      if (!live) return
      if (isNetworkError(err)) setUnreachable(true)
      else setError(messageOf(err))
    })
    return () => { live = false }
  }, [isOwner, online])
  if (!isOwner) return null
  const offline = !online || unreachable
  return <DatabaseStorageView status={offline ? null : status} offline={offline} error={error} />
}

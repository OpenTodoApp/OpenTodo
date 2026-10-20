// Settings → Server → Download your data (OpenSpec `multi-tenant-host`, "Owners
// can take their data away"): on a hosted service the owner downloads the whole
// server as one backup archive, the format `opentodo restore` reads, so moving
// to a self-hosted server takes one download.
import { useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import { Button, Notice, SettingRow, SettingsSection } from '../ui'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'

export function ServerArchiveView({ online, busy, error, onDownload }: {
  online: boolean
  busy: boolean
  error: string | null
  onDownload: () => void
}) {
  return (
    <SettingsSection {...cardCopy('server-archive')} testId="server-archive">
      {!online && <div className="pb-3"><Notice>{noticeCopy('server-archive', 'offline')}</Notice></div>}
      <SettingRow {...rowCopy('server-archive', 'archive')}
        control={<Button size="sm" disabled={!online} busy={busy} onClick={onDownload}>{t('Download archive')}</Button>} />
      {error && <p className="pt-2 text-meta text-danger" role="alert">{error}</p>}
    </SettingsSection>
  )
}

export function archiveErrorMessage(err: unknown): string {
  if (isNetworkError(err)) return t('Your server cannot be reached. Try again when you are online.')
  if (err instanceof ApiError && err.code === 'reauth_required') return t('Confirm your password, then download again.')
  return err instanceof Error ? err.message : String(err)
}

export function ServerArchivePanel() {
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function download() {
    setBusy(true)
    setError(null)
    try {
      const { blob, filename } = await api.downloadServerArchive()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = filename
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    } catch (err) {
      setError(archiveErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return <ServerArchiveView online={online} busy={busy} error={error} onDownload={() => void download()} />
}

// Settings → Server → Download your data (OpenSpec `multi-tenant-host`, "Owners
// can take their data away"): on a hosted service the owner downloads the whole
// server as one backup archive, the format `opentodo restore` reads, so moving
// to a self-hosted server takes one download.
import { useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { useOnline } from '../lib/online'
import { Button, Notice, SettingRow, SettingsSection } from '../ui'

export function ServerArchiveView({ online, busy, error, onDownload }: {
  online: boolean
  busy: boolean
  error: string | null
  onDownload: () => void
}) {
  return (
    <SettingsSection title="Download your data" headingId="server-archive-heading" testId="server-archive"
      description="Everything on this server — every account, project, task, comment, file and setting — as one backup archive. Restore it into your own OpenTodo server with opentodo restore; devices then sync with the new address.">
      {!online && <div className="pb-3"><Notice>You are offline. The download needs a connection to the server.</Notice></div>}
      <SettingRow label="Server archive" description="A compressed archive of the whole server. Keep it private: it contains every account's sign-in data."
        control={<Button size="sm" disabled={!online} busy={busy} onClick={onDownload}>Download archive</Button>} />
      {error && <p className="pt-2 text-meta text-danger" role="alert">{error}</p>}
    </SettingsSection>
  )
}

export function archiveErrorMessage(err: unknown): string {
  if (isNetworkError(err)) return 'Your server cannot be reached. Try again when you are online.'
  if (err instanceof ApiError && err.code === 'reauth_required') return 'Confirm your password, then download again.'
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

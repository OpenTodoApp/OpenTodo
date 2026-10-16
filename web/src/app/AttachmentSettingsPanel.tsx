// Settings → Server → Attachments (OpenSpec change attachments, design D5):
// the owner turns attachments on or off and sets the per-file limit and the
// total per account. Read live from the server; offline shows the last values.
import { useEffect, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { refreshLimits } from '../lib/attachments'
import { useOnline } from '../lib/online'
import type { AttachmentSettings } from '../lib/types'
import { Button } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { Switch } from '../ui'

export const MAX_FILE_MB = 2048
/** 1 TB, the server's bound. */
export const MAX_QUOTA_MB = 1 << 20

/** The form's problem, or null when the values are within bounds. */
export function validateAttachmentSettings(s: AttachmentSettings): string | null {
  if (!Number.isInteger(s.max_file_mb) || s.max_file_mb < 1 || s.max_file_mb > MAX_FILE_MB) return `The size per file is 1 to ${MAX_FILE_MB} MB.`
  if (!Number.isInteger(s.quota_mb) || s.quota_mb < 0 || s.quota_mb > MAX_QUOTA_MB) return `The total per account is 0 (no total) to ${MAX_QUOTA_MB} MB.`
  return null
}

export function AttachmentSettingsView({ value, online, busy, error, saved, onSave }: {
  value: AttachmentSettings | null
  online: boolean
  busy: boolean
  error: string | null
  saved: boolean
  onSave: (s: AttachmentSettings) => void
}) {
  const [draft, setDraft] = useState<AttachmentSettings | null>(value)
  useEffect(() => setDraft(value), [value])
  const disabled = !online || busy || !draft
  const problem = draft ? validateAttachmentSettings(draft) : null
  const dirty = !!draft && !!value && (draft.enabled !== value.enabled || draft.max_file_mb !== value.max_file_mb || draft.quota_mb !== value.quota_mb)
  const num = (v: string) => (v.trim() === '' ? Number.NaN : Number(v))
  return (
    <SettingsSection title="Attachments" headingId="attachments-settings-heading" testId="attachment-settings"
      description="Files people add to tasks and comments are stored on this server, under the data directory, and included in backups.">
      {!online && <div className="pb-3"><Notice>You are offline. These settings need a connection to the server.</Notice></div>}
      <SettingRow label="Allow attachments" description="When off, nobody can add files or links; existing ones stay and can still be opened."
        control={<Switch label="Allow attachments" hideLabel checked={draft?.enabled ?? true} disabled={disabled}
          onChange={(enabled) => draft && setDraft({ ...draft, enabled })} />} />
      <SettingRow label="Size per file" htmlFor="attachments-max-file" description={`In MB, from 1 to ${MAX_FILE_MB}. Larger files are refused before they are sent.`}
        control={<input id="attachments-max-file" type="number" min={1} max={MAX_FILE_MB} step={1} className="ui-input w-28" disabled={disabled}
          value={draft ? (Number.isNaN(draft.max_file_mb) ? '' : draft.max_file_mb) : ''}
          onChange={(e) => draft && setDraft({ ...draft, max_file_mb: num(e.target.value) })} />} />
      <SettingRow label="Total per account" htmlFor="attachments-quota" description="In MB; 0 means no total. Removing a file frees its space at once."
        control={<input id="attachments-quota" type="number" min={0} max={MAX_QUOTA_MB} step={1} className="ui-input w-28" disabled={disabled}
          value={draft ? (Number.isNaN(draft.quota_mb) ? '' : draft.quota_mb) : ''}
          onChange={(e) => draft && setDraft({ ...draft, quota_mb: num(e.target.value) })} />} />
      <div className="flex flex-wrap items-center gap-3 pt-3">
        <Button variant="primary" size="sm" disabled={disabled || !dirty || !!problem} busy={busy} onClick={() => draft && onSave(draft)}>Save</Button>
        {problem && dirty && <span className="text-meta text-danger" role="alert">{problem}</span>}
        {error && <span className="text-meta text-danger" role="alert">{error}</span>}
        {saved && !dirty && <span className="text-meta text-muted" role="status">Saved.</span>}
      </div>
    </SettingsSection>
  )
}

/** Container: loads and saves the owner's settings. */
export function AttachmentSettingsPanel() {
  const online = useOnline()
  const [value, setValue] = useState<AttachmentSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (!online) return
    void api.attachmentSettings().then(setValue, (err) => { if (!isNetworkError(err)) setError(err instanceof Error ? err.message : String(err)) })
  }, [online])
  return (
    <AttachmentSettingsView value={value} online={online} busy={busy} error={error} saved={saved}
      onSave={(s) => {
        setBusy(true)
        setError(null)
        setSaved(false)
        void api.saveAttachmentSettings(s).then((next) => {
          setValue(next)
          setSaved(true)
          void refreshLimits()
        }, (err) => {
          if (!(err instanceof ApiError && err.code === 'reauth_required')) setError(err instanceof Error ? err.message : String(err))
        }).finally(() => setBusy(false))
      }} />
  )
}

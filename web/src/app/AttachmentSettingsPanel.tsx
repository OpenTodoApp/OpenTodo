// Settings → Server → Attachments (OpenSpec change attachments, design D5):
// the owner turns attachments on or off and sets the per-file limit and the
// total per account. Read live from the server; offline shows the last values.
// settings-foundation D8: the switch saves when it changes (a refused save puts it
// back and says why under its row); the two limits are a form with a save bar.
import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, isNetworkError } from '../lib/api'
import { refreshLimits } from '../lib/attachments'
import { useOnline } from '../lib/online'
import type { AttachmentSettings } from '../lib/types'
import { Notice, NumberInput, SettingRow, SettingsSection, Switch, useDraft } from '../ui'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'
import { messageOf } from '../lib/errorText'
import { SettingsSaveBar } from './SettingsSaveBar'

export const MAX_FILE_MB = 2048
/** 1 TB, the server's bound. */
export const MAX_QUOTA_MB = 1 << 20

/** The form's problem, or null when the values are within bounds. */
export function validateAttachmentSettings(s: AttachmentSettings): string | null {
  if (!Number.isInteger(s.max_file_mb) || s.max_file_mb < 1 || s.max_file_mb > MAX_FILE_MB) return t('The size per file is 1 to {max} MB.', { max: MAX_FILE_MB })
  if (!Number.isInteger(s.quota_mb) || s.quota_mb < 0 || s.quota_mb > MAX_QUOTA_MB) return t('The total per account is 0 (no total) to {max} MB.', { max: MAX_QUOTA_MB })
  return null
}

type Limits = Pick<AttachmentSettings, 'max_file_mb' | 'quota_mb'>
const DEFAULT_LIMITS: Limits = { max_file_mb: 25, quota_mb: 0 }

export interface AttachmentSettingsViewProps {
  value: AttachmentSettings | null
  online: boolean
  /** A limits save is in flight. */
  busy: boolean
  /** Why the last limits save failed, shown in the save bar. */
  error: string | null
  /** Why the last switch save failed, shown under the switch's row. */
  toggleError?: string | null
  onToggle: (enabled: boolean) => void
  onSave: (s: AttachmentSettings) => void
}

export function AttachmentSettingsView({ value, online, busy, error, toggleError, onToggle, onSave }: AttachmentSettingsViewProps) {
  const limits = useDraft<Limits>(value ? { max_file_mb: value.max_file_mb, quota_mb: value.quota_mb } : DEFAULT_LIMITS)
  const { setValid } = limits
  const sizeValid = useCallback((ok: boolean) => setValid('size', ok), [setValid])
  const quotaValid = useCallback((ok: boolean) => setValid('quota', ok), [setValid])
  const disabled = !online || !value
  const allow = rowCopy('attachments-settings', 'allow')
  const size = rowCopy('attachments-settings', 'size')
  const quota = rowCopy('attachments-settings', 'quota')
  return (
    <SettingsSection {...cardCopy('attachments-settings')} testId="attachment-settings">
      {!online && <div className="pb-3"><Notice>{noticeCopy('attachments-settings', 'offline')}</Notice></div>}
      <SettingRow label={allow.label}
        description={toggleError ? <span className="text-danger" role="alert" data-attachments-toggle-error>{toggleError}</span> : allow.description}
        control={<Switch label={t('Allow attachments')} hideLabel checked={value?.enabled ?? true} disabled={disabled} onChange={onToggle} />} />
      <SettingRow {...size}
        control={<NumberInput key={`size-${limits.epoch}`} id="attachments-max-file" label={size.label} hideLabel unit="MB" min={1} max={MAX_FILE_MB}
          value={limits.draft.max_file_mb} disabled={disabled} onValidityChange={sizeValid} onChange={(v) => limits.set({ max_file_mb: v ?? 1 })} />} />
      <SettingRow {...quota}
        control={<NumberInput key={`quota-${limits.epoch}`} id="attachments-quota" label={quota.label} hideLabel unit="MB" min={1} max={MAX_QUOTA_MB} noLimit
          value={limits.draft.quota_mb === 0 ? null : limits.draft.quota_mb} disabled={disabled} onValidityChange={quotaValid}
          onChange={(v) => limits.set({ quota_mb: v ?? 0 })} />} />
      <SettingsSaveBar dirty={limits.dirty} invalid={limits.invalid} busy={busy} error={error}
        disabledReason={online ? undefined : noticeCopy('attachments-settings', 'offline')}
        onDiscard={limits.reset} onSave={() => { if (value) onSave({ ...value, ...limits.draft }) }} />
    </SettingsSection>
  )
}

const describe = (err: unknown) => (err instanceof ApiError && err.code === 'reauth_required' ? null : messageOf(err))

/** Container: loads and saves the owner's settings. */
export function AttachmentSettingsPanel() {
  const online = useOnline()
  const [value, setValue] = useState<AttachmentSettings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toggleError, setToggleError] = useState<string | null>(null)
  useEffect(() => {
    if (!online) return
    void api.attachmentSettings().then(setValue, (err) => { if (!isNetworkError(err)) setError(messageOf(err)) })
  }, [online])
  return (
    <AttachmentSettingsView value={value} online={online} busy={busy} error={error} toggleError={toggleError}
      onToggle={(enabled) => {
        if (!value) return
        const before = value
        setValue({ ...value, enabled })
        setToggleError(null)
        void api.saveAttachmentSettings({ ...before, enabled }).then((next) => {
          setValue(next)
          void refreshLimits()
        }, (err) => {
          setValue(before)
          setToggleError(describe(err))
        })
      }}
      onSave={(s) => {
        if (validateAttachmentSettings(s)) return
        setBusy(true)
        setError(null)
        void api.saveAttachmentSettings(s).then((next) => {
          setValue(next)
          void refreshLimits()
        }, (err) => setError(describe(err))).finally(() => setBusy(false))
      }} />
  )
}

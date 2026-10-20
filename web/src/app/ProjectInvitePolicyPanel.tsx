import { useEffect, useState } from 'react'
import { Switch } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { api, ApiError } from '../lib/api'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'

// Settings → People, owner only (OpenSpec `project-invite-links`):
// "Members can invite new people with project links". Off by default: then
// only links created by the owner or an admin (or any link while open sign-up
// is on) can create an account. The pure view renders every state.

export function ProjectInvitePolicyView({ value, busy, error, onChange }: {
  /** null until the server answered (or while offline). */
  value: boolean | null
  busy: boolean
  error: string | null
  onChange: (on: boolean) => void
}) {
  return (
    <SettingsSection {...cardCopy('project-invite-policy')} testId="project-invite-policy">
      {value === null ? (
        <Notice>{noticeCopy('project-invite-policy', 'offline')}</Notice>
      ) : (
        <SettingRow {...rowCopy('project-invite-policy', 'members')}
          control={<Switch checked={value} disabled={busy} onChange={onChange} label={t('Members can invite new people with project links')} hideLabel />} />
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </SettingsSection>
  )
}

export function ProjectInvitePolicyPanel() {
  const [value, setValue] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.getProjectInviteSettings().then((r) => { if (!cancelled) setValue(r.membersCanInviteNewPeople) }, () => undefined)
    return () => { cancelled = true }
  }, [])

  async function change(on: boolean) {
    setBusy(true)
    setError(null)
    try {
      setValue((await api.putProjectInviteSettings(on)).membersCanInviteNewPeople)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('The server could not be reached; try again when you are online.'))
    } finally {
      setBusy(false)
    }
  }

  return <ProjectInvitePolicyView value={value} busy={busy} error={error} onChange={(on) => void change(on)} />
}

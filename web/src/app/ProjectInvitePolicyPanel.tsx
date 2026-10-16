import { useEffect, useState } from 'react'
import { Switch } from '../ui'
import { Notice } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { api, ApiError } from '../lib/api'

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
    <SettingsSection title="Project invite links" headingId="project-invite-policy-heading" testId="project-invite-policy"
      description="Project owners and admins can invite people to a project with a single-use link. Links created by you or an admin can also create an account for someone new.">
      {value === null ? (
        <Notice>This setting is available when you are online.</Notice>
      ) : (
        <SettingRow label="Members can invite new people with project links"
          description="Off: links created by members only work for people who already have an account. Applies to links already handed out too, since they are checked when used."
          control={<Switch checked={value} disabled={busy} onChange={onChange} label="Members can invite new people with project links" hideLabel />} />
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
      setError(err instanceof ApiError ? err.message : 'The server could not be reached; try again when you are online.')
    } finally {
      setBusy(false)
    }
  }

  return <ProjectInvitePolicyView value={value} busy={busy} error={error} onChange={(on) => void change(on)} />
}

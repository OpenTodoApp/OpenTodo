import { useEffect, useState } from 'react'
import { HelpHeading } from './help/HelpLink'
import { api, ApiError } from '../lib/api'

// Settings → Administration, owner only (OpenSpec `project-invite-links`):
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
    <section className="space-y-2" aria-labelledby="project-invite-policy-heading" data-testid="project-invite-policy">
      <HelpHeading screen="settings/project-invites" id="project-invite-policy-heading" className="font-semibold">Project invite links</HelpHeading>
      <p className="text-sm text-muted">
        Project owners and admins can invite people to a project with a single-use link. Links created by you or an admin can also
        create an account for someone new; links created by members only work for people who already have an account, unless you allow it here.
      </p>
      {value === null ? (
        <p className="text-sm text-faint">This setting is available when you are online.</p>
      ) : (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={value} disabled={busy} onChange={(e) => onChange(e.target.checked)} />
          <span>
            Members can invite new people with project links
            <span className="block text-xs text-muted">Applies to links already handed out too: they are checked when they are used.</span>
          </span>
        </label>
      )}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
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

// Server configuration warnings for the owner (OpenSpec `trusted-proxies-lenient`):
// problems the server started despite, such as an invalid OPENTODO_TRUSTED_PROXIES
// entry. Shown at the top of the Settings overview and of Settings → People.
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { ConfigWarning, User } from '../lib/types'
import { Icon } from '../ui'

/** The owner's configuration warnings from /api/v1/me; empty for everyone else, offline or on older servers. */
export async function loadConfigWarnings(user: User): Promise<ConfigWarning[]> {
  if (user.role !== 'owner') return []
  try {
    return (await api.me()).config_warnings ?? []
  } catch {
    return []
  }
}

/** Loads and shows the warnings for the owner; renders nothing for other roles or when there are none. */
export function ConfigWarningsNotice({ user }: { user: User }) {
  const [warnings, setWarnings] = useState<ConfigWarning[]>([])
  useEffect(() => {
    let live = true
    void loadConfigWarnings(user).then((w) => { if (live) setWarnings(w) })
    return () => { live = false }
  }, [user])
  return <ConfigWarningList warnings={warnings} />
}

export function ConfigWarningList({ warnings }: { warnings: ConfigWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <section aria-labelledby="config-warnings-heading" data-testid="config-warnings"
      className="space-y-2 rounded-card border border-default bg-warning-soft p-4 text-sm text-on-warning-soft shadow-1">
      <h2 id="config-warnings-heading" className="flex items-center gap-2 font-semibold">
        <Icon name="alarm-clock" />
        {warnings.length === 1 ? 'Server configuration warning' : 'Server configuration warnings'}
      </h2>
      <ul className="space-y-1.5">
        {warnings.map((w) => (
          <li key={w.variable} className="break-words">
            <code className="rounded-chip bg-surface px-1 font-mono text-meta text-default">{w.variable}</code>: {w.message}
          </li>
        ))}
      </ul>
      <p className="text-meta">Only you, the owner, see this. It goes away after the server restarts with a corrected value.</p>
    </section>
  )
}

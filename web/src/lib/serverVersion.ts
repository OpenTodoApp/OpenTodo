// The server's version, read from auth/status while online (OpenSpec whats-new, design D2;
// feedback-door, design D2). Settings → About shows it, the What's new dot compares it with the
// compiled entries, and the feedback context names it. The sidebar's brand line shows the
// version the device last received, offline too, without a request of its own
// (sidebar-brand-and-row-grid D1): every auth/status read records it.
import { useEffect, useState } from 'react'
import { api } from './api'
import { createStoredValue } from './deviceStorage'
import { useOnline } from './online'
import { resettable } from './moduleState'

/** The version this device last received, kept on the device (a convenience, never synced). */
export const lastServerVersion = createStoredValue<string | null>('ot:server-version', {
  parse: (raw) => raw || null,
  serialize: (version) => version,
}, { crossTab: true })

/** Records the version an auth/status read carried (the app's start and the hook below). */
export function rememberServerVersion(version: string | undefined | null): void {
  if (version && lastServerVersion.get() !== version) lastServerVersion.set(version)
}

/** The last version this page read; a hook starts from it, so a dialog opened later has it at once. */
let known: string | null = null
resettable('serverVersion', () => { known = null })

/** The server's version while online; null before it is known or offline. */
export function useServerVersion(): string | null {
  const online = useOnline()
  const [version, setVersion] = useState<string | null>(known)
  useEffect(() => {
    if (!online) return
    let cancelled = false
    api.authStatus().then((s) => {
      known = s.version || null
      rememberServerVersion(known)
      if (!cancelled) setVersion(known)
    }, () => {})
    return () => { cancelled = true }
  }, [online])
  return version
}

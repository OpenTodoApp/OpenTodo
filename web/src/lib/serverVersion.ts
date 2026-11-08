// The server's version, read from auth/status while online (OpenSpec whats-new, design D2;
// feedback-door, design D2). Settings → About shows it, the What's new dot compares it with the
// compiled entries, and the feedback context names it.
import { useEffect, useState } from 'react'
import { api } from './api'
import { useOnline } from './online'
import { resettable } from './moduleState'

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
      if (!cancelled) setVersion(known)
    }, () => {})
    return () => { cancelled = true }
  }, [online])
  return version
}

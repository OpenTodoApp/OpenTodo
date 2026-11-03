// The server's version, read from auth/status while online (OpenSpec whats-new, design D2).
// Settings → About shows it and the What's new dot compares it with the compiled entries.
import { useEffect, useState } from 'react'
import { api } from './api'
import { useOnline } from './online'

/** The server's version while online; null before it is known or offline. */
export function useServerVersion(): string | null {
  const online = useOnline()
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    if (!online) return
    let cancelled = false
    api.authStatus().then((s) => { if (!cancelled) setVersion(s.version || null) }, () => {})
    return () => { cancelled = true }
  }, [online])
  return version
}

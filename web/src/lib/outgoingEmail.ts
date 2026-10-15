// Whether the server can send email (OpenSpec change outgoing-email, "Availability
// reported to clients"): read from the authentication status on every refresh, so
// the email actions in Settings and the share dialog appear and disappear with it.
// Memory only: offline, the actions need a connection anyway.
import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
let enabled = false

export function setOutgoingEmail(on: boolean | undefined): void {
  const next = on === true
  if (next === enabled) return
  enabled = next
  for (const l of listeners) l()
}

export function outgoingEmailEnabled(): boolean {
  return enabled
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** True when the server reported outgoing email as configured. */
export function useOutgoingEmail(): boolean {
  return useSyncExternalStore(subscribe, outgoingEmailEnabled, outgoingEmailEnabled)
}

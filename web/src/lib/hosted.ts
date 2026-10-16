import { useSyncExternalStore } from 'react'

/**
 * Hosted service (OpenSpec `multi-tenant-host`): set from `auth/status` on every
 * profile read. On a hosted server the operator owns outgoing email, single
 * sign-on, backups, attachment limits and the AI switches, so their panels are
 * hidden, and the owner gets a download of the whole server instead.
 */

const listeners = new Set<() => void>()
let current = false

/** Record whether this server is hosted (absent on a self-hosted server). */
export function setHosted(hosted: boolean | undefined): void {
  const next = hosted === true
  if (next === current) return
  current = next
  for (const l of listeners) l()
}

export function getHosted(): boolean {
  return current
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Whether this server is hosted, re-rendering when it changes. */
export function useHosted(): boolean {
  return useSyncExternalStore(subscribe, getHosted, getHosted)
}

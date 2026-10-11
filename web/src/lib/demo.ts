import { useSyncExternalStore } from 'react'
import type { DemoInfo } from './types'

/**
 * Demo instance state (OpenSpec `demo-mode`): set from `auth/status` on every
 * profile read and remembered on this device so the banner also shows offline.
 */

/** The banner text the spec fixes. */
export const DEMO_BANNER = "Demo instance — data resets every night, don't store anything private."

/** The note shown in place of a control the demo instance refuses. */
export const DEMO_RESTRICTED_NOTE = 'Disabled on this demo instance.'

const KEY = 'opentodo.demo'
const listeners = new Set<() => void>()
let current: DemoInfo | null = read()

function read(): DemoInfo | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as DemoInfo) : null
  } catch {
    return null
  }
}

/** Record the server's demo state (null when the instance is not a demo). */
export function setDemo(info: DemoInfo | null | undefined): void {
  const next = info ?? null
  if (JSON.stringify(next) === JSON.stringify(current)) return
  current = next
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage unavailable (private mode): the state still lives in memory.
  }
  for (const l of listeners) l()
}

export function getDemo(): DemoInfo | null {
  return current
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The demo state, re-rendering when it changes. */
export function useDemo(): DemoInfo | null {
  return useSyncExternalStore(subscribe, getDemo, getDemo)
}

/** True for an API error the demo instance answers for a refused feature. */
export function isDemoRestricted(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'demo_restricted'
}

import { useSyncExternalStore } from 'react'
import { api, ApiError } from './api'
import type { AuthStatus, DemoInfo, User } from './types'

/**
 * Demo instance state (OpenSpec `demo-mode`, `demo-sandboxes`): set from
 * `auth/status` on every profile read and remembered on this device so the
 * banner also shows offline. Each visitor works in a private sandbox that is
 * deleted after inactivity, at most a day after creation and every night.
 */

/** The banner text the design fixes (demo-sandboxes D6). */
export const DEMO_BANNER = "Demo — this sandbox is private to you and is deleted after 2 hours of inactivity. Don't store anything personal."

/** The note shown in place of a control the demo instance refuses. */
export const DEMO_RESTRICTED_NOTE = 'Disabled on this demo instance.'

/** Shown when the sandbox's write budget is used up (429 demo_limit). */
export const DEMO_LIMIT_NOTICE = 'This demo sandbox reached its limit of changes. Your latest edits stay on this device and are saved when the limit allows.'

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
  // The creation token changes on every read; only the stable part is kept.
  const next = info ? { ...info, token: '' } : null
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

/**
 * Creates a sandbox and signs this browser into it. The creation token is
 * single-use and short-lived, so a refused or missing one is replaced by a
 * fresh one from auth/status once.
 */
export async function startSandbox(token?: string): Promise<User> {
  let tok = token || (await api.authStatus()).demo?.token || ''
  try {
    return (await api.demoSandbox(tok)).user
  } catch (err) {
    if (!(err instanceof ApiError && err.code === 'demo_token')) throw err
    tok = (await api.authStatus()).demo?.token || ''
    return (await api.demoSandbox(tok)).user
  }
}

/** The message for a refused sandbox creation (busy demo, rate limit, stale page). */
export function sandboxErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'demo_busy':
        return 'The demo is busy, try again in a few minutes.'
      case 'rate_limited':
        return 'Too many new sandboxes from your network. Try again in an hour.'
      case 'demo_token':
      case 'bad_origin':
        return 'This page expired. Reload it and try again.'
    }
    return err.message
  }
  return 'The demo could not be reached. Check your connection and try again.'
}

/**
 * Decides, when the status says this browser is signed out, whether a demo
 * sandbox just expired: on a demo instance a device that was signed in has lost
 * its sandbox (deleted after inactivity, at its maximum age or by the nightly
 * reset). Its local data belongs to nothing any more, so it is cleared with
 * `clear` (the sign-out path) and the caller shows the expiry screen. Returns
 * whether that happened; on a normal server nothing changes.
 */
export async function expireSandboxIfGone(status: Pick<AuthStatus, 'demo' | 'authenticated'>, hadSession: boolean, clear: () => Promise<void>): Promise<boolean> {
  if (!status.demo || status.authenticated || !hadSession) return false
  await clear()
  return true
}

import { api, ApiError } from './api'
import type { AuthStatus, DemoInfo, User } from './types'
import { t, msg } from './i18n'
import { formatClock } from './dates'
import { createStore } from './store'
import { readJSON, readString, writeString } from './deviceStorage'

/**
 * Demo instance state (OpenSpec `demo-mode`, `demo-sandboxes`): set from
 * `auth/status` on every profile read and remembered on this device so the
 * banner also shows offline. Each visitor works in a private sandbox that is
 * deleted after inactivity, at most a day after creation and every night.
 */

/** Lifetimes the server reported before (demo-sandboxes D6), used until the status has been read once. */
const DEFAULT_HOURS = { idle: 2, max: 24 }

/** The idle lifetime in hours from the device's demo record, never a number fixed in the app. */
function hoursOf(info: Pick<DemoInfo, 'sandboxHours'> | null | undefined) {
  return { idle: info?.sandboxHours?.idle ?? DEFAULT_HOURS.idle, max: info?.sandboxHours?.max ?? DEFAULT_HOURS.max }
}

/** The banner's first sentence, shown at every width (demo-mode "Demo sign-in and banner", lean-chrome D2). */
export function demoBannerLead(info: Pick<DemoInfo, 'sandboxHours'> | null | undefined): string {
  return t('Demo: private sandbox, deleted after {idle} h of inactivity.', { idle: hoursOf(info).idle })
}

/** The banner's one line: the lead and "Don't store anything personal." */
export function demoBannerText(info: Pick<DemoInfo, 'sandboxHours'> | null | undefined): string {
  return `${demoBannerLead(info)} ${t(DEMO_NOTHING_PERSONAL)}`
}

/** The banner's second sentence, left to the Details control below 640 px. */
export const DEMO_NOTHING_PERSONAL = msg("Don't store anything personal.")

/** The full text behind the banner's Details control: the sandbox, both lifetimes, the nightly reset. */
export function demoDetailsText(info: Pick<DemoInfo, 'sandboxHours' | 'resetsAt'> | null | undefined): string {
  const { idle, max } = hoursOf(info)
  const reset = info?.resetsAt ? formatClock(info.resetsAt, false) : null
  return reset
    ? t('This demo sandbox is private to you. It is deleted after {idle} hours of inactivity, {max} hours after it was created at the latest, and at the nightly reset at {time}. Don\'t store anything personal.', { idle, max, time: reset })
    : t('This demo sandbox is private to you. It is deleted after {idle} hours of inactivity, {max} hours after it was created at the latest, and at the nightly reset. Don\'t store anything personal.', { idle, max })
}

// The banner's dismissal (lean-chrome D2): this browser session only, on this device.
// Nothing is synced or sent; a new session shows the banner again.
const DISMISS_KEY = 'opentodo.demoBannerDismissed'
const dismissed = createStore('demoBannerDismissed', readDismissed())

function readDismissed(): boolean {
  return readString(DISMISS_KEY, 'session') === '1'
}

/** Hides the banner until the browser session ends. */
export function dismissBanner(): void {
  writeString(DISMISS_KEY, '1', 'session') // storage unavailable: hidden for this page load only
  dismissed.set(true)
}

/** Re-reads the session's dismissal (a cleared session storage shows the banner again); for tests and a new session. */
export function reloadBannerDismissed(): void {
  dismissed.set(readDismissed())
}

/** Whether the banner was dismissed in this browser session. */
export const useBannerDismissed = dismissed.use

/** The note shown in place of a control the demo instance refuses. */
export const DEMO_RESTRICTED_NOTE = msg('Disabled on this demo instance.')

/** Shown when the sandbox's write budget is used up (429 demo_limit). */
export const DEMO_LIMIT_NOTICE = msg('This demo sandbox reached its limit of changes. Your latest edits stay on this device and are saved when the limit allows.')

const KEY = 'opentodo.demo'
const store = createStore<DemoInfo | null>('demo', read())

function read(): DemoInfo | null {
  return readJSON<DemoInfo | null>(KEY, null)
}

/** Record the server's demo state (null when the instance is not a demo). */
export function setDemo(info: DemoInfo | null | undefined): void {
  // The creation token changes on every read; only the stable part is kept.
  const next = info ? { ...info, token: '' } : null
  if (JSON.stringify(next) === JSON.stringify(store.get())) return
  // Storage unavailable (private mode): the state still lives in memory.
  writeString(KEY, next ? JSON.stringify(next) : null)
  store.set(next)
}

export const getDemo = store.get

/** The demo state, re-rendering when it changes. */
export const useDemo = store.use

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
        return t('The demo is busy, try again in a few minutes.')
      case 'rate_limited':
        return t('Too many new sandboxes from your network. Try again in an hour.')
      case 'demo_token':
      case 'bad_origin':
        return t('This page expired. Reload it and try again.')
    }
    return err.message
  }
  return t('The demo could not be reached. Check your connection and try again.')
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

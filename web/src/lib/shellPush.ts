// Reminders by push in the Android app (OpenSpec change shell-push, design D5 and
// D6). The shell registers with the UnifiedPush app the user chose and hands over
// what a browser's PushManager hands over; this module subscribes the device with
// it on the existing push routes, so the server pushes to the phone exactly as it
// pushes to a browser. Off until turned on, per device, never synced. Loaded only
// in a shell that lists `push` (main.tsx, the settings screen, sign-out).
import { api, ApiError } from './api'
import { db, getMeta, setMeta } from './db'
import { getDeviceId } from './ops'
import { has, shell, type ShellPushError, type ShellPushState, type ShellPushSubscription } from './shell'
import { shellNotificationsEnabled, shellTitlesEnabled } from './shellPublish'

/** The device's "Deliver instantly through UnifiedPush" switch. */
export const META_SHELL_PUSH_ON = 'shell:pushOn'
/** What the server holds for this device: the subscription's id, its endpoint and whether it carries titles. */
export const META_SHELL_PUSH = 'shell:push'

interface Remembered {
  subscriptionId: string
  endpoint: string
  includeContent: boolean
}

const ERRORS: readonly ShellPushError[] = ['no-distributor', 'cancelled', 'failed', 'action-required', 'network']

function parse(json: unknown): Record<string, unknown> | null {
  if (typeof json !== 'string') return null
  try {
    const v: unknown = JSON.parse(json)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function subscriptionOf(v: Record<string, unknown>): ShellPushSubscription | null {
  const { endpoint, p256dh, auth } = v
  const ok = typeof endpoint === 'string' && endpoint.startsWith('https://') && typeof p256dh === 'string' && !!p256dh && typeof auth === 'string' && !!auth
  return ok ? { endpoint, p256dh, auth } : null
}

/** Reads the answer of `pushSubscribe`; anything that is not a subscription or a known error is `failed`. */
export function parsePushSubscription(json: unknown): ShellPushSubscription | { error: ShellPushError } {
  const v = parse(json)
  if (!v) return { error: 'failed' }
  const error = ERRORS.find((e) => e === v.error)
  return error ? { error } : subscriptionOf(v) ?? { error: 'failed' }
}

/** Reads the answer of `pushState`; null for an answer that says nothing (nothing is changed on it). */
export function parsePushState(json: unknown): ShellPushState | null {
  const v = parse(json)
  if (!v || typeof v.available !== 'boolean' || typeof v.registered !== 'boolean') return null
  if (!v.registered) return { available: v.available, registered: false }
  const sub = subscriptionOf(v)
  return sub ? { available: v.available, registered: true, ...sub } : null
}

/** Registers with the UnifiedPush app through the shell; never throws. */
export async function pushSubscribe(vapidKey: string): Promise<ShellPushSubscription | { error: ShellPushError }> {
  const s = shell()
  if (!s || !has('push') || !s.pushSubscribe) return { error: 'failed' }
  try {
    return parsePushSubscription(await s.pushSubscribe(vapidKey))
  } catch {
    return { error: 'failed' }
  }
}

/** The shell's registration; null without the capability or when the shell's answer cannot be read. */
export async function pushState(): Promise<ShellPushState | null> {
  const s = shell()
  if (!s || !has('push') || !s.pushState) return null
  try {
    return parsePushState(await s.pushState())
  } catch {
    return null
  }
}

/** Tells the shell to unregister and delete its keys; false without the capability. */
export function pushUnsubscribe(): boolean {
  const s = shell()
  if (!s || !has('push') || !s.pushUnsubscribe) return false
  s.pushUnsubscribe()
  return true
}

/** What Settings → Notifications shows for push delivery. */
export interface ShellPushView {
  /** The shell lists `push`, it is the Android app, and the server offers push. */
  offered: boolean
  /** A UnifiedPush app is installed. */
  available: boolean
  enabled: boolean
}

/** The row's state. Never throws; an unreachable server keeps the row, a server without push hides it. */
export async function shellPushState(): Promise<ShellPushView> {
  const none: ShellPushView = { offered: false, available: false, enabled: false }
  if (!has('push') || shell()?.platform !== 'android') return none
  try {
    await api.pushKey()
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return none
  }
  const [state, on] = await Promise.all([pushState(), getMeta<boolean>(META_SHELL_PUSH_ON, false)])
  return { offered: true, available: !!state?.available, enabled: on && !!state?.registered }
}

/** Why push delivery could not be turned on: the shell's reason, or the server could not be reached. */
export type ShellPushReason = ShellPushError | 'offline'

const serverReason = (err: unknown): ShellPushReason => (err instanceof ApiError ? 'failed' : 'offline')

/** Subscribes the device on the server, remembers the row, and removes the row it replaces. */
async function register(sub: ShellPushSubscription, old: Remembered | null): Promise<void> {
  const includeContent = await shellTitlesEnabled()
  const res = await api.pushSubscribe({ deviceId: await getDeviceId(), endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth }, includeContent })
  const subscriptionId = res.subscription.id
  await setMeta(META_SHELL_PUSH, { subscriptionId, endpoint: sub.endpoint, includeContent } satisfies Remembered)
  // The server keeps one row per device and replaces it in place; a row with another id is the old one.
  if (old && old.subscriptionId !== subscriptionId) await api.pushUnsubscribe(old.subscriptionId).catch(() => undefined)
}

/** Turns the setting off and removes the device's row from the server (best effort: the push service's "gone" removes it too). */
async function forget(): Promise<void> {
  const old = await getMeta<Remembered | null>(META_SHELL_PUSH, null)
  await setMeta(META_SHELL_PUSH_ON, false)
  await db.meta.delete(META_SHELL_PUSH)
  if (old) await api.pushUnsubscribe(old.subscriptionId).catch(() => undefined)
}

/**
 * Turns push delivery on: the server's key, the shell's registration (the user
 * chooses the UnifiedPush app), the subscription on the server. A failure leaves
 * the setting off and nothing registered, with the reason.
 */
export async function enableShellPush(): Promise<{ ok: true } | { ok: false; reason: ShellPushReason }> {
  let key: string
  try {
    key = (await api.pushKey()).publicKey
  } catch (err) {
    return { ok: false, reason: serverReason(err) }
  }
  const sub = await pushSubscribe(key)
  if ('error' in sub) return { ok: false, reason: sub.error }
  try {
    await register(sub, await getMeta<Remembered | null>(META_SHELL_PUSH, null))
  } catch (err) {
    pushUnsubscribe()
    return { ok: false, reason: serverReason(err) }
  }
  await setMeta(META_SHELL_PUSH_ON, true)
  return { ok: true }
}

/**
 * Keeps the server's row equal to the shell's registration, on start and in a
 * background run: a new endpoint (or a changed titles option) is subscribed and the
 * old row removed; a registration the UnifiedPush app dropped, or notifications
 * turned off, turns push delivery off. Does nothing while the setting is off.
 */
export async function syncShellPush(): Promise<void> {
  if (!has('push') || !(await getMeta<boolean>(META_SHELL_PUSH_ON, false))) return
  if (!(await shellNotificationsEnabled())) return disableShellPush()
  const state = await pushState()
  if (!state) return
  if (!state.registered || !state.endpoint || !state.p256dh || !state.auth) return forget()
  const [old, titles] = await Promise.all([getMeta<Remembered | null>(META_SHELL_PUSH, null), shellTitlesEnabled()])
  if (old && old.endpoint === state.endpoint && old.includeContent === titles) return
  // Offline: the next run tries again; the phone's own schedule covers the time between.
  await register({ endpoint: state.endpoint, p256dh: state.p256dh, auth: state.auth }, old).catch(() => undefined)
}

/** Turns push delivery off: the server's row, the shell's registration and its keys (also at sign-out). */
export async function disableShellPush(): Promise<void> {
  await forget()
  pushUnsubscribe()
}

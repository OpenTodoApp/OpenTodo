// Device push notifications (OpenSpec change `reminders`). Device state, not
// synced: whether this browser is subscribed lives in the server's
// push_subscriptions table and, locally, in the meta table.
import { api, ApiError } from './api'
import { getMeta, setMeta } from './db'
import { getDeviceId } from './ops'
import type { PushSubscriptionStatus } from './types'

const META_ENABLED = 'push:enabled'
const META_INCLUDE = 'push:includeContent'

export interface PushState {
  /** The browser can do web push at all (service worker, PushManager, Notification). */
  supported: boolean
  /** The server offers push (false when the operator set OPENTODO_PUSH=off). */
  available: boolean
  permission: NotificationPermission | 'unsupported'
  /** This device asked for notifications and the server holds its subscription. */
  enabled: boolean
  includeContent: boolean
  subscription: PushSubscriptionStatus | null
  /** Enabled here but the server dropped the subscription (gone) or it keeps failing: offer to re-enable. */
  needsRenewal: boolean
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

function permission(): PushState['permission'] {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

/** The active service worker registration, or null (no SW in dev mode or unsupported). */
export async function swRegistration(timeoutMs = 3000): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  const ready = navigator.serviceWorker.ready
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  return (await Promise.race([ready, timeout])) ?? null
}

function urlBase64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (s.length % 4)) % 4)
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Current state, asking the server for this device's subscription. Never throws. */
export async function loadPushState(): Promise<PushState> {
  const enabledHere = await getMeta<boolean>(META_ENABLED, false)
  const includeContent = await getMeta<boolean>(META_INCLUDE, false)
  const base: PushState = {
    supported: pushSupported(), available: true, permission: permission(), enabled: false, includeContent,
    subscription: null, needsRenewal: false,
  }
  try {
    const res = await api.pushKey(await getDeviceId())
    const sub = res.subscription ?? null
    return {
      ...base, subscription: sub, enabled: enabledHere && !!sub,
      includeContent: sub ? sub.includeContent : includeContent,
      needsRenewal: enabledHere && (!sub || sub.needsRenewal),
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return { ...base, available: false }
    // Offline: report what this device believes.
    return { ...base, enabled: enabledHere }
  }
}

export class PushPermissionError extends Error {}

/**
 * Enable push on this device: ask for the permission, subscribe with the
 * server's key and register the subscription. Re-running it renews a dropped one.
 */
export async function enablePush(includeContent: boolean): Promise<PushState> {
  if (!pushSupported()) throw new Error('This browser does not support push notifications.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new PushPermissionError('Notifications are blocked for this site.')
  const reg = await swRegistration()
  if (!reg) throw new Error('The offline service worker is not active yet; reload the page and try again.')
  const { publicKey } = await api.pushKey()
  let sub = await reg.pushManager.getSubscription()
  // A subscription made for another server key (key rotated or restored elsewhere) must be replaced.
  const want = urlBase64ToBytes(publicKey)
  const have = sub?.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null
  if (sub && (!have || have.length !== want.length || have.some((b, i) => b !== want[i]))) {
    await sub.unsubscribe()
    sub = null
  }
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want })
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      throw new Error(`This browser refused the push subscription (${detail}). Private windows and some browsers cannot receive push; reminders still appear inside the app.`)
    }
  }
  const json = sub.toJSON()
  await api.pushSubscribe({
    deviceId: await getDeviceId(),
    endpoint: sub.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    includeContent,
  })
  await setMeta(META_ENABLED, true)
  await setMeta(META_INCLUDE, includeContent)
  return loadPushState()
}

/** Disable push on this device: remove the server subscription and the browser one. */
export async function disablePush(): Promise<void> {
  await setMeta(META_ENABLED, false)
  try {
    const res = await api.pushKey(await getDeviceId())
    if (res.subscription) await api.pushUnsubscribe(res.subscription.id)
  } catch {
    // Offline or push off: the server drops the subscription with the session at sign-out anyway.
  }
  const reg = await swRegistration(1000)
  const sub = await reg?.pushManager.getSubscription()
  await sub?.unsubscribe().catch(() => undefined)
}

/** Change the "include task titles" option (re-registers with the same subscription). */
export async function setIncludeContent(include: boolean): Promise<PushState> {
  await setMeta(META_INCLUDE, include)
  if (await getMeta<boolean>(META_ENABLED, false)) return enablePush(include)
  return loadPushState()
}

/** Show a notification right now through the service worker (or the page as a fallback). */
export async function testNotification(): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') throw new PushPermissionError('Notifications are not allowed.')
  const reg = await swRegistration(1000)
  const options = { body: 'Notifications work on this device.', tag: 'opentodo-test', icon: '/pwa-192.png' }
  if (reg) await reg.showNotification('OpenTodo', options)
  else new Notification('OpenTodo', options)
}

/** Best effort before signing out (the server also drops it with the session). */
export async function unsubscribeOnSignOut(): Promise<void> {
  if (!(await getMeta<boolean>(META_ENABLED, false))) return
  await disablePush().catch(() => undefined)
}

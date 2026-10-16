// Device push notifications (OpenSpec change `reminders`). Device state, not
// synced: whether this browser is subscribed lives in the server's
// push_subscriptions table and, locally, in the meta table.
import { api, ApiError } from './api'
import { getMeta, setMeta } from './db'
import { getDeviceId } from './ops'
import type { PushSubscriptionStatus } from './types'
import { formatInstant } from './dates'
import { t, msg, translatedMap } from './i18n'

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
  /** An offline service worker controls the app (none in `vite dev`, or before the first install). */
  serviceWorker: boolean
  /** The server could not be asked (offline or unreachable): server facts are unknown. */
  serverUnreachable: boolean
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
    subscription: null, needsRenewal: false, serviceWorker: !!(await swRegistration(1500)), serverUnreachable: false,
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
    return { ...base, enabled: enabledHere, serverUnreachable: true }
  }
}

export class PushPermissionError extends Error {}

/**
 * Enable push on this device: ask for the permission, subscribe with the
 * server's key and register the subscription. Re-running it renews a dropped one.
 */
export async function enablePush(includeContent: boolean): Promise<PushState> {
  if (!pushSupported()) throw new Error(t('This browser does not support push notifications.'))
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new PushPermissionError(t('Notifications are blocked for this site.'))
  const reg = await swRegistration()
  if (!reg) throw new Error(t('The offline service worker is not active yet; reload the page and try again.'))
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
      throw new Error(t('This browser refused the push subscription ({detail}). Private windows and some browsers cannot receive push; reminders still appear inside the app.', { detail }))
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

// ---- test notifications (OpenSpec change `push-test-delivery`) ----

/** How long Settings waits for the service worker's receipt before saying "accepted, not seen" (design D5). */
export const TEST_RECEIPT_WAIT_MS = 10_000
/** A receipt arriving later than the wait still upgrades the result while the page is open. */
const LATE_RECEIPT_MS = 2 * 60_000

export type TestOutcome =
  | { kind: 'received'; testId: string; receivedAt: number }
  | { kind: 'accepted_not_seen'; testId: string }
  | { kind: 'no_subscription' }
  | { kind: 'gone' }
  | { kind: 'failed'; status?: number; error: string }
  | { kind: 'rate_limited' }
  | { kind: 'offline' }
  | { kind: 'server_too_old' }

/** Where the service worker's messages arrive; navigator.serviceWorker in the app. */
export interface MessageSource {
  addEventListener(type: 'message', fn: (ev: MessageEvent) => void): void
  removeEventListener(type: 'message', fn: (ev: MessageEvent) => void): void
}

interface TestOptions {
  timeoutMs?: number
  source?: MessageSource | null
  /** Called when the push service accepted the test, before the receipt wait. */
  onSent?: (testId: string) => void
  /** Called when a receipt arrives after the result was already "accepted, not seen". */
  onLateReceipt?: (outcome: Extract<TestOutcome, { kind: 'received' }>) => void
}

function messageSource(): MessageSource | null {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null
}

/**
 * Send a real test push to this device through the server and wait for the
 * service worker to report that it arrived. Never throws.
 */
export async function sendTestPush(deviceId: string, opts: TestOptions = {}): Promise<TestOutcome> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { kind: 'offline' }
  const source = opts.source === undefined ? messageSource() : opts.source
  // Listen before sending: the receipt can arrive before the server answers.
  const receipts = new Map<string, number>()
  let waiter: ((receivedAt: number) => void) | null = null
  let wanted = ''
  const onMessage = (ev: MessageEvent) => {
    const m = ev.data as { type?: string; testId?: string; receivedAt?: number } | null
    if (m?.type !== 'push:test-received' || !m.testId) return
    const at = m.receivedAt ?? Date.now()
    receipts.set(m.testId, at)
    if (m.testId === wanted) waiter?.(at)
  }
  source?.addEventListener('message', onMessage)
  const stop = () => source?.removeEventListener('message', onMessage)

  let res
  try {
    res = await api.pushTest(deviceId)
  } catch (err) {
    stop()
    if (err instanceof ApiError) {
      if (err.status === 429) return { kind: 'rate_limited' }
      if (err.status === 404) return { kind: 'server_too_old' }
      return { kind: 'failed', status: err.status, error: err.message }
    }
    return { kind: 'offline' }
  }
  if (res.outcome !== 'sent' || !res.testId) {
    stop()
    if (res.outcome === 'no_subscription') return { kind: 'no_subscription' }
    if (res.outcome === 'gone') return { kind: 'gone' }
    return { kind: 'failed', status: res.status, error: res.error ?? t('The push service rejected the test.') }
  }
  const testId = res.testId
  opts.onSent?.(testId)
  const early = receipts.get(testId)
  if (early !== undefined) {
    stop()
    return { kind: 'received', testId, receivedAt: early }
  }
  wanted = testId
  const receivedAt = await new Promise<number | null>((resolve) => {
    waiter = resolve
    setTimeout(() => resolve(null), opts.timeoutMs ?? TEST_RECEIPT_WAIT_MS)
  })
  if (receivedAt !== null) {
    stop()
    return { kind: 'received', testId, receivedAt }
  }
  // Keep listening for a while: a slow push service still upgrades the result.
  waiter = (at) => {
    stop()
    opts.onLateReceipt?.({ kind: 'received', testId, receivedAt: at })
  }
  setTimeout(stop, LATE_RECEIPT_MS)
  return { kind: 'accepted_not_seen', testId }
}

/**
 * Show a notification from the page itself, without the server or the push
 * service (design D7): proves only the permission and the OS display settings.
 */
export async function localTestNotification(): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') throw new PushPermissionError(t('Notifications are not allowed.'))
  const reg = await swRegistration(1000)
  const options = { body: t('Local notification: this browser may show notifications.'), tag: `opentodo-local-test:${Date.now()}`, icon: '/pwa-192.png' }
  if (reg) await reg.showNotification('OpenTodo', options)
  else new Notification('OpenTodo', options)
}

/** Best effort before signing out (the server also drops it with the session). */
export async function unsubscribeOnSignOut(): Promise<void> {
  if (!(await getMeta<boolean>(META_ENABLED, false))) return
  await disablePush().catch(() => undefined)
}

// ---- delivery checklist (design D6): derived, never stored ----

export type StepStatus = 'ok' | 'fail' | 'pending' | 'not_checked' | 'unknown'
export type StepAction = 'enable' | 'reenable' | 'reload'
export interface ChecklistStep {
  id: 'support' | 'permission' | 'serviceWorker' | 'subscription' | 'delivery' | 'test'
  label: string
  status: StepStatus
  detail: string
  action?: StepAction
}

/** Where to turn notifications back on, by platform (best effort from the user agent). */
export function osNotificationHint(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return t('On iPhone and iPad, push works only in the app installed to the Home Screen: check Settings → Notifications → OpenTodo, and Focus.')
  if (/Android/.test(ua)) return t('On Android, check Settings → Apps → your browser → Notifications, and Do Not Disturb.')
  if (/Mac OS X|Macintosh/.test(ua)) return t('On macOS, check System Settings → Notifications → your browser (allow notifications, banners or alerts), and Focus.')
  if (/Windows/.test(ua)) return t('On Windows, check Settings → System → Notifications → your browser, and Do Not Disturb.')
  return t("Check your operating system's notification settings for this browser, and any do-not-disturb mode.")
}

const TEST_DETAIL = translatedMap<Exclude<TestOutcome['kind'], 'received' | 'accepted_not_seen'>>({
  no_subscription: msg('This device is not subscribed, so nothing was sent.'),
  gone: msg('The push service said this subscription expired; the server removed it.'),
  failed: msg('The push service rejected the test.'),
  rate_limited: msg('Too many tests in a short time; try again in a few minutes.'),
  offline: msg("You're offline; the test needs the server."),
  server_too_old: msg('This server does not support push tests yet; only a local notification can be shown.'),
})

export function pushChecklist(
  state: PushState, lastTest: TestOutcome | null, online: boolean, opts: { dev?: boolean; ua?: string } = {},
): ChecklistStep[] {
  const steps: ChecklistStep[] = []
  let blocked = false
  const add = (step: ChecklistStep) => steps.push(blocked && step.status !== 'unknown' ? { ...step, status: 'not_checked', detail: t('Not checked until the step above works.'), action: undefined } : step)

  add(state.supported
    ? { id: 'support', label: t('Browser supports push'), status: 'ok', detail: t('This browser can receive push notifications.') }
    : { id: 'support', label: t('Browser supports push'), status: 'fail', detail: t('This browser cannot receive push notifications (private windows and some browsers cannot). Reminders still appear inside the app.') })
  blocked ||= !state.supported

  const perm = state.permission
  add(perm === 'granted'
    ? { id: 'permission', label: t('Notifications allowed'), status: 'ok', detail: t('This site may show notifications.') }
    : perm === 'denied'
      ? { id: 'permission', label: t('Notifications allowed'), status: 'fail', detail: t("Notifications are blocked for this site. Allow them in the browser's site settings (the icon next to the address), then reload.") }
      : { id: 'permission', label: t('Notifications allowed'), status: 'pending', detail: t('The browser has not been asked yet.'), action: 'enable' })
  blocked ||= perm === 'denied' || perm === 'unsupported'

  add(state.serviceWorker
    ? { id: 'serviceWorker', label: t('Offline service worker active'), status: 'ok', detail: t('The background worker that receives pushes is running.') }
    : opts.dev
      ? { id: 'serviceWorker', label: t('Offline service worker active'), status: 'fail', detail: t('Development builds have no service worker, so push cannot work here. Use the production build (make run, http://localhost:8080) or the installed app. In-app reminders still work.') }
      : { id: 'serviceWorker', label: t('Offline service worker active'), status: 'fail', detail: t('The offline service worker is not active yet. Reload the page; on iPhone and iPad, install the app to the Home Screen first.'), action: 'reload' })
  const noWorker = !state.serviceWorker

  const serverUnknown = !online || state.serverUnreachable
  const sub = state.subscription
  if (serverUnknown) {
    add({ id: 'subscription', label: t('Subscribed on the server'), status: 'unknown', detail: t("Can't check while offline.") })
  } else if (!state.available) {
    add({ id: 'subscription', label: t('Subscribed on the server'), status: 'fail', detail: t('The server has push notifications turned off (OPENTODO_PUSH=off). Reminders still appear inside the app.') })
    blocked = true
  } else if (!sub) {
    add({ id: 'subscription', label: t('Subscribed on the server'), status: 'fail', detail: t('This device has no subscription on the server.'), action: noWorker || perm === 'denied' ? undefined : 'enable' })
  } else {
    add({ id: 'subscription', label: t('Subscribed on the server'), status: 'ok', detail: t('The server can push to this device.') })
  }

  if (serverUnknown) {
    add({ id: 'delivery', label: t('Server reaches the push service'), status: 'unknown', detail: t("Can't check while offline.") })
  } else if (!sub) {
    add({ id: 'delivery', label: t('Server reaches the push service'), status: 'not_checked', detail: t('Needs a subscription first.') })
  } else if (sub.failures > 0) {
    add({ id: 'delivery', label: t('Server reaches the push service'), status: 'fail', detail: t('{n, plural, one {The last send failed: {error}.} other {The last # sends failed: {error}.}}', { n: sub.failures, error: sub.lastError || t('unknown error') }), action: 'reenable' })
  } else if (sub.lastOkAt) {
    add({ id: 'delivery', label: t('Server reaches the push service'), status: 'ok', detail: t('Last delivered {instant}.', { instant: formatInstant(sub.lastOkAt, 'datetime') }) })
  } else {
    add({ id: 'delivery', label: t('Server reaches the push service'), status: 'pending', detail: t('Nothing delivered yet; send a test.') })
  }

  const hint = osNotificationHint(opts.ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : ''))
  if (!lastTest) {
    add({ id: 'test', label: t('Test notification received'), status: serverUnknown ? 'unknown' : 'pending', detail: serverUnknown ? t('The test needs the server; go online to run it.') : t('Not run yet.') })
  } else if (lastTest.kind === 'received') {
    add({ id: 'test', label: t('Test notification received'), status: 'ok', detail: `${t('Received on this device at {time}. If no banner appeared, the operating system hid it.', { time: formatInstant(lastTest.receivedAt, 'time') })} ${hint}` })
  } else if (lastTest.kind === 'accepted_not_seen') {
    add({ id: 'test', label: t('Test notification received'), status: 'fail', detail: `${t('The push service accepted the test, but this device has not reported it.')} ${hint}` })
  } else {
    const step: ChecklistStep = { id: 'test', label: t('Test notification received'), status: 'fail', detail: lastTest.kind === 'failed' ? `${TEST_DETAIL.failed} ${lastTest.status ? t('(status {status})', { status: lastTest.status }) : t('(the push service could not be reached)')}` : TEST_DETAIL[lastTest.kind] }
    if (lastTest.kind === 'gone' || lastTest.kind === 'no_subscription') step.action = noWorker ? undefined : lastTest.kind === 'gone' ? 'reenable' : 'enable'
    add(step)
  }
  return steps
}

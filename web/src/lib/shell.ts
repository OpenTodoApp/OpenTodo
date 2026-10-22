// The native shell bridge (OpenSpec change native-shells, design D5): a shell such
// as the Android app exposes `window.opentodoShell` to pages of the configured
// server's origin only. Everything here is optional: outside a shell `shell()` is
// null and every caller keeps today's browser behaviour. A method the shell does not
// list in `capabilities` is never called, so an older shell keeps working for the
// capabilities both sides know.

/** The bridge version this web app speaks. */
export const BRIDGE_VERSION = 1

/** The oldest shell app version this web app expects (bumped when a shell bug needs a forced update). */
export const MIN_SHELL_APP = '0.10.0'

export type ShellCapability = 'reminders' | 'share' | 'widgets' | 'biometric' | 'links'

/** One reminder handed to the shell: the next 7 days, title only when allowed. */
export interface ShellReminder {
  id: string
  taskId: string
  fireAt: number
  title?: string
}

/** The Today list the widgets show; titles only while the account is readable. */
export interface ShellWidgetData {
  updatedAt: number
  locked: boolean
  count: number
  overdue: number
  tasks: { id: string; title?: string; time?: string; priority: number; overdue: boolean }[]
}

/** The answer of `scheduleReminders`: whether the shell may show notifications. */
export type ShellPermission = 'granted' | 'denied' | 'exact-denied'

/** What the shell injects: the version fields plus the methods of bridge version 1. */
export interface OpenTodoShell {
  bridge: number
  platform: 'android' | 'ios' | 'desktop'
  app: string
  capabilities: string[]
  scheduleReminders?(json: string): Promise<ShellPermission> | ShellPermission | void
  testNotification?(): Promise<boolean> | boolean | void
  publishWidget?(json: string): void
  biometricStore?(keyB64: string): Promise<boolean> | boolean
  biometricRead?(): Promise<string | null> | string | null
  biometricForget?(): void
  openExternal?(url: string): void
}

declare global {
  interface Window {
    opentodoShell?: OpenTodoShell
  }
}

/** The shell's bridge, or null in a browser (or a bridge of an unknown shape). */
export function shell(): OpenTodoShell | null {
  if (typeof window === 'undefined') return null
  const s = window.opentodoShell
  if (!s || typeof s !== 'object' || typeof s.bridge !== 'number' || !Array.isArray(s.capabilities)) return null
  return s
}

/** Whether the shell is present and lists the capability. */
export function has(capability: ShellCapability): boolean {
  return !!shell()?.capabilities.includes(capability)
}

/** "0.9.1" < "0.10.0": numeric comparison of dotted versions, a suffix ignored. */
export function olderThan(version: string, min: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split(/[.+-]/).slice(0, 3).map((n) => Number.parseInt(n, 10) || 0)
  const a = parse(version), b = parse(min)
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0)
  return false
}

/** Whether Settings should say the shell is older than this server expects. */
export function shellOutdated(): boolean {
  const s = shell()
  return !!s && (s.bridge < BRIDGE_VERSION || olderThan(s.app, MIN_SHELL_APP))
}

/** Hands the next reminders to the shell; null when the shell cannot schedule. */
export async function scheduleReminders(list: ShellReminder[]): Promise<ShellPermission | null> {
  const s = shell()
  if (!s || !has('reminders') || !s.scheduleReminders) return null
  const out = await s.scheduleReminders(JSON.stringify(list))
  return out === 'denied' || out === 'exact-denied' ? out : 'granted'
}

/** Shows a test notification through the shell; null when the shell cannot. */
export async function testNotification(): Promise<boolean | null> {
  const s = shell()
  if (!s || !has('reminders') || !s.testNotification) return null
  return (await s.testNotification()) !== false
}

/** Publishes the widgets' Today list; false when the shell has no widgets. */
export function publishWidget(data: ShellWidgetData): boolean {
  const s = shell()
  if (!s || !has('widgets') || !s.publishWidget) return false
  s.publishWidget(JSON.stringify(data))
  return true
}

/** Stores the raw account key behind the device's biometrics; false when unavailable or refused. */
export async function biometricStore(keyB64: string): Promise<boolean> {
  const s = shell()
  if (!s || !has('biometric') || !s.biometricStore) return false
  return (await s.biometricStore(keyB64)) === true
}

/** Reads the raw account key after the biometric prompt; null when cancelled, invalid or unavailable. */
export async function biometricRead(): Promise<string | null> {
  const s = shell()
  if (!s || !has('biometric') || !s.biometricRead) return null
  const key = await s.biometricRead()
  return typeof key === 'string' && key ? key : null
}

/** Deletes the stored key (lock, sign-out, passphrase change, encryption off). */
export function biometricForget(): void {
  const s = shell()
  if (s && has('biometric')) s.biometricForget?.()
}

/** Sign-out: the shell drops the schedule, the widget data and the key behind the biometrics. */
export function forgetShellData(): void {
  const s = shell()
  if (!s) return
  if (has('reminders')) void Promise.resolve(s.scheduleReminders?.('[]')).catch(() => undefined)
  if (has('widgets')) s.publishWidget?.(JSON.stringify({ updatedAt: Date.now(), locked: true, count: 0, overdue: 0, tasks: [] }))
  if (has('biometric')) s.biometricForget?.()
}

/** Opens a URL outside the web view when the shell can; false means the caller opens it itself. */
export function openExternal(url: string): boolean {
  const s = shell()
  if (!s || !has('links') || !s.openExternal) return false
  s.openExternal(url)
  return true
}

/** True for an absolute http(s) URL of another origin than the page's. */
function external(href: string): boolean {
  try {
    const u = new URL(href, window.location.href)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== window.location.origin
  } catch {
    return false
  }
}

/**
 * In a shell with `links`, opens links to other origins and `target=_blank` links in
 * the system browser instead of the web view, so a provider page or a map never
 * carries the bridge; `window.open` of such a URL does the same. Does nothing in a
 * browser. Returns the uninstall function.
 */
export function installShellLinks(doc: Document = document): () => void {
  if (!has('links')) return () => {}
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a) return
    const href = a.getAttribute('href') ?? ''
    if (a.target !== '_blank' && !external(href)) return
    if (openExternal(new URL(href, window.location.href).href)) e.preventDefault()
  }
  doc.addEventListener('click', onClick)
  const original = window.open
  window.open = ((url?: string | URL, target?: string, features?: string) => {
    const href = url == null ? '' : String(url)
    if (href && (target === '_blank' || external(href)) && openExternal(new URL(href, window.location.href).href)) return null
    return original.call(window, url, target, features)
  }) as typeof window.open
  return () => { doc.removeEventListener('click', onClick); window.open = original }
}

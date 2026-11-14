// The native shell bridge (OpenSpec change native-shells, design D5): a shell such
// as the Android app exposes `window.opentodoShell` to pages of the configured
// server's origin only. Everything here is optional: outside a shell `shell()` is
// null and every caller keeps today's browser behaviour. A method the shell does not
// list in `capabilities` is never called, so an older shell keeps working for the
// capabilities both sides know. The bridge comes from the platform port
// (native-app-foundation D3): the native app has no web view and no bridge.
import { platform } from './platform'

/** The bridge version this web app speaks. */
export const BRIDGE_VERSION = 1

/** The oldest shell app version this web app expects (bumped when a shell bug needs a forced update). */
export const MIN_SHELL_APP = '0.10.0'

<<<<<<< HEAD
export type ShellCapability = 'reminders' | 'share' | 'widgets' | 'biometric' | 'links' | 'obsidian-links' | 'system-bars' | 'microphone' | 'geofences' | 'files' | 'haptics' | 'alarm-settings' | 'background'
=======
export type ShellCapability = 'reminders' | 'share' | 'widgets' | 'biometric' | 'links' | 'obsidian-links' | 'system-bars' | 'microphone' | 'geofences' | 'files' | 'haptics' | 'pull-refresh'
>>>>>>> worktree-agent-a327148a1a1e3624c

/**
 * One location reminder handed to the shell (location-reminders D3): the circle
 * to watch and the direction. The title only under the include-titles rule and
 * never for an encrypted account.
 */
export interface ShellGeofence {
  id: string
  taskId: string
  lat: number
  lon: number
  /** Metres, 100 to 5,000. */
  radius: number
  on: 'arrive' | 'leave'
  title?: string
}

/** The argument of `scheduleGeofences`: every armed location reminder, at most 100, sorted by id. */
export interface ShellGeofencePayload {
  version: 1
  /**
   * Set only when the user turns "Location reminders on this phone" on: a shell
   * with a screen asks for the missing location permission (fine, then
   * background) even when `regions` is empty. Without it the shell never asks.
   */
  ask?: true
  regions: ShellGeofence[]
}

/** The answer of `scheduleGeofences`: whether the shell may watch the regions in the background. */
export type ShellLocationPermission = 'granted' | 'foreground-only' | 'denied' | 'unavailable'

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
  /**
   * play-location-later: set by the Android app built for Google Play, which leaves
   * location reminders out until Play approves background location (the GitHub and
   * F-Droid app has them). Absent elsewhere.
   */
  store?: 'play'
  scheduleReminders?(json: string): Promise<ShellPermission> | ShellPermission | void
  testNotification?(): Promise<boolean> | boolean | void
  publishWidget?(json: string): void
  biometricStore?(keyB64: string): Promise<boolean> | boolean
  biometricRead?(): Promise<string | null> | string | null
  biometricForget?(): void
  openExternal?(url: string): void
  /** theme-engine D8: the status and navigation bar colour, `{"color":"#rrggbb","dark":bool}` (dark: light icons). */
  setSystemBars?(json: string): void
  /**
   * location-reminders D3: replaces the watched regions with a `ShellGeofencePayload`
   * and answers the background location state. It asks for the permission only
   * when the payload says `ask` and the shell has a screen; without background
   * permission it registers nothing.
   */
  scheduleGeofences?(json: string): Promise<ShellLocationPermission> | ShellLocationPermission | void
  /** Ask the phone for the microphone before the page records. True once it is allowed. */
  requestMicrophone?(): Promise<boolean> | boolean
  /**
   * shell-repairs D2: one chunk of a file made in the page (a `ShellFileChunk` of
   * lib/saveFile.ts). Answers `more` for a chunk that is not the last; the last one
   * opens the phone's save dialog and answers `saved`, `cancelled` or `failed`.
   */
  saveFile?(json: string): Promise<string> | string
  /** shell-repairs D5: the platform's own feedback for a `ShellHaptic`; an unknown kind is ignored. */
  haptic?(kind: string): void
<<<<<<< HEAD
  /** shell-reminders-on D3: opens the system page where exact alarms are allowed (Android, the visible app). */
  openAlarmSettings?(): void
  /** shell-reminders-on D4: a background run's web app is done; the shell ends the run. */
  backgroundDone?(): void
=======
  /**
   * pull-to-sync D4: the page showing handles a pull down itself, so a shell with its
   * own pull to refresh (`pull-refresh`) turns that off until another page loads.
   */
  pullHandled?(): void
>>>>>>> worktree-agent-a327148a1a1e3624c
}

declare global {
  interface Window {
    opentodoShell?: OpenTodoShell
  }
}

/** The shell's bridge, or null in a browser (or a bridge of an unknown shape). */
export function shell(): OpenTodoShell | null {
  const s = platform.shell()
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

/**
 * True when the page may use the microphone. A shell that asks the phone itself is
 * asked first, so the prompt is the system's and not a refusal the page then has to
 * explain. Without that capability (a browser, an older shell) the page asks as before.
 */
export async function allowMicrophone(): Promise<boolean> {
  const s = shell()
  if (!s || !has('microphone') || !s.requestMicrophone) return true
  return (await s.requestMicrophone()) === true
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

/** The payload that clears every region (sign-out, lock, the switch turned off). */
export const NO_GEOFENCES: ShellGeofencePayload = { version: 1, regions: [] }

/** Hands the armed location reminders to the shell; null when the shell has no `geofences`. */
export async function scheduleGeofences(payload: ShellGeofencePayload, fresh = false): Promise<ShellLocationPermission | null> {
  const s = shell()
  if (!s || !has('geofences') || !s.scheduleGeofences) return null
  // The publisher runs on every local change: an unchanged set is not handed over
  // again unless the caller needs a fresh answer (`fresh`, or asking).
  const key = JSON.stringify(payload.regions)
  if (!payload.ask && !fresh && sent.last?.key === key) return sent.last.answer
  const out = await s.scheduleGeofences(JSON.stringify(payload))
  const answer: ShellLocationPermission = out === 'foreground-only' || out === 'denied' || out === 'granted' ? out : 'unavailable'
  sent.last = { key, answer }
  return answer
}

/** The last regions handed to the shell and its answer (reset when the shell data is forgotten). */
const sent: { last: { key: string; answer: ShellLocationPermission } | null } = { last: null }


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
  if (has('geofences')) {
    sent.last = null
    void Promise.resolve(s.scheduleGeofences?.(JSON.stringify(NO_GEOFENCES))).catch(() => undefined)
  }
  if (has('widgets')) s.publishWidget?.(JSON.stringify({ updatedAt: Date.now(), locked: true, count: 0, overdue: 0, tasks: [] }))
  if (has('biometric')) s.biometricForget?.()
}

/**
 * Whether the shell shows the app to a person (shell-reminders-on D2). A background
 * run lists no `links`: nothing it answers is a person's answer, and nothing it is
 * handed may ask one.
 */
export function shellVisible(): boolean {
  return has('links')
}

/** Opens the system's exact-alarm page in a shell that lists `alarm-settings`; false elsewhere. */
export function openAlarmSettings(): boolean {
  const s = shell()
  if (!s || !has('alarm-settings') || !s.openAlarmSettings) return false
  s.openAlarmSettings()
  return true
}

/** Tells a background run's shell the web app is done; false outside such a run. */
export function backgroundDone(): boolean {
  const s = shell()
  if (!s || !has('background') || !s.backgroundDone) return false
  s.backgroundDone()
  return true
}

/** Opens a URL outside the web view when the shell can; false means the caller opens it itself. */
export function openExternal(url: string): boolean {
  const s = shell()
  if (!s || !has('links') || !s.openExternal) return false
  s.openExternal(url)
  return true
}

/**
 * Hands an Obsidian note link to the shell (obsidian-origin D4) when it lists
 * `obsidian-links`; the shell checks the link's shape again and opens nothing
 * else. False when the shell cannot: the caller then offers Copy link.
 */
export function openObsidian(url: string): boolean {
  const s = shell()
  if (!s || !has('obsidian-links') || !s.openExternal) return false
  s.openExternal(url)
  return true
}

/** The kinds of feedback a shell with `haptics` plays (shell-repairs D5). */
export type ShellHaptic = 'tick' | 'success'

/** Plays `kind` through a shell that lists `haptics`. False in a browser or another shell. */
export function shellHaptic(kind: ShellHaptic): boolean {
  const s = shell()
  if (!s || !has('haptics') || !s.haptic) return false
  s.haptic(kind)
  return true
}

/**
 * Tells a shell that lists `pull-refresh` (one with its own pull to refresh, which
 * reloads the page) that this page handles the pull itself (pull-to-sync D4). The
 * shell forgets it when another page loads, so every load says it again. False in a
 * browser or a shell without one.
 */
export function takeOverPull(): boolean {
  const s = shell()
  if (!s || !has('pull-refresh') || !s.pullHandled) return false
  s.pullHandled()
  return true
}

/** The payload of `setSystemBars` (theme-engine D8): the bar colour and whether its icons must be light. */
export interface ShellSystemBars {
  color: string
  dark: boolean
}

/** Whether light icons read better than dark ones on a `#rrggbb` colour (WCAG contrast of white and black on it). */
export function needsLightIcons(hex: string): boolean {
  const lin = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5)
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.05
}

/** The payload for a bar colour. */
export function systemBarsPayload(color: string): ShellSystemBars {
  return { color, dark: needsLightIcons(color) }
}

/**
 * Hands the bar colour to the shell when it lists `system-bars` (theme-engine D8);
 * false when the shell cannot colour its bars. The caller sends a colour only when it
 * changed (lib/appearance.ts).
 */
export function setSystemBars(color: string): boolean {
  const s = shell()
  if (!s || !has('system-bars') || !s.setSystemBars || !/^#[0-9a-f]{6}$/.test(color)) return false
  s.setSystemBars(JSON.stringify(systemBarsPayload(color)))
  return true
}

/** True for an absolute http(s) URL of another origin than the page's. */
function external(href: string, page: Location): boolean {
  try {
    const u = new URL(href, page.href)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.origin !== page.origin
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
export function installShellLinks(doc: Document): () => void {
  const win = doc.defaultView
  if (!win || !has('links')) return () => {}
  const page = win.location
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!a) return
    const href = a.getAttribute('href') ?? ''
    if (a.target !== '_blank' && !external(href, page)) return
    if (openExternal(new URL(href, page.href).href)) e.preventDefault()
  }
  doc.addEventListener('click', onClick)
  const original = win.open
  win.open = ((url?: string | URL, target?: string, features?: string) => {
    const href = url == null ? '' : String(url)
    if (href && (target === '_blank' || external(href, page)) && openExternal(new URL(href, page.href).href)) return null
    return original.call(win, url, target, features)
  }) as typeof win.open
  return () => { doc.removeEventListener('click', onClick); win.open = original }
}

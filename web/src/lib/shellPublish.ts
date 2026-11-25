// What the web app hands a native shell while it runs there (OpenSpec change
// native-shells, design D4 and D6): the next 7 days of reminders for the
// device-scheduled notifications, and the Today list for the widgets. Both are
// computed from the local store on every change, debounced, and republished empty
// or as counts when the account is locked or the user signs out (the store empties).
// Outside a shell nothing here runs.
import { liveQuery, type Subscription } from 'dexie'
import { addDaysISO, localDueOf, logicalToday } from './dates'
import { todayList } from './dayLists'
import { db, getMeta, setMeta } from './db'
import { encryptionSnapshot, onEncryptionChange } from './e2ee'
import { publishGeofences } from './geofences'
import { has, publishWidget, scheduleReminders, shell, shellVisible, type ShellPermission, type ShellReminder, type ShellWidgetData } from './shell'
import { heldAway, inQuietProject, type ProjectLink } from './reminderWatcher'
import { syncQuickAddReply } from './shellQuickAdd'
import { currentUserId } from './sharing'
import { compute, sharedIds } from './stats'
import type { StatProject } from './statsCounted'
import type { Membership } from './types'
import type { Project, Reminder, Task } from './types'
import { withoutKept } from './subtasks'

/** The device's "notifications through the app" switch (Settings → Notifications in a shell). */
export const META_SHELL_NOTIFICATIONS = 'shell:notifications'
/** Set when the switch was turned off automatically on a refused permission, not by the user, so a later grant can turn it back on (recheckShellNotifications). */
export const META_SHELL_NOTIF_AUTO_OFF = 'shell:notificationsAutoOff'
/** Shared with web push: whether notifications carry task titles. */
const META_INCLUDE = 'push:includeContent'
/** Set once the device was told that exact alarms are refused (shell-reminders-on D3). */
export const META_EXACT_NOTICED = 'shell:exactNoticed'
/** Dispatched on `window` whenever a hand-over from the visible app answers `exact-denied`; app/shellExactNotice.ts says it once per device. */
export const EXACT_ALARMS_EVENT = 'opentodo:exact-alarms'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const WIDGET_MAX = 50
const DEBOUNCE_MS = 500

/**
 * The reminders the shell should schedule: live, not dismissed, firing in the next 7
 * days, on an open task outside any trashed or archived project (OpenSpec `reminders`).
 */
export function shellReminders(reminders: readonly Reminder[], tasks: readonly Task[], now: number, opts: { titles: boolean; encrypted: boolean; away?: string }, projects: readonly ProjectLink[] = []): ShellReminder[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const out: ShellReminder[] = []
  for (const r of reminders) {
    if (r.deleted_at || r.fire_at == null || r.fire_at < now || r.fire_at > now + WEEK_MS) continue
    if (r.dismissed_at != null && r.dismissed_at >= r.fire_at) continue
    if (heldAway(opts.away, r.fire_at)) continue
    const task = byId.get(r.task_id)
    if (!task || task.deleted_at || task.completed_at) continue
    if (inQuietProject(task.project_id, projectById)) continue
    const item: ShellReminder = { id: r.id, taskId: r.task_id, fireAt: r.fire_at }
    if (opts.titles && !opts.encrypted && task.title) item.title = task.title
    if (r.urgent === true) item.urgent = true
    out.push(item)
  }
  return out.sort((a, b) => a.fireAt - b.fireAt)
}

/**
 * The widgets' Today list: titles, times, the project's name and an overdue task's
 * date only while the account is readable on this device, counts otherwise.
 * `actions` tells the shell what it may ask of this web app (android-widget-list D3):
 * `complete`, the widget's completion circle (`/?complete=<id>` in a background run).
 */
export function shellWidget(tasks: readonly Task[], today: string, now: number, locked: boolean, me?: string | null, projects: readonly Pick<Project, 'id' | 'name'>[] = []): ShellWidgetData {
  const list = todayList(tasks.filter((task) => !task.deleted_at && !task.completed_at), today, me)
  const names = new Map(projects.map((p) => [p.id, p.name]))
  const rows = list.slice(0, WIDGET_MAX).map((task) => {
    const due = localDueOf(task.due)
    const overdue = !!due && due.date < today
    const project = task.project_id ? names.get(task.project_id) : undefined
    return {
      id: task.id,
      ...(locked ? {} : { title: task.title }),
      ...(due?.time && !locked ? { time: due.time } : {}),
      ...(overdue && due && !locked ? { date: due.date } : {}),
      ...(project && !locked ? { project } : {}),
      priority: task.priority,
      overdue,
    }
  })
  return { updatedAt: now, locked, count: list.length, overdue: rows.filter((r) => r.overdue).length, tasks: locked ? [] : rows, actions: ['complete'] }
}

/**
 * The Completed widget's numbers (completed-widget D1): today's completions and, while
 * the account is readable, the last 7 days', from the Statistics count itself, so the
 * widget and the Stats screen never disagree. Locked: today's count only (D1).
 */
export function shellCompleted(tasks: readonly Task[], projects: readonly StatProject[], memberships: readonly Pick<Membership, 'projectId'>[], me: string | null, today: string, locked: boolean): NonNullable<ShellWidgetData['completed']> {
  const stats = compute({ tasks, projects, shared: sharedIds(memberships), me, today }, { start: addDaysISO(today, -6), end: today })
  const days = stats.perDay.map((d) => ({ day: d.date, done: d.count }))
  return locked ? { today: days[days.length - 1].done } : { today: days[days.length - 1].done, days }
}

/**
 * Whether the shell's notifications carry task titles on this device. On until the
 * user turns it off (shell-reminders-on D1); a browser's web push reads the same key
 * with its own default of off (lib/push.ts).
 */
export async function shellTitlesEnabled(): Promise<boolean> {
  return getMeta<boolean>(META_INCLUDE, true)
}

/** Sets whether notifications carry task titles; the publisher re-sends the schedule. */
export async function setShellTitles(on: boolean): Promise<void> {
  await setMeta(META_INCLUDE, on)
  // A push subscription carries the option too (shell-push D6).
  if (has('push')) void import('./shellPush').then((m) => m.syncShellPush()).catch(() => undefined)
}

/** Whether the device's notifications go through the shell: on until the user turns it off (shell-reminders-on D1). */
export async function shellNotificationsEnabled(): Promise<boolean> {
  return getMeta<boolean>(META_SHELL_NOTIFICATIONS, true)
}

/** True the first time this device asks: the exact-alarm notice is said once (shell-reminders-on D3). */
export async function takeExactNotice(): Promise<boolean> {
  if (await getMeta<boolean>(META_EXACT_NOTICED, false)) return false
  await setMeta(META_EXACT_NOTICED, true)
  return true
}

/** Turns the device's notifications off because the permission was refused, not by the user; a later grant turns them back on (recheckShellNotifications). */
async function autoOffShellNotifications(): Promise<void> {
  await setMeta(META_SHELL_NOTIFICATIONS, false)
  await setMeta(META_SHELL_NOTIF_AUTO_OFF, true)
}

/** Turns the shell's notifications on or off; returns the permission the shell reports (null without a shell). */
export async function setShellNotifications(on: boolean): Promise<ShellPermission | null> {
  if (!has('reminders')) return null
  await setMeta(META_SHELL_NOTIFICATIONS, on)
  // The user is choosing: clear the automatic-off mark so this stands until they change it.
  await setMeta(META_SHELL_NOTIF_AUTO_OFF, false)
  if (!on) {
    // Push delivery goes with the device's notifications (shell-push D6).
    if (has('push')) await import('./shellPush').then((m) => m.disableShellPush()).catch(() => undefined)
    await scheduleReminders([])
    return 'granted'
  }
  const permission = await publishReminders()
  if (permission === 'denied') await autoOffShellNotifications()
  return permission
}

/**
 * On resume: if the switch was turned off automatically on a refused permission (not by
 * the user) and the permission has since been granted in the system settings, turn it
 * back on. The shell reports the current permission on every schedule, so re-publishing
 * with the switch on settles it — a grant keeps it on and clears the mark, a refusal
 * turns it off again and keeps the mark for next time. Without this, reminders stay
 * in-app forever after the user allows notifications in the system settings.
 */
export async function recheckShellNotifications(): Promise<void> {
  if (!has('reminders')) return
  if (!(await getMeta<boolean>(META_SHELL_NOTIF_AUTO_OFF, false))) return
  await setMeta(META_SHELL_NOTIFICATIONS, true)
  const permission = await publishReminders()
  if (permission === 'denied') await autoOffShellNotifications()
  else if (permission != null) await setMeta(META_SHELL_NOTIF_AUTO_OFF, false)
}

/**
 * Computes and hands over the schedule now; empty when off, locked or signed out.
 * What the shell answers counts only when a person could have been asked
 * (shell-reminders-on D2): the visible app, handed at least one reminder. Then a
 * refusal turns the setting off, and refused exact alarms are announced.
 */
export async function publishReminders(now = Date.now()): Promise<ShellPermission | null> {
  const enc = encryptionSnapshot()
  const on = await shellNotificationsEnabled()
  if (!on || (enc.enabled && !enc.unlocked)) return scheduleReminders([])
  const [reminders, tasks, projects, titles, prefs] = await Promise.all([db.reminders.toArray(), db.tasks.toArray(), db.projects.toArray(), shellTitlesEnabled(), db.userPrefs.get('me')])
  // A kept subtask fires no reminder (keep-open-subtasks D3).
  const list = shellReminders(reminders, withoutKept(tasks), now, { titles, encrypted: enc.enabled, away: prefs?.away }, projects)
  const permission = await scheduleReminders(list)
  if (!list.length || !shellVisible()) return permission
  if (permission === 'denied') await autoOffShellNotifications()
  else if (permission === 'exact-denied' && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EXACT_ALARMS_EVENT))
  return permission
}

/** Computes and hands over the widgets' Today list now. */
async function publishToday(now = Date.now()): Promise<void> {
  const enc = encryptionSnapshot()
  const [tasks, memberships, me, projects] = await Promise.all([db.tasks.toArray(), db.memberships.toArray(), currentUserId(), db.projects.toArray()])
  const today = logicalToday(undefined, now)
  const locked = enc.enabled && !enc.unlocked
  publishWidget({ ...shellWidget(withoutKept(tasks), today, now, locked, me, projects), completed: shellCompleted(tasks, projects, memberships, me, today, locked) })
}

let started = false

/** Starts the publishers when the page runs in a shell with `reminders`, `widgets`, `geofences` or `focus`; a no-op otherwise. */
export function startShellPublishers(): () => void {
  if (started || !shell() || (!has('reminders') && !has('widgets') && !has('geofences') && !has('focus'))) return () => {}
  started = true
  // The Focus session (focus-live-activity D1), from its own chunk.
  let stopFocus: (() => void) | null = null
  let stopped = false
  if (has('focus')) void import('./focus/shellPublish').then((m) => { if (!stopped) stopFocus = m.startFocusPublisher() }).catch(() => undefined)
  let timer: ReturnType<typeof setTimeout> | null = null
  const run = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (has('reminders')) void publishReminders().catch(() => undefined)
      if (has('widgets')) void publishToday().catch(() => undefined)
      // Location reminders (location-reminders D3): the armed regions, on every change and on the tick.
      if (has('geofences')) void publishGeofences().catch(() => undefined)
      // The quick-add notification's inline field follows encryption (android-quick-add-notification D3).
      syncQuickAddReply()
    }, DEBOUNCE_MS)
  }
  // Any change to tasks, reminders, projects (trashed or archived), places (a linked place's pin), the meta table (the switches, the titles option) or the preferences (an away period).
  const sub: Subscription = liveQuery(() => Promise.all([db.tasks.count(), db.reminders.toArray(), db.tasks.toArray(), db.projects.toArray(), db.places.toArray(), db.meta.toArray(), db.userPrefs.get('me')])).subscribe({ next: run, error: () => undefined })
  const offEnc = onEncryptionChange(run)
  // The day rolls over at the logical day start even when nothing changes.
  const tick = setInterval(run, 15 * 60 * 1000)
  // On resume (the app shown again): a notification permission granted in the system
  // settings turns the device's notifications back on (shell-reminders recovery).
  const onVisible = () => { if (document.visibilityState === 'visible') void recheckShellNotifications().catch(() => undefined) }
  const canVisible = typeof document !== 'undefined' && has('reminders')
  if (canVisible) document.addEventListener('visibilitychange', onVisible)
  return () => { stopped = true; stopFocus?.(); sub.unsubscribe(); offEnc(); clearInterval(tick); if (canVisible) document.removeEventListener('visibilitychange', onVisible); if (timer) clearTimeout(timer); started = false }
}


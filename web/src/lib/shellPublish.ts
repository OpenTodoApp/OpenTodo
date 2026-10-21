// What the web app hands a native shell while it runs there (OpenSpec change
// native-shells, design D4 and D6): the next 7 days of reminders for the
// device-scheduled notifications, and the Today list for the widgets. Both are
// computed from the local store on every change, debounced, and republished empty
// or as counts when the account is locked or the user signs out (the store empties).
// Outside a shell nothing here runs.
import { liveQuery, type Subscription } from 'dexie'
import { localDueOf, logicalToday } from './dates'
import { todayList } from './dayLists'
import { db, getMeta, setMeta } from './db'
import { encryptionSnapshot, onEncryptionChange } from './e2ee'
import { has, publishWidget, scheduleReminders, shell, type ShellPermission, type ShellReminder, type ShellWidgetData } from './shell'
import type { Reminder, Task } from './types'

/** The device's "notifications through the app" switch (Settings → Notifications in a shell). */
export const META_SHELL_NOTIFICATIONS = 'shell:notifications'
/** Shared with web push: whether notifications carry task titles. */
const META_INCLUDE = 'push:includeContent'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const WIDGET_MAX = 50
const DEBOUNCE_MS = 500

/** The reminders the shell should schedule: live, not dismissed, firing in the next 7 days. */
export function shellReminders(reminders: readonly Reminder[], tasks: readonly Task[], now: number, opts: { titles: boolean; encrypted: boolean }): ShellReminder[] {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const out: ShellReminder[] = []
  for (const r of reminders) {
    if (r.deleted_at || r.fire_at == null || r.fire_at < now || r.fire_at > now + WEEK_MS) continue
    if (r.dismissed_at != null && r.dismissed_at >= r.fire_at) continue
    const task = byId.get(r.task_id)
    if (!task || task.deleted_at || task.completed_at) continue
    const item: ShellReminder = { id: r.id, taskId: r.task_id, fireAt: r.fire_at }
    if (opts.titles && !opts.encrypted && task.title) item.title = task.title
    out.push(item)
  }
  return out.sort((a, b) => a.fireAt - b.fireAt)
}

/** The widgets' Today list: titles only while the account is readable on this device, counts otherwise. */
export function shellWidget(tasks: readonly Task[], today: string, now: number, locked: boolean): ShellWidgetData {
  const list = todayList(tasks.filter((task) => !task.deleted_at && !task.completed_at), today)
  const rows = list.slice(0, WIDGET_MAX).map((task) => {
    const due = localDueOf(task.due)
    const overdue = !!due && due.date < today
    return {
      id: task.id,
      ...(locked ? {} : { title: task.title }),
      ...(due?.time && !locked ? { time: due.time } : {}),
      priority: task.priority,
      overdue,
    }
  })
  return { updatedAt: now, locked, count: list.length, overdue: rows.filter((r) => r.overdue).length, tasks: locked ? [] : rows }
}

/** Whether the device's notifications go through the shell. */
export async function shellNotificationsEnabled(): Promise<boolean> {
  return getMeta<boolean>(META_SHELL_NOTIFICATIONS, false)
}

/** Turns the shell's notifications on or off; returns the permission the shell reports (null without a shell). */
export async function setShellNotifications(on: boolean): Promise<ShellPermission | null> {
  if (!has('reminders')) return null
  await setMeta(META_SHELL_NOTIFICATIONS, on)
  if (!on) {
    await scheduleReminders([])
    return 'granted'
  }
  const permission = await publishReminders()
  if (permission === 'denied') await setMeta(META_SHELL_NOTIFICATIONS, false)
  return permission
}

/** Computes and hands over the schedule now; empty when off, locked or signed out. */
async function publishReminders(now = Date.now()): Promise<ShellPermission | null> {
  const enc = encryptionSnapshot()
  const on = await shellNotificationsEnabled()
  if (!on || (enc.enabled && !enc.unlocked)) return scheduleReminders([])
  const [reminders, tasks, titles] = await Promise.all([db.reminders.toArray(), db.tasks.toArray(), getMeta<boolean>(META_INCLUDE, false)])
  return scheduleReminders(shellReminders(reminders, tasks, now, { titles, encrypted: enc.enabled }))
}

/** Computes and hands over the widgets' Today list now. */
async function publishToday(now = Date.now()): Promise<void> {
  const enc = encryptionSnapshot()
  const tasks = await db.tasks.toArray()
  publishWidget(shellWidget(tasks, logicalToday(undefined, now), now, enc.enabled && !enc.unlocked))
}

let started = false

/** Starts the publishers when the page runs in a shell with `reminders` or `widgets`; a no-op otherwise. */
export function startShellPublishers(): () => void {
  if (started || !shell() || (!has('reminders') && !has('widgets'))) return () => {}
  started = true
  let timer: ReturnType<typeof setTimeout> | null = null
  const run = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (has('reminders')) void publishReminders().catch(() => undefined)
      if (has('widgets')) void publishToday().catch(() => undefined)
    }, DEBOUNCE_MS)
  }
  // Any change to tasks, reminders or the meta table (the switch, the titles option).
  const sub: Subscription = liveQuery(() => Promise.all([db.tasks.count(), db.reminders.toArray(), db.tasks.toArray(), db.meta.toArray()])).subscribe({ next: run, error: () => undefined })
  const offEnc = onEncryptionChange(run)
  // The day rolls over at the logical day start even when nothing changes.
  const tick = setInterval(run, 15 * 60 * 1000)
  return () => { sub.unsubscribe(); offEnc(); clearInterval(tick); if (timer) clearTimeout(timer); started = false }
}


// In-app reminder delivery (OpenSpec change `reminders`, design D7). A small
// polling loop over the local store: no server, no permission, works offline.
// It publishes the reminders that are due right now; the UI renders them as
// toasts. A reminder the service worker already showed as a system notification
// for the same firing time is skipped (the shared "shown" set below).
import Dexie, { type ObservabilitySet } from 'dexie'
import { quietOn } from './away'
import { logicalDay } from './dates'
import { db, getMeta, setMeta } from './db'
import { isDue } from './reminderTime'
import type { Project, Reminder, Task } from './types'
import { USER_PREFS_ID } from './userPrefs'
import { keptAmong } from './subtasks'

/** How often the watcher looks (the spec allows up to a minute of delay). */
export const WATCH_INTERVAL_MS = 15_000

/** Meta key of the shown set: reminder id -> { fireAt, by } (written by the service worker and the app). */
export const SHOWN_KEY = 'reminders:shown'

export interface ShownEntry {
  fireAt: number
  /** 'sw': a system notification was shown; 'app': an in-app toast or local notification. */
  by: 'sw' | 'app'
}
export type ShownSet = Record<string, ShownEntry>

export interface DueReminder {
  reminder: Reminder
  task: Task
}

export type ProjectLink = Pick<Project, 'id' | 'parent_id' | 'deleted_at'> & { archived?: boolean }

/**
 * Whether a project, or any project above it, is in the Trash or archived: the
 * reminders of its tasks wait (OpenSpec `reminders`). Unknown projects end the
 * walk; a cycle from concurrent moves is stopped by the seen set. The server's
 * twin is `projectQuiet` in internal/push; both read reminderProjects.vectors.json.
 */
export function inQuietProject(projectId: string | null | undefined, projects: Map<string, ProjectLink>): boolean {
  const seen = new Set<string>()
  let id = projectId ?? null
  while (id && !seen.has(id)) {
    seen.add(id)
    const p = projects.get(id)
    if (!p) return false
    if (p.deleted_at || p.archived) return true
    id = p.parent_id ?? null
  }
  return false
}

/** Whether a firing at `fireAt` falls on a day of an away period that pauses reminders (away-periods D4). */
export const heldAway = (away: string | undefined, fireAt: number | null): boolean =>
  !!away && fireAt != null && quietOn(away, logicalDay(fireAt))

/**
 * The reminders due at `now`: fired, live, not dismissed for this firing, on an open
 * task outside any trashed or archived project, and not already shown by the service
 * worker for the same firing time. Oldest first. A reminder skipped while its project
 * is trashed or archived shows again once the project is restored or unarchived.
 */
export function dueReminders(
  reminders: Reminder[],
  tasks: Map<string, Task>,
  now: number,
  shown: ShownSet = {},
  projects: Map<string, ProjectLink> = new Map(),
  away = '',
): DueReminder[] {
  const out: DueReminder[] = []
  for (const r of reminders) {
    const task = tasks.get(r.task_id)
    if (!isDue(r, task, now)) continue
    // Away with reminders paused (away-periods D4): dropped, also once the period ends.
    if (heldAway(away, r.fire_at)) continue
    // A graduated habit fires no reminder (habits-home D7).
    if (task?.habit_graduated_at != null) continue
    if (inQuietProject(task?.project_id, projects)) continue
    const s = shown[r.id]
    if (s && s.by === 'sw' && s.fireAt === r.fire_at) continue
    out.push({ reminder: r, task: task as Task })
  }
  return out.sort((a, b) => (a.reminder.fire_at as number) - (b.reminder.fire_at as number))
}

/** One pass over the local store. */
export async function checkReminders(now = Date.now()): Promise<DueReminder[]> {
  const reminders = await db.reminders.where('fire_at').belowOrEqual(now).toArray()
  if (reminders.length === 0) return []
  const ids = [...new Set(reminders.map((r) => r.task_id))]
  const tasks = new Map<string, Task>()
  for (const t of await db.tasks.bulkGet(ids)) if (t) tasks.set(t.id, t)
  // A kept subtask's reminder waits until its parent is reopened (keep-open-subtasks D3).
  for (const id of await keptAmong(tasks.values())) tasks.delete(id)
  const projects = new Map<string, ProjectLink>()
  if ([...tasks.values()].some((t) => t.project_id)) {
    for (const p of await db.projects.toArray()) projects.set(p.id, p)
  }
  const prefs = await db.userPrefs.get(USER_PREFS_ID)
  return dueReminders(reminders, tasks, now, await getMeta<ShownSet>(SHOWN_KEY, {}), projects, prefs?.away ?? '')
}

/** Record that this device showed a reminder for its current firing time. */
export async function markShown(id: string, fireAt: number, by: ShownEntry['by']): Promise<void> {
  const shown = await getMeta<ShownSet>(SHOWN_KEY, {})
  if (shown[id]?.fireAt === fireAt && shown[id]?.by === by) return
  shown[id] = { fireAt, by }
  // Keep the set small: entries for ids that no longer exist are dropped lazily.
  const ids = Object.keys(shown)
  if (ids.length > 200) {
    const live = new Set((await db.reminders.bulkGet(ids)).filter((r) => r && !r.deleted_at).map((r) => (r as Reminder).id))
    for (const k of ids) if (!live.has(k)) delete shown[k]
  }
  await setMeta(SHOWN_KEY, shown)
}

type Listener = (due: DueReminder[]) => void

export interface Watcher {
  /** Run a pass now (after a local change or a message from the service worker). */
  poke(): void
  stop(): void
}

/**
 * Start polling. `onChange` receives the full list of due reminders whenever it
 * changes (and once at start). A precise timer also fires at the next upcoming
 * firing time when that is sooner than the interval.
 */
export function startReminderWatcher(onChange: Listener, opts: { intervalMs?: number; now?: () => number } = {}): Watcher {
  const interval = opts.intervalMs ?? WATCH_INTERVAL_MS
  const now = opts.now ?? Date.now
  let stopped = false
  let last = ''
  let next: ReturnType<typeof setTimeout> | null = null
  let running = false
  let again = false

  async function run() {
    if (stopped) return
    if (running) {
      again = true
      return
    }
    running = true
    try {
      do {
        again = false
        const t = now()
        const due = await checkReminders(t)
        const key = due.map((d) => `${d.reminder.id}@${d.reminder.fire_at}:${d.task.title}`).join('|')
        if (key !== last && !stopped) {
          last = key
          onChange(due)
        }
        await armNext(t)
      } while (again && !stopped)
    } catch {
      // The store can be closed during sign-out; the next tick tries again.
    } finally {
      running = false
    }
  }

  async function armNext(t: number) {
    if (next) clearTimeout(next)
    next = null
    const upcoming = await db.reminders.where('fire_at').between(t, t + interval, false, true).first()
    if (upcoming?.fire_at != null && !stopped) next = setTimeout(() => void run(), Math.max(0, upcoming.fire_at - t) + 50)
  }

  // A change to reminders or tasks, here or in another page of the app (Dexie forwards
  // those as storagemutated), is looked at once: Done on an Android notification completes
  // the task in the shell's hidden web view while this page shows its card (issue 1535).
  const onMutated = (parts: ObservabilitySet) => { if (touchesReminders(parts)) void run() }
  Dexie.on.storagemutated.subscribe(onMutated)
  const timer = setInterval(() => void run(), interval)
  void run()
  return {
    poke: () => void run(),
    stop() {
      stopped = true
      Dexie.on.storagemutated.unsubscribe(onMutated)
      clearInterval(timer)
      if (next) clearTimeout(next)
    },
  }
}

/** Whether a change set names this database's reminders or tasks (keys read `idb://<db>/<table>/…`). */
function touchesReminders(parts: ObservabilitySet): boolean {
  const base = `idb://${db.name}/`
  return Object.keys(parts).some((k) => k.startsWith(`${base}reminders/`) || k.startsWith(`${base}tasks/`))
}

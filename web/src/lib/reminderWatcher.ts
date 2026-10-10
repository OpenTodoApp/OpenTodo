// In-app reminder delivery (OpenSpec change `reminders`, design D7). A small
// polling loop over the local store: no server, no permission, works offline.
// It publishes the reminders that are due right now; the UI renders them as
// toasts. A reminder the service worker already showed as a system notification
// for the same firing time is skipped (the shared "shown" set below).
import { db, getMeta, setMeta } from './db'
import { isDue } from './reminderTime'
import type { Reminder, Task } from './types'

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

/**
 * The reminders due at `now`: fired, live, not dismissed for this firing, on an open
 * task, and not already shown by the service worker for the same firing time.
 * Oldest first.
 */
export function dueReminders(reminders: Reminder[], tasks: Map<string, Task>, now: number, shown: ShownSet = {}): DueReminder[] {
  const out: DueReminder[] = []
  for (const r of reminders) {
    const task = tasks.get(r.task_id)
    if (!isDue(r, task, now)) continue
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
  return dueReminders(reminders, tasks, now, await getMeta<ShownSet>(SHOWN_KEY, {}))
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

  const timer = setInterval(() => void run(), interval)
  void run()
  return {
    poke: () => void run(),
    stop() {
      stopped = true
      clearInterval(timer)
      if (next) clearTimeout(next)
    },
  }
}

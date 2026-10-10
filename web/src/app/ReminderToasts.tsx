import { useEffect, useRef, useState } from 'react'
import { db, getMeta } from '../lib/db'
import { hlcSeed } from '../lib/hlc'
import { swRegistration } from '../lib/push'
import { dismissReminder, snoozeReminder } from '../lib/reminders'
import { markShown, startReminderWatcher, type DueReminder, type Watcher } from '../lib/reminderWatcher'
import type { SnoozeChoice } from '../lib/reminderTime'
import { requestSync } from '../lib/sync'
import { openTaskInList } from './signals'

/**
 * In-app reminder notifications (OpenSpec change `reminders`). Mounted once by
 * the Shell. Shows a toast per due reminder with snooze and dismiss buttons; when
 * the tab is hidden and notifications are allowed but this device has no push
 * subscription, shows a system notification instead (tagged per reminder, so a
 * push for the same reminder replaces rather than duplicates it). Also handles the
 * service worker's messages: a push that arrived while the app is focused, ops it
 * wrote from a notification action, and "open this task".
 */
export function ReminderToasts() {
  const [due, setDue] = useState<DueReminder[]>([])
  const watcher = useRef<Watcher | null>(null)
  const notified = useRef(new Set<string>())
  const firstButton = useRef<HTMLButtonElement>(null)
  const seenCount = useRef(0)

  useEffect(() => {
    const w = startReminderWatcher((list) => {
      setDue(list)
      for (const d of list) {
        if (d.reminder.fire_at !== null) void markShown(d.reminder.id, d.reminder.fire_at, 'app')
      }
      void notifyIfHidden(list, notified.current)
    })
    watcher.current = w
    const onVisible = () => {
      if (document.visibilityState === 'visible') w.poke()
    }
    document.addEventListener('visibilitychange', onVisible)
    const onMessage = (ev: MessageEvent) => void handleWorkerMessage(ev.data, w)
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => {
      w.stop()
      document.removeEventListener('visibilitychange', onVisible)
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [])

  // Move focus to a newly arrived reminder, unless the user is typing somewhere.
  useEffect(() => {
    if (due.length > seenCount.current) {
      const active = document.activeElement as HTMLElement | null
      const typing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable)
      if (!typing) firstButton.current?.focus()
    }
    seenCount.current = due.length
  }, [due])

  if (due.length === 0) return null

  const act = async (d: DueReminder, what: SnoozeChoice | 'dismiss') => {
    if (what === 'dismiss') await dismissReminder(d.reminder.id)
    else await snoozeReminder(d.reminder.id, what)
    watcher.current?.poke()
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="assertive">
      {due.slice(0, 4).map((d, i) => (
        <div
          key={d.reminder.id}
          role="alertdialog"
          aria-label={`Reminder: ${d.task.title || 'Untitled'}`}
          className="pointer-events-auto rounded-lg border border-amber-300 bg-white p-3 shadow-lg dark:border-amber-700 dark:bg-slate-900"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              void act(d, 'dismiss')
            }
          }}
        >
          <div className="flex items-start gap-2">
            <span aria-hidden className="pt-0.5">⏰</span>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openTaskInList(d.task)} title="Open task">
              <p className="truncate text-sm font-medium">{d.task.title || 'Untitled'}</p>
              <p className="text-xs text-slate-500">Reminder · {new Date(d.reminder.fire_at as number).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            <button ref={i === 0 ? firstButton : undefined} type="button" className="btn-ghost border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-700" onClick={() => void act(d, '10m')}>Snooze 10 min</button>
            <button type="button" className="btn-ghost border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-700" onClick={() => void act(d, '1h')}>1 hour</button>
            <button type="button" className="btn-ghost border border-slate-300 px-2 py-0.5 text-xs dark:border-slate-700" onClick={() => void act(d, 'tomorrow')}>Tomorrow 09:00</button>
            <div className="flex-1" />
            <button type="button" className="btn-primary px-2 py-0.5 text-xs" onClick={() => void act(d, 'dismiss')}>Dismiss</button>
          </div>
        </div>
      ))}
      {due.length > 4 && <p className="pointer-events-auto text-right text-xs text-slate-500">+{due.length - 4} more reminders</p>}
    </div>
  )
}

/** Hidden tab, permission granted, no push on this device: show a local system notification once per firing. */
async function notifyIfHidden(list: DueReminder[], notified: Set<string>): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (await getMeta<boolean>('push:enabled', false)) return // the push path covers this device
  const reg = await swRegistration(1000)
  for (const d of list) {
    const key = `${d.reminder.id}@${d.reminder.fire_at}`
    if (notified.has(key)) continue
    notified.add(key)
    const options: NotificationOptions = {
      body: 'Reminder', tag: `reminder:${d.reminder.id}`, icon: '/pwa-192.png',
      data: { reminderId: d.reminder.id, taskId: d.task.id, fireAt: d.reminder.fire_at },
    }
    try {
      if (reg) await reg.showNotification(d.task.title || 'Reminder', options)
      else new Notification(d.task.title || 'Reminder', options)
    } catch {
      // Notifications can be blocked at any time; the toast is still there.
    }
  }
}

interface WorkerMessage {
  type?: string
  reminderIds?: string[]
  ts?: number
  taskId?: string
}

async function handleWorkerMessage(data: WorkerMessage, w: Watcher): Promise<void> {
  switch (data?.type) {
    case 'reminders:push':
      // A push arrived while the app is focused: show it in-app (the watcher reads the store).
      requestSync(0)
      w.poke()
      return
    case 'reminders:changed': {
      // The service worker wrote reminder ops straight into IndexedDB. Re-put the rows so
      // live queries notice, keep our clock ahead of its timestamp, and upload them.
      if (typeof data.ts === 'number') hlcSeed(data.ts)
      for (const id of data.reminderIds ?? []) {
        const r = await db.reminders.get(id)
        if (r) await db.reminders.put(r)
      }
      requestSync(0)
      w.poke()
      return
    }
    case 'reminders:open': {
      if (!data.taskId) return
      const t = await db.tasks.get(data.taskId)
      if (t) openTaskInList(t)
      return
    }
  }
}

import type { Task } from '../lib/types'
import { Icon, Menu, MenuItem, ToastRegion, useMediaQuery } from '../ui'
import { useEffect, useRef, useState } from 'react'
import { getTask, touchReminders } from '../lib/localData'
import { hlcSeed } from '../lib/hlc'
import { pushEnabledHere, swRegistration } from '../lib/push'
import { dismissReminder, snoozeReminder } from '../lib/reminders'
import { markShown, startReminderWatcher, type DueReminder, type Watcher } from '../lib/reminderWatcher'
import type { SnoozeChoice } from '../lib/reminderTime'
import { applyReminderAction } from '../lib/shellActions'
import { requestSync } from '../lib/sync'
import { openTaskInList } from './signals'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t } from '../lib/i18n'

/**
 * In-app reminder notifications (OpenSpec change `reminders`). Mounted once by
 * the Shell. Shows a toast per due reminder with snooze and dismiss buttons. On a
 * touch screen or a narrow window (`reminder-card-compact`) it is one compact card:
 * the oldest reminder, one Snooze menu and Dismiss, the next one after an answer. When
 * the tab is hidden and notifications are allowed but this device has no push
 * subscription, shows a system notification instead (tagged per reminder, so a
 * push for the same reminder replaces rather than duplicates it). Also handles the
 * service worker's messages: a push that arrived while the app is focused, ops it
 * wrote from a notification action, Done on a notification, and "open this task".
 */
export function ReminderToasts() {
  const dt = useDateTimeFormat()
  const [due, setDue] = useState<DueReminder[]>([])
  const watcher = useRef<Watcher | null>(null)
  const notified = useRef(new Set<string>())
  const region = useRef<HTMLDivElement>(null)
  const seenCount = useRef(0)
  /** Where focus was when a reminder took it, to give it back after the last answer. */
  const returnTo = useRef<HTMLElement | null>(null)
  /** An answer was given from a card: the focus it held goes to the next card, or back. */
  const answered = useRef(false)
  const compact = useMediaQuery(COMPACT_REMINDER_QUERY)

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

  // Move focus to a newly arrived reminder, unless the user is typing somewhere
  // or working in an open dialog, menu or popover (the toast is still announced).
  // After an answer the focus the card held goes to the next card, else back where it was.
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null
    const first = region.current?.querySelector<HTMLElement>('[data-reminder-first]')
    // Focus is nowhere, or in a card (also one that just left).
    const free = !active || active === document.body || !!region.current?.contains(active)
    if (due.length > seenCount.current && !keepFocus(active)) {
      if (!free) returnTo.current = active
      first?.focus()
    } else if (answered.current && free) (first ?? returnTo.current)?.focus()
    answered.current = false
    seenCount.current = due.length
  }, [due])

  if (due.length === 0) return null

  const act = async (d: DueReminder, what: SnoozeChoice | 'dismiss') => {
    answered.current = true
    if (what === 'dismiss') await dismissReminder(d.reminder.id)
    else await snoozeReminder(d.reminder.id, what)
    watcher.current?.poke()
  }
  const shown = due.slice(0, compact ? 1 : 4)
  const more = due.length - shown.length
  const choices: [SnoozeChoice, string][] = [['10m', t('Snooze 10 min')], ['1h', t('1 hour')], ['tomorrow', t('Tomorrow 09:00')]]
  const moreText = t('{n, plural, one {+# more reminder} other {+# more reminders}}', { n: more })

  return (
    <ToastRegion live="assertive" regionRef={region}>
      {shown.map((d, i) => (
        <div
          key={d.reminder.id}
          role="alertdialog"
          aria-label={t('Reminder: {title}', { title: d.task.title || t('Untitled') })}
          className="pointer-events-auto rounded-control border border-warning bg-surface p-3 shadow-2"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              void act(d, 'dismiss')
            }
          }}
        >
          <div className="flex items-start gap-2">
            <span className="pt-0.5 text-muted pointer-coarse:pt-1.5"><Icon name="alarm-clock" /></span>
            <button type="button" className="min-w-0 flex-1 text-start" onClick={() => openTaskInList(d.task)}>
              <p className={`${compact ? 'truncate' : 'line-clamp-2'} user-text text-body font-medium`}>{d.task.title || t('Untitled')}</p>
              <p className={`text-meta text-muted ${compact ? 'truncate' : ''}`}>{tinyText(d.task) ?? t('Reminder · {instant}', { instant: dt.formatInstant(d.reminder.fire_at as number, 'datetime') })}</p>
            </button>
          </div>
          {compact ? (
            <div className="mt-2 flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-meta text-muted">{more > 0 && moreText}</p>
              <Menu kind="menu" label={t('Snooze')} namedByContent trigger={t('Snooze')} triggerClassName="ui-btn ui-btn--secondary ui-btn--sm" triggerProps={{ 'data-reminder-first': '' }}>
                {choices.map(([choice, label]) => <MenuItem key={choice} label={label} onSelect={() => void act(d, choice)} />)}
              </Menu>
              <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={() => void act(d, 'dismiss')}>{t('Dismiss')}</button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1">
              {choices.map(([choice, label], c) => (
                <button key={choice} data-reminder-first={i + c === 0 ? '' : undefined} type="button" className={`${SMALL} ui-btn--secondary`} onClick={() => void act(d, choice)}>{label}</button>
              ))}
              <div className="flex-1" />
              <button type="button" className={`${SMALL} ui-btn--primary`} onClick={() => void act(d, 'dismiss')}>{t('Dismiss')}</button>
            </div>
          )}
        </div>
      ))}
      {!compact && more > 0 && <p className="pointer-events-auto text-end text-meta text-muted">{moreText}</p>}
    </ToastRegion>
  )
}

/** The card's small buttons with a mouse. */
const SMALL = 'ui-btn ui-btn--sm px-2 py-0.5 text-meta'

/** A habit's reminder names its tiny version (habits-home D5): "One page is enough". */
function tinyText(task: Task): string | null {
  const tiny = task.habit ? task.habit_tiny?.trim() : ''
  return tiny ? t('{tiny} is enough', { tiny: tiny.charAt(0).toUpperCase() + tiny.slice(1) }) : null
}

/** Hidden tab, permission granted, no push on this device: show a local system notification once per firing. */
async function notifyIfHidden(list: DueReminder[], notified: Set<string>): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  if (await pushEnabledHere()) return // the push path covers this device
  const reg = await swRegistration(1000)
  for (const d of list) {
    const key = `${d.reminder.id}@${d.reminder.fire_at}`
    if (notified.has(key)) continue
    notified.add(key)
    const options: NotificationOptions = {
      body: tinyText(d.task) ?? t('Reminder'), tag: `reminder:${d.reminder.id}`, icon: '/pwa-192.png',
      data: { reminderId: d.reminder.id, taskId: d.task.id, fireAt: d.reminder.fire_at },
    }
    try {
      if (reg) await reg.showNotification(d.task.title || t('Reminder'), options)
      else new Notification(d.task.title || t('Reminder'), options)
    } catch {
      // Notifications can be blocked at any time; the toast is still there.
    }
  }
}

interface WorkerMessage {
  type?: string
  reminderId?: string
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
      await touchReminders(data.reminderIds ?? [])
      requestSync(0)
      w.poke()
      return
    }
    case 'reminders:done':
      // Done on a system notification (reminder-done-action D1): the app's own completion,
      // so a repeating task moves to its next occurrence.
      if (!data.reminderId) return
      await applyReminderAction(data.reminderId, 'done')
      requestSync(0)
      return
    case 'reminders:open': {
      if (!data.taskId) return
      const task = await getTask(data.taskId)
      if (task) openTaskInList(task)
      return
    }
  }
}

/**
 * Where the reminder is the compact card (reminder-card-compact): a touch screen, whose
 * 44 px buttons do not fit one row, and a window under 640 px, where the card spans the page.
 */
export const COMPACT_REMINDER_QUERY = '(pointer: coarse), (max-width: 39.99rem)'

/** Whether a newly arrived reminder must leave focus where it is. */
export function keepFocus(active: Pick<HTMLElement, 'tagName' | 'isContentEditable' | 'closest'> | null): boolean {
  if (!active || active.tagName === 'BODY') return false
  if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT' || active.isContentEditable) return true
  return active.closest('[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"]') !== null
}

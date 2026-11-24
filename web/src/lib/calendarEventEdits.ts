// Edits of connected calendars' events on this device (OpenSpec change calendar-event-edits,
// design D6). Events are server data, never ops: an edit patches the cached row at once and
// queues one command per event in `eventOutbox`; commands go to the server one at a time,
// which answers with the event as the calendar now holds it. A refusal restores the event and
// says why; a failure while online stays visible with Retry and Discard. Loaded with the
// calendar view (and by refreshEvents when a command is queued), never on the first load.
import { useLiveQuery } from 'dexie-react-hooks'
import { api, ApiError, isNetworkError } from './api'
import { db } from './db'
import { resettable } from './moduleState'
import { refreshEvents } from './calendarFeeds'
import { t } from './i18n'
import type { CalendarEvent, CalendarEventAccess, CalendarEventPatch, EventCommand } from './types'

/** A delete waits this long, so the toast's Undo can cancel it. */
export const DELETE_DELAY_MS = 8_000

export type EventChange = CalendarEventPatch | { delete: true }

/** Where refusals and failures are told (the calendar view installs its toast). */
let notice: (text: string) => void = () => {}
export function onEventNotice(fn: (text: string) => void): () => void {
  notice = fn
  return () => { if (notice === fn) notice = () => {} }
}

const FIELDS = ['summary', 'start', 'end', 'allDay'] as const

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/** The fields of `ev` that `patch` names, as they are now: the inverse change for Undo. */
export function inverseOf(ev: CalendarEvent, patch: CalendarEventPatch): CalendarEventPatch {
  const out: CalendarEventPatch = {}
  for (const f of FIELDS) if (f in patch) (out as Record<string, unknown>)[f] = ev[f]
  return out
}

/** Does `patch` leave `base` as it is? */
function returnsTo(base: CalendarEvent, patch: CalendarEventPatch): boolean {
  return FIELDS.every((f) => !(f in patch) || same(patch[f], base[f]))
}

export const commandKey = (connectionId: string, eventId: string) => `${connectionId}:${eventId}`

/**
 * Change or delete an event: the cached row changes at once and one command per event holds
 * the change (later edits merge, a delete replaces them, an edit back to the start removes
 * it). Returns the inverse change for Undo (null for a delete: Undo cancels it with
 * cancelEventDelete). Throws when the event cannot be changed from this device.
 */
export async function editEvent(ev: CalendarEvent, change: EventChange, now = Date.now(), settle = 0): Promise<CalendarEventPatch | null> {
  let inverse: CalendarEventPatch | null = null
  await db.transaction('rw', [db.calendarEvents, db.calendarSubscriptions, db.eventOutbox], async () => {
    const sub = await db.calendarSubscriptions.get(ev.subscriptionId)
    const current = (await db.calendarEvents.get(ev.id)) ?? ev
    if (!sub?.connectionId || !current.rev) throw new Error('event_not_editable')
    const key = commandKey(sub.connectionId, current.id)
    const existing = await db.eventOutbox.get(key)
    const del = 'delete' in change
    if (!del) inverse = inverseOf(current, change)
    if (existing?.sending) {
      // In flight: the change waits and goes out against the id the server answers with.
      const next = del ? undefined : { ...(existing.next ?? {}), ...change }
      await db.eventOutbox.put({ ...existing, next, ...(del ? { patch: { delete: true }, next: undefined } : {}) })
    } else {
      const base = existing?.base ?? current
      const patch: EventChange = del ? { delete: true } : { ...(existing && !('delete' in existing.patch) ? existing.patch : {}), ...change }
      if (!del && returnsTo(base, patch as CalendarEventPatch)) await db.eventOutbox.delete(key)
      else await db.eventOutbox.put({ key, connectionId: sub.connectionId, eventId: current.id, rev: existing?.rev ?? current.rev, base, patch, notBefore: del ? now + DELETE_DELAY_MS : now + settle })
    }
    if (del) await db.calendarEvents.delete(current.id)
    else await db.calendarEvents.put({ ...current, ...change })
  })
  // A delete waits for Undo; keys wait to settle, so several presses go out as one request.
  const wait = 'delete' in change ? DELETE_DELAY_MS : settle
  if (wait) setTimeout(() => void flushEventEdits(), wait + 50)
  else void flushEventEdits()
  return inverse
}

/**
 * Change an event and return its Undo: the inverse change on the event as it is then (found by
 * its UID, since a move gives it a new id once the server answers), or the delete cancelled.
 */
export async function editEventUndoable(ev: CalendarEvent, change: EventChange, settle = 0): Promise<() => Promise<unknown>> {
  if ('delete' in change) {
    await editEvent(ev, change)
    return () => cancelEventDelete(ev)
  }
  const inverse = await editEvent(ev, change, Date.now(), settle)
  return async () => {
    const now = await db.calendarEvents.where('subscriptionId').equals(ev.subscriptionId).filter((r) => r.uid === ev.uid).first()
    if (now && inverse) await editEvent(now, inverse)
  }
}

/** Undo an assistant's change (calendar-event-edits D12): the server restores it; the row is swapped. */
export async function undoAssistantEdit(ev: CalendarEvent): Promise<void> {
  const sub = await db.calendarSubscriptions.get(ev.subscriptionId)
  if (!sub?.connectionId) return
  const res = await api.undoCalendarEvent(sub.connectionId, ev.id)
  await db.transaction('rw', [db.calendarEvents], async () => {
    await db.calendarEvents.delete(res.replaces)
    await db.calendarEvents.put(res.event)
  })
}

/** Undo of a delete that was not sent yet: the command goes and the event comes back. */
export async function cancelEventDelete(ev: CalendarEvent): Promise<boolean> {
  return db.transaction('rw', [db.calendarEvents, db.calendarSubscriptions, db.eventOutbox], async () => {
    const sub = await db.calendarSubscriptions.get(ev.subscriptionId)
    if (!sub?.connectionId) return false
    const cmd = await db.eventOutbox.get(commandKey(sub.connectionId, ev.id))
    if (!cmd || cmd.sending || !('delete' in cmd.patch)) return false
    await db.eventOutbox.delete(cmd.key)
    await db.calendarEvents.put(cmd.base)
    return true
  })
}

/** Refusals that drop the command and restore the event, with what the toast says. */
export function refusalText(err: ApiError, ev: CalendarEvent): string {
  const title = ev.summary || t('Busy')
  switch (err.code) {
    case 'event_changed': return t('{title} changed in your calendar; your edit was not applied', { title })
    case 'event_gone': return t('{title} is no longer in your calendar', { title })
    case 'event_edits_off': return t('Editing events is off for this connection')
    case 'calendar_read_only': return t('This calendar is read-only')
    case 'event_not_editable': return eventAccessText(err.serverMessage.split(': ').pop() as CalendarEventAccess['reason'])
  }
  return err.message
}

const REFUSED = new Set([400, 403, 404, 409, 422])

let flushing: Promise<void> | null = null

/**
 * Send what is due, one command at a time, oldest first. Offline, everything waits; a command
 * that fails while online is marked failed and waits for Retry or Discard.
 */
export function flushEventEdits(): Promise<void> {
  if (flushing) {
    again = true // asked while running: look once more when this run ends
    return flushing
  }
  flushing = (async () => {
    try {
      do {
        again = false
        await sendDue()
      } while (again)
    } finally {
      flushing = null
    }
  })()
  return flushing
}

let again = false
resettable('calendarEventEdits', () => { flushing = null; again = false; notice = () => {} })

async function sendDue(): Promise<void> {
  for (;;) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return
    const due = (await db.eventOutbox.where('notBefore').belowOrEqual(Date.now()).toArray()).filter((c) => !c.sending && !c.failed)
    if (!due.length) return
    if (!(await sendOne(due[0]))) return
  }
}

/** One command; false stops the loop (offline). */
async function sendOne(cmd: EventCommand): Promise<boolean> {
  await db.eventOutbox.update(cmd.key, { sending: true })
  try {
    if ('delete' in cmd.patch) {
      await api.deleteCalendarEvent(cmd.connectionId, cmd.eventId, cmd.rev)
      await db.eventOutbox.delete(cmd.key)
      return true
    }
    const res = await api.updateCalendarEvent(cmd.connectionId, cmd.eventId, { ...cmd.patch, rev: cmd.rev })
    await db.transaction('rw', [db.calendarEvents, db.eventOutbox], async () => {
      const latest = await db.eventOutbox.get(cmd.key)
      await db.eventOutbox.delete(cmd.key)
      await db.calendarEvents.delete(res.replaces)
      await db.calendarEvents.put(res.event)
      if (latest && 'delete' in latest.patch) {
        // Deleted while the edit was in flight: the delete follows against the new id.
        await db.eventOutbox.put({ ...latest, key: commandKey(cmd.connectionId, res.event.id), eventId: res.event.id, rev: res.event.rev ?? '', base: res.event, sending: false })
        await db.calendarEvents.delete(res.event.id)
      } else if (latest?.next) {
        await db.eventOutbox.put({ key: commandKey(cmd.connectionId, res.event.id), connectionId: cmd.connectionId, eventId: res.event.id, rev: res.event.rev ?? '', base: res.event, patch: latest.next, notBefore: Date.now() })
        await db.calendarEvents.put({ ...res.event, ...latest.next })
      }
    })
    return true
  } catch (err) {
    if (isNetworkError(err) && typeof navigator !== 'undefined' && navigator.onLine === false) {
      await db.eventOutbox.update(cmd.key, { sending: false })
      return false
    }
    if (err instanceof ApiError && REFUSED.has(err.status)) {
      await restore(cmd)
      notice(refusalText(err, cmd.base))
      void refreshEvents()
      return true
    }
    // A failure while online is not retried alone: Retry or Discard (review fixes).
    await db.eventOutbox.update(cmd.key, { sending: false, failed: err instanceof ApiError ? err.code : 'unreachable' })
    notice(t('{title} could not be saved to your calendar', { title: cmd.base.summary || t('Busy') }))
    return true
  }
}

async function restore(cmd: EventCommand): Promise<void> {
  await db.transaction('rw', [db.calendarEvents, db.eventOutbox], async () => {
    await db.eventOutbox.delete(cmd.key)
    await db.calendarEvents.put(cmd.base)
  })
}

/** Send a failed command again. */
export async function retryEventEdit(key: string): Promise<void> {
  await db.eventOutbox.update(key, { failed: undefined, sending: false, notBefore: Date.now() })
  await flushEventEdits()
}

/** Drop a failed command and show the event as it was. */
export async function discardEventEdit(key: string): Promise<void> {
  const cmd = await db.eventOutbox.get(key)
  if (cmd) await restore(cmd)
}

/** The queued commands by event id, live. */
export function useEventCommands(): Map<string, EventCommand> {
  const rows = useLiveQuery(() => db.eventOutbox.toArray(), [], [])
  return new Map(rows.map((c) => [c.eventId, c]))
}

/** Why an event cannot be changed, for its tooltip and popover. */
export function eventAccessText(reason: CalendarEventAccess['reason'] | undefined): string {
  switch (reason) {
    case 'edits_off': return t('Editing events is off for this connection')
    case 'calendar_read_only': return t('This calendar is read-only')
    case 'recurring': return t('Repeating events are read-only for now')
    case 'has_guests': return t('This event has guests')
    case 'not_organizer': return t('Someone else organised this event')
    case 'no_etag':
    case 'refresh_pending': return t('This event can be changed after the next sync')
  }
  return t('From a subscribed calendar. Edit it in its own app.')
}

if (typeof window !== 'undefined') window.addEventListener('online', () => void flushEventEdits())

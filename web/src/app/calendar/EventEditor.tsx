// The editor in an event's popover (OpenSpec change calendar-event-edits D7): the one-click
// alternative to every drag (WCAG 2.5.7). Title, date and times, Save and Delete when the
// event's access allows them; otherwise why it cannot be changed. An assistant's change shows
// who made it with Undo; a change that failed shows Retry and Discard. Loaded when the popover
// of an event of a connected calendar opens.
import { useState, type FormEvent } from 'react'
import { addDaysISO, daysBetweenISO, eventPointIn, localDueOf } from '../../lib/dates'
import { commandKey, discardEventEdit, eventAccessText, retryEventEdit, useEventCommands } from '../../lib/calendarEventEdits'
import { t } from '../../lib/i18n'
import type { CalendarEvent, CalendarEventPatch, CalendarWhen } from '../../lib/types'
import { Button, Field, Input } from '../../ui'
import { navigate } from '../router'
import { editEventWithUndo, undoAssistantChange } from './eventActions'

/** The point as the viewer reads it: date and time in their zone. */
function localOf(p: CalendarWhen, zone?: string): { date: string; time: string } {
  if (!p.time) return { date: p.date, time: '' }
  const l = p.tz ? localDueOf({ date: p.date, time: p.time, tz: p.tz }, zone) : { date: p.date, time: p.time }
  return { date: l.date, time: l.time ?? '' }
}

/** The change the fields make, or null when they change nothing (or are not valid). */
export function editorPatch(ev: CalendarEvent, f: { title: string; date: string; start: string; end: string }, zone?: string): CalendarEventPatch | null {
  const patch: CalendarEventPatch = {}
  const title = f.title.trim()
  if (title && title !== ev.summary) patch.summary = title
  if (ev.allDay) {
    if (f.date && f.date !== ev.start.date) {
      const days = Math.max(1, daysBetweenISO(ev.start.date, ev.end.date))
      Object.assign(patch, { start: { date: f.date }, end: { date: addDaysISO(f.date, days) }, allDay: true })
    }
  } else {
    const was = { s: localOf(ev.start, zone), e: localOf(ev.end, zone) }
    if (f.date && f.start && f.end && (f.date !== was.s.date || f.start !== was.s.time || f.end !== was.e.time)) {
      if (f.end <= f.start) return null
      const at = (time: string): CalendarWhen => {
        const p = eventPointIn(ev.start.tz, { date: f.date, time }, zone)
        return p.tz ? { date: p.date, time: p.time, tz: p.tz } : { date: p.date, time: p.time }
      }
      Object.assign(patch, { start: at(f.start), end: at(f.end), allDay: false })
    }
  }
  return Object.keys(patch).length ? patch : null
}

export default function EventEditor({ ev, zone, onDone }: { ev: CalendarEvent; zone?: string; onDone?: () => void }) {
  const commands = useEventCommands()
  const cmd = commands.get(ev.id)
  const s = localOf(ev.start, zone)
  const [f, setF] = useState({ title: ev.summary, date: s.date, start: s.time, end: localOf(ev.end, zone).time })
  const access = ev.access
  const patch = editorPatch(ev, f, zone)
  const save = (e: FormEvent) => {
    e.preventDefault()
    if (!patch) return
    void editEventWithUndo(ev, patch)
    onDone?.()
  }
  return (
    <div className="space-y-2 pt-1">
      {ev.changedBy && (
        <p className="flex items-center justify-between gap-2 text-meta text-muted" data-event-changed-by>
          {t('Changed by {name}', { name: ev.changedBy.name || t('an assistant') })}
          <Button size="sm" variant="ghost" onClick={() => { void undoAssistantChange(ev); onDone?.() }}>{t('Undo')}</Button>
        </p>
      )}
      {cmd?.failed && (
        <p className="flex items-center justify-between gap-2 text-meta text-danger" data-event-failed>
          {t('Not saved to your calendar')}
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={() => void retryEventEdit(commandKey(cmd.connectionId, cmd.eventId))}>{t('Retry')}</Button>
            <Button size="sm" variant="ghost" onClick={() => void discardEventEdit(commandKey(cmd.connectionId, cmd.eventId))}>{t('Discard')}</Button>
          </span>
        </p>
      )}
      {access?.update ? (
        <form className="space-y-2" data-event-edit onSubmit={save}>
          <Field label={t('Title')}><Input value={f.title} maxLength={500} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label={t('Date')}><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          {!ev.allDay && (
            <div className="flex gap-2">
              <Field label={t('Start')}><Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
              <Field label={t('End')}><Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <Button type="submit" size="sm" disabled={!patch}>{t('Save')}</Button>
            {access.delete && <Button size="sm" variant="danger" onClick={() => { void editEventWithUndo(ev, { delete: true }); onDone?.() }}>{t('Delete')}</Button>}
          </div>
        </form>
      ) : access?.delete ? (
        <Button size="sm" variant="danger" onClick={() => { void editEventWithUndo(ev, { delete: true }); onDone?.() }}>{t('Delete')}</Button>
      ) : (
        <p className="text-meta text-faint" data-event-locked={access?.reason}>
          {eventAccessText(access?.reason)}
          {access?.reason === 'edits_off' && <> <a className="text-accent underline" href="/settings/integrations/calendar-sync" onClick={(e) => { e.preventDefault(); navigate({ view: 'settings', section: 'integrations', page: 'calendar-sync' }) }}>{t('Settings')}</a></>}
        </p>
      )}
    </div>
  )
}

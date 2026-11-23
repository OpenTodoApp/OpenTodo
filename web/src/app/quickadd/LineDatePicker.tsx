// The date tool of the phone's sheet (OpenSpec change phone-quickadd-date-picker), also
// opened on the web from the palette's When row and the line's calendar button
// (quick-add-calendar): under the
// line, the quick dates, the month and a row of times. A pick writes the date into the
// line as words the parser reads (lineDue, D1, D3), replacing the line's date rather
// than adding a second; Clear removes it. Due only (D2). Taps keep the focus in the
// line, so the keyboard stays up (D4); the controls still take focus from the keyboard.
import { type MouseEvent, type RefObject, useEffect, useId, useState } from 'react'
import { formatDate, formatTime, logicalToday, quickChoices } from '../../lib/dates'
import { t } from '../../lib/i18n'
import type { Chip, ParseContext } from '../../lib/nlp'
import { withDue } from '../../lib/nlp/lineDue'
import type { Due } from '../../lib/types'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { CalendarGrid } from '../datetime/DateField'
import { Icon } from '../../ui'
import { FIELD_ICON } from './fields'

const TIMES = ['09:00', '12:00', '17:00', '20:00']

/** The date tool's state: open or not, the line's due date and the pick that rewrites the line. */
export type LineDate = ReturnType<typeof useLineDate>

export function useLineDate({ input, value, chips, context, change }: {
  input: RefObject<HTMLTextAreaElement | null>
  value: string
  chips: readonly Chip[]
  /** The line's parse context; null while recognition is off (no date tool then). */
  context: () => Omit<ParseContext, 'dismissed'> | null
  change: (next: string) => void
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  // An emptied line (a task was added, or the text cleared) closes the picker.
  useEffect(() => { if (!value) setOpen(false) }, [value])
  const chip = chips.find((c) => c.kind === 'due')
  const due = chip ? (chip.value as Due) : null
  const pick = (next: Due | null) => {
    const ctx = context()
    if (!ctx) return
    const line = withDue(value, chip?.spans ?? [], next, ctx)
    change(line)
    requestAnimationFrame(() => {
      const el = input.current
      if (!el) return
      el.focus()
      el.setSelectionRange(line.length, line.length)
    })
  }
  return { id, open, due, pick, show: () => setOpen(true), toggle: () => setOpen((o) => !o) }
}

const option = (on: boolean) =>
  `touch-target inline-flex min-h-8 shrink-0 items-center rounded-control px-2.5 text-meta ${on ? 'bg-selected font-semibold text-strong' : 'text-muted hover:bg-sunken hover:text-default dark:hover:bg-raised'}`

export function LineDatePicker({ id, due, onPick, today = logicalToday() }: { id: string; due: Due | null; onPick: (due: Due | null) => void; today?: string }) {
  const { resolved } = useDateTimeFormat()
  const date = due?.date ?? null
  const time = due?.time
  const setDate = (iso: string) => onPick(time ? { date: iso, time } : { date: iso })
  const setTime = (next?: string) => onPick(next ? { date: date ?? today, time: next } : { date: date ?? today })
  // A tap on a button leaves the focus in the line; the time field takes it, to type a time.
  const keep = (e: MouseEvent) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault() }
  return (
    <div id={id} role="group" aria-label={t('When')} onMouseDown={keep} className="space-y-2 border-t border-default px-3 py-2" data-line-date-picker>
      <div role="radiogroup" aria-label={t('Quick dates')} className="-mx-1 flex gap-0.5 overflow-x-auto [scrollbar-width:none]" data-scroll-x>
        {quickChoices('due', today, resolved).map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={c.date === date} data-choice={c.id}
            aria-label={`${c.label}, ${formatDate(c.date as string, 'long', resolved)}`} className={option(c.date === date)}
            onClick={() => setDate(c.date as string)}>{c.label}</button>
        ))}
        {date && <button type="button" className={option(false)} onClick={() => onPick(null)} data-line-date-clear>{t('Clear')}</button>}
      </div>
      <CalendarGrid value={date} prefs={resolved} onPick={setDate} today={today} compact />
      <div role="radiogroup" aria-label={t('Time')} className="-mx-1 flex items-center gap-0.5 overflow-x-auto [scrollbar-width:none]" data-scroll-x>
        <button type="button" role="radio" aria-checked={!!date && !time} disabled={!date} className={`${option(!!date && !time)} disabled:opacity-40`}
          onClick={() => setTime()}>{t('No time of day')}</button>
        {TIMES.map((tm) => (
          <button key={tm} type="button" role="radio" aria-checked={time === tm} data-time={tm} className={option(time === tm)}
            onClick={() => setTime(tm)}>{formatTime(tm, resolved)}</button>
        ))}
        <input type="time" aria-label={t('Time')} className="ui-input h-8 w-28 shrink-0 text-meta" value={time ?? ''}
          onChange={(e) => { if (e.target.value) setTime(e.target.value) }} data-line-date-time />
      </div>
    </div>
  )
}

/** Quick add in a list: the calendar button beside the field (quick-add-calendar). It keeps the focus in the line. */
export function LineDateButton({ date }: { date: LineDate }) {
  return (
    <button type="button" data-quick-add-calendar onMouseDown={(e) => e.preventDefault()} onClick={date.toggle}
      aria-label={t('Pick a date')} aria-expanded={date.open} aria-controls={date.id}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-control hover:bg-hover hover:text-default ${date.open ? 'bg-selected text-default' : 'text-faint'}`}>
      <Icon name={FIELD_ICON.when} size={16} />
    </button>
  )
}

// The date picker of the When popover (OpenSpec change task-panel-polish, design D2):
// quick choices with the date each one means, one field that shows the date in words
// ("Thu 22 Oct") and accepts typing ("fri", "in 3 days", "22/10") with what it
// understood previewed under it, and the month calendar, always visible. Every pick
// commits at once; nothing hides behind an icon. The Do on segment (when-picker D4,
// D5) puts the field first, takes a date with a time ("tomorrow 3pm") and shows the
// quick choices as one compact line.
import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { addDaysISO, formatDate, formatTime, logicalToday, type QuickChoice } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { Tooltip } from '../../ui'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { CalendarGrid, inputLanguages } from './DateField'
import { parseDateInput, parseDateTimeInput, type DateTimeInput } from './parse'

export interface DatePickerProps {
  /** `YYYY-MM-DD`, or null when empty. */
  value: string | null
  onChange: (iso: string | null) => void
  /**
   * A typed date with a time ("tomorrow 3pm"): set, the field also reads a time
   * through the quick-add date reader and hands date and time over together
   * (when-picker D4). A time alone keeps the date, or takes today without one.
   */
  onChangeTimed?: (iso: string, time: string) => void
  /** The field's accessible name ("Due date", "Deadline"). */
  label: string
  choices: QuickChoice[]
  /** The choice that is on (Someday has no date); by default the choice whose date is the value. */
  chosen?: string | null
  /** A choice without a plain date (Someday). */
  onChoice?: (c: QuickChoice) => void
  /** What the field reads when there is no value ("No start date", or an example of what it takes). */
  emptyText?: string
  /** A message when a date is not allowed here (it is then not saved), else null. */
  validate?: (iso: string) => string | null
  autoFocus?: boolean
  /** A day the calendar marks, such as the deadline. */
  marked?: { date: string; label: string }
  /**
   * The Do on layout (when-picker D5): the field first, the quick choices as one
   * line of words with each date in its name and tooltip, and a preview line that
   * takes no room while empty.
   */
  compact?: boolean
}

export function DatePicker({ value, onChange, onChangeTimed, label, choices, chosen, onChoice, emptyText, validate, autoFocus, marked, compact = false }: DatePickerProps) {
  const { resolved } = useDateTimeFormat()
  const today = logicalToday()
  const words = value ? formatDate(value, 'long', resolved) : ''
  const [draft, setDraft] = useState(words)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fieldId = useId()
  const previewId = useId()
  useEffect(() => { if (!editing) setDraft(words) }, [words, editing])

  const read = (text: string): DateTimeInput | null => {
    if (!text || text === words) return null
    const opts = { today, prefs: resolved, languages: inputLanguages() }
    if (onChangeTimed) {
      const got = parseDateTimeInput(text, opts)
      return got ? { ...got, date: got.date ?? value ?? today } : null
    }
    const date = parseDateInput(text, opts)
    return date ? { date } : null
  }
  const parsed = editing ? read(draft.trim()) : null
  const on = chosen !== undefined ? chosen : choices.find((c) => c.date !== null && c.date === value)?.id ?? (value === null ? choices.find((c) => c.date === null)?.id ?? null : null)

  const refused = (iso: string) => {
    const message = validate?.(iso)
    setError(message ?? null)
    return !!message
  }
  const set = (iso: string | null) => {
    if (iso && refused(iso)) return false
    setError(null)
    if (iso !== value) onChange(iso)
    return true
  }
  const commit = () => {
    const text = draft.trim()
    // Emptying the field clears the date.
    if (!text && value !== null && editing) { set(null); return }
    if (!text || text === words) { setError(null); return }
    const got = read(text)
    if (!got?.date) {
      setError(t('Not a valid date. Try {example}, {iso} or “tomorrow”.', { example: formatDate(today, 'numeric', resolved), iso: today }))
      return
    }
    if (got.time && onChangeTimed) {
      if (refused(got.date)) return
      onChangeTimed(got.date, got.time)
    } else if (!set(got.date)) return
    setEditing(false)
    setDraft(formatDate(got.date, 'long', resolved))
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    else if (e.key === 'Escape' && draft !== words) { e.stopPropagation(); setDraft(words); setError(null) }
  }
  const pick = (c: QuickChoice) => {
    if (c.date === 'someday') { onChoice?.(c); return }
    if (onChoice && c.date === null) { onChoice(c); return }
    set(c.date)
  }

  const previewText = error ?? (parsed?.date ? `→ ${formatDate(parsed.date, 'long', resolved)}${parsed.time ? ` ${formatTime(parsed.time, resolved)}` : ''}` : '')
  const field = (
    <div>
      <label htmlFor={fieldId} className="sr-only">{label}</label>
      <input id={fieldId} className="ui-input w-full" autoComplete="off" spellCheck={false} autoFocus={autoFocus}
        value={editing ? draft : words} placeholder={emptyText ?? t('Type a date: fri, 3 days, {example}', { example: formatDate(addDaysISO(today, 1), 'numeric', resolved) })}
        aria-describedby={previewId} aria-invalid={!!error}
        onFocus={(e) => { setEditing(true); setDraft(words); e.currentTarget.select() }}
        onChange={(e) => { setEditing(true); setDraft(e.target.value); setError(null) }}
        onBlur={() => { commit(); setEditing(false) }}
        onKeyDown={onKey} data-date-words />
      {/* In the compact layout the empty preview takes no room; it stays in the tree as the field's description. */}
      <p id={previewId} className={`text-meta ${compact ? (previewText ? 'mt-1' : 'h-0 overflow-hidden') : 'mt-1 min-h-5'} ${error ? 'text-danger' : 'text-muted'}`}
        role={error ? 'alert' : undefined} data-date-preview>
        {previewText}
      </p>
    </div>
  )

  const quick = (
    <div role="radiogroup" aria-label={t('Quick dates')} className={compact ? '-mx-1 flex flex-wrap gap-x-0.5 gap-y-1' : 'flex flex-wrap gap-1.5'} data-quick-choices>
      {choices.map((c) => {
        const dated = c.date && c.date !== 'someday'
        const button = (
          <button key={c.id} type="button" role="radio" aria-checked={on === c.id} data-choice={c.id}
            aria-label={compact && dated ? `${c.label}, ${formatDate(c.date!, 'long', resolved)}` : undefined}
            className={`touch-target inline-flex items-center rounded-control text-meta ${compact
              ? `min-h-7 px-2 transition duration-(--duration-ui) ${on === c.id ? 'bg-selected font-semibold text-strong' : 'text-muted hover:bg-sunken hover:text-default dark:hover:bg-raised'}`
              : `min-h-8 gap-1.5 border px-2.5 py-1 ${on === c.id ? 'border-accent bg-accent-soft text-on-accent-soft font-semibold' : 'border-default text-default hover:bg-sunken dark:hover:bg-raised'}`}`}
            onClick={() => pick(c)}>
            {c.label}
            {dated && !compact && <span className={on === c.id ? 'font-normal' : 'text-faint'}>{formatDate(c.date!, 'compact', resolved)}</span>}
          </button>
        )
        return compact && dated ? <Tooltip key={c.id} label={formatDate(c.date!, 'long', resolved)}>{button}</Tooltip> : button
      })}
    </div>
  )

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'} data-date-picker data-compact={compact || undefined}>
      {compact ? <>{field}{quick}</> : <>{quick}{field}</>}
      <CalendarGrid value={value} prefs={resolved} onPick={(iso) => { setEditing(false); set(iso) }} compact marked={marked} />
    </div>
  )
}

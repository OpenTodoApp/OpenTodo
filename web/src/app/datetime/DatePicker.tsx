// The date picker of the When popover (OpenSpec change task-panel-polish, design D2):
// quick choices with the date each one means, one field that shows the date in words
// ("Thu 22 Oct") and accepts typing ("fri", "in 3 days", "22/10") with what it
// understood previewed under it, and the month calendar, always visible. Every pick
// commits at once; nothing hides behind an icon.
import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { addDaysISO, formatDate, logicalToday, type QuickChoice } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { CalendarGrid, inputLanguages } from './DateField'
import { parseDateInput } from './parse'

export interface DatePickerProps {
  /** `YYYY-MM-DD`, or null when empty. */
  value: string | null
  onChange: (iso: string | null) => void
  /** The field's accessible name ("Due date", "Deadline"). */
  label: string
  choices: QuickChoice[]
  /** The choice that is on (Someday has no date); by default the choice whose date is the value. */
  chosen?: string | null
  /** A choice without a plain date (Someday). */
  onChoice?: (c: QuickChoice) => void
  /** What the field reads when there is no value ("No start date"). */
  emptyText?: string
  /** A message when a date is not allowed here (it is then not saved), else null. */
  validate?: (iso: string) => string | null
  autoFocus?: boolean
  /** A day the calendar marks, such as the deadline. */
  marked?: { date: string; label: string }
}

export function DatePicker({ value, onChange, label, choices, chosen, onChoice, emptyText, validate, autoFocus, marked }: DatePickerProps) {
  const { resolved } = useDateTimeFormat()
  const today = logicalToday()
  const words = value ? formatDate(value, 'long', resolved) : ''
  const [draft, setDraft] = useState(words)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fieldId = useId()
  const previewId = useId()
  useEffect(() => { if (!editing) setDraft(words) }, [words, editing])

  const parse = (text: string) => (text && text !== words ? parseDateInput(text, { today, prefs: resolved, languages: inputLanguages() }) : null)
  const parsed = editing ? parse(draft.trim()) : null
  const on = chosen !== undefined ? chosen : choices.find((c) => c.date !== null && c.date === value)?.id ?? (value === null ? choices.find((c) => c.date === null)?.id ?? null : null)

  const set = (iso: string | null) => {
    if (iso) {
      const refused = validate?.(iso)
      if (refused) { setError(refused); return false }
    }
    setError(null)
    if (iso !== value) onChange(iso)
    return true
  }
  const commit = () => {
    const text = draft.trim()
    // Emptying the field clears the date.
    if (!text && value !== null && editing) { set(null); return }
    if (!text || text === words) { setError(null); return }
    const iso = parse(text)
    if (!iso) {
      setError(t('Not a valid date. Try {example}, {iso} or “tomorrow”.', { example: formatDate(today, 'numeric', resolved), iso: today }))
      return
    }
    if (set(iso)) { setEditing(false); setDraft(formatDate(iso, 'long', resolved)) }
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    else if (e.key === 'Escape' && draft !== words) { e.stopPropagation(); setDraft(words); setError(null) }
  }

  return (
    <div className="space-y-3" data-date-picker>
      <div role="radiogroup" aria-label={t('Quick dates')} className="flex flex-wrap gap-1.5" data-quick-choices>
        {choices.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={on === c.id} data-choice={c.id}
            className={`touch-target inline-flex min-h-8 items-center gap-1.5 rounded-control border px-2.5 py-1 text-meta ${on === c.id ? 'border-accent bg-accent-soft text-on-accent-soft font-semibold' : 'border-default text-default hover:bg-sunken dark:hover:bg-raised'}`}
            onClick={() => {
              if (c.date === 'someday') { onChoice?.(c); return }
              if (onChoice && c.date === null) { onChoice(c); return }
              set(c.date)
            }}>
            {c.label}
            {c.date && c.date !== 'someday' && <span className={on === c.id ? 'font-normal' : 'text-faint'}>{formatDate(c.date, 'compact', resolved)}</span>}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor={fieldId} className="sr-only">{label}</label>
        <input id={fieldId} className="ui-input w-full" autoComplete="off" spellCheck={false} autoFocus={autoFocus}
          value={editing ? draft : words} placeholder={emptyText ?? t('Type a date: fri, 3 days, {example}', { example: formatDate(addDaysISO(today, 1), 'numeric', resolved) })}
          aria-describedby={previewId} aria-invalid={!!error}
          onFocus={(e) => { setEditing(true); setDraft(words); e.currentTarget.select() }}
          onChange={(e) => { setEditing(true); setDraft(e.target.value); setError(null) }}
          onBlur={() => { commit(); setEditing(false) }}
          onKeyDown={onKey} data-date-words />
        <p id={previewId} className={`mt-1 min-h-5 text-meta ${error ? 'text-danger' : 'text-muted'}`} role={error ? 'alert' : undefined} data-date-preview>
          {error ?? (parsed ? `→ ${formatDate(parsed, 'long', resolved)}` : '')}
        </p>
      </div>

      <CalendarGrid value={value} prefs={resolved} onPick={(iso) => { setEditing(false); set(iso) }} compact marked={marked} />
    </div>
  )
}

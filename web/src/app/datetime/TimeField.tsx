// Time field of task editing (OpenSpec change date-time-preferences, design D4): a
// text field that shows the time in the user's format and accepts 15, 1530, 15:30,
// 3pm or noon whatever that format is, with a list of 15-minute suggestions. The
// list is a combobox popup: focus stays in the field, arrows move through it and
// Enter picks.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { formatTime } from '../../lib/dates'
import { IconButton } from '../../ui/Button'
import { Field, Input } from '../../ui/Field'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { Popover } from '../overlay/Popover'
import { parseTimeInput } from './parse'

export interface TimeFieldProps {
  /** `HH:MM`, or null when empty. */
  value: string | null
  onChange: (hhmm: string | null) => void
  label: string
  hideLabel?: boolean
  disabled?: boolean
  className?: string
  inputClassName?: string
}

/** Every quarter hour of the day, `00:00` … `23:45`. */
export const QUARTER_HOURS: readonly string[] = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`)

/** The suggestion to start from: the value's quarter hour, else 09:00. */
function startIndex(value: string | null): number {
  if (!value) return 36
  const [h, m] = value.split(':').map(Number)
  return Math.min(95, h * 4 + Math.floor(m / 15))
}

export function TimeField({ value, onChange, label, hideLabel, disabled, className, inputClassName = 'w-32' }: TimeFieldProps) {
  const { resolved } = useDateTimeFormat()
  const shown = value ? formatTime(value, resolved) : ''
  const [draft, setDraft] = useState(shown)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(startIndex(value))
  const anchor = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const listId = useId()
  const options = useMemo(() => QUARTER_HOURS.map((t) => ({ value: t, label: formatTime(t, { ...resolved, time: resolved.hour12 ? '12h' : '24h' }) })), [resolved])

  useEffect(() => { setDraft(shown); setError(null) }, [shown])
  useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [open, active])

  const pick = (hhmm: string | null) => {
    setOpen(false)
    setError(null)
    setDraft(hhmm ? formatTime(hhmm, resolved) : '')
    if (hhmm !== value) onChange(hhmm)
  }

  const commit = () => {
    const text = draft.trim()
    if (text === shown.trim()) return setError(null)
    if (!text) return pick(null)
    const hhmm = parseTimeInput(text)
    if (!hhmm) {
      setError('Not a valid time. Try 15:30, 3:30 pm or 1530.')
      return
    }
    pick(hhmm)
  }

  const openList = () => {
    setActive(startIndex(parseTimeInput(draft) ?? value))
    setOpen(true)
  }

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        e.preventDefault()
        if (!open) return openList()
        setActive((i) => Math.max(0, Math.min(95, i + (e.key === 'ArrowDown' ? 1 : -1))))
        return
      case 'PageDown':
      case 'PageUp':
        if (!open) return
        e.preventDefault()
        setActive((i) => Math.max(0, Math.min(95, i + (e.key === 'PageDown' ? 4 : -4))))
        return
      case 'Enter':
        e.preventDefault()
        if (open) pick(options[active].value)
        else commit()
        return
      case 'Escape':
        if (open) return // the popover closes through the overlay stack
        if (draft !== shown) {
          e.stopPropagation()
          setDraft(shown)
          setError(null)
        }
        return
    }
  }

  return (
    <div className={className}>
      <Field label={label} hideLabel={hideLabel} error={error}>
        <div ref={anchor} className="flex items-center gap-1">
          <Input className={inputClassName} value={draft} disabled={disabled} autoComplete="off" spellCheck={false}
            placeholder={formatTime('09:00', { ...resolved, time: resolved.hour12 ? '12h' : '24h' })}
            role="combobox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-autocomplete="none"
            aria-activedescendant={open ? `${listId}-${active}` : undefined}
            onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (!open) commit() }} onKeyDown={onKey} />
          <IconButton icon="clock" label="Show times" disabled={disabled} tabIndex={-1}
            aria-expanded={open} onMouseDown={(e) => e.preventDefault()} onClick={() => (open ? setOpen(false) : openList())} />
        </div>
      </Field>
      <Popover open={open} onClose={() => { setOpen(false); commit() }} anchor={anchor} label="Times" modal={false} role={undefined} width="sm:w-40" className="p-1">
        <ul ref={list} id={listId} role="listbox" aria-label="Times" className="max-h-60 overflow-y-auto">
          {options.map((o, i) => (
            <li key={o.value} id={`${listId}-${i}`} role="option" aria-selected={i === active} data-index={i}
              onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o.value)}
              className={`cursor-pointer rounded-control px-3 py-1.5 tabular-nums ${i === active ? 'bg-accent-soft text-on-accent-soft' : 'text-default hover:bg-sunken'}`}>
              {o.label}
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  )
}

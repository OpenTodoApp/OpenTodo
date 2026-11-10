import { useEffect, useRef, useState } from 'react'
import { formatMinutes, parseDuration } from '../lib/duration'
import { updateTask } from '../lib/ops'
import type { Task } from '../lib/types'
import { estimateFocus } from './signals'
import { t } from '../lib/i18n'
import { act } from './actionError'

/** The editor's presets (sidebar-brand-and-row-grid D5): four common sizes. */
export const ESTIMATE_EDITOR_PRESETS = [15, 30, 60, 120] as const
/** ↑ and ↓ change the value by this many minutes. */
const STEP = 15
/** The estimate's range (parseDuration): one minute to one week. */
const MAX = 10080

/**
 * Estimate control of the detail panel (OpenSpec `time-blocking`, sidebar-brand-and-row-grid
 * D5): one field that takes typed durations (`45m`, `1h30`, `90`), with ↑ and ↓ in 15-minute
 * steps, and four presets as a quiet segmented row. Enter (or leaving the field) commits one
 * operation through the op log; a value outside the range is refused with a message and
 * nothing is written. Clear is in the facet editor's footer. `e` on a selected list row
 * opens the panel with this input focused.
 */
export function EstimateField({ task }: { task: Task }) {
  const ref = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState(task.estimate_minutes ? formatMinutes(task.estimate_minutes) : '')
  const [error, setError] = useState<string | null>(null)
  /** Escape discards the draft; the blur that follows must not commit it. */
  const cancelled = useRef(false)

  useEffect(() => {
    setDraft(task.estimate_minutes ? formatMinutes(task.estimate_minutes) : '')
  }, [task.estimate_minutes])

  useEffect(() => {
    const focus = () => {
      ref.current?.focus()
      ref.current?.select()
    }
    if (estimateFocus.take(task.id)) focus()
    return estimateFocus.subscribe((id) => {
      if (id === task.id && estimateFocus.take(id)) focus()
    })
  }, [task.id])

  const set = (minutes: number | null) => {
    setError(null)
    if (minutes !== task.estimate_minutes) act(updateTask(task.id, { estimate_minutes: minutes }))
    setDraft(minutes ? formatMinutes(minutes) : '')
  }

  const commit = (): boolean => {
    const text = draft.trim()
    if (!text) {
      set(null)
      return true
    }
    const minutes = parseDuration(text)
    if (minutes === null) {
      setError(t('Use minutes or hours, for example 20, 45m, 1h30 (up to one week).'))
      return false
    }
    set(minutes)
    return true
  }

  /** ↑ and ↓: the next 15-minute step from the typed value (or the stored one), within the range; nothing is written until Enter. */
  const step = (dir: 1 | -1) => {
    const now = parseDuration(draft.trim()) ?? task.estimate_minutes ?? 0
    const next = dir > 0 ? Math.floor(now / STEP) * STEP + STEP : Math.ceil(now / STEP) * STEP - STEP
    if (next < STEP || next > MAX) return
    setError(null)
    setDraft(formatMinutes(next))
  }

  const current = parseDuration(draft.trim())
  return (
    <div className="space-y-2" data-estimate-editor>
      <input
        ref={ref}
        className="ui-input w-full tabular-nums"
        aria-label={t('Estimate')}
        aria-keyshortcuts="ArrowUp ArrowDown"
        placeholder={t('e.g. 45m, 1h30')}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); setError(null) }}
        onFocus={() => (cancelled.current = false)}
        onBlur={() => {
          if (!cancelled.current) commit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (commit()) ref.current?.blur()
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault()
            step(e.key === 'ArrowUp' ? 1 : -1)
          } else if (e.key === 'Escape') {
            cancelled.current = true
            setDraft(task.estimate_minutes ? formatMinutes(task.estimate_minutes) : '')
            setError(null)
          }
        }}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `estimate-error-${task.id}` : undefined}
      />
      {/* The segmented control's look (ui/SegmentedControl) as toggle buttons: no preset may be chosen. */}
      <div className="grid grid-cols-4 rounded-control border border-default bg-sunken p-0.5" role="group" aria-label={t('Estimate presets')}>
        {ESTIMATE_EDITOR_PRESETS.map((m) => {
          const on = (current ?? task.estimate_minutes) === m
          return (
            <button key={m} type="button" aria-pressed={on} onClick={() => set(m)} data-estimate-preset={m}
              className={`touch-target min-h-6 min-w-0 rounded-chip px-2 py-0.5 text-meta font-medium tabular-nums outline-none transition duration-(--duration-ui) focus-visible:ring-2 focus-visible:ring-focus ${on ? 'bg-surface text-strong shadow-1' : 'text-muted pointer-fine:hover:text-default'}`}>
              {formatMinutes(m)}
            </button>
          )
        })}
      </div>
      {error && <p id={`estimate-error-${task.id}`} role="alert" className="text-meta text-danger">{error}</p>}
    </div>
  )
}

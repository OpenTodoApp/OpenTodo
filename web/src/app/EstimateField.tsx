import { Icon } from '../ui'
import { useEffect, useRef, useState } from 'react'
import { ESTIMATE_PRESETS, formatMinutes, parseDuration } from '../lib/duration'
import { updateTask } from '../lib/ops'
import type { Task } from '../lib/types'
import { estimateFocus } from './signals'
import { t } from '../lib/i18n'
import { act } from './actionError'

/**
 * Estimate control of the detail panel (OpenSpec `time-blocking`): shorthand input
 * (`45m`, `1h30`, `90`), presets and a clear button. Enter (or leaving the field)
 * commits through the op log; an unparseable value is reported and not written.
 * `e` on a selected list row opens the panel with this input focused.
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

  return (
    <div>
      <div className="flex gap-2">
        <input
          ref={ref}
          className="ui-input w-32"
          aria-label={t('Estimate')}
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
            } else if (e.key === 'Escape') {
              cancelled.current = true
              setDraft(task.estimate_minutes ? formatMinutes(task.estimate_minutes) : '')
              setError(null)
            }
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `estimate-error-${task.id}` : undefined}
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label={t('Estimate presets')}>
          {ESTIMATE_PRESETS.map((m) => (
            <button
              key={m}
              type="button"
              className={`rounded-control border px-2 py-1 font-mono text-meta ${task.estimate_minutes === m ? 'border-accent bg-accent-soft text-on-accent-soft' : 'border-input text-muted hover:bg-sunken dark:hover:bg-raised'}`}
              aria-pressed={task.estimate_minutes === m}
              onClick={() => set(m)}
            >
              {formatMinutes(m)}
            </button>
          ))}
          {task.estimate_minutes !== null && (
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-1 text-meta" onClick={() => set(null)} aria-label={t('Clear estimate')}><Icon name="x" /></button>
          )}
        </div>
      </div>
      {error && <p id={`estimate-error-${task.id}`} className="mt-1 text-meta text-danger">{error}</p>}
    </div>
  )
}

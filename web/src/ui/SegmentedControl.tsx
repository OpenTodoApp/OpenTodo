// A segmented control (OpenSpec change series-exceptions, design D5): two or three
// mutually exclusive options in one row, as a WAI-ARIA radio group with roving focus
// (arrow keys, Home and End select). Each option is at least 24 px tall (WCAG 2.5.8)
// and the row reaches 44 px on touch screens with `touch-target`.
import { useRef, type KeyboardEvent } from 'react'

export interface SegmentOption<T extends string> {
  id: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[]
  value: T
  onChange: (id: T) => void
  /** Accessible name of the group. */
  label: string
  disabled?: boolean
  /** Long labels wrap onto a second line instead of being cut (three scopes on a phone, series-split). */
  wrap?: boolean
  className?: string
  /** Test and script hooks. */
  [hook: `data-${string}`]: string | boolean | undefined
}

export function SegmentedControl<T extends string>({ options, value, onChange, label, disabled = false, wrap = false, className = '', ...hooks }: SegmentedControlProps<T>) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const move = (e: KeyboardEvent) => {
    const i = options.findIndex((o) => o.id === value)
    const next = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % options.length
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + options.length) % options.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    onChange(options[next].id)
    refs.current[options[next].id]?.focus()
  }
  return (
    <div {...hooks} role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} onKeyDown={disabled ? undefined : move}
      className={`inline-flex max-w-full rounded-control border border-default bg-sunken p-0.5 ${className}`}>
      {options.map((o) => {
        const on = o.id === value
        return (
          <button key={o.id} ref={(el) => { refs.current[o.id] = el }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} disabled={disabled}
            data-segment={o.id} onClick={() => { if (!on) onChange(o.id) }}
            className={`touch-target min-h-6 min-w-0 flex-1 ${wrap ? 'whitespace-normal leading-tight text-balance' : 'truncate'} rounded-chip px-2.5 py-0.5 text-meta font-medium outline-none transition duration-(--duration-ui)
              focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed
              ${on ? 'bg-surface text-strong shadow-1' : 'text-muted pointer-fine:hover:text-default'}`}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

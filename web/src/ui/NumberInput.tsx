// Number input (OpenSpec change settings-foundation, design D7): a text field for a
// number within a range, with its unit inside the field after the value and an
// optional "No limit" choice that clears and disables it. A text input with a
// numeric keyboard, not type="number", so the scroll wheel never changes a value
// and the decimal separator follows what the person types.
import { useEffect, useId, useState, type ReactNode } from 'react'
import { t } from '../lib/i18n'

export interface NumberInputProps {
  label: ReactNode
  description?: ReactNode
  /** The saved value; null means "No limit" (only with noLimit). */
  value: number | null
  /** Called with every valid value, and with null when "No limit" is chosen. */
  onChange: (value: number | null) => void
  /** Called whenever the typed text becomes valid or invalid, for a save bar. */
  onValidityChange?: (valid: boolean) => void
  min: number
  max: number
  step?: number
  /** Accept decimals (otherwise whole numbers only). */
  decimal?: boolean
  /** Shown after the value inside the field and in the range error ("MB", "min"). */
  unit?: string
  /** Offer "No limit"; the label overrides the default wording. */
  noLimit?: boolean | string
  disabled?: boolean
  hideLabel?: boolean
  id?: string
  className?: string
}

function parse(text: string, decimal: boolean): number | null {
  const s = text.trim().replace(',', '.')
  if (s === '' || !(decimal ? /^-?\d+(\.\d+)?$/ : /^-?\d+$/).test(s)) return null
  return Number(s)
}

export function NumberInput({ label, description, value, onChange, onValidityChange, min, max, step = 1, decimal = false, unit, noLimit, disabled, hideLabel, id: idProp, className }: NumberInputProps) {
  const gen = useId()
  const id = idProp ?? `${gen}-n`
  const [text, setText] = useState(value === null ? '' : String(value))
  // A saved value that changes from outside (Discard, a sync) replaces the text.
  useEffect(() => {
    setText((cur) => (value === null ? (noLimit ? '' : cur) : parse(cur, decimal) === value ? cur : String(value)))
  }, [value, noLimit, decimal])
  const unlimited = !!noLimit && value === null
  const parsed = parse(text, decimal)
  const invalid = !unlimited && (parsed === null || parsed < min || parsed > max)
  useEffect(() => { onValidityChange?.(!invalid) }, [invalid, onValidityChange])
  const range = unit ? t('Between {min} and {max} {unit}', { min, max, unit }) : t('Between {min} and {max}', { min, max })
  const descId = description ? `${gen}-desc` : undefined
  const errId = invalid ? `${gen}-err` : undefined
  const unitId = unit ? `${gen}-unit` : undefined
  const commit = (next: string) => {
    setText(next)
    const n = parse(next, decimal)
    if (n !== null && n >= min && n <= max) onChange(n)
  }
  const stepBy = (dir: 1 | -1) => {
    const base = parsed ?? (dir > 0 ? min - step : max + step)
    const next = Math.min(max, Math.max(min, Math.round((base + dir * step) * 1e6) / 1e6))
    commit(String(next))
  }
  return (
    <div className={`space-y-1.5${className ? ` ${className}` : ''}`} data-number-input>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'block text-body font-medium text-default'}>{label}</label>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-36 max-w-full">
          <input id={id} type="text" inputMode={decimal ? 'decimal' : 'numeric'} autoComplete="off"
            value={text} disabled={disabled || unlimited} aria-invalid={invalid || undefined}
            aria-describedby={[unitId, descId, errId].filter(Boolean).join(' ') || undefined}
            onChange={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp') { e.preventDefault(); stepBy(1) }
              if (e.key === 'ArrowDown') { e.preventDefault(); stepBy(-1) }
            }}
            className={`ui-input aria-invalid:border-danger aria-invalid:focus:ring-danger/30 ${unit ? 'pr-12' : ''}`} />
          {unit && <span id={unitId} className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-meta text-muted">{unit}</span>}
        </div>
        {noLimit && (
          <label className={`inline-flex items-center gap-2 text-body text-default ${disabled ? '' : 'cursor-pointer'}`}>
            <input type="checkbox" checked={unlimited} disabled={disabled}
              onChange={(e) => {
                if (e.target.checked) { setText(''); onChange(null) } else { setText(String(min)); onChange(min) }
              }}
              className="h-4 w-4 shrink-0 rounded-chip border-input accent-(--ot-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
            {typeof noLimit === 'string' ? noLimit : t('No limit')}
          </label>
        )}
      </div>
      {description && <p id={descId} className="text-meta text-muted">{description}</p>}
      {invalid && <p id={errId} className="text-meta text-danger">{range}</p>}
    </div>
  )
}

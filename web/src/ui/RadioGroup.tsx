// Radio group (OpenSpec change settings-foundation, design D7): one choice among
// two to six options. Native radio inputs inside labels, so the browser gives the
// group semantics, "2 of 3", arrow keys that move the choice and Tab that enters
// and leaves at the chosen option. The mark takes the accent, never the
// platform's colour. `cards` suits options that need a sentence; `list` short ones.
import { useId, type ReactNode } from 'react'
import { Icon } from './Icon'

export interface RadioOption<V extends string> {
  value: V
  label: ReactNode
  /** At most 60 characters (design-system "Settings section and row patterns"). */
  description?: ReactNode
  disabled?: boolean
  /** Why a disabled option cannot be chosen; read and shown in place of the description. */
  reason?: ReactNode
}

export interface RadioGroupProps<V extends string> {
  /** The group's accessible name; shown above the options unless hideLabel. */
  label: ReactNode
  hideLabel?: boolean
  value: V
  onChange: (value: V) => void
  options: readonly RadioOption<V>[]
  variant?: 'cards' | 'list'
  disabled?: boolean
  /** A form field name; one is generated when absent. */
  name?: string
  className?: string
  /** Extra attribute on each input, for tests and the anatomy checks (e.g. "mcp-scope"). */
  dataKey?: string
}

export function RadioGroup<V extends string>({ label, hideLabel, value, onChange, options, variant = 'cards', disabled, name, className, dataKey }: RadioGroupProps<V>) {
  const id = useId()
  const group = name ?? `radio-${id}`
  const labelId = `${id}-label`
  return (
    <div role="radiogroup" aria-labelledby={labelId} aria-disabled={disabled || undefined} data-radio-group={variant}
      className={`${variant === 'cards' ? 'space-y-1.5' : 'space-y-2'}${className ? ` ${className}` : ''}`}>
      <div id={labelId} className={hideLabel ? 'sr-only' : 'mb-1.5 text-body font-medium text-default'}>{label}</div>
      {options.map((o) => {
        const off = disabled || o.disabled
        const chosen = o.value === value
        const detail = o.disabled && o.reason ? o.reason : o.description
        const detailId = detail ? `${id}-${o.value}-d` : undefined
        const extra = dataKey ? { [`data-${dataKey}`]: o.value } : {}
        return (
          <label key={o.value} data-radio-option={o.value} data-chosen={chosen || undefined}
            className={variant === 'cards'
              ? `flex items-start gap-3 rounded-control border px-3 py-2 transition-colors duration-(--duration-ui) ${chosen ? 'border-accent bg-accent-soft' : off ? 'border-soft' : 'border-default'} ${off ? '' : 'cursor-pointer hover:border-strong'}`
              : `flex items-start gap-2.5 ${off ? '' : 'cursor-pointer'}`}>
            <input type="radio" name={group} value={o.value} checked={chosen} disabled={off} aria-describedby={detailId}
              onChange={() => onChange(o.value)} {...extra}
              className="mt-0.5 h-4 w-4 shrink-0 accent-(--ot-accent) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50" />
            <span className="min-w-0 flex-1">
              <span className={`block text-body ${variant === 'cards' ? 'font-medium' : ''} ${off ? 'text-muted' : 'text-default'}`}>{o.label}</span>
              {detail && <span id={detailId} className="block text-meta text-muted">{detail}</span>}
            </span>
            {variant === 'cards' && chosen && <Icon name="check" size="sm" className="mt-0.5 shrink-0 text-accent" />}
          </label>
        )
      })}
    </div>
  )
}

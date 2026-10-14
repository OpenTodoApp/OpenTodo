// Switch and Checkbox (OpenSpec change ui-primitives, design D4). A setting that
// applies at once is a switch (role="switch"); a choice submitted with a form is a checkbox.
import { forwardRef, useEffect, useImperativeHandle, useRef, type InputHTMLAttributes, type ReactNode } from 'react'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
  /** Hide the visible label (it stays the accessible name). */
  hideLabel?: boolean
  id?: string
  /** id of text elsewhere that describes the switch (e.g. a setting row's description). */
  describedBy?: string
}

export function Switch({ checked, onChange, label, description, disabled, hideLabel, id, describedBy }: SwitchProps) {
  return (
    <label className={`inline-flex items-start gap-3 ${disabled ? '' : 'cursor-pointer'}`}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition duration-(--duration-ui) ease-calm
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50
          ${checked ? 'border-accent bg-accent' : 'border-input bg-sunken'}`}
      >
        <span aria-hidden="true" className={`inline-block h-4 w-4 rounded-full bg-surface shadow-1 transition-transform duration-(--duration-ui) ease-calm ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
      {/* A disabled control fades; its label stays readable (AA) in the muted colour. */}
      <span className={hideLabel ? 'sr-only' : 'min-w-0'}>
        <span className={`block text-sm ${disabled ? 'text-muted' : 'text-default'}`}>{label}</span>
        {description && <span className="block text-meta text-muted">{description}</span>}
      </span>
    </label>
  )
}

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
  description?: ReactNode
  indeterminate?: boolean
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, description, indeterminate, className, ...rest }, ref) {
  const inner = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => inner.current!)
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = !!indeterminate
  }, [indeterminate])
  return (
    <label className={`inline-flex items-start gap-2.5 ${rest.disabled ? '' : 'cursor-pointer'}${className ? ` ${className}` : ''}`}>
      <input ref={inner} type="checkbox" {...rest} className="mt-0.5 h-4 w-4 shrink-0 rounded-chip border-input accent-(--ot-accent) disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" />
      <span className="min-w-0">
        <span className={`block text-sm ${rest.disabled ? 'text-muted' : 'text-default'}`}>{label}</span>
        {description && <span className="block text-meta text-muted">{description}</span>}
      </span>
    </label>
  )
})

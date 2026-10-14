// Form controls (OpenSpec change ui-primitives, design D4): thin wrappers over
// native elements. Field wires the label, description and error to its control.
import {
  createContext, forwardRef, useContext, useId,
  type AriaAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'

interface FieldContext {
  id: string
  describedBy?: string
  invalid: boolean
}
const Ctx = createContext<FieldContext | null>(null)

export interface FieldProps {
  label: ReactNode
  description?: ReactNode
  error?: ReactNode
  /** Visually hide the label (it stays the control's accessible name). */
  hideLabel?: boolean
  className?: string
  children: ReactNode
}

export function Field({ label, description, error, hideLabel, className, children }: FieldProps) {
  const id = useId()
  const descId = description ? `${id}-desc` : undefined
  const errId = error ? `${id}-err` : undefined
  const describedBy = [descId, errId].filter(Boolean).join(' ') || undefined
  return (
    <div className={`space-y-1.5${className ? ` ${className}` : ''}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'block text-sm font-medium text-default'}>{label}</label>
      <Ctx.Provider value={{ id, describedBy, invalid: !!error }}>{children}</Ctx.Provider>
      {description && <p id={descId} className="text-meta text-muted">{description}</p>}
      {error && <p id={errId} className="text-meta text-danger">{error}</p>}
    </div>
  )
}

/** Props a control takes from the surrounding Field (explicit props win). */
function useFieldProps(props: { id?: string; 'aria-describedby'?: string; 'aria-invalid'?: AriaAttributes['aria-invalid'] }) {
  const f = useContext(Ctx)
  return {
    id: props.id ?? f?.id,
    'aria-describedby': props['aria-describedby'] ?? f?.describedBy,
    'aria-invalid': props['aria-invalid'] ?? (f?.invalid ? true : undefined),
  }
}

const invalidRing = 'aria-invalid:border-danger aria-invalid:focus:ring-danger/30'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} {...props} {...useFieldProps(props)} className={`input ${invalidRing}${className ? ` ${className}` : ''}`} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} {...props} {...useFieldProps(props)} className={`input min-h-24 ${invalidRing}${className ? ` ${className}` : ''}`} />
})

/** For small fixed option sets (role, sort, group by). Choosing an entity uses Combobox. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} {...props} {...useFieldProps(props)} className={`input ${invalidRing}${className ? ` ${className}` : ''}`} />
})

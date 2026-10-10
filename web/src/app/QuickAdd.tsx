import { type FormEvent, forwardRef, useState } from 'react'

interface QuickAddProps {
  placeholder: string
  onAdd: (title: string) => Promise<void> | void
  /** Prefilled title (the capture screen proposes the shared page's title). */
  initialValue?: string
  /** Form id, so a button elsewhere can submit it with `form=`. */
  formId?: string
  /** Hide the `q` shortcut hint (it does not apply outside the task views). */
  hideHint?: boolean
  autoFocus?: boolean
  /** Accessible name of the input; "Add a task" by default. */
  label?: string
}

export const QuickAdd = forwardRef<HTMLInputElement, QuickAddProps>(
  function QuickAdd({ placeholder, onAdd, initialValue, formId, hideHint, autoFocus, label }, ref) {
    const [value, setValue] = useState(initialValue ?? '')
    async function submit(e: FormEvent) {
      e.preventDefault()
      const title = value.trim()
      if (!title) return
      setValue('')
      await onAdd(title)
    }
    return (
      <form id={formId} onSubmit={(e) => void submit(e)} className="flex items-center gap-2">
        <span className="text-xl leading-none text-emerald-600">+</span>
        <input
          ref={ref}
          className="input border-transparent bg-transparent px-1 shadow-none focus:border-transparent focus:ring-0 dark:bg-transparent"
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
          }}
          aria-label={label ?? 'Add a task'}
          autoFocus={autoFocus}
        />
        {!hideHint && <span className="kbd hidden sm:inline">q</span>}
      </form>
    )
  },
)

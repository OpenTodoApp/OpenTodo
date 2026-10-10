import { type FormEvent, forwardRef, useState } from 'react'

export const QuickAdd = forwardRef<HTMLInputElement, { placeholder: string; onAdd: (title: string) => Promise<void> | void }>(
  function QuickAdd({ placeholder, onAdd }, ref) {
    const [value, setValue] = useState('')
    async function submit(e: FormEvent) {
      e.preventDefault()
      const title = value.trim()
      if (!title) return
      setValue('')
      await onAdd(title)
    }
    return (
      <form onSubmit={(e) => void submit(e)} className="flex items-center gap-2">
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
          aria-label="Add a task"
        />
        <span className="kbd hidden sm:inline">q</span>
      </form>
    )
  },
)

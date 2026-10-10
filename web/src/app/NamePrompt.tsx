import { type FormEvent, useState } from 'react'

/** A small modal asking for a name: Enter confirms, Esc cancels. Errors from onSubmit are shown inline. */
export function NamePrompt({ title, label, initial = '', confirm = 'Save', hint, onSubmit, onCancel }: {
  title: string
  label: string
  initial?: string
  confirm?: string
  hint?: string
  onSubmit: (name: string) => Promise<void> | void
  onCancel: () => void
}) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setError('Please enter a name')
    try {
      await onSubmit(name.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 p-4 pt-24" onClick={onCancel}>
      <form role="dialog" aria-label={title} onSubmit={(e) => void submit(e)} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl dark:bg-slate-900">
        <h2 className="mb-2 text-base font-semibold">{title}</h2>
        <input className="input" autoFocus aria-label={label} placeholder={label} value={name}
          onChange={(e) => { setName(e.target.value); setError(null) }}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }} />
        {error && <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
        {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="btn-ghost text-sm" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary text-sm">{confirm}</button>
        </div>
      </form>
    </div>
  )
}

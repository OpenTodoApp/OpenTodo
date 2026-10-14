import { type FormEvent, useState } from 'react'
import { Dialog } from './overlay'

/** A small dialog asking for a name: Enter confirms, Esc cancels. Errors from onSubmit are shown inline. */
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
    <Dialog title={title} label={title} onClose={onCancel}>
      <form onSubmit={(e) => void submit(e)}>
        <input className="input" autoFocus aria-label={label} placeholder={label} value={name}
          onChange={(e) => { setName(e.target.value); setError(null) }} />
        {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
        {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="btn-ghost text-sm" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-primary text-sm">{confirm}</button>
        </div>
      </form>
    </Dialog>
  )
}

// "Save as view" in place (OpenSpec change views-and-display, design D6): the New view
// page's header becomes a card with the name field, Cancel and Save view, so the
// conditions, the display options and the results stay in sight while naming. Enter
// saves, Esc cancels; an error from saving is shown under the name.
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Button, Icon } from '../../ui'
import { t } from '../../lib/i18n'

export function SaveViewCard({ onSave, onCancel }: { onSave: (name: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError(t('Please enter a name')); return }
    try {
      await onSave(name.trim())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} data-save-view-card aria-label={t('Save as view')}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel() } }}
      className="my-2 flex flex-wrap items-center gap-3 rounded-card border border-strong bg-raised px-3 py-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-sunken text-muted" aria-hidden><Icon name="layers" size="md" /></span>
      <div className="min-w-0 flex-1 basis-48">
        <input ref={input} className="w-full bg-transparent text-h3 text-strong outline-none placeholder:text-faint" aria-label={t('View name')}
          placeholder={t('Name this view')} value={name} aria-invalid={!!error} aria-describedby="save-view-message"
          onChange={(e) => { setName(e.target.value); setError(null) }} />
        <p id="save-view-message" className="text-meta" aria-live="polite">
          {error ? <span role="alert" className="text-danger">{error}</span> : <span className="text-faint">{t('Saved with its conditions and display options, in the sidebar under Views.')}</span>}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" type="button" onClick={onCancel}>{t('Cancel')}</Button>
        <Button variant="primary" size="sm" type="submit">{t('Save view')}</Button>
      </div>
    </form>
  )
}

// The link dialog of the notes editor (OpenSpec change ui-correctness): replaces
// the browser's prompt. Only addresses a note can show as a link are accepted
// (https, http and mailto, as the renderer's safeHref); an empty address removes
// the link, Cancel leaves it as it was.
import { type FormEvent, useState } from 'react'
import { safeHref } from '../lib/markdown'
import { t } from '../lib/i18n'
import { Button, Field, Input } from '../ui'
import { Dialog } from './overlay/Dialog'

export function LinkDialog({ current, onSubmit, onCancel }: {
  /** The selection's link, or '' when it has none. */
  current: string
  /** The address to link, or '' to remove the link. */
  onSubmit: (href: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(current || 'https://')
  const [error, setError] = useState<string | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const href = value.trim()
    if (href !== '' && !safeHref(href)) {
      setError(t('Enter an address that starts with https://, http:// or mailto:.'))
      return
    }
    onSubmit(href)
  }
  return (
    <Dialog title={current ? t('Edit link') : t('Add a link')} onClose={onCancel} testId="link-dialog">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t('Link address')} description={current ? t('Leave it empty to remove the link.') : undefined} error={error}>
          <Input type="url" inputMode="url" autoComplete="off" spellCheck={false} value={value} data-autofocus
            onChange={(e) => { setValue(e.target.value); setError(null) }} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>{t('Cancel')}</Button>
          <Button variant="primary" type="submit">{value.trim() === '' && current ? t('Remove link') : t('Save')}</Button>
        </div>
      </form>
    </Dialog>
  )
}

// Confirmation dialog (OpenSpec change ui-primitives, design D9): replaces the
// browser's confirm(). Focus starts on Cancel; a destructive one ignores outside taps.
import { useState, type ReactNode } from 'react'
import { Dialog } from '../../app/overlay/Dialog'
import { Button } from '../Button'
import { t } from '../../lib/i18n'

export interface ConfirmDialogProps {
  title: string
  /** What happens, in the user's terms (e.g. "3 open tasks lose this label."). */
  consequence: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
  /** May return a promise; the confirm button is busy until it settles, then the dialog closes. */
  onConfirm: () => unknown
  onCancel: () => void
}

export function ConfirmDialog({ title, consequence, confirmLabel, cancelLabel = t('Cancel'), tone = 'danger', onConfirm, onCancel }: ConfirmDialogProps) {
  const [error, setError] = useState<string | null>(null)
  const confirm = async () => {
    setError(null)
    try {
      await onConfirm()
      onCancel()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <Dialog title={title} onClose={onCancel} dismissable={tone !== 'danger'} role={tone === 'danger' ? 'alertdialog' : 'dialog'} testId="confirm-dialog">
      <div className="space-y-4">
        <div className="text-body text-default">{consequence}</div>
        {error && <p role="alert" className="text-meta text-danger">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} data-autofocus>{cancelLabel}</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={confirm} className={tone === 'danger' ? 'border border-current' : undefined}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

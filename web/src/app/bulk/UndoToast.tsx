// "12 tasks completed · Undo" for ten seconds after a bulk action (bulk-edit D5).
// The Undo button is reachable with Tab; Ctrl/⌘+Z outside a text field undoes too.
import { useEffect } from 'react'
import { Tooltip, ToastRegion } from '../../ui'
import { undoBatch } from '../../lib/undo'
import { hideBulkToast, updateBulkToast, useBulkToast } from './toastStore'
import { useShortcutScope } from '../shortcuts'
import { t } from '../../lib/i18n'

export const TOAST_MS = 10_000

export async function undoToast(undoId: string): Promise<void> {
  const r = await undoBatch(undoId)
  const base = r.restored === 1 && r.skipped.length === 0 ? t('Undone.') : t('Undone: {n} restored.', { n: r.restored })
  updateBulkToast({ undoId: null, result: r.skipped.length ? `${base} ${t('Kept because they were changed again since: {items}.', { items: r.skipped.join(', ') })}` : base })
}

export function UndoToast() {
  const toast = useBulkToast()
  useEffect(() => {
    if (!toast) return
    const item = setTimeout(() => hideBulkToast(toast.key), toast.ttl ?? TOAST_MS)
    return () => clearTimeout(item)
  }, [toast])
  const undoId = toast?.undoId ?? null
  useShortcutScope('global', { 'global.undo-bulk': () => { if (!undoId) return false; void undoToast(undoId) } }, { enabled: !!undoId })
  if (!toast) return null
  return (
    <ToastRegion label={t('Last action')}>
      <div className="pointer-events-auto flex items-center gap-3 rounded-control border border-default bg-surface px-3 py-2 text-body shadow-2" data-bulk-toast>
        <p role="status" className="min-w-0 flex-1">{toast.result ?? toast.label}</p>
        {toast.action && !toast.result && (
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-1 text-accent" data-toast-action
            onClick={() => { toast.action!.run(); hideBulkToast(toast.key) }}>{toast.action.label}</button>
        )}
        {toast.undoId && (
          <Tooltip label={t('Undo')} shortcut="Ctrl+Z">
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-1 text-accent" onClick={() => void undoToast(toast.undoId!)}>{t('Undo')}</button>
          </Tooltip>
        )}
      </div>
    </ToastRegion>
  )
}

// "12 tasks completed · Undo" for ten seconds after a bulk action (bulk-edit D5).
// The Undo button is reachable with Tab; Ctrl/⌘+Z outside a text field undoes too.
import { useEffect } from 'react'
import { undoBatch } from '../../lib/undo'
import { ToastRegion } from '../overlay'
import { hideBulkToast, updateBulkToast, useBulkToast } from './toastStore'

export const TOAST_MS = 10_000

export async function undoToast(undoId: string): Promise<void> {
  const r = await undoBatch(undoId)
  const base = r.restored === 1 && r.skipped.length === 0 ? 'Undone.' : `Undone: ${r.restored} restored.`
  updateBulkToast({ undoId: null, result: r.skipped.length ? `${base} Kept because they were changed again since: ${r.skipped.join(', ')}.` : base })
}

export function UndoToast() {
  const toast = useBulkToast()
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => hideBulkToast(toast.key), toast.ttl ?? TOAST_MS)
    return () => clearTimeout(t)
  }, [toast])
  useEffect(() => {
    if (!toast?.undoId) return
    const undoId = toast.undoId
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'z') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      e.preventDefault()
      void undoToast(undoId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toast?.undoId])
  if (!toast) return null
  return (
    <ToastRegion label="Last action">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-default bg-surface px-3 py-2 text-sm shadow-lg" data-bulk-toast>
        <p role="status" className="min-w-0 flex-1">{toast.result ?? toast.label}</p>
        {toast.undoId && <button type="button" className="btn-ghost px-2 py-1 text-accent" onClick={() => void undoToast(toast.undoId!)} title="Undo (Ctrl+Z)">Undo</button>}
      </div>
    </ToastRegion>
  )
}

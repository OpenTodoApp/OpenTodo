// The toast primitive (OpenSpec changes bulk-edit D5 and moments-and-onboarding D9;
// design-system "Toast primitive"): one toast at a time, a new one replacing the last;
// one sentence and at most two controls, Undo first; ten seconds after a batch, five
// after one task's action, the timer paused while the pointer is over it or focus is
// inside and restarted when both leave. Tab reaches its controls, focus never moves
// into it by itself, Ctrl/⌘+Z outside a text field undoes. It never covers the focused
// element (useToastClearance). No movement: it only fades, also under reduced motion.
import { useEffect, useRef, useState } from 'react'
import { Tooltip, ToastRegion, useToastClearance } from '../../ui'
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

/** The toast's timer: `ttl` ms of being shown, not counting the time it is held (hover or focus). */
function useToastTimer(key: number | undefined, ttl: number, held: boolean) {
  const left = useRef(ttl)
  useEffect(() => { left.current = ttl }, [key, ttl])
  useEffect(() => {
    if (key === undefined || held) return
    const started = Date.now()
    const timer = setTimeout(() => hideBulkToast(key), left.current)
    return () => { clearTimeout(timer); left.current = Math.max(0, left.current - (Date.now() - started)) }
  }, [key, held])
}

export function UndoToast() {
  const toast = useBulkToast()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  useToastTimer(toast?.key, toast?.ttl ?? TOAST_MS, hovered || focused)
  useEffect(() => { setHovered(false); setFocused(false) }, [toast?.key])
  const region = useRef<HTMLDivElement>(null)
  const side = useToastClearance(region, !!toast)
  const undoId = toast?.undoId ?? null
  useShortcutScope('global', { 'global.undo-bulk': () => { if (!undoId) return false; void undoToast(undoId) } }, { enabled: !!undoId })
  if (!toast) return null
  return (
    <ToastRegion label={t('Last action')} side={side} regionRef={region}>
      <div className="ui-toast pointer-events-auto flex items-center gap-3 rounded-control border border-default bg-surface px-3 py-2 text-body shadow-2" data-bulk-toast
        onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false) }}>
        <p role="status" className="min-w-0 flex-1">{toast.result ?? toast.label}</p>
        {toast.undoId && (
          <Tooltip label={t('Undo')} shortcut="Ctrl+Z">
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-1 text-accent" data-toast-undo onClick={() => void undoToast(toast.undoId!)}>{t('Undo')}</button>
          </Tooltip>
        )}
        {toast.action && !toast.result && (
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm px-2 py-1 text-accent" data-toast-action
            onClick={() => { toast.action!.run(); hideBulkToast(toast.key) }}>{toast.action.label}</button>
        )}
      </div>
    </ToastRegion>
  )
}

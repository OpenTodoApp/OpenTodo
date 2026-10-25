// The toast primitive (OpenSpec changes bulk-edit D5 and moments-and-onboarding D9;
// design-system "Toast primitive"): one toast at a time, a new one replacing the last;
// one sentence and at most two controls, Undo first; ten seconds after a batch, five
// after one task's action, the timer paused while the pointer is over it or focus is
// inside and restarted when both leave. Tab reaches its controls, focus never moves
// into it by itself, Ctrl/⌘+Z outside a text field undoes. It never covers the focused
// element (useToastClearance). It slides up 8 px as it enters and fades out as it
// leaves (web-app "Overlay motion", motion-v2 D5); under reduced motion it only fades.
import { useEffect, useRef, useState } from 'react'
import { Icon, Tooltip, ToastRegion, useToastClearance } from '../../ui'
import { undoBatch, undoTaskCount } from '../../lib/undo'
import { cancelDepartures, emphasisMs, noMotion, withListTransition } from '../motion'
import { ACTION_TOAST_MS, hideBulkToast, updateBulkToast, useBulkToast, type BulkToast } from './toastStore'
import { useShortcutScope } from '../shortcuts'
import { t } from '../../lib/i18n'

export const TOAST_MS = 10_000

export async function undoToast(undoId: string): Promise<void> {
  // Undo during a completion sequence keeps the row in place (motion-v2 D2).
  cancelDepartures()
  // The rows Undo brings back or moves slide into place, up to the cap (motion-v2 D4).
  const r = await withListTransition(await undoTaskCount(undoId), () => undoBatch(undoId))
  const base = r.restored === 1 && r.skipped.length === 0 ? t('Undone.') : t('Undone: {n} restored.', { n: r.restored })
  updateBulkToast({ undoId: null, result: r.skipped.length ? `${base} ${t('Kept because they were changed again since: {items}.', { items: r.skipped.join(', ') })}` : base })
}

/**
 * The toast's timer: `ttl` ms of being shown, not counting the time it is held (hover or
 * focus). A new message in the same toast (the result after Undo) starts it again.
 */
function useToastTimer(key: number | undefined, message: string | undefined, ttl: number, held: boolean) {
  const left = useRef(ttl)
  useEffect(() => { left.current = ttl }, [key, message, ttl])
  useEffect(() => {
    if (key === undefined || held) return
    const started = Date.now()
    const timer = setTimeout(() => hideBulkToast(key), left.current)
    return () => { clearTimeout(timer); left.current = Math.max(0, left.current - (Date.now() - started)) }
  }, [key, message, held])
}

const TOAST_CLASS = 'ui-toast pointer-events-auto flex items-center gap-3 rounded-control border border-default bg-surface px-3 py-2 text-body shadow-2'

/** The toast that just closed, kept for its exit (three quarters of the emphasis duration). */
function useLeaving(toast: BulkToast | null): BulkToast | null {
  const [prev, setPrev] = useState(toast)
  const [leaving, setLeaving] = useState<BulkToast | null>(null)
  if (prev !== toast) {
    setPrev(toast)
    setLeaving(!toast && prev && !noMotion() ? prev : null)
  }
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => setLeaving(null), emphasisMs() * 0.75)
    return () => clearTimeout(timer)
  }, [leaving])
  return leaving
}

export function UndoToast() {
  const toast = useBulkToast()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  // After Undo the result reads for one task's action time (issue 348).
  useToastTimer(toast?.key, toast?.result, toast?.result ? ACTION_TOAST_MS : toast?.ttl ?? TOAST_MS, hovered || focused)
  useEffect(() => { setHovered(false); setFocused(false) }, [toast?.key])
  const region = useRef<HTMLDivElement>(null)
  // Undo removes its own button while it has focus, and the browser may not report that
  // focus left (issue 348): a new message reads the hold from the page, not from events.
  useEffect(() => {
    const el = region.current?.querySelector('[data-bulk-toast]')
    if (!el) return
    setFocused(el.contains(document.activeElement))
    setHovered(el.matches(':hover'))
  }, [toast?.result])
  /** Where focus was before it entered the toast, to give it back on dismiss. */
  const returnTo = useRef<HTMLElement | null>(null)
  const dismiss = (key: number) => {
    const inside = !!region.current?.contains(document.activeElement)
    hideBulkToast(key)
    if (inside && returnTo.current?.isConnected) returnTo.current.focus()
  }
  const leaving = useLeaving(toast)
  const side = useToastClearance(region, !!toast)
  const undoId = toast?.undoId ?? null
  useShortcutScope('global', { 'global.undo-bulk': () => { if (!undoId) return false; void undoToast(undoId) } }, { enabled: !!undoId })
  if (!toast) {
    // The toast that just closed fades out; it takes no input.
    return leaving && (
      <ToastRegion label={t('Last action')} side={side} regionRef={region}>
        <div aria-hidden="true" inert data-closing="" className={TOAST_CLASS}>
          <p className="min-w-0 flex-1">{leaving.result ?? leaving.label}</p>
        </div>
      </ToastRegion>
    )
  }
  return (
    <ToastRegion label={t('Last action')} side={side} regionRef={region}>
      <div key={toast.key} className={TOAST_CLASS} data-bulk-toast
        onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
        onFocus={(e) => {
          setFocused(true)
          const from = e.relatedTarget as HTMLElement | null
          if (from && !e.currentTarget.contains(from)) returnTo.current = from
        }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false) }}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dismiss(toast.key) } }}>
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
        {/* Dismiss is not one of the toast's two actions: it only closes it (app-shell "Notices are toasts"). */}
        <Tooltip label={t('Dismiss')} shortcut="Esc">
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm -mr-1 px-1 py-1 text-muted" aria-label={t('Dismiss')} data-toast-dismiss
            onClick={() => dismiss(toast.key)}><Icon name="x" size="sm" /></button>
        </Tooltip>
      </div>
    </ToastRegion>
  )
}

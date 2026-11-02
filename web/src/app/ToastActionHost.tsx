// The host for background failures (the focus engine's failed time entry, heard
// through lib/focus/failures), mounted once by the Shell: one toast with the
// recorded message, leaving after the action toast's window, replaced by the next. The UndoToast stays the one offer of the
// last change; the two never show at once (the undo offer wins, the message waits),
// so the failure cannot cover the offer's Undo control (design-system "Toast
// primitive"); its window starts when it is first shown, not when it was raised.
// Like the offer, it never covers the focused element (useToastClearance).
import { useEffect, useRef, useState } from 'react'
import { Icon, ToastRegion, useToastClearance } from '../ui'
import { ACTION_TOAST_MS, hideActionToast, showActionToast, useActionToast, useBulkToast, useToastTimer } from './bulk/toastStore'
import { actionErrorMessage } from './actionError'
import { onEntryFailure, type EntryFailure } from '../lib/focus/failures'
import { useResetOnChange } from '../lib/useResetOnChange'
import { t } from '../lib/i18n'

/** The sentence for a failed focus time entry, so the person knows whether the minutes were logged. */
function entryFailureMessage({ phase, error }: EntryFailure): string {
  const detail = actionErrorMessage(error)
  return phase === 'start'
    ? t('The time entry could not be started; this session is not being tracked. ({detail})', { detail })
    : t('The time entry could not be stopped; the minutes may not be logged correctly. ({detail})', { detail })
}

export function ToastActionHost() {
  const toast = useActionToast()
  const offer = useBulkToast()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const shown = toast && !offer ? toast : null
  const region = useRef<HTMLDivElement>(null)
  // The focus session reports a failed time entry; this is where it becomes a message.
  useEffect(() => onEntryFailure((failure) => showActionToast(entryFailureMessage(failure))), [])
  /** Where focus was before it entered the toast, to give it back on dismiss. */
  const returnTo = useRef<HTMLElement | null>(null)
  // Removing the focused (or hovered) toast fires no blur (or pointerleave): the hold
  // resets when the shown message changes or leaves, as the UndoToast's does.
  useResetOnChange([shown?.key], () => { setHovered(false); setFocused(false) })
  // The window runs from the first render of this message (not from showActionToast:
  // while an offer holds the region the message waits), pausing on hover or focus.
  useToastTimer(shown?.key, shown?.label, ACTION_TOAST_MS, hovered || focused, hideActionToast)
  // Where the focused element would sit under the message, the region moves aside.
  const side = useToastClearance(region, !!shown)
  if (!shown) return null
  return (
    <ToastRegion live="assertive" label={t('Last action')} side={side} regionRef={region}>
      <div key={shown.key} className="ui-toast pointer-events-auto flex items-center gap-3 rounded-control border border-default bg-surface px-3 py-2 text-body shadow-2" data-action-toast
        onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
        onFocus={(e) => {
          setFocused(true)
          const from = e.relatedTarget as HTMLElement | null
          if (from && !e.currentTarget.contains(from)) returnTo.current = from
        }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false) }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.preventDefault(); e.stopPropagation()
          const inside = region.current?.contains(document.activeElement)
          hideActionToast(shown.key)
          if (inside && returnTo.current?.isConnected) returnTo.current.focus()
        }}>
        <span className="shrink-0 text-danger"><Icon name="circle-alert" /></span>
        <p role="status" className="min-w-0 flex-1">{shown.label}</p>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm -mr-1 px-1 py-1 text-muted" aria-label={t('Dismiss')}
          onClick={() => hideActionToast(shown.key)} data-action-toast-dismiss><Icon name="x" size="sm" /></button>
      </div>
    </ToastRegion>
  )
}

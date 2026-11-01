// The host for background failures (the focus engine's failed time entry), mounted
// once by the Shell: one toast with the recorded message, leaving after the action
// toast's window, replaced by the next. The UndoToast stays the one offer of the
// last change; the two never show at once (the undo offer wins, the message waits),
// so the failure cannot cover the offer's Undo control (design-system "Toast
// primitive"); its window starts when it is first shown, not when it was raised.
import { useState } from 'react'
import { Icon, ToastRegion } from '../ui'
import { ACTION_TOAST_MS, hideActionToast, useActionToast, useBulkToast, useToastTimer } from './bulk/toastStore'
import { t } from '../lib/i18n'

export function ToastActionHost() {
  const toast = useActionToast()
  const offer = useBulkToast()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const shown = toast && !offer ? toast : null
  // The window runs from the first render of this message (not from showActionToast:
  // while an offer holds the region the message waits), pausing on hover or focus.
  useToastTimer(shown?.key, shown?.label, ACTION_TOAST_MS, hovered || focused, hideActionToast)
  if (!shown) return null
  return (
    <ToastRegion live="assertive" label={t('Last action')}>
      <div key={shown.key} className="ui-toast pointer-events-auto flex items-center gap-3 rounded-control border border-default bg-surface px-3 py-2 text-body shadow-2" data-action-toast
        onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
        onFocus={() => setFocused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false) }}>
        <span className={shown.tone === 'danger' ? 'shrink-0 text-danger' : 'shrink-0 text-muted'}>
          <Icon name={shown.tone === 'danger' ? 'circle-alert' : 'circle-check-big'} />
        </span>
        <p role="status" className="min-w-0 flex-1">{shown.label}</p>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm -mr-1 px-1 py-1 text-muted" aria-label={t('Dismiss')}
          onClick={() => hideActionToast(shown.key)} data-action-toast-dismiss><Icon name="x" size="sm" /></button>
      </div>
    </ToastRegion>
  )
}

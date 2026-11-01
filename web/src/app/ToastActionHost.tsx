// The host for background failures (the focus engine's failed time entry), mounted
// once by the Shell: one toast with the recorded message, leaving after the action
// toast's window, replaced by the next. The UndoToast stays the one offer of the
// last change; the two never show at once (the undo offer wins, the message waits).
import { useEffect, useRef } from 'react'
import { Icon, ToastRegion } from '../ui'
import { ACTION_TOAST_MS, hideActionToast, useActionToast, type ActionToast } from './bulk/toastStore'
import { t } from '../lib/i18n'

/** The message leaves after the action-toast window. */
function useExpiry(toast: ActionToast | null): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!toast) return
    timer.current = setTimeout(() => hideActionToast(toast.key), ACTION_TOAST_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [toast?.key]) // eslint-disable-line react-hooks/exhaustive-deps -- the message renders through the store, the key times it
}

export function ToastActionHost() {
  const toast = useActionToast()
  useExpiry(toast)
  if (!toast) return null
  return (
    <ToastRegion live="assertive" label={t('Last action')}>
      <div key={toast.key} className="ui-toast pointer-events-auto flex items-center gap-3 rounded-control border border-default bg-surface px-3 py-2 text-body shadow-2" data-action-toast>
        <span className={toast.tone === 'danger' ? 'shrink-0 text-danger' : 'shrink-0 text-muted'}>
          <Icon name={toast.tone === 'danger' ? 'circle-alert' : 'circle-check-big'} />
        </span>
        <p role="status" className="min-w-0 flex-1">{toast.label}</p>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm -mr-1 px-1 py-1 text-muted" aria-label={t('Dismiss')}
          onClick={() => hideActionToast(toast.key)} data-action-toast-dismiss><Icon name="x" size="sm" /></button>
      </div>
    </ToastRegion>
  )
}

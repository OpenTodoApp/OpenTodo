import { Icon, ToastRegion } from '../../ui'
import { useEffect, useState } from 'react'
import { undoChanges } from '../../lib/assistant'
import { closeAssistant, useAssistantOpen } from '../../lib/assistantStatus'
import { AssistantPanel } from './AssistantPanel'
import { t } from '../../lib/i18n'

/**
 * The lazy assistant chunk's root (in-app-assistant D9): mounted on first open
 * and kept, so the Undo toast outlives the panel.
 */
export default function AssistantRoot({ context }: { context: () => { view?: string; selected?: string[]; projectId?: string } }) {
  const open = useAssistantOpen()
  const [toast, setToast] = useState<{ text: string; undoId: string | null } | null>(null)
  useEffect(() => {
    if (!toast) return
    const item = setTimeout(() => setToast(null), 10_000)
    return () => clearTimeout(item)
  }, [toast])
  return (
    <>
      {open && <AssistantPanel onClose={closeAssistant} context={context} onApplied={(r) => setToast(r)} />}
      <ToastRegion label={t('Assistant')}>
        {toast && (
          <div role="status" className="pointer-events-auto flex items-center gap-2 rounded-control bg-(--ot-text-strong) px-3 py-2 text-body text-(--ot-surface) shadow-2" data-assistant-toast>
            <span className="min-w-0 flex-1">{toast.text}</span>
            {toast.undoId && (
              <button type="button" className="rounded-control px-2 py-1 font-medium underline focus-visible:outline-2 focus-visible:outline-focus"
                onClick={() => { const id = toast.undoId!; setToast({ text: t('Undoing…'), undoId: null }); void undoChanges(id).then((u) => setToast({ text: u.skipped.length ? t('Undone, except: {items}.', { items: u.skipped.join(', ') }) : t('Undone.'), undoId: null })) }}>
                {t('Undo')}
              </button>
            )}
            <button type="button" className="rounded-control px-2 py-1" aria-label={t('Dismiss')} onClick={() => setToast(null)}><Icon name="x" /></button>
          </div>
        )}
      </ToastRegion>
    </>
  )
}

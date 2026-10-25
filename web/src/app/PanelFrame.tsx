// The chrome of a non-task occupant of the shell's panel slot (OpenSpec change
// ux-overhaul, app-shell "The panel slot has an address"): project activity and
// history, the calendar's planning list. Same column as the task panel from
// 1024 px, a sheet over the content below that; Escape or Close empties the slot.
import type { ReactNode } from 'react'
import { IconButton } from '../ui'
import { closePanel } from './panel'
import { useShortcutScope } from './shortcuts'
import { t } from '../lib/i18n'

export function PanelFrame({ title, children, actions, testId, onEscape, onClose = closePanel }: {
  title: string
  children: ReactNode
  actions?: ReactNode
  testId?: string
  /** Runs before Escape closes the slot; true when it handled the key (the planning list cancels a placement first). */
  onEscape?: () => boolean
  /** Close and Escape: empties the slot; the planning list also remembers it closed. */
  onClose?: () => void
}) {
  // Escape empties the slot (the `panel` scope); an overlay above it keeps its own Escape.
  useShortcutScope('panel', {
    'panel.escape': (e) => {
      if ((e.target as HTMLElement | null)?.closest('[data-overlay]')) return false
      if (onEscape?.()) return
      onClose()
    },
  })
  return (
    <aside data-panel-frame={testId ?? title} aria-label={title}
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-default bg-surface pb-[env(safe-area-inset-bottom)] shadow-3 lg:static lg:w-(--panel-w) lg:max-w-none lg:shadow-none">
      <div data-panel-header className="flex items-center gap-2 border-b border-default px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <h2 className="min-w-0 flex-1 truncate text-h3 font-semibold text-strong">{title}</h2>
        {actions}
        <IconButton icon="x" label={t('Close')} onClick={onClose} data-overlay-close className="touch-target" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </aside>
  )
}

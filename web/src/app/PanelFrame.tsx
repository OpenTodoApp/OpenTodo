// The chrome of a non-task occupant of the shell's panel slot (OpenSpec change
// ux-overhaul, app-shell "The panel slot has an address"): project activity and
// history, the calendar's planning list. Same column as the task panel from
// 1024 px, a sheet over the content below that; Escape or Close empties the slot.
import { useEffect, type ReactNode } from 'react'
import { IconButton } from '../ui'
import { closePanel } from './panel'

export function PanelFrame({ title, children, actions, testId }: { title: string; children: ReactNode; actions?: ReactNode; testId?: string }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target as HTMLElement | null
      if (t?.closest('[data-overlay]')) return
      closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <aside data-panel-frame={testId ?? title} aria-label={title}
      className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-default bg-surface pb-[env(safe-area-inset-bottom)] shadow-3 lg:static lg:w-[26rem] lg:max-w-none lg:shadow-none min-[1440px]:w-[30rem]">
      <div data-panel-header className="flex items-center gap-2 border-b border-default px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <h2 className="min-w-0 flex-1 truncate text-h3 font-semibold text-strong">{title}</h2>
        {actions}
        <IconButton icon="x" label="Close" onClick={closePanel} data-overlay-close className="touch-target" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </aside>
  )
}

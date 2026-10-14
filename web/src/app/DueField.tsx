// Due date and time in the detail panel, with the "Fixed to time zone" toggle
// (OpenSpec change absolute-datetimes). The inputs always show the due in the
// viewer's zone; edits of a zoned due are converted back into its zone
// (dueFromView), so it stays fixed. Every change is one `updateTask` due edit.
import { Icon } from '../ui/Icon'
import { useEffect } from 'react'
import { dueFromView, fixDueToZone, localDueOf, releaseDue, zoneCity, zoneHint } from '../lib/dates'
import { updateTask } from '../lib/ops'
import type { Task } from '../lib/types'
import { isTyping, useViewerZone } from './useViews'

/** `z` with the panel open (not typing) toggles the zone; listed in the shortcut help. */
export const ZONE_TOGGLE_KEY = 'z'

export function DueField({ task, readOnly = false }: { task: Task; readOnly?: boolean }) {
  const zone = useViewerZone()
  const view = localDueOf(task.due, zone)
  const zoned = !!task.due?.tz
  const canFix = !!task.due?.time
  const hint = zoneHint(task.due, zone)

  const setView = (next: { date: string; time?: string } | null) => void updateTask(task.id, { due: dueFromView(task.due, next, zone) })
  const toggleZone = () => {
    if (!task.due || !task.due.time) return
    void updateTask(task.id, { due: zoned ? releaseDue(task.due, zone) : fixDueToZone(task.due, zone) })
  }

  useEffect(() => {
    if (readOnly) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ZONE_TOGGLE_KEY || e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return
      if (document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      toggleZone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="space-y-1">
      {/* Wraps on narrow panels: WebKit's date field does not shrink below its own minimum. */}
      <div className="flex flex-wrap gap-2">
        <input type="date" className="input min-w-40 flex-1" aria-label="Due date" value={view?.date ?? ''}
          onChange={(e) => setView(e.target.value ? { date: e.target.value, ...(view?.time ? { time: view.time } : {}) } : null)} />
        <input type="time" className="input w-36" aria-label="Due time" value={view?.time ?? ''} disabled={!view}
          onChange={(e) => view && setView(e.target.value ? { date: view.date, time: e.target.value } : { date: view.date })} />
        {task.due && <button className="btn-ghost" onClick={() => void updateTask(task.id, { due: null })} aria-label="Clear due date" title="Clear due date"><Icon name="x" /></button>}
      </div>
      <label className={`flex items-center gap-2 text-xs ${canFix ? 'text-slate-600 dark:text-slate-300' : 'text-faint'}`}
        title={canFix ? `Keep this time fixed in ${zoned ? task.due!.tz : zone} wherever it is viewed (z)` : 'Set a time to fix it to a time zone'}>
        <input type="checkbox" checked={zoned} disabled={!canFix} onChange={toggleZone} aria-keyshortcuts="z" />
        Fixed to time zone{zoned ? `: ${zoneCity(task.due!.tz!)}` : canFix ? ` (${zoneCity(zone)})` : ''}
      </label>
      {hint && <p className="text-xs text-muted" data-testid="zone-hint">{hint}</p>}
    </div>
  )
}

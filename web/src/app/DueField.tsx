// Due date and time in the detail panel, with the zone control (OpenSpec changes
// absolute-datetimes, task-detail-redesign D4). The fields always show the due in
// the viewer's zone; edits of a zoned due are converted back into its zone
// (dueFromView), so it stays fixed. Every change is one due edit, with an Undo offer.
import { IconButton } from '../ui'
import { dueFromView, localDueOf, zoneHint } from '../lib/dates'
import type { Task } from '../lib/types'
import { DateField } from './datetime/DateField'
import { setDueWithUndo } from './undoable'
import { TimeField } from './datetime/TimeField'
import { ZoneControl } from './task-detail/ZoneControl'
import { useViewerZone } from './useViews'

/** `z` with the panel open (not typing) toggles the zone; the handler lives in ZoneControl. */
export { ZONE_TOGGLE_KEY } from './task-detail/ZoneControl'

export function DueField({ task, readOnly = false }: { task: Task; readOnly?: boolean }) {
  const zone = useViewerZone()
  const view = localDueOf(task.due, zone)
  const hint = zoneHint(task.due, zone)

  const setView = (next: { date: string; time?: string } | null) => void setDueWithUndo(task.id, dueFromView(task.due, next, zone))

  return (
    <div className="space-y-1">
      {/* Text fields in the user's date and time format (date-time-preferences D4); they wrap on narrow panels. */}
      <div className="flex flex-wrap items-start gap-2">
        <DateField label="Due date" hideLabel className="min-w-44 flex-1" value={view?.date ?? null}
          onChange={(date) => setView(date ? { date, ...(view?.time ? { time: view.time } : {}) } : null)} />
        <TimeField label="Due time" hideLabel value={view?.time ?? null} disabled={!view}
          onChange={(time) => view && setView(time ? { date: view.date, time } : { date: view.date })} />
        {task.due && <IconButton icon="x" label="Clear due date" onClick={() => void setDueWithUndo(task.id, null)} />}
      </div>
      {task.due && <ZoneControl task={task} readOnly={readOnly} viewerZone={zone} />}
      {hint && <p className="text-meta text-muted" data-testid="zone-hint">{hint}</p>}
    </div>
  )
}

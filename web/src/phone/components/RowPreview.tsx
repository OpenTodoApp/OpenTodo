// The task at the head of its actions sheet on a phone (OpenSpec change phone-delight,
// design D4): the check's priority ring and the facts the task's row shows, read-only.
// The sheet's own title is the task's title, so it is not repeated here.
import { useDateTimeFormat } from '../../app/DateTimePrefsProvider'
import { useToday, useViewerZone } from '../../app/useViews'
import { useProjects } from '../../lib/localData'
import type { Task } from '../../lib/types'
import { Icon } from '../../ui'
import { rowOf } from '../rowModel'

const RING: Record<number, string> = { 1: 'border-p1', 2: 'border-p2', 3: 'border-p3', 4: 'border-input' }
const TONE: Record<string, string> = { danger: 'text-danger', accent: 'text-accent' }

export function RowPreview({ task }: { task: Task }) {
  const today = useToday()
  const zone = useViewerZone()
  const dateTime = useDateTimeFormat().resolved
  const project = useProjects().find((p) => p.id === task.project_id)
  const row = rowOf(task, undefined, { today, zone, dateTime, project })
  if (!row.facts?.length) return null
  return (
    <div data-row-preview={task.id} className="flex min-w-0 items-center gap-2 px-3 pb-2 pt-1 text-meta text-muted">
      <span aria-hidden className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${RING[row.priority]}`} />
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
        {row.facts.map((f) => (
          <span key={f.id} data-fact={f.id} className={`inline-flex min-w-0 items-center gap-1 ${TONE[f.tone ?? ''] ?? ''}`}>
            {f.mark}{f.icon && <Icon name={f.icon} size="xs" />}<span className="truncate">{f.text}</span>
          </span>
        ))}
      </span>
    </div>
  )
}

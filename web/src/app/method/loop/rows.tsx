// Task rows of the Loop home's moves (loop-guided-dashboard D4): ordinary rows that
// complete in place and open the task beside the page, as in the method views.
import { useMemo, type ReactNode } from 'react'
import { resolveLabels } from '../../../lib/labels'
import { useAllLabels, useAllProjects } from '../../../lib/localData'
import { hasTimeColumn } from '../../../lib/rowTime'
import { listSlotsOff } from '../../../lib/rowSlots'
import { setTaskCompleted } from '../../../lib/ops'
import type { Task } from '../../../lib/types'
import { act } from '../../actionError'
import { openFromRow } from '../../sidePanel'
import { openTaskPage } from '../../taskTrail'
import { TaskRow } from '../../TaskRow'

/** The rows of a short list, with the project shown on each. */
export function Rows({ tasks, label }: { tasks: readonly Task[]; label?: string }) {
  const labels = useAllLabels()
  const projects = useAllProjects()
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  // The time column (rows-v2 D2): one fact of the list.
  const timeColumn = hasTimeColumn(tasks)
  const slotsOff = listSlotsOff(tasks)
  return (
    <ul aria-label={label}>
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} project={task.project_id ? projectMap.get(task.project_id) : undefined} labels={resolveLabels(task.labels, labelMap)}
          showProject selected={false} timeColumn={timeColumn} slotsOff={slotsOff}
          onToggle={() => act(setTaskCompleted(task.id, !task.completed_at))}
          onOpen={(e) => openFromRow(task.id, e)} onOpenPage={() => openTaskPage(task.id)} />
      ))}
    </ul>
  )
}

/** A small group heading inside a move. */
export function GroupHeading({ id, children, end }: { id: string; children: ReactNode; end?: ReactNode }) {
  return (
    <div className="mb-1 flex items-center gap-2 px-2">
      <h3 id={id} className="text-meta font-semibold text-faint">{children}</h3>
      {end && <span className="ml-auto">{end}</span>}
    </div>
  )
}

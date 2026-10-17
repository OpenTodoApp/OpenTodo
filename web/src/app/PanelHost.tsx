// The shell's panel slot (OpenSpec change ux-overhaul, design D1): the one place
// the task detail panel is rendered. It owns the panel's data (projects, labels,
// memberships) so every view, and the palette, notifications and reminders, open
// a task the same way.
import { useEffect, useMemo } from 'react'
import { useLabels, useMembershipMap, useProjects, useTask } from '../lib/localData'
import { roleOf } from '../lib/sharing'
import type { Task, User } from '../lib/types'
import { closePanel, openTaskPanel, usePanel, usePanelHandlers } from './panel'
import { TaskDetail } from './TaskDetail'

/** The data every task detail needs (the panel and the expanded page share it). */
export function useTaskDetailData() {
  const projects = useProjects()
  const labels = useLabels()
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels])
  const memberMap = useMembershipMap()
  const readOnly = (task: Task) => roleOf(task.project_id, memberMap) === 'viewer'
  return { projects, labelMap, readOnly }
}

export function PanelHost({ user }: { user?: Pick<User, 'id'> }) {
  const occupant = usePanel()
  const handlers = usePanelHandlers()
  const taskId = occupant?.kind === 'task' ? occupant.id : null
  const { projects, labelMap, readOnly } = useTaskDetailData()
  // undefined while loading, null when the task does not exist.
  const task = useTask(taskId)

  // A task that is gone (deleted here or elsewhere) leaves the slot.
  useEffect(() => {
    if (taskId && (task === null || task?.deleted_at)) closePanel()
  }, [taskId, task])

  if (!occupant) return null
  if (occupant.kind === 'custom') return <>{occupant.render()}</>
  if (!task) return null
  return (
    <TaskDetail
      // Remount per task so pickers and drafts never show the previous task's data.
      key={occupant.id}
      taskId={occupant.id}
      userId={user?.id}
      readOnly={readOnly(task)}
      projects={projects}
      labelMap={labelMap}
      onClose={closePanel}
      onOpen={openTaskPanel}
      onToggleComplete={handlers.toggleComplete}
    />
  )
}

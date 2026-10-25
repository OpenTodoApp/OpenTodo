// The shell's panel slot (OpenSpec change ux-overhaul, design D1): the one place
// the task detail panel is rendered. It owns the panel's data (projects, labels,
// memberships) so every view, and the palette, notifications and reminders, open
// a task the same way.
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { t } from '../lib/i18n'
import { useLabels, useMembershipMap, useProjects, useTask } from '../lib/localData'
import { roleOf } from '../lib/sharing'
import type { Task, User } from '../lib/types'
import { useMediaQuery } from '../ui'
import { closePanel, closeTaskPanel, openTaskPanel, SPLIT_QUERY, usePanel, usePanelHandlers, useSplitEmptyPane, useSplitKind } from './panel'
import { PanelResizeHandle, SidePanelClose } from './sidePanel'
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
  // A split page with nothing docked keeps its pane ("No task selected", inbox-split D2).
  const empty = useSplitEmptyPane()
  const kind = useSplitKind()
  const wide = useMediaQuery(SPLIT_QUERY)

  // The panel slides in only when it opens from closed, never when it switches tasks
  // (web-app "Overlay motion", motion-v2 D5).
  const shown = occupant?.kind === 'task' ? occupant.id : null
  const [prevShown, setPrevShown] = useState<string | null>(null)
  const [enteredFor, setEnteredFor] = useState<string | null>(null)
  if (shown !== prevShown) {
    setPrevShown(shown)
    setEnteredFor(shown && !prevShown ? shown : null)
  }

  // While the next task reads from the database the panel keeps the one it shows, so
  // switching tasks never empties the slot for a frame and the list beside it never
  // widens and narrows again (a flicker, GitHub issue 383).
  const [held, setHeld] = useState<Task | null>(null)
  if (task && task !== held) setHeld(task)
  if (!taskId && held) setHeld(null)
  const shownTask = task ?? (task === undefined && taskId ? held : null)

  // A task that is gone (deleted here or elsewhere) leaves the slot.
  useEffect(() => {
    if (taskId && (task === null || task?.deleted_at)) closePanel()
  }, [taskId, task])

  if (!occupant) return empty && wide ? <SplitPane side={kind === 'panel'}>{empty()}</SplitPane> : null
  if (occupant.kind === 'custom') return <>{occupant.render()}</>
  if (!shownTask) return null
  return (
    <TaskDetail
      // Remount per task so pickers and drafts never show the previous task's data.
      key={shownTask.id}
      taskId={shownTask.id}
      initial={shownTask}
      userId={user?.id}
      readOnly={readOnly(shownTask)}
      projects={projects}
      labelMap={labelMap}
      onClose={closePanel}
      onDismiss={closeTaskPanel}
      onOpen={openTaskPanel}
      onToggleComplete={handlers.toggleComplete}
      entering={shownTask.id === enteredFor}
    />
  )
}

/** The slot's frame while a split page has no task docked: where the docked task will stand. */
function SplitPane({ children, side }: { children: ReactNode; side: boolean }) {
  return (
    <aside aria-label={t('Task details')} data-split-empty
      className="relative hidden min-w-0 flex-col border-l border-default bg-surface lg:flex lg:w-(--panel-w)">
      <PanelResizeHandle />
      {/* The side panel closes from its empty pane too (task-side-panel D8); the Inbox's split has no Close here. */}
      {side && <SidePanelClose />}
      {children}
    </aside>
  )
}

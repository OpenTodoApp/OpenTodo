// The docked task (OpenSpec change ux-overhaul, web-app "Task panel layout"): the
// task beside a list in the shell's panel slot, on a page that keeps a split (the
// Inbox, task-full-page D3). Everywhere else a task opens as its page (TaskPageView);
// both read the same model (useTaskDetail) and the same parts.
import { useLayoutEffect, useRef, useState } from 'react'
import { roleOf } from '../../lib/sharing'
import type { Label, Project, Task } from '../../lib/types'
import { IconButton, playExit } from '../../ui'
import { panelTaskId } from '../panel'
import { PanelResizeHandle } from '../sidePanel'
import { SampleNotice } from '../SampleNotice'
import { isSample } from '../../lib/sampleTasks'
import { t } from '../../lib/i18n'
import { AttachmentsRow } from './AttachmentsRow'
import { ConversationTabs } from './ConversationTabs'
import { Facets } from './Facets'
import { FieldsGroup } from './FieldsGroup'
import { Subtasks } from './Subtasks'
import { TaskActionsMenu } from './TaskActionsMenu'
import { ReadOnlyNote, TaskHead, TaskRelations } from './TaskHead'
import { TaskNotes } from './TaskNotes'
import { TaskPageDialog } from './TaskPageDialog'
import { useTaskDetail } from './useTaskDetail'

export { taskLink } from './useTaskDetail'
export { AddSubtask } from './Subtasks'
export { NOTES_CLAMP_LINES } from './TaskNotes'

export interface TaskDetailProps {
  taskId: string
  /** The panel was closed before this task opened: it slides in (web-app "Overlay motion"). */
  entering?: boolean
  /** Signed-in account; enables the assignee row (task-assignment). */
  userId?: string
  /** Viewer of the task's shared project: values read as text, no Complete or Delete. */
  readOnly?: boolean
  projects: Project[]
  labelMap: Map<string, Label>
  onClose: () => void
  /** The header's Close, when it does more than close (the side panel stays closed, task-side-panel D4); defaults to onClose. */
  onDismiss?: () => void
  /** Open another task (a subtask or the parent). */
  onOpen?: (id: string) => void
  /** Complete / reopen through the list so the "complete parent too" prompt can follow. */
  onToggleComplete?: (task: Task) => void
}

export function TaskDetail({ taskId, userId, projects, labelMap, onClose, onDismiss, onOpen, onToggleComplete, readOnly = false, entering = false }: TaskDetailProps) {
  const panel = useRef<HTMLElement>(null)
  const m = useTaskDetail({ taskId, readOnly, projects, labelMap, onClose, onOpen, onToggleComplete, scope: panel })
  // Closing the panel (not switching its task) slides it out on a copy (motion-v2 D5).
  useLayoutEffect(() => {
    const el = panel.current
    return () => { if (panelTaskId() === null) playExit(el, { className: 'panel-exit' }) }
  }, [])
  // The pinned bottom of the panel: the comment composer renders here while the
  // Comments tab is shown, so it is in view without scrolling (ux-overhaul).
  const [footer, setFooter] = useState<HTMLDivElement | null>(null)
  const { task } = m
  if (!task) return null

  return (
    <aside ref={panel} data-detail-for={task.id} data-detail-variant="panel"
      className={`fixed inset-y-0 right-0 z-30 flex w-full flex-col border-l border-default bg-surface pb-[env(safe-area-inset-bottom)] shadow-3 md:max-w-md lg:relative lg:z-auto lg:w-(--panel-w) lg:max-w-none lg:shadow-none ${entering ? 'panel-enter' : ''}`}>
      <PanelResizeHandle />
      {/* Sticky header (ux-overhaul, web-app "Task panel layout"): the checkbox, the title, the menu, Close. */}
      <div data-panel-header className="flex items-center gap-2 border-b border-default px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <TaskHead m={m} readOnly={readOnly} projects={projects} size="panel" />
        <TaskActionsMenu m={m} page={false} readOnly={readOnly} onOpen={onOpen} />
        <IconButton icon="x" label={t('Close')} onClick={onDismiss ?? onClose} data-overlay-close className="touch-target" />
      </div>
      {readOnly && <ReadOnlyNote />}
      {isSample(task) && !readOnly && <SampleNotice />}
      <div className="min-w-0 flex-1 overflow-y-auto" data-panel-body>
        <div className="min-w-0 space-y-4 p-4">
          <TaskRelations m={m} onOpen={onOpen} />
          <TaskNotes task={task} readOnly={readOnly} clamp />
          <Facets task={task} userId={userId} readOnly={readOnly} projects={projects} labelMap={labelMap}
            parent={m.parent ?? undefined} childCount={m.children.length} onOpen={onOpen} />
          {/* Custom field values of the task's project (custom-fields). */}
          <FieldsGroup task={task} readOnly={readOnly} />
          <Subtasks task={task} items={m.children} progress={m.progress} readOnly={readOnly} onToggle={m.toggle} onOpen={onOpen} />
          <AttachmentsRow taskId={task.id} userId={userId} role={roleOf(task.project_id, m.memberships ?? new Map())} dropTarget={panel} />
        </div>
        <ConversationTabs task={task} userId={userId} readOnly={readOnly} onOpen={onOpen} composerHost={footer} />
      </div>
      <div ref={setFooter} data-panel-footer className="shrink-0 border-t border-default bg-surface px-4 py-3 empty:hidden" />
      {m.pageDialog && <TaskPageDialog task={task} status={m.pageStatus ?? null} onClose={() => m.setPageDialog(false)} />}
    </aside>
  )
}

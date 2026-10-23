// What the docked panel and the task page share (OpenSpec change task-full-page,
// design D5): the live task and its relatives, the title draft that a change from
// another device does not overwrite, the actions of the header menu, task pages'
// publish state, and the `panel` keys (1–4, y, Shift+K) while focus is inside.
import { useLiveQuery } from 'dexie-react-hooks'
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { openAssistantWith, useAssistantStatus } from '../../lib/assistantStatus'
import { useSubtasks, useTask } from '../../lib/localData'
import { markTaskNotificationsRead } from '../../lib/notifications'
import { skipOccurrence, updateTask } from '../../lib/ops'
import { membershipMap, roleOf } from '../../lib/sharing'
import { progressOf } from '../../lib/subtasks'
import type { EditPlan } from '../../lib/nlp/edit'
import type { Label, Priority, Project, Task } from '../../lib/types'
import { toggleTracking } from '../../lib/timeEntries'
import { useOnline } from '../../lib/online'
import { t } from '../../lib/i18n'
import { act } from '../actionError'
import { useShortcutScope } from '../shortcuts'
import { commitTitleEdit } from '../titleEdit'
import { completeWithUndo, deleteWithUndo } from '../undoable'
import { useTaskPageStatus } from './taskPageStatus'

/** The link that opens a task in the app: its page (task-full-page). */
export function taskLink(id: string, origin = typeof location === 'undefined' ? '' : location.origin): string {
  return `${origin}/task/${encodeURIComponent(id)}`
}

export interface TaskDetailInput {
  taskId: string
  readOnly: boolean
  projects: Project[]
  labelMap: Map<string, Label>
  onClose: () => void
  onOpen?: (id: string) => void
  onToggleComplete?: (task: Task) => void
  /** The element the `panel` keys apply inside. */
  scope: RefObject<HTMLElement | null>
}

export function useTaskDetail({ taskId, readOnly, projects, labelMap, onClose, onOpen, onToggleComplete, scope }: TaskDetailInput) {
  const assistant = useAssistantStatus()
  const task = useTask(taskId)
  const [title, setTitle] = useState('')
  const [copied, setCopied] = useState(false)
  const children = useSubtasks(taskId)
  const parent = useTask(task?.parent_id)
  const series = useTask(task?.series_id)
  const progress = useMemo(() => progressOf({ id: taskId }, children), [taskId, children])
  const memberships = useLiveQuery(() => membershipMap(), [])
  // Task pages (task-pages): the task's owner, or the owner and admins of its shared
  // project, publish a top-level task; the status comes from the server when online.
  const role = memberships ? roleOf(task?.project_id, memberships) : null
  const canPublish = !!task && !task.parent_id && !readOnly && (role === 'owner' || role === 'admin')
  const { status: pageStatus } = useTaskPageStatus(taskId, canPublish)
  const [pageDialog, setPageDialog] = useState(false)
  const online = useOnline()

  // The stored title the draft started from, and whether the field has focus: a
  // change from another device does not overwrite a title being typed
  // (client-sync-robustness); the draft is committed on blur as usual.
  const titleBase = useRef('')
  const titleField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  // Labels for `@` in the title (smart-title-tokens).
  const labelList = useMemo(() => [...labelMap.values()], [labelMap])
  useEffect(() => {
    if (!task) return
    const focused = !!titleField.current && titleField.current === document.activeElement
    if (focused && title !== titleBase.current) return
    titleBase.current = task.title
    setTitle(task.title)
  }, [task?.id, task?.title]) // eslint-disable-line react-hooks/exhaustive-deps -- reacts to the stored title only; the draft is read, not a trigger
  useEffect(() => setCopied(false), [taskId])
  // The title grows to two lines, then stops (it scrolls inside itself while being edited).
  useLayoutEffect(() => {
    const el = titleField.current
    if (!el) return
    el.style.height = 'auto'
    const line = parseFloat(getComputedStyle(el).lineHeight) || 24
    el.style.height = `${Math.min(el.scrollHeight, Math.ceil(line * 2))}px`
  }, [title, task?.id])
  // Opening a task reads its notifications (task-assignment); works offline.
  useEffect(() => {
    void markTaskNotificationsRead(taskId)
  }, [taskId])

  // The `panel` scope while focus is inside (keyboard-shortcuts "Innermost scope
  // wins"): 1–4 set the open task's priority, y tracks time, Shift+K skips its occurrence.
  useShortcutScope('panel', {
    'panel.priority': (e) => {
      if (!task || readOnly) return false
      act(updateTask(task.id, { priority: Number(e.key) as Priority }))
    },
    'panel.track': () => {
      if (!task || readOnly || task.deleted_at) return false
      act(toggleTracking(task.id, { canStart: !task.completed_at }))
    },
    'panel.skip': () => {
      if (!task || readOnly || !task.recurrence) return false
      act(skipOccurrence(task.id))
    },
  }, { within: () => scope.current })

  // A committed title (smart-title-tokens D5): a plain rename as before; what the edit typed
  // (a date, a priority, #project, @label…) applied as one undoable change.
  const commitTitle = (plan: EditPlan) => {
    if (!task) return
    const next = plan.patch.title ?? task.title
    titleBase.current = next
    setTitle(next)
    act(commitTitleEdit(task, plan, labelList, (id) => projects.find((p) => p.id === id)?.name ?? t('the project')).then((id) => { if (id !== task.id) onOpen?.(id) }))
  }
  const toggle = (tk: Task) => (onToggleComplete ? onToggleComplete(tk) : act(completeWithUndo(tk.id, !tk.completed_at)))
  const remove = () => { if (task) { act(deleteWithUndo(task.id)); onClose() } }
  const copyLink = () => {
    if (task) void navigator.clipboard?.writeText(taskLink(task.id)).then(() => setCopied(true), () => {})
  }
  // assistant-skills: "Break this down" runs the skill with this task as its subject.
  const breakDown = () => { if (task) openAssistantWith({ skill: 'break-down', text: t('Break down “{title}”', { title: task.title }), selected: [task.id] }) }

  return {
    task, title, setTitle, titleField, labelList, commitTitle, toggle, remove, copyLink, copied, breakDown,
    children, parent, series, progress, memberships, canPublish, pageStatus, pageDialog, setPageDialog, online,
    assistantAvailable: !!assistant?.available,
  }
}

export type TaskDetailModel = ReturnType<typeof useTaskDetail>

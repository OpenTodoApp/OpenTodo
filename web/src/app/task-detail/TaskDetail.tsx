import { useLiveQuery } from 'dexie-react-hooks'
import { Component, type FormEvent, type KeyboardEvent, lazy, type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { openAssistantWith, useAssistantStatus } from '../../lib/assistantStatus'
import { db } from '../../lib/db'
import { markTaskNotificationsRead } from '../../lib/notifications'
import { createSubtask, deleteTask, setTaskCompleted, updateTask } from '../../lib/ops'
import { progressOf } from '../../lib/subtasks'
import type { Label, Priority, Project, Task } from '../../lib/types'
import { IconButton } from '../../ui/Button'
import { Badge } from '../../ui/Card'
import { Icon } from '../../ui/Icon'
import { MenuItem, MenuSeparator } from '../../ui/Menu'
import { useDateTimeFormat } from '../DateTimePrefsProvider'
import { Markdown } from '../Markdown'
import { Menu } from '../overlay/Menu'
import { isTyping } from '../useViews'
import { ConversationTabs } from './ConversationTabs'
import { Properties } from './Properties'

// The rich-text editor and its libraries are a separate chunk, fetched when a
// note is first opened (collaborative-rich-text, task 3.1).
const NotesEditor = lazy(() => import('../NotesEditor'))

/** The link that opens a task in the app (the same one notifications use). */
export function taskLink(id: string, origin = typeof location === 'undefined' ? '' : location.origin): string {
  return `${origin}/?task=${encodeURIComponent(id)}`
}

export function TaskDetail({ taskId, userId, projects, labelMap, onClose, onOpen, onToggleComplete, readOnly = false }: {
  taskId: string
  /** Signed-in account; enables the assignee row (task-assignment). */
  userId?: string
  /** Viewer of the task's shared project: values read as text, no Complete or Delete. */
  readOnly?: boolean
  projects: Project[]
  labelMap: Map<string, Label>
  onClose: () => void
  /** Open another task in the panel (a subtask or the parent). */
  onOpen?: (id: string) => void
  /** Complete / reopen through the list so the "complete parent too" prompt can follow. */
  onToggleComplete?: (task: Task) => void
}) {
  const dt = useDateTimeFormat()
  const assistant = useAssistantStatus()
  const task = useLiveQuery(() => db.tasks.get(taskId), [taskId])
  const [title, setTitle] = useState('')
  const [copied, setCopied] = useState(false)

  const children = useLiveQuery(
    () => db.tasks.where('parent_id').equals(taskId).filter((t) => !t.deleted_at).sortBy('position'),
    [taskId], [] as Task[],
  )
  const parent = useLiveQuery(() => (task?.parent_id ? db.tasks.get(task.parent_id) : undefined), [task?.parent_id])
  const series = useLiveQuery(() => (task?.series_id ? db.tasks.get(task.series_id) : undefined), [task?.series_id])
  const progress = useMemo(() => progressOf({ id: taskId }, children), [taskId, children])

  useEffect(() => {
    if (task) setTitle(task.title)
  }, [task?.id, task?.title]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setCopied(false), [taskId])
  // Opening a task reads its notifications (task-assignment); works offline.
  useEffect(() => {
    void markTaskNotificationsRead(taskId)
  }, [taskId])

  if (!task) return null

  // assistant-skills: "Break this down" runs the skill with this task as its subject.
  const breakDown = () => openAssistantWith({ skill: 'break-down', text: `Break down “${task.title}”`, selected: [task.id] })

  const commitTitle = () => {
    const t = title.trim()
    if (t && t !== task.title) void updateTask(task.id, { title: t })
    else setTitle(task.title)
  }
  const toggle = (t: Task) => (onToggleComplete ? onToggleComplete(t) : void setTaskCompleted(t.id, !t.completed_at))
  const remove = () => { void deleteTask(task.id); onClose() }
  const copyLink = () => {
    void navigator.clipboard?.writeText(taskLink(task.id)).then(() => setCopied(true), () => {})
  }
  // 1–4 set the priority while focus is in the panel but not in a text field.
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (readOnly || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.nativeEvent)) return
    if (e.key >= '1' && e.key <= '4') {
      e.preventDefault()
      e.stopPropagation()
      void updateTask(task.id, { priority: Number(e.key) as Priority })
    }
  }

  return (
    <aside data-detail-for={task.id} onKeyDown={onKeyDown} className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-default bg-surface pb-[env(safe-area-inset-bottom)] shadow-xl md:static md:shadow-none">
      <div className="flex items-center gap-2 border-b border-default px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        {!readOnly && (
          <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => toggle(task)}>
            <Icon name={task.completed_at ? 'undo-2' : 'check'} />{task.completed_at ? 'Reopen' : 'Complete'}
          </button>
        )}
        {progress.total > 0 && <Badge hue="slate" title="Completed subtasks">{progress.done}/{progress.total}</Badge>}
        <div className="flex-1" />
        {copied && <span role="status" className="text-meta text-muted">Link copied</span>}
        <Menu kind="menu" label="Task actions" trigger={<Icon name="ellipsis" size="md" />} triggerClassName="btn-ghost touch-target px-2 py-1.5" width="sm:w-60">
          <MenuItem label="Copy link" icon="link" onSelect={copyLink} />
          {parent && <MenuItem label="Open parent task" icon="corner-down-right" onSelect={() => onOpen?.(parent.id)} />}
          {series && <MenuItem label="Open recurring task" icon="repeat" onSelect={() => onOpen?.(series.id)} />}
          {!readOnly && assistant?.available && <MenuItem label="Break this down" icon="list" onSelect={breakDown} />}
          {!readOnly && <MenuSeparator />}
          {!readOnly && <MenuItem label="Delete" icon="trash-2" danger onSelect={remove} />}
        </Menu>
        <IconButton icon="x" label="Close" onClick={onClose} data-overlay-close className="touch-target" />
      </div>
      {readOnly && (
        <p role="note" className="border-b border-default bg-sunken px-4 py-2 text-meta text-muted">
          Read-only: you are a viewer of this shared project. You can still comment.
        </p>
      )}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="min-w-0 space-y-4 p-4">
          {parent && (
            <button type="button" className="flex items-center gap-1 text-meta text-faint hover:text-default" onClick={() => onOpen?.(parent.id)} title="Open parent task">
              <Icon name="corner-down-right" />{parent.title || 'Untitled'}
              {parent.deleted_at ? ' (deleted)' : parent.completed_at && !task.completed_at ? ' (completed)' : ''}
            </button>
          )}
          {series && (
            <button type="button" className="flex items-center gap-1 text-meta text-faint hover:text-default" onClick={() => onOpen?.(series.id)} title="Open the recurring task">
              <Icon name="repeat" />{task.completed_at ? 'Completed occurrence' : 'Single occurrence'} of {series.title || 'Untitled'}{series.deleted_at ? ' (deleted)' : ''}
            </button>
          )}
          <input
            className="w-full bg-transparent text-lg font-semibold text-default focus:outline-none"
            value={title}
            readOnly={readOnly}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            aria-label="Title"
          />
          <NotesBoundary task={task} readOnly={readOnly}>
            <Suspense fallback={<NotesPreview text={task.description} />}>
              <NotesEditor key={task.id} task={task} readOnly={readOnly} />
            </Suspense>
          </NotesBoundary>

          <Properties task={task} userId={userId} readOnly={readOnly} projects={projects} labelMap={labelMap}
            parent={parent} childCount={children.length} onOpen={onOpen} />

          <section aria-labelledby={`subtasks-${task.id}`}>
            <h3 id={`subtasks-${task.id}`} className="mb-1 flex items-center gap-2 text-meta font-semibold text-muted">
              <Icon name="list" className="text-faint" />Subtasks{progress.total > 0 && <span className="font-normal text-faint">{progress.done}/{progress.total}</span>}
            </h3>
            <ul className="mb-2 space-y-0.5 empty:hidden" aria-label="Subtasks">
              {children.map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-control px-1 py-1 hover:bg-sunken dark:hover:bg-raised">
                  <button
                    type="button"
                    aria-label={c.completed_at ? `Reopen ${c.title}` : `Complete ${c.title}`}
                    onClick={() => toggle(c)}
                    disabled={readOnly}
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 text-[10px] ${c.completed_at ? 'border-input bg-faint text-on-accent' : 'border-input hover:bg-success-soft'}`}
                  >
                    {c.completed_at && <Icon name="check" size={10} />}
                  </button>
                  <button type="button" className={`min-w-0 flex-1 truncate text-left text-sm ${c.completed_at ? 'text-faint line-through' : 'text-default'}`} onClick={() => onOpen?.(c.id)}>
                    {c.title || <span className="italic text-faint">Untitled</span>}
                  </button>
                </li>
              ))}
            </ul>
            {!readOnly && <AddSubtask parent={task} />}
          </section>

          <p className="text-meta text-faint">
            Created {dt.formatInstant(task.created_at, 'datetime')}
            {task.completed_at && <> · Completed {dt.formatInstant(task.completed_at, 'datetime')}</>}
          </p>
        </div>
        <ConversationTabs task={task} userId={userId} readOnly={readOnly} onOpen={onOpen} />
      </div>
    </aside>
  )
}

/** "Add subtask" input: creates on Enter and stays focused for the next entry. */
function AddSubtask({ parent }: { parent: Task }) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const title = value.trim()
    if (!title) return
    setValue('')
    await createSubtask(parent.id, title)
    ref.current?.focus()
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="flex items-center gap-2">
      <span className="text-accent"><Icon name="plus" /></span>
      <input
        ref={ref}
        className="input py-1"
        placeholder="Add subtask…"
        aria-label="Add subtask"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
      />
    </form>
  )
}

/** The note as rendered Markdown while the editor chunk loads. */
function NotesPreview({ text }: { text: string }) {
  return (
    <div className="notes-host" aria-busy="true">
      <div className="notes-editor">{text ? <Markdown source={text} /> : <p className="text-faint">Notes…</p>}</div>
    </div>
  )
}

/** Plain-text notes, the fallback when the editor cannot load (e.g. its chunk is missing offline). */
function PlainNotes({ task, readOnly }: { task: Task; readOnly: boolean }) {
  const [text, setText] = useState(task.description)
  useEffect(() => setText(task.description), [task.id, task.description])
  return (
    <textarea
      className="input min-h-28 resize-y"
      placeholder="Notes…"
      value={text}
      disabled={readOnly}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== task.description) void updateTask(task.id, { description: text })
      }}
      aria-label="Notes"
    />
  )
}

/** Falls back to plain-text notes when the rich-text editor fails to load or render. */
class NotesBoundary extends Component<{ task: Task; readOnly: boolean; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <PlainNotes task={this.props.task} readOnly={this.props.readOnly} />
  }
}

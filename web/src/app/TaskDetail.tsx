import { useLiveQuery } from 'dexie-react-hooks'
import { Component, type FormEvent, lazy, type ReactNode, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { db } from '../lib/db'
import { removeLabel, resolveLabels } from '../lib/labels'
import { createSubtask, deleteTask, setTaskCompleted, setTaskParent, updateTask } from '../lib/ops'
import { buildProjectTree } from '../lib/projects'
import { progressOf } from '../lib/subtasks'
import { descendants, flattenTree } from '../lib/tree'
import type { Label, Priority, Project, Section, Task } from '../lib/types'
import { byPosition } from '../lib/ordering'
import { effectiveSection, moveTaskToSection } from '../lib/sections'
import { DueField } from './DueField'
import { EstimateField } from './EstimateField'
import { LabelChip, LabelPicker } from './LabelPicker'
import { RecurrenceField } from './RecurrenceField'
import { RemindersField } from './RemindersField'
import { AssigneePicker } from './AssigneePicker'
import { markTaskNotificationsRead } from '../lib/notifications'
import { HistoryPanel } from './HistoryPanel'
import { TaskConversation } from './TaskConversation'
import { Markdown } from './Markdown'

// The rich-text editor and its libraries are a separate chunk, fetched when a
// note is first opened (collaborative-rich-text, task 3.1).
const NotesEditor = lazy(() => import('./NotesEditor'))

const PRIORITIES: { p: Priority; label: string; cls: string }[] = [
  { p: 1, label: 'P1', cls: 'text-red-600 border-red-500' },
  { p: 2, label: 'P2', cls: 'text-orange-600 border-orange-500' },
  { p: 3, label: 'P3', cls: 'text-blue-600 border-blue-500' },
  { p: 4, label: 'P4', cls: 'text-slate-500 border-slate-400' },
]

export function TaskDetail({ taskId, userId, projects, labelMap, onClose, onOpen, onToggleComplete, readOnly = false }: {
  taskId: string
  /** Signed-in account; enables the assignee picker (task-assignment). */
  userId?: string
  /** Viewer of the task's shared project: every control is disabled. */
  readOnly?: boolean
  projects: Project[]
  labelMap: Map<string, Label>
  onClose: () => void
  /** Open another task in the panel (a subtask or the parent). */
  onOpen?: (id: string) => void
  /** Complete / reopen through the list so the "complete parent too" prompt can follow. */
  onToggleComplete?: (task: Task) => void
}) {
  const task = useLiveQuery(() => db.tasks.get(taskId), [taskId])
  const [title, setTitle] = useState('')
  const [parentError, setParentError] = useState<string | null>(null)

  // Open, non-deleted tasks of the same project: the candidates for the parent picker.
  const projectId = task?.project_id ?? null
  const candidates = useLiveQuery(
    () => db.tasks.filter((t) => !t.deleted_at && !t.completed_at && t.project_id === projectId).sortBy('position'),
    [projectId], [] as Task[],
  )
  const children = useLiveQuery(
    () => db.tasks.where('parent_id').equals(taskId).filter((t) => !t.deleted_at).sortBy('position'),
    [taskId], [] as Task[],
  )
  const parent = useLiveQuery(() => (task?.parent_id ? db.tasks.get(task.parent_id) : undefined), [task?.parent_id])
  const series = useLiveQuery(() => (task?.series_id ? db.tasks.get(task.series_id) : undefined), [task?.series_id])
  const excluded = useMemo(() => descendants(taskId, candidates), [taskId, candidates])
  // Projects in sidebar (tree) order, indented by depth; archived ones are left out.
  const projectOptions = useMemo(() => flattenTree(buildProjectTree(projects).roots), [projects])
  const progress = useMemo(() => progressOf({ id: taskId }, children), [taskId, children])
  // Section picker (board-view): live sections of the task's own project only.
  const sections = useLiveQuery(
    () => (projectId ? db.sections.where('project_id').equals(projectId).filter((s) => !s.deleted_at).toArray().then((l) => l.sort(byPosition)) : Promise.resolve([] as Section[])),
    [projectId], [] as Section[],
  )
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])

  useEffect(() => {
    if (task) {
      setTitle(task.title)
    }
  }, [task?.id, task?.title]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setParentError(null), [taskId])
  // Opening a task reads its notifications (task-assignment); works offline.
  useEffect(() => {
    void markTaskNotificationsRead(taskId)
  }, [taskId])

  if (!task) return null

  const commitTitle = () => {
    const t = title.trim()
    if (t && t !== task.title) void updateTask(task.id, { title: t })
    else setTitle(task.title)
  }
  // A move into another sharing scope creates a copy (project-sharing); follow it.
  const moveTo = async (projectId: string | null) => {
    const id = await updateTask(task.id, { project_id: projectId })
    if (id !== task.id) onOpen?.(id)
  }
  const toggle = (t: Task) => (onToggleComplete ? onToggleComplete(t) : void setTaskCompleted(t.id, !t.completed_at))
  const changeParent = async (value: string) => {
    setParentError(null)
    try {
      await setTaskParent(task.id, value || null)
    } catch (err) {
      setParentError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <aside data-detail-for={task.id} className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-xl dark:border-slate-800 dark:bg-slate-950 md:static md:shadow-none">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] dark:border-slate-800">
        <button className="btn-ghost text-xs" onClick={() => toggle(task)} disabled={readOnly}>
          {task.completed_at ? '↶ Reopen' : '✓ Complete'}
        </button>
        {progress.total > 0 && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400" title="Completed subtasks">
            {progress.done}/{progress.total}
          </span>
        )}
        <div className="flex-1" />
        <button className="btn-danger text-xs" onClick={() => { void deleteTask(task.id); onClose() }} disabled={readOnly}>Delete</button>
        <button className="btn-ghost touch-target" onClick={onClose} aria-label="Close" data-overlay-close>✕</button>
      </div>
      {readOnly && (
        <p role="note" className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Read-only: you are a viewer of this shared project.
        </p>
      )}
      <div className="min-w-0 flex-1 overflow-y-auto">
      <fieldset disabled={readOnly} className="min-w-0 space-y-4 p-4">
        {parent && (
          <button type="button" className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" onClick={() => onOpen?.(parent.id)} title="Open parent task">
            ↳ {parent.title || 'Untitled'}
            {parent.deleted_at ? ' (deleted)' : parent.completed_at && !task.completed_at ? ' (completed)' : ''}
          </button>
        )}
        {series && (
          <button type="button" className="block text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" onClick={() => onOpen?.(series.id)} title="Open the recurring task">
            ↻ {task.completed_at ? 'Completed occurrence' : 'Single occurrence'} of {series.title || 'Untitled'}{series.deleted_at ? ' (deleted)' : ''}
          </button>
        )}
        <input
          className="w-full bg-transparent text-lg font-medium focus:outline-none"
          value={title}
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

        <Field label="Project">
          <select className="input" aria-label="Project" value={task.project_id ?? ''} onChange={(e) => void moveTo(e.target.value || null)}>
            <option value="">Inbox</option>
            {projectOptions.map((n) => (
              <option key={n.id} value={n.id}>{'  '.repeat(n.depth)}{n.item.name}</option>
            ))}
            {/* Keep the current project selectable when it is archived. */}
            {projects.filter((p) => p.archived && p.id === task.project_id).map((p) => (
              <option key={p.id} value={p.id}>{p.name} (archived)</option>
            ))}
          </select>
          {children.length > 0 && <p className="mt-1 text-xs text-slate-400">Moving this task moves its {children.length === 1 ? 'subtask' : 'subtasks'} too.</p>}
        </Field>

        {task.project_id && sections.length > 0 && (
          <Field label="Section">
            {/* Subtasks are shown under their parent, so only top-level tasks pick a section. */}
            <select className="input" aria-label="Section" value={effectiveSection(task, sectionMap) ?? ''}
              disabled={!!parent && !parent.deleted_at}
              onChange={(e) => void moveTaskToSection(task.id, e.target.value || null).catch(() => undefined)}>
              <option value="">No section</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name || 'Untitled section'}</option>)}
            </select>
            {parent && !parent.deleted_at && <p className="mt-1 text-xs text-slate-400">Subtasks are shown in their parent’s section.</p>}
          </Field>
        )}

        <Field label="Parent task">
          <select className="input" aria-label="Parent task" value={task.parent_id ?? ''} onChange={(e) => void changeParent(e.target.value)}>
            <option value="">No parent</option>
            {/* Keep the current parent selectable even when it is completed, deleted or elsewhere. */}
            {task.parent_id && !candidates.some((c) => c.id === task.parent_id && !excluded.has(c.id)) && (
              <option value={task.parent_id}>{parent?.title || 'Untitled'}{parent?.completed_at ? ' (completed)' : parent?.deleted_at ? ' (deleted)' : ''}</option>
            )}
            {candidates.filter((c) => c.id !== task.id && !excluded.has(c.id)).map((c) => (
              <option key={c.id} value={c.id}>{c.title || 'Untitled'}</option>
            ))}
          </select>
          {parentError && <p className="mt-1 text-xs text-red-600">{parentError}</p>}
        </Field>

        {userId && (
          <Field label="Assignee">
            <AssigneePicker taskId={task.id} userId={userId} inline />
          </Field>
        )}

        <Field label="Priority">
          <div className="flex gap-2">
            {PRIORITIES.map(({ p, label, cls }) => (
              <button key={p} className={`rounded-md border px-3 py-1 text-sm ${cls} ${task.priority === p ? 'bg-slate-100 font-semibold dark:bg-slate-800' : 'opacity-70 hover:opacity-100'}`}
                onClick={() => void updateTask(task.id, { priority: p })}>{label}</button>
            ))}
          </div>
        </Field>

        <Field label="Due">
          <DueField task={task} readOnly={readOnly} />
        </Field>

        <Field label="Reminders">
          <RemindersField task={task} />
        </Field>

        <Field label="Estimate">
          <EstimateField task={task} />
        </Field>
        <Field label="Repeat">
          <RecurrenceField task={task} onOpen={onOpen} />
        </Field>

        <Field label="Labels">
          <div className="mb-2 flex flex-wrap gap-1 empty:hidden">
            {resolveLabels(task.labels, labelMap).map((l) => <LabelChip key={l.id} label={l} onRemove={() => void removeLabel(task.id, l.id)} />)}
          </div>
          <LabelPicker taskId={task.id} inline />
        </Field>

        <Field label={progress.total > 0 ? `Subtasks · ${progress.done}/${progress.total}` : 'Subtasks'}>
          <ul className="mb-2 space-y-0.5" aria-label="Subtasks">
            {children.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded px-1 py-1 hover:bg-slate-50 dark:hover:bg-slate-900">
                <button
                  type="button"
                  aria-label={c.completed_at ? `Reopen ${c.title}` : `Complete ${c.title}`}
                  onClick={() => toggle(c)}
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 text-[10px] ${c.completed_at ? 'border-slate-400 bg-slate-400 text-white' : 'border-slate-300 hover:bg-emerald-100 dark:border-slate-600'}`}
                >
                  {c.completed_at ? '✓' : ''}
                </button>
                <button type="button" className={`min-w-0 flex-1 truncate text-left text-sm ${c.completed_at ? 'text-slate-400 line-through' : ''}`} onClick={() => onOpen?.(c.id)}>
                  {c.title || <span className="italic text-slate-400">Untitled</span>}
                </button>
              </li>
            ))}
          </ul>
          <AddSubtask parent={task} />
        </Field>

        <p className="pt-4 text-xs text-slate-400">
          Created {new Date(task.created_at).toLocaleString()}
          {task.completed_at && <> · Completed {new Date(task.completed_at).toLocaleString()}</>}
        </p>
      </fieldset>
      <div className="border-t border-slate-200 px-4 pb-4 dark:border-slate-800">
        <TaskConversation task={task} userId={userId} />
      </div>
      </div>
      <div className="border-t border-slate-200 px-4 pb-4 dark:border-slate-800">
        <HistoryPanel entity="task" id={task.id} readOnly={readOnly} onRestored={(id) => id !== task.id && onOpen?.(id)} />
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
      <span className="text-emerald-600">+</span>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </div>
  )
}

/** The note as rendered Markdown while the editor chunk loads. */
function NotesPreview({ text }: { text: string }) {
  return (
    <div className="notes-host" aria-busy="true">
      <div className="notes-editor">{text ? <Markdown source={text} /> : <p className="text-slate-400">Notes…</p>}</div>
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

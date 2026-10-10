import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { removeLabel, resolveLabels } from '../lib/labels'
import { deleteTask, setTaskCompleted, updateTask } from '../lib/ops'
import type { Label, Priority, Project } from '../lib/types'
import { LabelChip, LabelPicker } from './LabelPicker'

const PRIORITIES: { p: Priority; label: string; cls: string }[] = [
  { p: 1, label: 'P1', cls: 'text-red-600 border-red-500' },
  { p: 2, label: 'P2', cls: 'text-orange-600 border-orange-500' },
  { p: 3, label: 'P3', cls: 'text-blue-600 border-blue-500' },
  { p: 4, label: 'P4', cls: 'text-slate-500 border-slate-400' },
]

export function TaskDetail({ taskId, projects, labelMap, onClose }: { taskId: string; projects: Project[]; labelMap: Map<string, Label>; onClose: () => void }) {
  const task = useLiveQuery(() => db.tasks.get(taskId), [taskId])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description)
    }
  }, [task?.id, task?.title, task?.description]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!task) return null

  const commitTitle = () => {
    const t = title.trim()
    if (t && t !== task.title) void updateTask(task.id, { title: t })
    else setTitle(task.title)
  }
  const commitDescription = () => {
    if (description !== task.description) void updateTask(task.id, { description })
  }

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950 md:static md:shadow-none">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
        <button className="btn-ghost text-xs" onClick={() => void setTaskCompleted(task.id, !task.completed_at)}>
          {task.completed_at ? '↶ Reopen' : '✓ Complete'}
        </button>
        <div className="flex-1" />
        <button className="btn-danger text-xs" onClick={() => { void deleteTask(task.id); onClose() }}>Delete</button>
        <button className="btn-ghost" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <input
          className="w-full bg-transparent text-lg font-medium focus:outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          aria-label="Title"
        />
        <textarea
          className="input min-h-28 resize-y"
          placeholder="Notes…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
          aria-label="Description"
        />

        <Field label="Project">
          <select className="input" aria-label="Project" value={task.project_id ?? ''} onChange={(e) => void updateTask(task.id, { project_id: e.target.value || null })}>
            <option value="">Inbox</option>
            {projects.filter((p) => !p.archived || p.id === task.project_id).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Priority">
          <div className="flex gap-2">
            {PRIORITIES.map(({ p, label, cls }) => (
              <button key={p} className={`rounded-md border px-3 py-1 text-sm ${cls} ${task.priority === p ? 'bg-slate-100 font-semibold dark:bg-slate-800' : 'opacity-70 hover:opacity-100'}`}
                onClick={() => void updateTask(task.id, { priority: p })}>{label}</button>
            ))}
          </div>
        </Field>

        <Field label="Due">
          <div className="flex gap-2">
            <input type="date" className="input" aria-label="Due date" value={task.due?.date ?? ''}
              onChange={(e) => void updateTask(task.id, { due: e.target.value ? { date: e.target.value, ...(task.due?.time ? { time: task.due.time } : {}) } : null })} />
            <input type="time" className="input w-32" aria-label="Due time" value={task.due?.time ?? ''} disabled={!task.due}
              onChange={(e) => task.due && void updateTask(task.id, { due: e.target.value ? { date: task.due.date, time: e.target.value } : { date: task.due.date } })} />
            {task.due && <button className="btn-ghost" onClick={() => void updateTask(task.id, { due: null })} aria-label="Clear due date">✕</button>}
          </div>
        </Field>

        <Field label="Labels">
          <div className="mb-2 flex flex-wrap gap-1 empty:hidden">
            {resolveLabels(task.labels, labelMap).map((l) => <LabelChip key={l.id} label={l} onRemove={() => void removeLabel(task.id, l.id)} />)}
          </div>
          <LabelPicker taskId={task.id} inline />
        </Field>

        <p className="pt-4 text-xs text-slate-400">
          Created {new Date(task.created_at).toLocaleString()}
          {task.completed_at && <> · Completed {new Date(task.completed_at).toLocaleString()}</>}
        </p>
      </div>
    </aside>
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

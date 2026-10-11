import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/db'
import { updateTask } from '../lib/ops'
import { assigneeOptions, memberName, membershipMap } from '../lib/sharing'

/** Initials for the compact assignee chip on task rows. */
export function initials(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[1][0] : '')).toUpperCase()
}

/** Compact assignee chip (task rows in shared projects). */
export function AssigneeChip({ name, me }: { name: string; me?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted" title={`Assigned to ${name}`} data-assignee>
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[9px] font-semibold text-white">{initials(name)}</span>
      <span className="max-w-24 truncate">{me ? 'You' : name}</span>
    </span>
  )
}

/**
 * Assignee picker (OpenSpec `task-assignment`): the project's members from the
 * local membership cache, or only you for a personal task, plus "Unassigned".
 * Typing filters, ↑/↓ move, Enter assigns, Esc closes. Assigning is one op, so it
 * works offline; the server re-checks membership when the op arrives.
 */
export function AssigneePicker({ taskId, userId, onClose, inline = false }: {
  taskId: string
  userId: string
  onClose?: () => void
  inline?: boolean
}) {
  const task = useLiveQuery(() => db.tasks.get(taskId), [taskId])
  const memberships = useLiveQuery(() => membershipMap(), [], new Map())
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const [focused, setFocused] = useState(!inline)

  const options = useMemo(() => {
    const people = assigneeOptions(task?.project_id, memberships, { id: userId, name: 'You', email: '' })
      .map((p) => ({ id: p.userId as string | null, label: p.userId === userId ? 'You' : p.name || p.email, sub: p.userId === userId ? '' : p.email }))
    const all = [{ id: null as string | null, label: 'Unassigned', sub: '' }, ...people]
    const key = q.trim().toLowerCase()
    return key ? all.filter((o) => o.label.toLowerCase().includes(key) || o.sub.toLowerCase().includes(key)) : all
  }, [task?.project_id, memberships, userId, q])
  useEffect(() => setHi(0), [q])

  if (!task) return null
  const current = task.assignee_id ?? null
  const currentName = current ? (current === userId ? 'You' : memberName(current, memberships) ?? 'Former member') : 'Unassigned'

  async function pick(id: string | null | undefined) {
    if (id === undefined || !task) return
    if (id !== (task.assignee_id ?? null)) await updateTask(task.id, { assignee_id: id })
    setQ('')
    if (onClose) onClose()
    else setFocused(false)
  }

  const open = focused || !inline
  return (
    <div className="relative" onFocus={() => setFocused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false) }}>
      <input
        className="input"
        autoFocus={!inline}
        placeholder={inline ? currentName : 'Assign to…'}
        aria-label="Assignee"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(options.length - 1, h + 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)) }
          else if (e.key === 'Enter') { e.preventDefault(); void pick(options[hi]?.id) }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (onClose) onClose(); else (e.target as HTMLInputElement).blur() }
        }}
      />
      {open && (
        <ul role="listbox" aria-label="Assignees" className={`max-h-56 overflow-y-auto py-1 text-sm ${inline ? 'absolute left-0 right-0 z-10 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900' : ''}`}>
          {options.map((o, i) => (
            <li key={o.id ?? '__none'} role="option" aria-selected={o.id === current}
              onMouseDown={(e) => e.preventDefault()} onClick={() => void pick(o.id)} onMouseEnter={() => setHi(i)}
              className={`touch-target flex w-full cursor-pointer items-center gap-2 px-2 py-1.5 text-left ${i === hi ? 'bg-slate-100 dark:bg-slate-800' : ''}`}>
                <span className="w-4 text-center text-emerald-700 dark:text-emerald-400">{o.id === current ? '✓' : ''}</span>
                <span className="flex-1 truncate">{o.label}</span>
                {o.sub && <span className="truncate text-xs text-faint">{o.sub}</span>}
            </li>
          ))}
          {options.length === 0 && <li className="px-2 py-1.5 text-xs text-faint">No member matches.</li>}
        </ul>
      )}
    </div>
  )
}

import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo } from 'react'
import { db } from '../lib/db'
import { updateTask } from '../lib/ops'
import { assigneeOptions, memberName, membershipMap } from '../lib/sharing'
import { Avatar } from '../ui/Avatar'
import { Combobox, ComboboxPanel } from '../ui/Combobox/Combobox'
import { Icon } from '../ui/Icon'

export { initials } from '../ui/Avatar'

/** Compact assignee chip (task rows in shared projects); the avatar colour follows the account id. */
export function AssigneeChip({ id, name, me }: { id: string; name: string; me?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-muted" title={`Assigned to ${name}`} data-assignee>
      <Avatar id={id} name={name} size="xs" />
      <span className="max-w-24 truncate">{me ? 'You' : name}</span>
    </span>
  )
}

/**
 * Assignee picker (OpenSpec `task-assignment`, rebuilt on the design-system
 * Combobox by `ui-primitives`): "Unassigned" and "You" first, then the members
 * assigned most recently on this device, then the rest. Typing matches names and
 * emails. Assigning is one op, so it works offline; the server re-checks
 * membership when the op arrives.
 */
export function AssigneePicker({ taskId, userId, onClose, inline = false }: {
  taskId: string
  userId: string
  onClose?: () => void
  inline?: boolean
}) {
  const task = useLiveQuery(() => db.tasks.get(taskId), [taskId])
  const memberships = useLiveQuery(() => membershipMap(), [], new Map())

  const people = useMemo<Person[]>(() => [
    { id: NONE, name: 'Unassigned', email: '' },
    ...assigneeOptions(task?.project_id, memberships, { id: userId, name: 'You', email: '' })
      .map((p) => ({ id: p.userId, name: p.userId === userId ? 'You' : p.name || p.email, email: p.userId === userId ? '' : p.email })),
  ], [task?.project_id, memberships, userId])

  if (!task) return null
  const current = task.assignee_id ?? null
  const currentName = current ? (current === userId ? 'You' : memberName(current, memberships) ?? 'Former member') : 'Unassigned'

  const props = {
    label: 'Assignee',
    source: people,
    getKey: (p: Person) => p.id,
    getLabel: (p: Person) => p.name,
    getSecondary: (p: Person) => p.email || undefined,
    pinned: [NONE, userId],
    selected: [current ?? NONE],
    rankContext: `assignee:${task.project_id ?? 'personal'}`,
    emptyText: 'No member matches.',
    renderLeading: (p: Person) => (p.id === NONE ? <span className="flex h-6 w-6 items-center justify-center text-faint"><Icon name="circle" /></span> : <Avatar id={p.id} name={p.name} size="sm" />),
    onPick: async (p: Person) => {
      const id = p.id === NONE ? null : p.id
      if (id !== current) await updateTask(task.id, { assignee_id: id })
    },
    onClose,
  }
  return inline ? <Combobox {...props} placeholder={currentName} /> : <ComboboxPanel {...props} placeholder="Assign to…" />
}

const NONE = '__unassigned'
interface Person { id: string; name: string; email: string }

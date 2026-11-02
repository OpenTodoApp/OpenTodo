import { useMemo } from 'react'
import { useTask, useMembershipMap } from '../lib/localData'
import { updateTask } from '../lib/ops'
import { assigneeOptions, memberName } from '../lib/sharing'
import { PersonAvatar } from './PersonAvatar'
import { Tooltip } from '../ui'
import { Combobox, ComboboxPanel } from '../ui'
import { Icon } from '../ui'
import { t, useLanguageVersion } from '../lib/i18n'

export { initials } from '../ui'

/**
 * Compact assignee chip (task rows in shared projects); the avatar colour follows the
 * account id. `turns` marks a rotating chore with a small rotate glyph on the avatar
 * (chore-rotation D5), named "<name>, takes turns".
 */
export function AssigneeChip({ id, name, me, turns = false }: { id: string; name: string; me?: boolean; turns?: boolean }) {
  const shown = me ? t('You') : name
  return (
    <Tooltip label={turns ? t('Assigned to {name}, taking turns', { name }) : t('Assigned to {name}', { name })}>
      <span className="inline-flex items-center gap-1 text-muted" data-assignee data-turns={turns || undefined}>
        <span className="inline-flex shrink-0 items-center gap-0.5">
          <PersonAvatar id={id} name={name} size="xs" />
          {turns && <Icon name="rotate-ccw" size={10} className="text-faint" />}
        </span>
        <span className="max-w-24 truncate">{shown}{turns && <span className="sr-only">{`, ${t('takes turns')}`}</span>}</span>
      </span>
    </Tooltip>
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
  const task = useTask(taskId)
  const memberships = useMembershipMap()

  const lang = useLanguageVersion()
  const people = useMemo<Person[]>(() => [
    { id: NONE, name: t('Unassigned'), email: '' },
    ...assigneeOptions(task?.project_id, memberships, { id: userId, name: t('You'), email: '' })
      .map((p) => ({ id: p.userId, name: p.userId === userId ? t('You') : p.name || p.email, email: p.userId === userId ? '' : p.email })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lang: t() reads the interface language, so a switch re-translates the names
  ], [task?.project_id, memberships, userId, lang])

  if (!task) return null
  const current = task.assignee_id ?? null
  const currentName = current ? (current === userId ? t('You') : memberName(current, memberships) ?? t('Former member')) : t('Unassigned')

  const props = {
    label: t('Assignee'),
    source: people,
    getKey: (p: Person) => p.id,
    getLabel: (p: Person) => p.name,
    getSecondary: (p: Person) => p.email || undefined,
    pinned: [NONE, userId],
    selected: [current ?? NONE],
    rankContext: `assignee:${task.project_id ?? 'personal'}`,
    emptyText: t('No member matches.'),
    renderLeading: (p: Person) => (p.id === NONE ? <span className="flex h-6 w-6 items-center justify-center text-faint"><Icon name="circle" /></span> : <PersonAvatar id={p.id} name={p.name} size="sm" />),
    onPick: async (p: Person) => {
      const id = p.id === NONE ? null : p.id
      if (id !== current) await updateTask(task.id, { assignee_id: id })
    },
    onClose,
  }
  return inline ? <Combobox {...props} placeholder={currentName} /> : <ComboboxPanel {...props} placeholder={t('Assign to…')} />
}

const NONE = '__unassigned'
interface Person { id: string; name: string; email: string }

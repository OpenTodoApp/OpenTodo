// "Takes turns: Alice → Bob → Carol" under the Who facet (OpenSpec change
// chore-rotation, design D5): the people of a rotation in effect, the current
// assignee emphasised, someone who left the project marked. Read-only for every
// role; editors change it from the Assignee editor's "Take turns…".
import { Fragment } from 'react'
import { useMembershipMap } from '../../lib/localData'
import { activeRotation, memberSet } from '../../lib/rotation'
import type { Task } from '../../lib/types'
import { Icon } from '../../ui'
import { t } from '../../lib/i18n'

export function RotationLine({ task, userId }: { task: Task; userId?: string }) {
  const memberships = useMembershipMap()
  const m = task.project_id ? memberships.get(task.project_id) : undefined
  const list = activeRotation(task, memberSet(m))
  if (list.length === 0) return null
  const name = (id: string): { text: string; gone: boolean } => {
    if (id === userId) return { text: t('You'), gone: false }
    const p = m?.members.find((x) => x.userId === id)
    return p ? { text: p.name || p.email, gone: false } : { text: t('left the project'), gone: true }
  }
  return (
    <p className="flex min-w-0 items-start gap-2 text-meta text-muted" data-rotation-line>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-faint" aria-hidden="true"><Icon name="rotate-ccw" size="xs" /></span>
      <span className="min-w-0 flex-1">
        {t('Takes turns:')}{' '}
        {list.map((id, i) => {
          const n = name(id)
          const now = id === task.assignee_id
          return (
            <Fragment key={id}>
              {i > 0 && <Icon name="arrow-right" size={10} className="mx-1 inline align-baseline text-faint" />}
              {i > 0 && <span className="sr-only">, </span>}
              <span className={now ? 'font-semibold text-default' : n.gone ? 'italic text-faint' : undefined} aria-current={now ? 'true' : undefined}>{n.text}</span>
            </Fragment>
          )
        })}
      </span>
    </p>
  )
}

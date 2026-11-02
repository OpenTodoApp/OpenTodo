// The Assignee editor of the task panel: the people picker, and for a recurring
// task of a project with two or more members "Take turns…" (OpenSpec change
// chore-rotation, design D5), which turns the same anchored popover into the
// rotation editor. The rotation editor loads on first use.
import { lazy, Suspense, useState, type RefObject } from 'react'
import { useMembershipMap } from '../../lib/localData'
import { updateTask } from '../../lib/ops'
import { canRotate, memberSet } from '../../lib/rotation'
import type { Task } from '../../lib/types'
import { Button, Skeleton, Switch } from '../../ui'
import { AssigneePicker } from '../AssigneePicker'
import { act } from '../actionError'
import { FacetEditor } from './FacetEditor'
import { t } from '../../lib/i18n'

const RotationEditor = lazy(() => import('./RotationEditor'))

export function AssigneeEditor({ task, userId, solo, readOnly, anchor, onClose, startWithTurns = false }: {
  task: Task
  userId?: string
  /** Only the user can be assigned (a personal project): a switch instead of the picker. */
  solo: boolean
  readOnly: boolean
  anchor: RefObject<HTMLElement | null>
  onClose: () => void
  startWithTurns?: boolean
}) {
  const memberships = useMembershipMap()
  const members = memberSet(task.project_id ? memberships.get(task.project_id) : undefined)
  const offer = !readOnly && !solo && canRotate(task, members)
  const [turns, setTurns] = useState(startWithTurns && offer)
  if (turns && offer) {
    return (
      <FacetEditor anchor={anchor} icon="rotate-ccw" title={t('Take turns')} onClose={onClose} width="sm:w-[22rem]">
        <Suspense fallback={<Skeleton count={2} />}>
          <RotationEditor task={task} userId={userId} onBack={() => setTurns(false)} />
        </Suspense>
      </FacetEditor>
    )
  }
  const clear = task.assignee_id ? () => act(updateTask(task.id, { assignee_id: null })) : undefined
  return (
    <FacetEditor anchor={anchor} icon="user-check" title={t('Assignee')} onClose={onClose} onClear={clear}>
      {solo && userId
        ? <Switch label={t('Show in Assigned to me')} checked={task.assignee_id === userId} disabled={readOnly} onChange={(on) => act(updateTask(task.id, { assignee_id: on ? userId : null }))} />
        : <AssigneePicker taskId={task.id} userId={userId ?? ''} onClose={onClose} />}
      {offer && (
        <div className="mt-2 border-t border-default pt-2">
          <Button variant="ghost" size="sm" icon="rotate-ccw" onClick={() => setTurns(true)} data-take-turns>
            {(task.rotation?.length ?? 0) > 0 ? t('Change who takes turns…') : t('Take turns…')}
          </Button>
        </div>
      )}
    </FacetEditor>
  )
}

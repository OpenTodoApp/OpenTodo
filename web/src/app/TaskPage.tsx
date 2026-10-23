// The task page at /task/<id> (OpenSpec change task-full-page): how a task opens
// everywhere except a page that keeps a split. It reads the trail the list left
// (taskTrail.ts) for "4 / 12", j and k and the way back; opened from a link or a
// reload there is no trail, and Back goes to the task's own list with it selected.
import { useEffect } from 'react'
import { useTask } from '../lib/localData'
import type { User } from '../lib/types'
import { PageBody, Skeleton } from '../ui'
import { closePanel } from './panel'
import { useTaskDetailData } from './PanelHost'
import { navigate } from './router'
import { selectTask } from './signals'
import { leaveTaskPage, openTaskPage, stepTask, trailNeighbour, trailPosition, useTaskTrail } from './taskTrail'
import { TaskPageView } from './task-detail/TaskPageView'
import { t } from '../lib/i18n'

export function TaskPage({ id, user }: { id: string; user?: Pick<User, 'id'> }) {
  const data = useTaskDetailData()
  const task = useTask(id)
  const trail = useTaskTrail()
  // The page replaces the panel; nothing stays open in the slot behind it.
  useEffect(() => closePanel(), [id])

  // Without a trail: the task's list (its project, or the Inbox) with the task selected.
  const back = () => leaveTaskPage(id, () => {
    selectTask.set(id)
    navigate(task?.project_id ? { view: 'project', id: task.project_id } : { view: 'inbox' })
  })

  if (task === undefined) return <PageBody width="list"><div className="py-6"><Skeleton shape="line" count={4} label={t('Loading task')} /></div></PageBody>
  if (task === null || task.deleted_at) {
    return (
      <PageBody width="list">
        <p className="py-6 text-body text-muted">{t('This task no longer exists.')}{' '}<button className="underline" onClick={() => navigate({ view: 'inbox' })}>{t('Go to Inbox')}</button></p>
      </PageBody>
    )
  }
  return (
    <TaskPageView key={id} taskId={id} userId={user?.id} readOnly={data.readOnly(task)} projects={data.projects} labelMap={data.labelMap}
      onOpen={(next) => openTaskPage(next)}
      nav={{
        position: trailPosition(id),
        hasPrev: !!trailNeighbour(id, -1),
        hasNext: !!trailNeighbour(id, 1),
        onStep: (step) => { stepTask(id, step) },
        onBack: back,
        backLabel: trail?.label ?? '',
      }} />
  )
}

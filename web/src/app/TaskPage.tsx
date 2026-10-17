// The expanded task (OpenSpec change ux-overhaul, app-shell "Panel width and
// expansion"): the same detail as the panel, filling the content column at
// /task/<id>, with Back returning to the task's list with the panel open.
import { useEffect } from 'react'
import { useTask } from '../lib/localData'
import type { User } from '../lib/types'
import { PageBody, Skeleton } from '../ui'
import { closePanel } from './panel'
import { openTaskInList } from './signals'
import { useTaskDetailData } from './PanelHost'
import { navigate } from './router'
import { TaskDetail } from './task-detail/TaskDetail'
import { t } from '../lib/i18n'

export function TaskPage({ id, user }: { id: string; user?: Pick<User, 'id'> }) {
  const data = useTaskDetailData()
  const task = useTask(id)
  // The page replaces the panel; nothing stays open in the slot behind it.
  useEffect(() => closePanel(), [id])

  // Back: the task's list with the panel open (the list takes the pending request on mount).
  const back = () => openTaskInList({ id, project_id: task?.project_id ?? null })

  if (task === undefined) return <PageBody width="list"><div className="py-6"><Skeleton shape="line" count={4} label={t('Loading task')} /></div></PageBody>
  if (task === null || task.deleted_at) {
    return (
      <PageBody width="list">
        <p className="py-6 text-body text-muted">{t('This task no longer exists.')}{' '}<button className="underline" onClick={() => navigate({ view: 'inbox' })}>{t('Go to Inbox')}</button></p>
      </PageBody>
    )
  }
  return (
    <PageBody width="list" className="px-0 md:px-0" data-task-page={id}>
      <TaskDetail key={id} variant="page" taskId={id} userId={user?.id} readOnly={data.readOnly(task)} projects={data.projects} labelMap={data.labelMap}
        onClose={back} onOpen={(next) => navigate({ view: 'task', id: next })} />
    </PageBody>
  )
}

// Whether a task has an active task page (OpenSpec task-pages, "Publishing from the
// task panel"): read from the pages this device last heard of (lib/taskPageStore,
// filled after each sync), shared by the header's "Published" marker and the comment
// composer's notice. Pages are server data, so offline nothing is shown.
import { useSyncExternalStore } from 'react'
import { useOnline } from '../../lib/online'
import { knownTaskPage, setKnownTaskPage, subscribeTaskPages, taskPagesVersion } from '../../lib/taskPageStore'
import type { TaskPageStatus } from '../../lib/types'

/** Records a task's page status (null: no active page). */
export function setTaskPageStatus(taskId: string, status: TaskPageStatus | null): void {
  setKnownTaskPage(taskId, status)
}

/** The task's page status, or null; undefined offline or when the user may not publish it. */
export function useTaskPageStatus(taskId: string, enabled: boolean): { status: TaskPageStatus | null | undefined } {
  const online = useOnline()
  useSyncExternalStore(subscribeTaskPages, taskPagesVersion)
  return { status: online && enabled ? knownTaskPage(taskId) : undefined }
}

/** True when the task has an active page this device knows of (the composer notice). */
export function useTaskPublished(taskId: string): boolean {
  const online = useOnline()
  useSyncExternalStore(subscribeTaskPages, taskPagesVersion)
  return online && !!knownTaskPage(taskId)
}

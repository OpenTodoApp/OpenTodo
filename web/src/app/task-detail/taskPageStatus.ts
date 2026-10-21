// Whether a task has an active task page (OpenSpec task-pages, "Publishing from the
// task panel"): read from the server when the panel opens online, shared by the
// header's "Published" marker and the comment composer's notice. Pages are server
// data, so offline nothing is known and nothing is shown.
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { api } from '../../lib/api'
import { useOnline } from '../../lib/online'
import type { TaskPageStatus } from '../../lib/types'

const statuses = new Map<string, TaskPageStatus | null>()
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((fn) => fn())
}

/** Records a task's page status (null: no active page). */
export function setTaskPageStatus(taskId: string, status: TaskPageStatus | null): void {
  statuses.set(taskId, status)
  emit()
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The task's page status as last read (undefined before it is known, or offline). */
export function useTaskPageStatus(taskId: string, enabled: boolean): { status: TaskPageStatus | null | undefined; refresh: () => Promise<void> } {
  const online = useOnline()
  const status = useSyncExternalStore(subscribe, () => (online && enabled ? statuses.get(taskId) : undefined))
  const refresh = useCallback(async () => {
    try {
      setTaskPageStatus(taskId, await api.taskPageStatus(taskId))
    } catch (err) {
      // 404: no active page. Anything else leaves the last known state.
      if ((err as { status?: number }).status === 404) setTaskPageStatus(taskId, null)
    }
  }, [taskId])
  useEffect(() => {
    if (online && enabled) void refresh()
  }, [online, enabled, refresh])
  return { status, refresh }
}

/** True when the task has an active page this device knows of (the composer notice). */
export function useTaskPublished(taskId: string): boolean {
  const online = useOnline()
  return useSyncExternalStore(subscribe, () => online && !!statuses.get(taskId))
}

// The user's active task pages as this device last heard them from the server
// (OpenSpec task-pages): filled by the pass after each sync and by publishing or
// revoking here, read by the task panel's "Published" marker and the comment
// composer's notice. Pages are server data: nothing is stored on the device.
import type { TaskPageStatus } from './types'
import { createSignal } from './store'

const pages = new Map<string, TaskPageStatus>()
const changes = createSignal()
let version = 0

function emit(): void {
  version++
  changes.notify()
}

/** Replaces the known pages with the server's list. */
export function setKnownTaskPages(list: TaskPageStatus[]): void {
  pages.clear()
  for (const p of list) pages.set(p.taskId, p)
  emit()
}

/** Records one task's page (null: none) after publishing, revoking or reading its status. */
export function setKnownTaskPage(taskId: string, status: TaskPageStatus | null): void {
  if (status) pages.set(taskId, status)
  else pages.delete(taskId)
  emit()
}

export function knownTaskPage(taskId: string): TaskPageStatus | null {
  return pages.get(taskId) ?? null
}

export const subscribeTaskPages = changes.subscribe

/** Changes whenever the known pages change (for useSyncExternalStore). */
export function taskPagesVersion(): number {
  return version
}

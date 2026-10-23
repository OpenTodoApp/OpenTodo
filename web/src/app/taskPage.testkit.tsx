// Tests that render a list without the shell: the task page for the current route,
// where the shell would render it (task-full-page), so opening a task can be followed.
import { navigate, useRoute } from './router'
import { TaskPage } from './TaskPage'
import { resetTaskTrail } from './taskTrail'

export function TaskPageHost({ userId }: { userId?: string }) {
  const route = useRoute()
  return route.view === 'task' ? <TaskPage id={route.id} user={userId ? { id: userId } : undefined} /> : null
}

/** The task whose page is open, from the address (null on any other page). */
export const openedTask = (): string | null => /^\/task\/([^/?#]+)/.exec(location.pathname)?.[1] ?? null

/** Between cases: back to the Inbox address, no trail. */
export function resetTaskPage(): void {
  navigate({ view: 'inbox' }, { replace: true })
  resetTaskTrail()
}

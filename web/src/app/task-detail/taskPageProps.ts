// What a task page is given (OpenSpec change task-full-page): the task, the lists it
// reads and the way back. In a file of its own since phone-ui-trial (design D4): the
// desktop page (TaskPageView) and the phone page (PhoneTaskPage) take the same props,
// so TaskPage can hand them to either.
import type { Label, Project } from '../../lib/types'

export interface TaskPageNav {
  /** Where the task sits in the list it was opened from, or null when it is not listed there. */
  position: { index: number; total: number } | null
  hasPrev: boolean
  hasNext: boolean
  onStep: (step: 1 | -1) => void
  onBack: () => void
  /** The list's name, for the phone's bar and the breadcrumb's first crumb ("Today"). */
  backLabel: string
  /** The task was opened from its own project, so the project crumb leads back. */
  fromProject?: boolean
}

export interface TaskPageViewProps {
  taskId: string
  userId?: string
  readOnly: boolean
  projects: Project[]
  labelMap: Map<string, Label>
  nav: TaskPageNav
  onOpen: (id: string) => void
}

// Quick add as a bottom sheet (OpenSpec change ux-overhaul, app-shell "Phone
// navigation", "Add from anywhere"): opened by the floating add button, its field
// focused with the keyboard up, the view's defaults applied (Today's date in Today,
// tomorrow in Upcoming, the project in a project), the list visible above it.
import { useLiveQuery } from 'dexie-react-hooks'
import type { RefObject } from 'react'
import { db } from '../lib/db'
import { todayISO } from '../lib/dates'
import { createTask } from '../lib/ops'
import type { Label, Project } from '../lib/types'
import { taskDefaults } from './listActions'
import { Popover } from './overlay/Popover'
import { QuickAdd, type QuickAddInput } from './QuickAdd'
import type { Route } from './router'

export function QuickAddSheet({ open, onClose, anchor, route, userId }: {
  open: boolean
  onClose: () => void
  anchor: RefObject<HTMLButtonElement | null>
  route: Route
  userId?: string
}) {
  const projects = useLiveQuery(() => db.projects.filter((p) => !p.deleted_at && !p.archived).toArray(), [], [] as Project[])
  const labels = useLiveQuery(() => db.labels.filter((l) => !l.deleted_at).toArray(), [], [] as Label[])
  // The same defaults as the view's own quick add line; attributes typed in the line override them.
  const onAdd = async ({ labels: typed, ...rest }: QuickAddInput) => {
    const { labels: viewLabels, ...defaults } = taskDefaults(route, todayISO(), userId)
    if (rest.due || rest.deadline) delete defaults.start
    await createTask({ ...defaults, ...rest, labels: [...new Set([...viewLabels, ...(typed ?? [])])] })
    onClose()
  }
  return (
    <Popover open={open} onClose={onClose} anchor={anchor} label="Add a task" side="top" align="end" width="sm:w-96" className="p-3">
      <div data-quick-add-sheet>
        <QuickAdd autoFocus hideHint placeholder="Add a task…" label="Add a task" projects={projects} labels={labels} onAdd={onAdd} />
      </div>
    </Popover>
  )
}

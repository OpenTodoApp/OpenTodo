// Quick add as a bottom sheet (OpenSpec change ux-overhaul, app-shell "Phone
// navigation", "Add from anywhere"): opened by the floating add button, its field
// focused with the keyboard up, the view's defaults applied (Today's date in Today,
// tomorrow in Upcoming, the project in a project), the list visible above it. Under the
// line, the understood fields as chips and a tool row with send (palette-quick-add D7).
import { Popover } from '../ui'
import type { RefObject } from 'react'
import { useLabels, useProjects } from '../lib/localData'
import { logicalToday } from '../lib/dates'
import { createTaskThenSuggest } from '../lib/assistantSuggest'
import { preferredPlacement } from '../lib/userPrefs'
import { taskDefaults } from './listActions'
import { addTasksUndoable } from '../lib/pasteTasks'
import { showBulkToast } from './bulk/toastStore'
import { QuickAdd, type QuickAddInput } from './QuickAdd'
import type { Route } from './router'
import { t } from '../lib/i18n'
import { takeQuickAddPrefill } from '../lib/shellActions'
import { useMemo } from 'react'

// An empty view's "Add a task" on a touch device opens this sheet (lean-chrome D7,
// task-list-presentation "Empty views"): the Shell registers the opener; without a
// Shell (a list rendered alone) the caller focuses its own quick add instead.
let opener: (() => void) | null = null

/** The Shell's way to open the sheet; returns the unregister function. */
export function onQuickAddSheetRequest(fn: () => void): () => void {
  opener = fn
  return () => { if (opener === fn) opener = null }
}

/** Opens the quick-add sheet; false when no Shell is mounted to open it. */
export function requestQuickAddSheet(): boolean {
  if (!opener) return false
  opener()
  return true
}

export function QuickAddSheet({ open, onClose, anchor, route, userId }: {
  open: boolean
  onClose: () => void
  anchor: RefObject<HTMLButtonElement | null>
  route: Route
  userId?: string
}) {
  // Live projects, archived included, as in the views' quick add: the parser and the
  // pickers leave archived ones out themselves (web-layering, one visibility rule).
  // Text from a native shell's quick-add widget, read once (native-shells D6).
  const prefill = useMemo(() => (open ? takeQuickAddPrefill() : null), [open])
  const projects = useProjects()
  const labels = useLabels()
  // The same defaults as the view's own quick add line; attributes typed in the line override them.
  const withDefaults = ({ labels: typed, ...rest }: QuickAddInput) => {
    const { labels: viewLabels, ...defaults } = taskDefaults(route, logicalToday(), userId)
    if (rest.due || rest.deadline) delete defaults.start
    return { ...defaults, ...rest, labels: [...new Set([...viewLabels, ...(typed ?? [])])] }
  }
  const onAdd = async (input: QuickAddInput) => {
    // Top or bottom of the list it lands in (add-position D3).
    await createTaskThenSuggest({ ...withDefaults(input), placement: await preferredPlacement() })
    onClose()
  }
  // A pasted list (paste-to-tasks D3): one batch with the view's defaults per line, one Undo.
  const onAddMany = async (inputs: QuickAddInput[]) => {
    const added = await addTasksUndoable(inputs.map(withDefaults), { placement: await preferredPlacement() })
    showBulkToast(added.label, added.undoId)
    onClose()
  }
  return (
    <Popover open={open} onClose={onClose} anchor={anchor} label={t('Add a task')} side="top" align="end" width="sm:w-96" className="pt-3 pb-0">
      <div data-quick-add-sheet>
        <QuickAdd layout="sheet" autoFocus hideHint initialValue={prefill ?? undefined} placeholder={t('Add a task…')} label={t('Add a task')} projects={projects} labels={labels} onAdd={onAdd} onAddMany={onAddMany} />
      </div>
    </Popover>
  )
}

// Quick add as a bottom sheet (OpenSpec change ux-overhaul, app-shell "Phone
// navigation", "Add from anywhere"): opened by the floating add button, its field
// focused with the keyboard up, the view's defaults applied (Today's date in Today,
// tomorrow in Upcoming, the project in a project), the list visible above it. Under the
// line, the understood fields as chips and a tool row with send (palette-quick-add D7).
// It stays open after an add, the field empty and focused for the next task, until
// the user closes it (quick-add-keep-adding D1).
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
import { handleShellUrl, takeQuickAddPrefill } from '../lib/shellActions'
import { useEffect, useMemo, useState } from 'react'
import { addManyToList, addToList } from './reuseAdd'
import { isReusable } from '../lib/reusable'

// An empty view's "Add a task" on a touch device opens this sheet (lean-chrome D7,
// task-list-presentation "Empty views"): the Shell registers the opener; without a
// Shell (a list rendered alone) the caller focuses its own quick add instead.
export interface QuickAddSheetRequest {
  projectId: string
  sectionId: string | null
  sectionName: string
  trigger?: HTMLElement
}

let opener: ((request?: QuickAddSheetRequest) => void) | null = null

/** The Shell's way to open the sheet; returns the unregister function. */
function onQuickAddSheetRequest(fn: (request?: QuickAddSheetRequest) => void): () => void {
  opener = fn
  return () => { if (opener === fn) opener = null }
}

/** Opens the quick-add sheet; false when no Shell is mounted to open it. */
export function requestQuickAddSheet(request?: QuickAddSheetRequest): boolean {
  if (!opener) return false
  opener(request)
  return true
}

/** One capture session in the shell; context belongs to an opening, never to a later page. */
export function useQuickAddSheet(route: Route) {
  const [open, setOpen] = useState(false)
  const [context, setContext] = useState<QuickAddSheetRequest>()
  const close = () => { setOpen(false); setContext(undefined) }
  useEffect(() => { setOpen(false); setContext(undefined) }, [route])
  useEffect(() => {
    const off = onQuickAddSheetRequest((request) => { setContext(request); setOpen(true) })
    void handleShellUrl(requestQuickAddSheet)
    return off
  }, [])
  return { open, context, close }
}

export function QuickAddSheet({ open, onClose, anchor, route, userId, context }: {
  open: boolean
  onClose: () => void
  anchor: RefObject<HTMLElement | null>
  route: Route
  userId?: string
  context?: QuickAddSheetRequest
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
    const project_id = rest.project_id ?? context?.projectId ?? defaults.project_id
    return { ...defaults, ...rest, project_id,
      ...(context ? { section_id: project_id === context.projectId ? context.sectionId : null } : {}),
      labels: [...new Set([...viewLabels, ...(typed ?? [])])] }
  }
  // In a reusable list, its ticked items are suggested while typing, as in the list's own line (reusable-suggest-sheet).
  const listId = context?.projectId ?? (route.view === 'project' ? route.id : null)
  const reuseProjectId = listId && isReusable(projects.find((p) => p.id === listId)) ? listId : null
  // A count of adds, so the status line announces "Added" again for each one.
  const [added, setAdded] = useState(0)
  const onAdd = async (input: QuickAddInput) => {
    // Top or bottom of the list it lands in (add-position D3).
    await addToList({ ...withDefaults(input), placement: await preferredPlacement() }, createTaskThenSuggest)
    setAdded((n) => n + 1)
  }
  // A pasted list (paste-to-tasks D3): one batch with the view's defaults per line, one Undo.
  const onAddMany = async (inputs: QuickAddInput[]) => {
    const placement = await preferredPlacement()
    await addManyToList(inputs.map(withDefaults), async (fresh) => {
      const added = await addTasksUndoable(fresh, { placement })
      showBulkToast(added.label, added.undoId)
    })
  }
  return (
    <Popover open={open} onClose={onClose} anchor={anchor} label={t('Add a task')} side="top" align="end" width="sm:w-96" className="pt-3 pb-0">
      <div data-quick-add-sheet>
        {context && <p className="user-text px-3 pb-2 text-meta text-muted" data-quick-add-section>{t('Add a task to {sectionName}', { sectionName: context.sectionName })}</p>}
        <span className="sr-only" role="status" aria-live="polite" data-sheet-added>{added > 0 && <span key={added}>{t('Added')}</span>}</span>
        <QuickAdd layout="sheet" autoFocus hideHint initialValue={prefill ?? undefined} placeholder={t('Add a task…')} label={t('Add a task')} reuseProjectId={reuseProjectId} projects={projects} labels={labels} onAdd={onAdd} onAddMany={onAddMany} />
      </div>
    </Popover>
  )
}

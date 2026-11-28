// The wiring of a task list (OpenSpec changes web-component-structure and phone-lists,
// design D1): everything the list screen composes over its data (useListModel): the
// selection, the manual orders, drag, adding with the view's defaults, completion and
// its prompts, the row menu, the keyboard, the row actions and the header's actions.
// The desktop list (TaskListView) and the phone list (src/phone) both draw from it,
// so neither holds list logic of its own.
import { useFeature } from '../../lib/features'
import { useWithMethod } from '../help/MethodLink'
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lazy } from '../../lib/lazy'
import { useListExtras } from './listExtras'
import { t } from '../../lib/i18n'
import { useMembershipMap } from '../../lib/localData'
import { preferredPlacement, USER_PREFS_ID } from '../../lib/userPrefs'
import { useMarkProjectSeen } from '../../lib/feed'
import { dayOrderRows, dayOrderSiblings, isTodayProjectGroup, sectionOfRows, type ListGroup, type ListRow } from '../../lib/listGroups'
import { useDayOrderDrop } from './useDayOrderDrop'
import type { TodayListDrop } from './useListDrag'
import { taskStepEdges, type Step } from '../../lib/move'
import type { ViewPlacement } from '../../lib/viewOrder'
import type { OrderHost } from '../../lib/viewOrderMove'
import { dropInView, reorderInView, stepInView } from '../viewOrderActions'
import type * as TodayDrop from './todayGroupDrop'
import { canEditTasks, roleOf } from '../../lib/sharing'
import { isNarrowed } from '../../lib/completedDisplay'
import { createTaskThenSuggest } from '../../lib/assistantSuggest'
import { getPlace, locationFromPlace } from '../../lib/locations'
import { dayTotalsText } from '../../lib/time'
import { useDayTotals } from '../../lib/timeEntries'
import { nextViewMode, saveShowCompleted, saveViewMode, type ProjectViewMode } from '../../lib/sections'
import { parentReadyToComplete } from '../../lib/subtasks'
import type { AccountRole, Task } from '../../lib/types'
import { act } from '../actionError'
import { useAwayMeta } from '../away/AwayMenu'
import { offerArchiveAfterCompletion } from '../ArchivePrompt'
import { useWorkspaceName } from '../workspaceNav'
import { useListReady } from './useListReady'
import { type ListReorder, type RowMenuItems } from '../bulk/BulkActions'
import { useDockHold, useInlineEdit, useRowMenuItems } from './useRowEditing'
import { useRowMenu } from '../bulk/useRowMenu'
import { useActionsOpen } from '../bulk/useBulkList'
import { useCollapsedGroups } from '../collapsedGroups'
import { taskDefaults } from '../listActions'
import { panelTaskId, usePanelHasTask, setPanelTaskId as setOpenId, sidePanelDocks } from '../panel'
import { useClickAway } from './useClickAway'
import { InlineEditor } from './InlineEditor'
import { holdSelect } from './RowSwipe'
import { type QuickAddInput } from '../QuickAdd'
import { useSelection } from '../selection'
import { completeWithUndo, stepRowWithUndo } from '../undoable'
import { useBoardMoves } from './useBoardMoves'
import { usePhoneListActions } from './ListChrome'
import { useCalmUpcoming, useListMotion } from './ListGroups'
import { useListSplit } from './useInboxSplit'
import { afterListAdd, afterListAddMany } from './afterListAdd'
import { addTasksUndoable } from '../../lib/pasteTasks'
import { useListBindings } from './useListBindings'
import { useListDrag } from './useListDrag'
import { useDropSelect } from './useDropSelect'
import { type AddingBelow } from './belowLine'
import { useListModel, type ListRoute } from './useListModel'
import { markPendingDone } from '../../lib/pendingDone'
import { useListShortcuts, type ListUi } from './useListShortcuts'
import { noteTodayOpened } from '../../lib/firstDay'
import { useTodayAgenda } from '../calendar/TodayAgenda'
import { useUpcomingList } from '../calendar/UpcomingAgenda'
import { closedListMeta } from './useClosedList'
import { addManyToList, createUnlessReused } from '../reuseAdd'

// The Completed view's controls load with the view (completed-view-review: bundle budget).
const CompletedOptions = lazy(() => import('../completed/CompletedBar').then((m) => ({ default: m.CompletedOptions })))

/** Transient UI of the list: pickers, prompts, quick adds and the actions menu. */
function useListUi(ticked: ReadonlySet<string>, order: readonly string[], items: RowMenuItems, expandedId: string | null) {
  const actions = useActionsOpen(order.length)
  const [selectMode, setSelectMode] = useState(false)
  const [addingUnder, setAddingUnder] = useState<string | null>(null)
  const [addingBelow, setAddingBelow] = useState<AddingBelow | null>(null)
  /** Parent whose last open subtask was just completed; Enter completes it too. */
  const [prompt, setPrompt] = useState<Task | null>(null)
  /** Task whose label picker (`L`) is open. */
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  /** Task whose assignee picker (Shift+A) is open (task-assignment). */
  const [assignFor, setAssignFor] = useState<string | null>(null)
  /** Section whose quick add is open ('' = "No section"), board-view. */
  const [addingTo, setAddingTo] = useState<string | null>(null)
  /** The row's More button when the menu was opened from it (rows-v2 D7); null for `.`. */
  const actionsFrom = useRef<HTMLElement | null>(null)
  const { open: openActionsMenu } = actions
  const openActions = useCallback((picker: string | null = null, from: HTMLElement | null = null) => { actionsFrom.current = from; openActionsMenu(picker) }, [openActionsMenu])
  // The row's menu at the pointer (task-row-context-menu): one state, one selection
  // rule and one focus restore, shared with the filter, saved-view and method lists.
  const rowMenu = useRowMenu(ticked, order, { ...items, expandedId })
  const ui: ListUi = { pickerFor, setPickerFor, assignFor, setAssignFor, prompt, setPrompt, addingUnder, setAddingUnder, addingBelow, setAddingBelow, setAddingTo, openActions }
  return { ui, actions, actionsFrom, selectMode, setSelectMode, addingTo, rowMenu }
}

/** Bulk selection over the list's rows (bulk-edit D1); read-only tasks cannot be ticked. */
function useTickedRows(rows: ListRow[], taskMap: Map<string, Task>, isReadOnly: (task?: Task) => boolean) {
  const tickRows = useMemo(() => rows.filter((r) => !r.contextual).map((r) => r.task.id), [rows])
  const contextIds = useMemo(() => new Set(rows.filter((r) => r.contextual).map((r) => r.task.id)), [rows])
  const readOnlyId = useCallback((id: string) => contextIds.has(id) || isReadOnly(taskMap.get(id)), [contextIds, isReadOnly, taskMap])
  const selection = useSelection(tickRows, readOnlyId)
  const ticked = useMemo(() => tickRows.filter((id) => selection.ticked.has(id)), [tickRows, selection.ticked])
  return { tickRows, selection, ticked, contextIds }
}

const NO_TICKED: ReadonlySet<string> = new Set()

/** The day order's page (day-manual-order): Today under a grouping other than Project, or Upcoming. */
interface DayOrderPage { page: 'today' | 'upcoming'; parts: boolean; ticked: ReadonlySet<string> }

/** The day order Today (under any grouping but Project) and Upcoming share, and the rows it places. */
function useDayOrderPage(route: ListRoute, groupBy: string | undefined, parts: boolean, ticked: ReadonlySet<string>, groups: readonly ListGroup[]) {
  const page = route.view === 'upcoming' ? 'upcoming' as const : route.view === 'today' && groupBy !== 'project' ? 'today' as const : null
  const dayOrder = useMemo<DayOrderPage | null>(() => (page ? { page, parts, ticked } : null), [page, parts, ticked])
  const dayOrderIds = useMemo(() => (page ? new Set(dayOrderRows(groups).map((r) => r.task.id)) : undefined), [page, groups])
  return { dayOrder, dayOrderIds }
}

/** The personal order for a label page, Today grouped by Project (`today`), or the day order of Today and Upcoming (`day`). */
function useOwnOrder(route: ListRoute, rows: ListRow[], groups: ListGroup[], board: boolean, today: boolean, nest: boolean, taskMap: Map<string, Task>, day: DayOrderPage | null) {
  // State, not a ref: the chunk can land after a row menu opened, and the menu then renders
  // again with the contextual moves.
  const [todayModule, setTodayModule] = useState<typeof TodayDrop>()
  useEffect(() => {
    if (today && !todayModule) {
      void import('./todayGroupDrop').then(({ applyTodayDrop, todayGroupDrop, contextualMoveItems }) => {
        setTodayModule({ applyTodayDrop, todayGroupDrop, contextualMoveItems })
      })
    }
  }, [today, todayModule])
  const page = day?.page
  const host = useMemo<OrderHost | null>(() => route.view === 'label' ? { entity: 'label', id: route.id }
    : today ? { entity: 'user_prefs', id: USER_PREFS_ID, page: 'today' } : page ? { entity: 'user_prefs', id: USER_PREFS_ID, page } : null, [route, today, page])
  const orderRows = useMemo(() => today ? groups.filter(isTodayProjectGroup).flatMap((g) => g.rows.filter((r) => r.depth === 0)) : page ? dayOrderRows(groups) : rows, [today, page, groups, rows])
  const latest = useRef({ rows: orderRows, groups, taskMap })
  latest.current = { rows: orderRows, groups, taskMap }
  const memberships = useMembershipMap()
  const dayDrop = useDayOrderDrop(page ? host : null, !!day?.parts, day?.ticked ?? NO_TICKED, latest, memberships)
  const groupOf = useMemo(() => new Map(groups.flatMap((g) => g.rows.map((r) => [r.task.id, g.key] as const))), [groups])
  const reorder = useCallback((id: string, at: ViewPlacement) => {
    if (host) act(reorderInView(host, latest.current.rows.map((r) => r.task), id, at))
  }, [host])
  const siblingsOf = useCallback((id: string) => {
    if (page) return dayOrderSiblings(latest.current.groups, id)
    const group = latest.current.groups.find((g) => g.rows.some((r) => r.task.id === id))
    if (!group || (today && (!isTodayProjectGroup(group) || !canEditTasks(roleOf(group.project, memberships))))) return []
    return group.rows.filter((r) => !today || (r.depth === 0 && !r.task.completed_at)).map((r) => r.task)
  }, [today, page, memberships])
  const step = useCallback((id: string, how: Step) => {
    if (!host) return Promise.resolve(false)
    return stepInView(host, latest.current.rows.map((r) => r.task), siblingsOf(id), id, how)
  }, [host, siblingsOf])
  const edges = useCallback<ListReorder['edges']>(async (id) => {
    if (!today && !page) return { first: false, last: false }
    const siblings = siblingsOf(id)
    const i = siblings.findIndex((task) => task.id === id)
    return i < 0 ? null : { first: i === 0, last: i === siblings.length - 1 }
  }, [today, page, siblingsOf])
  // Grouped by Project in the List layout (view-project-drops D1): a drop in another project's group moves the task there.
  const byProject = !board && groups.some((g) => g.project)
  const across = useMemo(() => {
    if (!host || today || !byProject) return undefined
    const projectOf = (key: string) => {
      const g = latest.current.groups.find((x) => x.key === key)
      if (g?.project) return { id: g.project, name: g.heading ?? t('Project') }
      return g && (g.key === 'inbox' || g.key.endsWith(':inbox')) ? { id: null, name: t('Inbox') } : null
    }
    return {
      projectOf,
      canEdit: (id: string | null) => canEditTasks(roleOf(id, memberships)),
      move: (taskId: string, at: ViewPlacement, key: string) => {
        const into = projectOf(key)
        if (into) act(dropInView(host, latest.current.rows.map((r) => r.task), taskId, { projectId: into.id, projectName: into.name, at }))
      },
    }
  }, [host, today, byProject, memberships])
  const projectDrop = useMemo(() => {
    if (!host || !today) return undefined
    const move = async (id: string, drop: import('../../lib/viewOrderMove').GroupDrop) =>
      todayModule?.applyTodayDrop(host, latest.current.rows.map((r) => r.task), latest.current.groups, id, drop)
    return {
      resolve: (task: Task, target: string | null, y: number, gesture: import('./projectGroupPlacement').DragDepth) =>
        todayModule?.todayGroupDrop(latest.current.groups, memberships, nest, task, target, y, gesture, latest.current.taskMap) ?? null,
      move: (id: string, drop: TodayListDrop) => ('kind' in drop ? Promise.resolve(undefined) : move(id, drop)),
      contextActions: (task: Task) => nest ? todayModule?.contextualMoveItems(task, latest.current.groups, memberships, latest.current.taskMap, move) ?? [] : [],
      canEdit: (group: ListGroup) => isTodayProjectGroup(group) && canEditTasks(roleOf(group.project, memberships)),
    }
  }, [host, today, memberships, nest, todayModule])
  const todayDrop = projectDrop ?? dayDrop
  return useMemo(() => (host ? { reorder, step, edges, groupOf, across, todayDrop } : null), [host, reorder, step, edges, groupOf, across, todayDrop])
}

/** The row menu's Reorder items (accessibility-aa D3): the keyboard move's writes, from a pointer; null without a manual order. */
function useListReorder(manual: boolean, ownOrder: Pick<NonNullable<ReturnType<typeof useOwnOrder>>, 'step' | 'edges' | 'todayDrop'> | null, onReorder: (() => void) | undefined, add?: ListReorder['add']): ListReorder | null {
  return useMemo<ListReorder | null>(() => (!manual ? null : {
    move: (id, step) => { if (ownOrder) act(ownOrder.step(id, step)); else { onReorder?.(); act(stepRowWithUndo(id, step)) } },
    edges: ownOrder?.edges ?? taskStepEdges,
    contextActions: ownOrder?.todayDrop?.contextActions,
    add,
  }), [manual, ownOrder, onReorder, add])
}

/**
 * The row menu's "Add task below" and "Add subtask" (add-below) in a tree list: the line
 * opens once the menu has closed and given focus back, so it keeps the focus it takes.
 */
function useListAdd(on: boolean, ui: ListUi, toggleCollapsed: (id: string, force?: boolean) => void): ListReorder['add'] {
  const { setAddingUnder, setAddingBelow } = ui
  return useMemo(() => (!on ? undefined : {
    below: (id: string) => { requestAnimationFrame(() => { setAddingUnder(null); setAddingBelow({ anchor: id, last: id }) }) },
    under: (id: string) => { requestAnimationFrame(() => { toggleCollapsed(id, false); setAddingBelow(null); setAddingUnder(id) }) },
  }), [on, setAddingUnder, setAddingBelow, toggleCollapsed])
}

/** The page title of a list. */
function listTitle(view: ListRoute['view'], project?: string, label?: string, place?: string): string {
  return {
    inbox: t('Inbox'), today: t('Today'), upcoming: t('Upcoming'), someday: t('Someday'), anytime: t('Anytime'), completed: t('Completed'), assigned: t('Assigned to me'), project: project ?? t('Project'), label: label ?? t('Label'), place: place ?? t('Location'),
  }[view]
}

export function useListScreen(route: ListRoute, userId?: string, userRole?: AccountRole) {
  const m = useListModel(route, userId)
  const workspaceName = useWorkspaceName()
  const { rows, groups: taskGroups, columns: dataColumns, board, timeline, projectId, today, taskMap, isReadOnly, collapsedSections, viewMode, sectionMap } = m
  useMarkProjectSeen(route.view === 'project' ? projectId ?? null : null) // a shared project on screen is seen (quiet-unread D2)
  const upcomingCal = useUpcomingList(route.view === 'upcoming', taskGroups, today, m.upcomingThrough, m.zone, m.dt.resolved)
  // Completed rows stay on screen for their sequence (motion-v2); data stays as read.
  const { groups, columns } = useListMotion(upcomingCal.groups, dataColumns)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentColumn, setCurrentColumn] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const collapsedGroups = useCollapsedGroups()
  // Calm Upcoming (sidebar-brand-and-row-grid D8): the later days are closed bars unless Later days is In full.
  const { summarised, cursorRows } = useCalmUpcoming(route.view === 'upcoming', groups, rows, !!m.display?.laterInFull, collapsedGroups)
  // Bulk selection (bulk-edit D1): ticked rows, separate from the cursor row.
  const { tickRows, selection, ticked, contextIds } = useTickedRows(rows, taskMap, isReadOnly)
  const { dockId, holdDock, releaseDock } = useDockHold(selectedId)
  const { inline, setInline, startInline, editTitle } = useInlineEdit(taskMap, board, isReadOnly, setSelectedId, holdDock)
  const { menuItems, expandedId, setExpandedId } = useRowMenuItems(!board && !timeline, editTitle, setSelectedId)
  const { ui, actions, actionsFrom, selectMode, setSelectMode, addingTo, rowMenu } = useListUi(selection.ticked, ticked, menuItems, expandedId)
  // Observe panel presence only so moving the cursor between docked tasks does not redraw the list.
  const panelOpen = usePanelHasTask()
  const inbox = useListSplit({ inbox: route.view === 'inbox', rows, ownRows: m.ownRows, selectedId, setSelectedId, ticking: selection.ticked.size > 0, dockId })
  const quickAddRef = useRef<HTMLTextAreaElement>(null)
  // The first-day checklist's "Plan today" (moments-and-onboarding D5): Today opened after the first task.
  useEffect(() => { if (route.view === 'today') void noteTodayOpened() }, [route.view])
  const listRoot = useRef<HTMLDivElement>(null)
  // A press on empty space clears the selection and closes the panel (inline-task-editing D4), never the side panel (task-side-panel D4).
  useClickAway(listRoot, !!selectedId || panelOpen || !!inline, () => {
    const focused = document.activeElement
    if (focused instanceof HTMLElement && listRoot.current?.contains(focused) && focused.closest('[data-inline-editor]')) focused.blur()
    setInline(null)
    setSelectedId(null)
    if (panelTaskId() && !sidePanelDocks()) setOpenId(null)
  })
  const renderInline = useCallback((task: Task) => (
    <InlineEditor key={task.id} task={task} caret={inline?.caret} compact={inline?.compact} projects={m.projects} labelMap={m.labelMap}
      onFollow={(id) => setSelectedId(id)}
      onDone={(details) => {
        setInline((editing) => editing?.id === task.id ? null : editing)
        if (details) setOpenId(task.id)
        requestAnimationFrame(() => {
          if (details || document.activeElement !== document.body) return
          const row = listRoot.current?.querySelector<HTMLButtonElement>(`[data-task-id="${CSS.escape(task.id)}"] [data-row-open]`)
          row?.focus({ preventScroll: true })
        })
      }} />
  ), [inline, setInline, m.projects, m.labelMap])
  /** Vim `o` (vim-keybindings): the task the next quick-add entry is placed after, if any. */
  const insertAfter = useRef<string | null>(null)

  const toggleViewMode = useCallback(() => { if (projectId) void saveViewMode(projectId, nextViewMode(viewMode)) }, [projectId, viewMode])
  // Saved even when it is the layout shown: until the stored layout has loaded the switch shows
  // List, and a click on List then must not be lost when the stored Board or Timeline arrives (issue 941).
  const chooseViewMode = useCallback((mode: ProjectViewMode) => {
    if (projectId) void saveViewMode(projectId, mode)
  }, [projectId])
  // The checkbox's completion path, defined below; the board's Completed column completes through it.
  const toggleCompleteRef = useRef<(id: string, completed: boolean) => Promise<void>>(async () => {})
  const { toggleSection, moveToSection } = useBoardMoves(projectId, collapsedSections, sectionMap, toggleCompleteRef)
  // Manual ordering (manual-ordering): projects (editors and above) and the Inbox by positions; a label page by its own order (view-manual-order); Today and Upcoming by the day order (day-manual-order).
  const { dayOrder, dayOrderIds } = useDayOrderPage(route, m.display?.groupBy, m.dayParts, selection.ticked, upcomingCal.groups), projectManual = (route.view === 'project' && m.projectEditable) || route.view === 'inbox', ownOrder = useOwnOrder(route, rows, upcomingCal.groups, board, route.view === 'today' && m.display?.groupBy === 'project', m.nested, taskMap, dayOrder), manual = projectManual || !!ownOrder, listReorder = useListReorder(manual, ownOrder, m.listDisplay.onReorder, useListAdd(projectManual && m.treeView && !board, ui, m.toggleCollapsed))
  const sectionOfRow = useMemo(() => sectionOfRows(board, dataColumns, upcomingCal.groups), [board, dataColumns, upcomingCal.groups])
  const [selectDropped, wasDropped] = useDropSelect(selectedId, setSelectedId)
  const drag = useListDrag({ manual, onReorder: ownOrder ? undefined : m.listDisplay.onReorder, source: { rows, groups: upcomingCal.groups, sectionOfRow, tree: m.tree, board, sectionMap, ticked: selection.ticked, onHold: (task) => { if (!contextIds.has(task.id)) holdSelect(task.id, selection, setSelectMode) }, openRowMenu: rowMenu.open, reorder: ownOrder?.reorder, groupOf: ownOrder?.groupOf, across: ownOrder?.across, readOnly: isReadOnly, today: ownOrder?.todayDrop, project: projectId }, moveToSection, onDropped: selectDropped, onDragStart: rowMenu.dismiss })
  // The view supplies defaults; attributes typed in the quick-add line override them.
  const withDefaults = useCallback(async (inputs: QuickAddInput[]) => {
    const place = route.view === 'place' ? await getPlace(route.id) : undefined
    return inputs.map(({ labels: typed, ...rest }) => {
      // In Assigned to me a new task is yours (Inbox unless a #project was typed).
      const { labels: viewLabels, ...defaults } = taskDefaults(route, today, userId)
      if (route.view === 'project' && insertAfter.current) defaults.project_id = taskMap.get(insertAfter.current)?.project_id ?? defaults.project_id // `o` in an open sub-project adds there (subproject-inline)
      // In Someday a line with a date is scheduled, not parked (someday-and-evening); a typed time sector also takes the view's date (time-sectors D2).
      if (rest.due || rest.deadline || rest.sector) { delete defaults.start; if (rest.sector) defaults.due = null }
      return {
        ...defaults,
        ...rest,
        // In a place's list a new task happens there (task-locations).
        ...(place && !place.deleted_at ? { location: locationFromPlace(place) } : {}),
        // Labels are multi-valued: a label view's label is kept alongside typed @labels.
        labels: [...new Set([...viewLabels, ...(typed ?? [])])],
      }
    })
  }, [route, today, userId, taskMap])
  const onAdd = useCallback(async (input: QuickAddInput) => {
    // Top or bottom (add-position D3); `o` keeps its anchor, so that entry appends before it moves.
    const placement = insertAfter.current ? 'bottom' : await preferredPlacement()
    const [task] = await withDefaults([input])
    const id = await createUnlessReused({ placement, ...task }, createTaskThenSuggest) // null: a reusable list reused an item (reusable-lists D3)
    // The `o` move, the Inbox's note, or the note for a row out of sight (add-position D5).
    const list = listTitle(route.view, m.currentProject?.name, m.currentLabel?.name, m.currentPlace?.name)
    if (id) await afterListAdd(id, { route, today, insertAfter, sectionMap: drag.latestSectionMap, list, placement: projectManual ? placement : undefined, root: listRoot.current, select: setSelectedId })
  }, [withDefaults, route, today, drag.latestSectionMap, projectManual, m.currentProject, m.currentLabel, m.currentPlace, setSelectedId])
  // A pasted list (paste-to-tasks D3): every line with the view's defaults, one batch, one Undo.
  const onAddMany = useCallback(async (inputs: QuickAddInput[]) => {
    const placement = insertAfter.current ? 'bottom' : await preferredPlacement()
    await addManyToList(await withDefaults(inputs), async (fresh) => afterListAddMany(await addTasksUndoable(fresh, { placement }), { route, today, insertAfter, sectionMap: drag.latestSectionMap }))
  }, [withDefaults, route, today, drag.latestSectionMap])

  const { setPrompt } = ui
  const rowsById = useRef(taskMap)
  rowsById.current = taskMap
  /** Complete or reopen; after completing the last open subtask, offer the parent (design D5). */
  const toggleComplete = useCallback(async (id: string, completed: boolean) => {
    markPendingDone(rowsById.current.get(id), completed)
    await completeWithUndo(id, completed)
    if (!completed) return setPrompt((p) => (p?.id === id ? null : p))
    const parent = await parentReadyToComplete(id)
    setPrompt(parent)
    // The last open task of a project: offer one-key archiving (trash-and-history).
    if (!parent) await offerArchiveAfterCompletion(id)
  }, [setPrompt])
  toggleCompleteRef.current = toggleComplete
  const acceptPrompt = useCallback(() => {
    if (!ui.prompt) return
    const parent = ui.prompt
    setPrompt(null)
    act(toggleComplete(parent.id, true))
  }, [ui.prompt, setPrompt, toggleComplete])

  const shared = { route, rows: cursorRows, columns: dataColumns, board, manual, moveInView: ownOrder?.step, selectedId, setSelectedId, isReadOnly, taskMap, ticked, selection, ui, quickAddRef, toggleComplete, toggleCollapsed: m.toggleCollapsed }
  useListShortcuts({
    ...shared, onReorder: m.listDisplay.onReorder, projectId, tree: m.tree, tickRows, treeView: m.treeView, nested: m.nested, projectReadOnly: m.projectReadOnly, projectEditable: m.projectEditable,
    today, userId, acceptPrompt, moveToSection, toggleViewMode, foldColumn: toggleSection,
    editInline: startInline, expandedId, setExpandedId,
  })
  // Vim's `o` inserts by project position: only where positions are the order (manual: projectManual).
  const rowActions = useListBindings({ ...shared, manual: projectManual, setSelectMode, startDrag: drag.startDrag, insertAfter, listRoot, wasDropped, projectReadOnly: m.projectReadOnly, startInline, editTitle, holdDock, releaseDock, setExpandedId, openRowMenu: rowMenu.open, draggingId: drag.draggingId })

  const { edgeOf, boardGroups, queryControl: queryFilter, queryHost, cardNotes } = useListExtras(board, m.queryFilter, projectId ? { mode: viewMode, onChoose: chooseViewMode } : null, projectId, m.currentProject?.name) // Colour by on boards, Upcoming's and each project's query filter (calendar-clarity, project-query-filter)

  // The list's own rows: Today's Done today group is not part of them (today-closed-list D6).
  const own = m.ownRows
  // A project list whose completed tasks are hidden ends with how many (precision-rows D6).
  const hiddenDone = !m.showCompleted && projectId && viewMode === 'list' ? [...m.doneBySection.values()].reduce((n, tasks) => n + tasks.length, 0) : 0
  const showCompleted = projectId ? () => act(saveShowCompleted(projectId, true)) : undefined
  // Completed has its own display options (completed-view-review D1).
  const displayControl = route.view === 'completed' ? <Suspense fallback={null}><CompletedOptions value={m.completedDisplay} /></Suspense> : m.listDisplay.control
  const completedNarrowed = route.view === 'completed' && isNarrowed(m.completedDisplay, m.completedQuery)
  const { currentProject, currentLabel, currentPlace } = m
  // Below 768 px the list's actions sit in the shell's bar and its overflow (phone-v2 D1); in a narrow column the header's row takes the same (tablet-header-room).
  const { phone, room, ...phoneActions } = usePhoneListActions({ route, root: listRoot, userRole, rowCount: own.length, topLevelCount: own.filter((r) => r.depth === 0).length,
    onSelectMode: () => setSelectMode(true), extraSlot: displayControl, filterKey: m.filterKey, duration: m.duration, onDuration: m.chooseDuration, queryFilter,
    project: currentProject && { row: currentProject, editable: m.projectEditable, viewMode, onViewMode: chooseViewMode } })
  // The Open Loops move this screen serves (open-loops "References to the method").
  const methodMove = route.view === 'inbox' ? 'catch' as const : route.view === 'someday' ? 'place' as const : undefined
  // Today's planned and tracked totals sit in the header's meta, not a new row (time-tracking D4).
  const listedTasks = useMemo(() => (route.view === 'today' ? m.ownRows.map((r) => r.task) : []), [route.view, m.ownRows])
  const totals = useDayTotals(listedTasks, today, route.view === 'today'), tracking = useFeature('time-tracking') // the totals belong to Time tracking (workspace-feature-switches D4)
  const todayMeta /* with the closed list's "3 of 5 · 4 done" (today-closed-list D1, D6) and "Away until Friday" (away-periods D4) */ = [m.dt.formatDate(today, 'heading'), useAwayMeta(today, route.view === 'today'), closedListMeta(m.closed), tracking ? dayTotalsText(totals.planned, totals.tracked) : null].filter(Boolean).join(' · ')
  const meta = useWithMethod(methodMove, route.view === 'today' ? todayMeta : route.view === 'label' ? rows.length : route.view === 'inbox' ? inbox.meta : undefined)
  const methodSubtitle = useWithMethod(methodMove, undefined)
  const title = listTitle(route.view, currentProject?.name, currentLabel?.name, currentPlace?.name)

  const agenda = useTodayAgenda(route.view === 'today', today, m.zone)
  const { ready, briefing } = useListReady(route, m.loaded, !!currentProject)
  return {
    m, workspaceName, rows, taskGroups, groups, columns, board, timeline, projectId, today, taskMap, isReadOnly, viewMode,
    upcomingCal, selectedId, setSelectedId, currentColumn, setCurrentColumn, revealed, setRevealed, collapsedGroups, summarised,
    selection, ticked, contextIds, inline, renderInline, editTitle, menuItems, ui, actions, actionsFrom, selectMode, setSelectMode, addingTo, expandedId, rowMenu,
    quickAddRef, listRoot, toggleViewMode, chooseViewMode, toggleSection, dayOrderIds, ownOrder, manual, listReorder, drag, onAdd, onAddMany,
    toggleComplete, setPrompt, acceptPrompt, listedTasks, rowActions, edgeOf, boardGroups, queryFilter, queryHost, cardNotes, own, hiddenDone, showCompleted,
    displayControl, completedNarrowed, currentProject, currentLabel, currentPlace, phone, room, phoneActions, meta, methodSubtitle, title, agenda, ready, briefing,
  }
}

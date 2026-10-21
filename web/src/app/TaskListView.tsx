// The task list (Inbox, Today, Upcoming, Someday, Anytime, Completed, Assigned to me,
// projects and labels). Since OpenSpec change web-component-structure this file only
// wires the pieces under ./task-list: the data (useListModel over lib/listGroups and
// lib/liveData), the keyboard (useListShortcuts), drag (useListDrag), the bindings to
// the panel and the Vim layer (useListBindings), and the bodies for the list, the
// board and the timeline.
import { CloseDayRow } from './CloseDayRow'
import { useWithMethod } from './help/MethodLink'
import { useCallback, useMemo, useRef, useState } from 'react'
import { currentDateTime } from '../lib/dates'
import { t } from '../lib/i18n'
import { getTask } from '../lib/liveData'
import { completedOpenKey, flatRow, sectionOfRows } from '../lib/listGroups'
import { LOGBOOK_PAGE } from '../lib/logbook'
import { moveTask } from '../lib/move'
import { createTask } from '../lib/ops'
import { getPlace, locationFromPlace } from '../lib/locations'
import { dayTotalsText } from '../lib/time'
import { useDayTotals } from '../lib/timeEntries'
import { effectiveSection, moveTaskToSection, nextViewMode, saveListColumns, saveShowCompleted, saveViewMode, setSectionCollapsed, type ProjectViewMode } from '../lib/sections'
import { parentReadyToComplete } from '../lib/subtasks'
import type { AccountRole, Task } from '../lib/types'
import { Button, PAGE_FRAME, PageHeader, useFinePointer } from '../ui'
import { act } from './actionError'
import { addedWhere } from './addedWhere'
import { offerArchiveAfterCompletion } from './ArchivePrompt'
import { ACTION_TOAST_MS, showBulkToast } from './bulk/toastStore'
import { BoardView } from './BoardView'
import { BulkActionsMenu, SelectionBar } from './bulk/BulkActions'
import { useCollapsedGroups } from './collapsedGroups'
import { taskDefaults } from './listActions'
import { usePanelTaskId, setPanelTaskId as setOpenId } from './panel'
import { useClickAway } from './task-list/useClickAway'
import { InlineEditor } from './task-list/InlineEditor'
import { useRowClick } from './rowClick'
import { ProjectHeader } from './ProjectHeader'
import { LabelMenu } from './LabelsView'
import { ProjectNote } from './ProjectNote'
import { QuickAdd, type QuickAddInput } from './QuickAdd'
import { requestQuickAddSheet } from './QuickAddSheet'
import { navigate, type Route } from './router'
import { AddSection } from './Sections'
import { selectTask } from './signals'
import { useSelection } from './selection'
import { SubProjects } from './SubProjects'
import { TimelineView } from './TimelineView'
import { completeWithUndo } from './undoable'
import { CompleteParentPrompt, EmptyState, FilteredEmpty, LayoutSwitch, ListPageActions, MissingTarget, placeholderFor, PlannedWithoutProject, ReadOnlyQuickAdd, usePlannedWithoutProject, RowPickerDialogs } from './task-list/ListChrome'
import { GroupedList, LogbookMore, rowRenderer } from './task-list/ListGroups'
import { useListBindings } from './task-list/useListBindings'
import { useListDrag } from './task-list/useListDrag'
import { useListModel, type ListRoute } from './task-list/useListModel'
import { useListShortcuts, type ListUi } from './task-list/useListShortcuts'

export { BLOCKED_OPEN_KEY } from '../lib/listGroups'

/** The guide section of each list page (user-documentation "Contextual help"); projects use their header's. */
const HELP_SCREENS: Partial<Record<Route['view'], string>> = {
  inbox: 'inbox', today: 'today', upcoming: 'upcoming', anytime: 'anytime', someday: 'someday', completed: 'completed', assigned: 'assigned', label: 'label',
}

/** Transient UI of the list: pickers, prompts, quick adds and the actions menu. */
function useListUi() {
  const [actionsOpen, setActionsOpen] = useState(false)
  const [actionsPicker, setActionsPicker] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [addingUnder, setAddingUnder] = useState<string | null>(null)
  /** Parent whose last open subtask was just completed; Enter completes it too. */
  const [prompt, setPrompt] = useState<Task | null>(null)
  /** Task whose label picker (`L`) is open. */
  const [pickerFor, setPickerFor] = useState<string | null>(null)
  /** Task whose assignee picker (Shift+A) is open (task-assignment). */
  const [assignFor, setAssignFor] = useState<string | null>(null)
  /** Section whose quick add is open ('' = "No section"), board-view. */
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const openActions = useCallback((picker: string | null = null) => { setActionsPicker(picker); setActionsOpen(true) }, [])
  const onActionsOpen = useCallback((v: boolean) => { setActionsOpen(v); if (!v) setActionsPicker(null) }, [])
  const ui: ListUi = { pickerFor, setPickerFor, assignFor, setAssignFor, prompt, setPrompt, addingUnder, setAddingUnder, setAddingTo, openActions }
  return { ui, actionsOpen, actionsPicker, onActionsOpen, selectMode, setSelectMode, addingTo }
}

/** With the Completed group on (project-completed-section), sections offer no "n completed" of their own. */
const NO_DONE: Map<string, Task[]> = new Map()

export function TaskListView({ route, userId, userRole }: { route: ListRoute; userId?: string; userRole?: AccountRole }) {
  const m = useListModel(route, userId)
  const { rows, groups, columns, board, timeline, projectId, today, taskMap, isReadOnly, collapsedSections, viewMode, sectionMap } = m
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentColumn, setCurrentColumn] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const collapsedGroups = useCollapsedGroups()
  // Bulk selection (bulk-edit D1): ticked rows, separate from the cursor row.
  const tickRows = useMemo(() => rows.map((r) => r.task.id), [rows])
  const readOnlyId = useCallback((id: string) => isReadOnly(taskMap.get(id)), [isReadOnly, taskMap])
  const selection = useSelection(tickRows, readOnlyId)
  const ticked = useMemo(() => tickRows.filter((id) => selection.ticked.has(id)), [tickRows, selection.ticked])
  const { ui, actionsOpen, actionsPicker, onActionsOpen, selectMode, setSelectMode, addingTo } = useListUi()
  // The open task lives in the shell's panel slot (app-shell D1); this view only selects and opens.
  const openId = usePanelTaskId()
  const quickAddRef = useRef<HTMLInputElement>(null)
  const focusQuickAdd = useCallback(() => quickAddRef.current?.focus(), [])
  // An empty view's "Add a task": the quick-add sheet on a touch device, the view's own field otherwise.
  const fine = useFinePointer()
  const addFromEmpty = useCallback(() => { if (fine || !requestQuickAddSheet()) focusQuickAdd() }, [fine, focusQuickAdd])
  const listRoot = useRef<HTMLDivElement>(null)
  // The row being edited in place and where its caret starts (inline-task-editing D1, D2).
  const [inline, setInline] = useState<{ id: string; caret?: number } | null>(null)
  const clickPref = useRowClick()
  // A press on empty space of the column clears the selection and closes the panel (inline-task-editing D4).
  useClickAway(listRoot, !!selectedId || !!openId || !!inline, () => {
    setInline(null)
    setSelectedId(null)
    if (openId) setOpenId(null)
  })
  // A click on a title edits it in place: a mouse click (not Enter) with a fine pointer from 768 px,
  // the "Edit in place" preference, no panel open, a task the user may edit; otherwise the panel opens.
  const startInline = useCallback((id: string, e?: React.MouseEvent) => {
    const task = taskMap.get(id)
    const fine = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches
    const wide = typeof window !== 'undefined' && window.innerWidth >= 768
    if (!e || e.detail === 0 || !task || board || clickPref !== 'edit' || !fine || !wide || openId || isReadOnly(task)) return false
    setSelectedId(id)
    setInline({ id, caret: caretFromClick(e) })
    return true
  }, [taskMap, board, clickPref, openId, isReadOnly])
  const renderInline = useCallback((task: Task) => (
    <InlineEditor key={task.id} task={task} caret={inline?.id === task.id ? inline.caret : undefined} projects={m.projects} labelMap={m.labelMap}
      onFollow={(id) => setSelectedId(id)}
      onDone={(details) => {
        setInline(null)
        if (details) setOpenId(task.id)
        // Focus back on the row so the keyboard picks up where the editor was.
        requestAnimationFrame(() => listRoot.current?.querySelector<HTMLButtonElement>(`[data-task-id="${CSS.escape(task.id)}"] [data-row-open]`)?.focus())
      }} />
  ), [inline, m.projects, m.labelMap])
  /** Vim `o` (vim-keybindings): the task the next quick-add entry is placed after, if any. */
  const insertAfter = useRef<string | null>(null)

  const toggleViewMode = useCallback(() => {
    if (projectId) void saveViewMode(projectId, nextViewMode(viewMode))
  }, [projectId, viewMode])
  const chooseViewMode = useCallback((mode: ProjectViewMode) => {
    if (projectId && mode !== viewMode) void saveViewMode(projectId, mode)
  }, [projectId, viewMode])
  const toggleSection = useCallback((key: string, force?: boolean) => {
    if (projectId) act(setSectionCollapsed(projectId, key, force ?? !collapsedSections.includes(key)))
  }, [projectId, collapsedSections])
  /** Move a top-level task to a section ('' = none); a no-op when it is already there. */
  const moveToSection = useCallback((task: Task, key: string) => {
    if ((effectiveSection(task, sectionMap) ?? '') === key) return
    act(moveTaskToSection(task.id, key || null))
  }, [sectionMap])

  // Manual ordering (OpenSpec `manual-ordering`): project lists and boards (editors
  // and above) and the Inbox. Date and filter views keep their own sort.
  const manual = (route.view === 'project' && m.projectEditable) || route.view === 'inbox'
  const sectionOfRow = useMemo(() => sectionOfRows(board, columns, groups), [board, columns, groups])
  const drag = useListDrag({ manual, source: { rows, sectionOfRow, tree: m.tree, board, sectionMap, ticked: selection.ticked }, moveToSection, onDropped: setSelectedId })
  const { latestSectionMap } = drag

  // The view supplies defaults; attributes typed in the quick-add line override them.
  const onAdd = useCallback(async ({ labels: typed, ...rest }: QuickAddInput) => {
    // In Assigned to me a new task is yours (Inbox unless a #project was typed).
    const { labels: viewLabels, ...defaults } = taskDefaults(route, today, userId)
    // In Someday a line with a date is scheduled, not parked (someday-and-evening).
    if (rest.due || rest.deadline) delete defaults.start
    const place = route.view === 'place' ? await getPlace(route.id) : undefined
    const id = await createTask({
      ...defaults,
      ...rest,
      // In a place's list a new task happens there (task-locations).
      ...(place && !place.deleted_at ? { location: locationFromPlace(place) } : {}),
      // Labels are multi-valued: a label view's label is kept alongside typed @labels.
      labels: [...new Set([...viewLabels, ...(typed ?? [])])],
    })
    const after = insertAfter.current
    if (after) {
      // Opened with `o`: place it right after the anchor, as its sibling; the next entry follows it.
      insertAfter.current = id
      const anchor = await getTask(after)
      if (anchor) {
        await moveTask(id, {
          parent_id: anchor.parent_id,
          ...(anchor.parent_id === null ? { section_id: effectiveSection(anchor, latestSectionMap()) } : {}),
          at: { after },
        })
      }
    }
    // A line that scheduled the task took it out of the Inbox: say where it went (inbox-means-unplaced D5).
    if (route.view === 'inbox') {
      const created = await getTask(id)
      const where = created ? addedWhere(created, today, currentDateTime()) : null
      if (where) showBulkToast(where.label, null, { ttl: ACTION_TOAST_MS, action: { label: t('Open'), run: () => { selectTask.set(id); navigate({ view: where.view }) } } })
    }
  }, [route, today, userId, latestSectionMap])

  const { setPrompt } = ui
  /** Complete or reopen; after completing the last open subtask, offer the parent (design D5). */
  const toggleComplete = useCallback(async (id: string, completed: boolean) => {
    await completeWithUndo(id, completed)
    if (!completed) {
      setPrompt((p) => (p?.id === id ? null : p))
      return
    }
    const parent = await parentReadyToComplete(id)
    setPrompt(parent)
    // The last open task of a project: offer one-key archiving (trash-and-history).
    if (!parent) await offerArchiveAfterCompletion(id)
  }, [setPrompt])
  const acceptPrompt = useCallback(() => {
    if (!ui.prompt) return
    const parent = ui.prompt
    setPrompt(null)
    act(toggleComplete(parent.id, true))
  }, [ui.prompt, setPrompt, toggleComplete])

  const shared = { route, rows, columns, board, manual, selectedId, setSelectedId, openId, isReadOnly, taskMap, ticked, selection, ui, quickAddRef, toggleComplete, toggleCollapsed: m.toggleCollapsed }
  useListShortcuts({
    ...shared, projectId, tree: m.tree, tickRows, treeView: m.treeView, projectReadOnly: m.projectReadOnly, projectEditable: m.projectEditable,
    today, userId, acceptPrompt, moveToSection, toggleViewMode,
    editInline: (id) => { setSelectedId(id); setInline({ id }) },
  })
  const rowActions = useListBindings({ ...shared, setSelectMode, startDrag: drag.startDrag, insertAfter, listRoot, projectReadOnly: m.projectReadOnly, startInline })

  const renderRow = rowRenderer({
    view: route.view, labelId: route.view === 'label' ? route.id : undefined, userId, projectMap: m.projectMap, labelMap: m.labelMap, memberMap: m.memberMap, selectedId, progress: m.progress, blocked: m.blocked,
    habits: m.habits, isReadOnly, board, manual, treeView: m.treeView, dropAt: drag.dropAt, draggingId: drag.draggingId, ticked: selection.ticked,
    showCheckbox: selectMode || selection.ticked.size > 0, fieldColumns: m.fieldColumns, projectFieldDefs: m.projectFieldDefs, siblingPos: m.siblingPos,
    actions: rowActions, addingUnder: ui.addingUnder, onCloseSubtask: () => ui.setAddingUnder(null),
    inlineId: inline?.id ?? null, renderInline,
  })

  // Planned tasks without a project (inbox-means-unplaced D4): in the Inbox header's meta, or its action row on phones.
  const planned = usePlannedWithoutProject(route.view === 'inbox')
  const pageActions = (
    <ListPageActions route={route} userRole={userRole} rowCount={rows.length} topLevelCount={rows.filter((r) => r.depth === 0).length}
      selectMode={selectMode} onSelectMode={() => setSelectMode((v) => !v)} filterKey={m.filterKey} duration={m.duration} onDuration={m.chooseDuration} planned={planned} />
  )
  const { currentProject, currentLabel, currentPlace } = m
  // The Open Loops move this screen serves (open-loops "References to the method").
  const methodMove = route.view === 'inbox' ? 'catch' as const : route.view === 'someday' ? 'place' as const : undefined
  // Today's planned and tracked totals sit in the header's meta, not a new row (time-tracking D4).
  const listedTasks = useMemo(() => (route.view === 'today' ? rows.map((r) => r.task) : []), [route.view, rows])
  const totals = useDayTotals(listedTasks, today, route.view === 'today')
  const todayMeta = [m.dt.formatDate(today, 'heading'), dayTotalsText(totals.planned, totals.tracked)].filter(Boolean).join(' · ')
  const meta = useWithMethod(methodMove, route.view === 'today' ? todayMeta : route.view === 'label' ? rows.length : planned > 0 ? <PlannedWithoutProject count={planned} /> : undefined)
  const methodSubtitle = useWithMethod(methodMove)
  const title = {
    inbox: t('Inbox'), today: t('Today'), upcoming: t('Upcoming'), someday: t('Someday'), anytime: t('Anytime'), completed: t('Completed'), assigned: t('Assigned to me'), project: currentProject?.name ?? t('Project'), label: currentLabel?.name ?? t('Label'),
    place: currentPlace?.name ?? t('Location'),
  }[route.view]

  if (route.view === 'project' && m.projects.length > 0 && !currentProject) return <MissingTarget kind="project" />
  if (route.view === 'label' && m.labels.length > 0 && (!currentLabel || currentLabel.deleted_at)) return <MissingTarget kind="label" />
  if (route.view === 'place' && currentPlace !== undefined && (!currentPlace || currentPlace.deleted_at)) return <MissingTarget kind="place" />

  return (
    <div ref={listRoot} className="min-w-0 px-4 py-5 md:px-8">
        <div className={PAGE_FRAME} data-page-body={board || timeline ? 'full' : m.fieldColumns ? 'wide' : 'list'} data-list-page>
          {route.view === 'project' && currentProject ? (
            <ProjectHeader project={currentProject} userId={userId} actions={pageActions} subtitle={board ? currentColumn : undefined}
              layout={<LayoutSwitch mode={viewMode} onChoose={chooseViewMode} />} />
          ) : (
            // The page header (ux-overhaul, app-shell "Page template"; task-list-presentation
            // "Nothing between the header and the list"): title, meta, actions, Help.
            <PageHeader title={title} help={HELP_SCREENS[route.view] ?? 'inbox'} actions={pageActions}
              leading={currentLabel && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: currentLabel.color }} />}
              meta={meta} subtitle={methodSubtitle}
              menu={route.view === 'label' && currentLabel ? <LabelMenu label={currentLabel} /> : undefined} />
          )}

          {route.view !== 'completed' && (
            <div className="mb-3 border-b border-default pb-2">
              {m.projectReadOnly ? <ReadOnlyQuickAdd /> : (
                <QuickAdd ref={quickAddRef} onAdd={onAdd} projects={m.projects} labels={m.labels} placeholder={placeholderFor(route, currentProject, currentLabel, currentPlace ?? undefined)} voiceShortcut />
              )}
            </div>
          )}

          <SelectionBar ids={ticked} onClear={selection.clear} menuOpen={actionsOpen && ticked.length > 0}
            onMenuOpenChange={onActionsOpen} startPicker={actionsPicker} />
          {actionsOpen && ticked.length === 0 && selectedId && (
            // `.` with nothing ticked: the same menu for the cursor task.
            <BulkActionsMenu ids={[selectedId]} open onOpenChange={onActionsOpen} startPicker={actionsPicker}
              trigger={<span className="sr-only">{t('Actions')}</span>} triggerClassName="sr-only" />
          )}

          {route.view === 'project' && currentProject && <ProjectNote project={currentProject} />}
          {route.view === 'project' && !board && <SubProjects projectId={route.id} />}
          {m.offerColumns && (
            // The list's columns layout (custom-fields): per project, on this device only.
            <div className="mb-1 flex justify-end">
              <Button variant="ghost" size="sm" icon="list" aria-pressed={!!m.columnsPref} data-columns-toggle
                className={m.columnsPref ? 'bg-sunken text-default dark:bg-raised' : undefined}
                onClick={() => projectId && saveListColumns(projectId, !m.columnsPref)}>
                {t('Columns')}
              </Button>
            </div>
          )}
          {rows.length === 0 && !(board || m.liveSections.length > 0) && (m.duration
            ? <FilteredEmpty onClear={() => m.chooseDuration(null)} />
            : <EmptyState view={route.view} waiting={groups.find((g) => g.key === 'blocked')?.count ?? 0} readOnly={m.projectReadOnly} onAdd={addFromEmpty}
                completed={!m.showCompleted && projectId && viewMode === 'list' ? [...m.doneBySection.values()].reduce((n, tasks) => n + tasks.length, 0) : 0}
                onShowCompleted={projectId ? () => act(saveShowCompleted(projectId, true)) : undefined} />)}

          {board && currentProject ? (
            <BoardView project={currentProject} columns={columns} editable={m.projectEditable} addingTo={addingTo} setAddingTo={ui.setAddingTo}
              projects={m.projects} labels={m.labels} renderCard={(task) => renderRow(flatRow(task))} onCurrentColumn={setCurrentColumn} />
          ) : timeline && currentProject ? (
            <TimelineView groups={groups} today={today} zone={m.zone} editable={m.projectEditable} selectedId={selectedId}
              onSelect={setSelectedId} onOpen={(id) => { setSelectedId(id); setOpenId(id) }} byId={taskMap} />
          ) : (
            <GroupedList groups={groups} view={route.view} project={currentProject} fieldColumns={m.fieldColumns} projectFieldDefs={m.projectFieldDefs}
              editable={m.projectEditable} renderRow={renderRow} addingTo={addingTo} setAddingTo={ui.setAddingTo} onToggleSection={toggleSection}
              doneBySection={m.showCompleted ? NO_DONE : m.doneBySection} revealed={revealed}
              completed={m.showCompleted && projectId ? { tasks: m.completedTasks, open: m.completedOpen, onToggle: () => m.toggleCollapsed(completedOpenKey(projectId)) } : undefined} toggleCollapsed={m.toggleCollapsed} collapsedGroups={collapsedGroups} projects={m.projects} labels={m.labels}
              onReveal={(key) => setRevealed((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })} />
          )}
          {route.view === 'today' && <CloseDayRow />}
          {m.logbook && <LogbookMore total={m.logbook.total} limit={m.logbookLimit} onMore={() => m.setLogbookLimit((n) => n + LOGBOOK_PAGE)} />}
          {route.view === 'project' && !board && !timeline && m.projectEditable && <div className="mb-4"><AddSection projectId={route.id} layout="list" /></div>}
        </div>
      {ui.prompt && <CompleteParentPrompt parent={ui.prompt} onAccept={acceptPrompt} onDismiss={() => setPrompt(null)} />}
      <RowPickerDialogs assignFor={ui.assignFor} pickerFor={ui.pickerFor} userId={userId} onCloseAssign={() => ui.setAssignFor(null)} onClosePicker={() => ui.setPickerFor(null)} />
    </div>
  )
}

/** The caret offset in the row's title under a click, or undefined (the editor puts it at the end). */
function caretFromClick(e: React.MouseEvent): number | undefined {
  const title = (e.currentTarget as Element).querySelector?.('[data-row-title]')
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }
  const pos = doc.caretPositionFromPoint?.(e.clientX, e.clientY)
  const range = !pos && document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null
  const node = pos?.offsetNode ?? range?.startContainer
  const offset = pos?.offset ?? range?.startOffset
  if (!title || !node || offset === undefined || !title.contains(node)) return undefined
  // Characters before the clicked text node within the title, plus the offset in it.
  let before = 0
  const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n && n !== node; n = walker.nextNode()) before += n.textContent?.length ?? 0
  return before + offset
}


// The task list (Inbox, Today, Upcoming, Someday, Anytime, Completed, Assigned to me,
// projects and labels). Since OpenSpec change web-component-structure this file only
// wires the pieces under ./task-list: the data (useListModel over lib/listGroups and
// lib/liveData), the keyboard (useListShortcuts), drag (useListDrag), the bindings to
// the panel and the Vim layer (useListBindings), and the bodies for the list, the
// board and the timeline.
import { useCallback, useMemo, useRef, useState } from 'react'
import { t } from '../lib/i18n'
import { getTask } from '../lib/liveData'
import { completedOpenKey, flatRow, sectionOfRows } from '../lib/listGroups'
import { LOGBOOK_PAGE } from '../lib/logbook'
import { moveTask } from '../lib/move'
import { createTask } from '../lib/ops'
import { effectiveSection, moveTaskToSection, nextViewMode, saveListColumns, saveViewMode, setSectionCollapsed, type ProjectViewMode } from '../lib/sections'
import { parentReadyToComplete } from '../lib/subtasks'
import type { AccountRole, Task } from '../lib/types'
import { Button, PageHeader } from '../ui'
import { act } from './actionError'
import { offerArchiveAfterCompletion } from './ArchivePrompt'
import { BoardView } from './BoardView'
import { BulkActionsMenu, SelectionBar } from './bulk/BulkActions'
import { useCollapsedGroups } from './collapsedGroups'
import { FirstRunCard, useFirstRun } from './FirstRun'
import { taskDefaults } from './listActions'
import { usePanelTaskId, setPanelTaskId as setOpenId } from './panel'
import { ProjectHeader } from './ProjectHeader'
import { ProjectNote } from './ProjectNote'
import { QuickAdd, type QuickAddInput } from './QuickAdd'
import type { Route } from './router'
import { AddSection } from './Sections'
import { useSelection } from './selection'
import { SubProjects } from './SubProjects'
import { TimelineView } from './TimelineView'
import { completeWithUndo } from './undoable'
import { CompleteParentPrompt, EmptyState, FilteredEmpty, LayoutSwitch, ListPageActions, MissingTarget, placeholderFor, ReadOnlyQuickAdd, RowPickerDialogs } from './task-list/ListChrome'
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
  // The first run (first-run "Three-step first run"): the Inbox shows the card instead of its empty state.
  const showFirstRun = useFirstRun() && route.view === 'inbox'
  const listRoot = useRef<HTMLDivElement>(null)
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
  const drag = useListDrag({ manual, source: { rows, sectionOfRow, tree: m.tree, board, sectionMap }, moveToSection, onDropped: setSelectedId })
  const { latestSectionMap } = drag

  // The view supplies defaults; attributes typed in the quick-add line override them.
  const onAdd = useCallback(async ({ labels: typed, ...rest }: QuickAddInput) => {
    // In Assigned to me a new task is yours (Inbox unless a #project was typed).
    const { labels: viewLabels, ...defaults } = taskDefaults(route, today, userId)
    // In Someday a line with a date is scheduled, not parked (someday-and-evening).
    if (rest.due || rest.deadline) delete defaults.start
    const id = await createTask({
      ...defaults,
      ...rest,
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
  })
  const rowActions = useListBindings({ ...shared, setSelectMode, startDrag: drag.startDrag, insertAfter, listRoot, projectReadOnly: m.projectReadOnly })

  const renderRow = rowRenderer({
    view: route.view, userId, projectMap: m.projectMap, labelMap: m.labelMap, memberMap: m.memberMap, selectedId, progress: m.progress, blocked: m.blocked,
    habits: m.habits, isReadOnly, board, manual, treeView: m.treeView, dropAt: drag.dropAt, draggingId: drag.draggingId, ticked: selection.ticked,
    showCheckbox: selectMode || selection.ticked.size > 0, fieldColumns: m.fieldColumns, projectFieldDefs: m.projectFieldDefs, siblingPos: m.siblingPos,
    actions: rowActions, addingUnder: ui.addingUnder, onCloseSubtask: () => ui.setAddingUnder(null),
  })

  const pageActions = (
    <ListPageActions route={route} userRole={userRole} rowCount={rows.length} topLevelCount={rows.filter((r) => r.depth === 0).length}
      selectMode={selectMode} onSelectMode={() => setSelectMode((v) => !v)} filterKey={m.filterKey} duration={m.duration} onDuration={m.chooseDuration} />
  )
  const { currentProject, currentLabel } = m
  const title = {
    inbox: t('Inbox'), today: t('Today'), upcoming: t('Upcoming'), someday: t('Someday'), anytime: t('Anytime'), completed: t('Completed'), assigned: t('Assigned to me'), project: currentProject?.name ?? t('Project'), label: currentLabel?.name ?? t('Label'),
  }[route.view]

  if (route.view === 'project' && m.projects.length > 0 && !currentProject) return <MissingTarget kind="project" />
  if (route.view === 'label' && m.labels.length > 0 && (!currentLabel || currentLabel.deleted_at)) return <MissingTarget kind="label" />

  return (
    <div ref={listRoot} className="min-w-0 px-4 py-5 md:px-8">
        <div className={board || timeline ? 'mx-auto' : m.fieldColumns ? 'mx-auto max-w-6xl' : 'mx-auto max-w-3xl'} data-list-page>
          {route.view === 'project' && currentProject ? (
            <ProjectHeader project={currentProject} userId={userId} actions={pageActions} subtitle={board ? currentColumn : undefined}
              layout={<LayoutSwitch mode={viewMode} onChoose={chooseViewMode} />} />
          ) : (
            // The page header (ux-overhaul, app-shell "Page template"; task-list-presentation
            // "Nothing between the header and the list"): title, meta, actions, Help.
            <PageHeader title={title} help={HELP_SCREENS[route.view] ?? 'inbox'} actions={pageActions}
              leading={currentLabel && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: currentLabel.color }} />}
              meta={route.view === 'today' ? m.dt.formatDate(today, 'heading') : route.view === 'label' ? rows.length : undefined} />
          )}

          {route.view !== 'completed' && (
            <div className="mb-3 border-b border-default pb-2">
              {m.projectReadOnly ? <ReadOnlyQuickAdd /> : (
                <QuickAdd ref={quickAddRef} onAdd={onAdd} projects={m.projects} labels={m.labels} placeholder={placeholderFor(route, currentProject, currentLabel)} voiceShortcut />
              )}
            </div>
          )}

          {showFirstRun && <FirstRunCard onFocusQuickAdd={focusQuickAdd} />}

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
          {rows.length === 0 && !showFirstRun && !(board || m.liveSections.length > 0) && (m.duration
            ? <FilteredEmpty onClear={() => m.chooseDuration(null)} />
            : <EmptyState view={route.view} waiting={groups.find((g) => g.key === 'blocked')?.count ?? 0} readOnly={m.projectReadOnly} onAdd={focusQuickAdd} />)}

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
          {m.logbook && <LogbookMore total={m.logbook.total} limit={m.logbookLimit} onMore={() => m.setLogbookLimit((n) => n + LOGBOOK_PAGE)} />}
          {route.view === 'project' && !board && !timeline && m.projectEditable && <div className="mb-4"><AddSection projectId={route.id} layout="list" /></div>}
        </div>
      {ui.prompt && <CompleteParentPrompt parent={ui.prompt} onAccept={acceptPrompt} onDismiss={() => setPrompt(null)} />}
      <RowPickerDialogs assignFor={ui.assignFor} pickerFor={ui.pickerFor} userId={userId} onCloseAssign={() => ui.setAssignFor(null)} onClosePicker={() => ui.setPickerFor(null)} />
    </div>
  )
}

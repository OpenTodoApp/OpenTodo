// The task list (Inbox, Today, Upcoming, Someday, Anytime, Completed, Assigned to me,
// projects and labels) as the desktop draws it. The list's wiring is the hook
// useListScreen (./task-list/useListScreen, OpenSpec changes web-component-structure
// and phone-lists D1), shared with the phone list; this file draws the header, the add
// row, the rows (TaskRow) and the bodies for the list, the board and the timeline.
import { TodayStrip } from './habits/TodayStrip'
import { CloseDayRow } from './CloseDayRow'
import { Suspense, useRef, type CSSProperties } from 'react'
import { lazy, preloadable } from '../lib/lazy'
import { ProjectCalendarLayout } from './task-list/listExtras'
import { t } from '../lib/i18n'
import { completedOpenKey, flatRow } from '../lib/listGroups'
import { canEditTasks, roleOf } from '../lib/sharing'
import { LOGBOOK_PAGE } from '../lib/logbook'
import { setCompletedDisplay } from '../lib/completedDisplay'
import { saveListColumns } from '../lib/sections'
import type { AccountRole, Task } from '../lib/types'
import { Button, frameKind, hueFor, PAGE_FRAME, Skeleton, useFinePointer } from '../ui'
import { BoardView } from './BoardView'
import { UrgencyContext } from './useUrgency'
import { BulkActionsMenu, ListReorderContext, SelectionBar } from './bulk/BulkActions'
import { EarlierActions } from './task-list/EarlierActions'
import { setPanelTaskId as setOpenId } from './panel'
import { ProjectHeader } from './ProjectHeader'
import { ProjectNote } from './ProjectNote'
import { LinkedRefs } from './Markdown'
import { useListSwipe } from './task-list/RowSwipe'
import { QuickAdd } from './QuickAdd'
import { AddSection } from './Sections'
import { SubProjectsGroup, subProjectLead } from './SubProjects'
import { CompleteParentPrompt, EmptyState, FilteredEmpty, HiddenNote, LayoutSwitch, ListPageActions, MissingTarget, phoneGroups, placeholderFor, ReadOnlyQuickAdd, RowPickerDialogs } from './task-list/ListChrome'
import { GroupedList, LogbookMore, useRowRenderer } from './task-list/ListGroups'
import { STICKY_QUICK_ADD, useStickyQuickAdd } from './task-list/stickyQuickAdd'
import { useAddLines } from './task-list/belowLine'
import type { ListRoute } from './task-list/useListModel'
import { useListScreen } from './task-list/useListScreen'
import { ListHeader } from './task-list/ListHeader'
import { TodayAgenda } from './calendar/TodayAgenda'
import { UpcomingEventsNote } from './calendar/UpcomingAgenda'
import { RoutinesInboxSlot } from './routines/InboxSlot'
import { isReusable } from '../lib/reusable'

export { BLOCKED_OPEN_KEY } from '../lib/listGroups'


/**
 * The list's frame (page-rhythm D3): a project is a layout page (one 80 rem frame for
 * list, board and timeline; its list spans 72 rem); every other list is standalone.
 * Both start at the column's left edge, so opening the panel moves neither (list-stays-still).
 */
function useListFrame(layoutPage: boolean, full: boolean, fieldColumns: boolean) {
  const width = full ? 'full' as const : fieldColumns || layoutPage ? 'wide' as const : 'list' as const
  return { width, kind: frameKind(width, layoutPage ? 'layout' : 'standalone') }
}

/** Today's Earlier group header actions (page-rhythm D6). */
const earlierActions = (ids: readonly string[]) => <EarlierActions ids={ids} />


/** With the Completed group on (project-completed-section), sections offer no "n completed" of their own. */
const NO_DONE: Map<string, Task[]> = new Map()

// The Completed view's controls load with the view (completed-view-review: bundle budget).
// A project's timeline layout loads with it (fetched ahead by the shell once idle).
const TimelineView = preloadable(() => import('./TimelineView').then((m) => ({ default: m.TimelineView })))
export const preloadTimeline = TimelineView.preload
const CompletedSearch = lazy(() => import('./completed/CompletedBar').then((m) => ({ default: m.CompletedSearch })))

export function TaskListView({ route, userId, userRole }: { route: ListRoute; userId?: string; userRole?: AccountRole }) {
  const s = useListScreen(route, userId, userRole)
  const {
    m, workspaceName, rows, taskGroups, groups, columns, board, timeline, projectId, today, taskMap, isReadOnly, viewMode,
    upcomingCal, selectedId, setSelectedId, currentColumn, setCurrentColumn, revealed, setRevealed, collapsedGroups, summarised,
    selection, ticked, contextIds, inline, renderInline, ui, actions, actionsFrom, selectMode, setSelectMode, addingTo, expandedId, rowMenu,
    quickAddRef, listRoot, toggleViewMode, chooseViewMode, toggleSection, dayOrderIds, ownOrder, manual, drag, onAdd, onAddMany,
    setPrompt, acceptPrompt, rowActions, edgeOf, boardGroups, queryFilter, queryHost, cardNotes, own, hiddenDone, showCompleted,
    displayControl, completedNarrowed, currentProject, currentLabel, currentPlace, phone, room, phoneActions, meta, methodSubtitle, title, agenda, ready, briefing,
  } = s
  const quickAddRow = useRef<HTMLDivElement>(null)
  const fine = useFinePointer()
  const renderRow = useRowRenderer({
    view: route.view, labelId: route.view === 'label' ? route.id : undefined, userId, projectMap: m.projectMap, labelMap: m.labelMap, memberMap: m.memberMap, selectedId, progress: m.progress, blocked: m.blocked, flow: m.flow,
    habits: m.habits, isReadOnly, board, manual, ownOrder: !!ownOrder, dayOrderIds, treeView: m.treeView || m.nested, dropAt: drag.dropAt, draggingId: drag.draggingId, ticked: selection.ticked,
    showCheckbox: selectMode || (fine && selection.ticked.size > 0), selectMode, fieldColumns: m.fieldColumns, projectFieldDefs: m.projectFieldDefs, siblingPos: m.siblingPos,
    timeColumn: m.timeColumn, slotsOff: m.slotsOff, rowLayout: m.display?.rowLayout, actions: rowActions, ...useAddLines(rows, ui), edgeOf, cardNotes,
    inlineId: inline?.id ?? null, renderInline, expandedId, swipe: useListSwipe(listRoot, !fine && selection.ticked.size === 0 && !selectMode && !board, rows.length),
    swipeEditTitle: !timeline,
    editInPlace: !board && !timeline,
  })
  const pageActions = (
    <ListPageActions route={route} userRole={userRole} rowCount={own.length} extra={displayControl}
      selectMode={selectMode} onSelectMode={() => setSelectMode((v) => !v)} filterKey={m.filterKey} duration={m.duration} onDuration={m.chooseDuration} queryFilter={queryFilter} />
  )
  const frame = useListFrame(route.view === 'project', board || timeline, m.fieldColumns)
  // Measured once the list (and its quick add row) is on screen.
  const quickAddTop = useStickyQuickAdd(quickAddRow, ready && route.view !== 'completed')
  if (route.view === 'project' && m.projects.length > 0 && !currentProject) return <MissingTarget kind="project" />
  if (route.view === 'label' && m.labels.length > 0 && (!currentLabel || currentLabel.deleted_at)) return <MissingTarget kind="label" />
  if (route.view === 'place' && currentPlace !== undefined && (!currentPlace || currentPlace.deleted_at)) return <MissingTarget kind="place" />
  if (!ready) return <div className="min-w-0 px-4 py-5 md:px-8" data-list-loading />
  if (route.view === 'project' && currentProject && viewMode === 'calendar') return <ProjectCalendarLayout project={currentProject} userId={userId} onCycle={toggleViewMode} onChoose={chooseViewMode} layout={<LayoutSwitch mode={viewMode} onChoose={chooseViewMode} />} />

  return (
    <ListReorderContext.Provider value={s.listReorder}><UrgencyContext.Provider value={m.urgency}><div ref={room} className="min-w-0 px-4 py-5 [--page-head-top:--spacing(5)] md:px-8">
        <div className={PAGE_FRAME} data-page-body={frame.width} data-page-frame={frame.kind} data-page-gutter="outside" data-list-page
          data-page-project={route.view === 'project' ? '' : undefined}>
          {route.view === 'project' && currentProject ? (
            <ProjectHeader project={currentProject} userId={userId} actions={pageActions} subtitle={board ? currentColumn : undefined} extraGroups={boardGroups} print={!board && !timeline}
              phone={phone ? { slots: phoneActions.slots, groups: phoneGroups(phoneActions.projectItems) } : undefined}
              layout={<LayoutSwitch mode={viewMode} onChoose={chooseViewMode} />} />
          ) : (
            <ListHeader route={route} title={title} label={currentLabel} meta={meta} subtitle={methodSubtitle} briefing={briefing} actions={pageActions} phone={phone ? phoneActions : null} agenda={agenda.toggle} upcomingEvents={upcomingCal.toggle} />
          )}

          {route.view === 'completed' && <Suspense fallback={<div className="mb-3 h-9" />}><CompletedSearch value={m.completedQuery} onChange={m.setCompletedQuery} /></Suspense>}
          {route.view !== 'completed' && (
            // Sticks under the page header from 768 px, so adding never needs a scroll back up (add-position D4).
            <div ref={quickAddRow} style={{ top: quickAddTop.top, '--below-head-gap': `${quickAddTop.gap}px` } as CSSProperties} className={`mb-3 pb-2 ${STICKY_QUICK_ADD}`} data-quick-add-row>
              {m.projectReadOnly ? <ReadOnlyQuickAdd /> : (
                <QuickAdd ref={quickAddRef} onAdd={onAdd} onAddMany={onAddMany} reuseProjectId={isReusable(currentProject) ? currentProject!.id : null} projects={m.projects} labels={m.labels} placeholder={placeholderFor(route, currentProject, currentLabel, currentPlace ?? undefined, workspaceName, phone)} voiceShortcut />
              )}
            </div>
          )}
          {agenda.toggle && <TodayAgenda cal={agenda.cal} zone={m.zone} />}{m.todayHabits && <TodayStrip tasks={m.allTasks} projects={m.projects} today={today} />}

          <SelectionBar ids={ticked} onClear={selection.clear} menuOpen={actions.forTicked}
            onMenuOpenChange={actions.onOpenChange} startPicker={actions.picker} onDone={selectMode ? () => setSelectMode(false) : undefined} />
          {actions.forCursor && selectedId && ( // `.` with nothing ticked: the same menu for the cursor task.
            <BulkActionsMenu ids={[selectedId]} open onOpenChange={actions.onOpenChange} startPicker={actions.picker} anchor={actionsFrom}
              {...s.menuItems} expandedId={expandedId}
              trigger={<span className="sr-only">{t('Actions')}</span>} triggerClassName="sr-only" />
          )}
          {rowMenu.element}{queryHost}

          {route.view === 'project' && currentProject && <><ProjectNote project={currentProject} phone={phone} /><LinkedRefs kind="project" id={currentProject.id} folded /></>}
          {timeline && <SubProjectsGroup groups={subProjectLead(taskGroups) ?? []} projects={m.projects} toggle={m.toggleCollapsed} />}
          {m.offerColumns && <ColumnsToggle on={!!m.columnsPref} onToggle={() => projectId && saveListColumns(projectId, !m.columnsPref)} />}
          {own.length === 0 && !upcomingCal.hasEvents && !taskGroups.find((g) => g.key === 'all')?.folded && !(board || m.liveSections.length > 0) && (m.duration || m.queryFilter?.query || completedNarrowed
            ? <FilteredEmpty onClear={() => { m.chooseDuration(null); m.queryFilter?.setQuery(''); m.setCompletedQuery(''); if (completedNarrowed) setCompletedDisplay({ projects: [] }) }} />
            : <EmptyState view={route.view} waiting={groups.find((g) => g.key === 'blocked')?.count ?? 0} readOnly={m.projectReadOnly}
                completed={hiddenDone} onShowCompleted={showCompleted} />)}

          {board && currentProject ? (
            <BoardView project={currentProject} columns={columns} editable={m.projectEditable} addingTo={addingTo} setAddingTo={ui.setAddingTo}
              projects={m.projects} labels={m.labels} renderCard={(task) => renderRow(flatRow(task))} onCurrentColumn={setCurrentColumn} placeholder={drag.placeholder} onFold={toggleSection} />
          ) : timeline && currentProject ? (
            <Suspense fallback={<Skeleton shape="row" count={4} />}><TimelineView groups={upcomingCal.groups} today={today} zone={m.zone} editable={m.projectEditable} selectedId={selectedId}
              onSelect={setSelectedId} onOpen={(id) => { setSelectedId(id); setOpenId(id) }} byId={taskMap} hue={hueFor(currentProject.color)} /></Suspense>
          ) : (
            <GroupedList groups={groups} view={route.view} project={currentProject} fieldColumns={m.fieldColumns} projectFieldDefs={m.projectFieldDefs} siblingPos={(m.treeView || m.nested) && !board ? m.siblingPos : undefined} reveal={selectedId} todayDropTarget={ownOrder?.todayDrop?.canEdit} activeTodayDrop={drag.dropGroup}
              contextualDrag={!!drag.draggingId && contextIds.has(drag.draggingId)}
              editable={m.projectEditable} canEdit={(id) => canEditTasks(roleOf(id, m.memberMap))} renderRow={renderRow} addingTo={addingTo} setAddingTo={ui.setAddingTo} onToggleSection={toggleSection}
              doneBySection={m.showCompleted ? NO_DONE : m.doneBySection} revealed={revealed}
              completed={m.showCompleted && projectId ? { tasks: m.completedTasks, open: m.completedOpen, onToggle: () => m.toggleCollapsed(completedOpenKey(projectId)) } : undefined} toggleCollapsed={m.toggleCollapsed} collapsedGroups={collapsedGroups} projects={m.projects} labels={m.labels}
              earlierActions={route.view === 'today' || m.upcomingToday ? earlierActions : undefined}
              eventsFor={upcomingCal.eventsFor} summarised={summarised}
              onReveal={(key) => setRevealed((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })} />
          )}
          {upcomingCal.hasEvents && <UpcomingEventsNote status={upcomingCal.status} fetchedAt={upcomingCal.fetchedAt} />}
          {own.length > 0 && hiddenDone > 0 && showCompleted && !board && !timeline && <HiddenNote count={hiddenDone} onShow={showCompleted} />}
          {route.view === 'today' && <CloseDayRow />}{route.view === 'inbox' && <RoutinesInboxSlot />}
          {m.logbook && <LogbookMore total={m.logbook.total} limit={m.logbookLimit} onMore={() => m.setLogbookLimit((n) => n + LOGBOOK_PAGE)} />}
          {route.view === 'project' && !board && !timeline && m.projectEditable && <div className="mb-4"><AddSection projectId={route.id} layout="list" /></div>}
        </div>
      {ui.prompt && <CompleteParentPrompt parent={ui.prompt} onAccept={acceptPrompt} onDismiss={() => setPrompt(null)} />}
      <RowPickerDialogs assignFor={ui.assignFor} pickerFor={ui.pickerFor} userId={userId} onCloseAssign={() => ui.setAssignFor(null)} onClosePicker={() => ui.setPickerFor(null)} />
    </div></UrgencyContext.Provider></ListReorderContext.Provider>
  )
}

/** The list's columns layout (custom-fields): per project, on this device only. */
function ColumnsToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div className="mb-1 flex justify-end">
      <Button variant="ghost" size="sm" icon="list" aria-pressed={on} data-columns-toggle onClick={onToggle}>
        {t('Columns')}
      </Button>
    </div>
  )
}

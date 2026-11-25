// The task list (Inbox, Today, Upcoming, Someday, Anytime, Completed, Assigned to me,
// projects and labels) as the desktop draws it. The list's wiring is the hook
// useListScreen (./task-list/useListScreen, OpenSpec changes web-component-structure
// and phone-lists D1), shared with the phone list; this file draws the header, the add
// row, the rows (TaskRow) and the bodies for the list, the board and the timeline.
import { TodayStrip } from './habits/TodayStrip'
import { CloseDayRow } from './CloseDayRow'
import { Suspense, useRef, type CSSProperties, type ReactNode } from 'react'
import { lazy, preloadable } from '../lib/lazy'
import { ProjectCalendarLayout } from './task-list/listExtras'
import { t } from '../lib/i18n'
import { useMemberships, useUserPrefsRow } from '../lib/localData'
import { briefingHidden, othersTasksShown, setBriefingShown, setOthersTasksShown, setTodayEventsShown, setUpcomingEventsShown, setUpcomingStartsWithToday, upcomingStartsWithToday } from '../lib/userPrefs'
import { completedOpenKey, flatRow } from '../lib/listGroups'
import { canEditTasks, roleOf, useMe } from '../lib/sharing'
import { LOGBOOK_PAGE } from '../lib/logbook'
import { setCompletedDisplay } from '../lib/completedDisplay'
import { saveListColumns } from '../lib/sections'
import type { AccountRole, Label, Task } from '../lib/types'
import { Button, DESKTOP_HEADER_QUERY, frameKind, hueFor, MenuGroup, MenuItem, MenuSeparator, PAGE_FRAME, PageHeader, Skeleton, useFinePointer, useMediaQuery } from '../ui'
import { openAssistantWith, useAssistantStatus } from '../lib/assistantStatus'
import { act } from './actionError'
import { AwayHost, AwayMenuItems } from './away/AwayMenu'
import { BoardView } from './BoardView'
import { BriefingText } from './Briefing'
import type { Briefing } from '../lib/briefing'
import { UrgencyContext } from './useUrgency'
import { BulkActionsMenu, ListReorderContext, SelectionBar } from './bulk/BulkActions'
import { EarlierActions } from './task-list/EarlierActions'
import { setPanelTaskId as setOpenId } from './panel'
import { ProjectHeader } from './ProjectHeader'
import { LabelMenu } from './LabelsView'
import { ProjectNote } from './ProjectNote'
import { LinkedRefs } from './Markdown'
import { useListSwipe } from './task-list/RowSwipe'
import { QuickAdd } from './QuickAdd'
import type { Route } from './router'
import { AddSection } from './Sections'
import { SubProjectsGroup, subProjectLead } from './SubProjects'
import { CompleteParentPrompt, EmptyState, FilteredEmpty, HiddenNote, LayoutSwitch, ListPageActions, MissingTarget, type PhoneItem, PhoneMenuItems, phoneGroups, placeholderFor, ReadOnlyQuickAdd, RowPickerDialogs } from './task-list/ListChrome'
import { GroupedList, LogbookMore, useRowRenderer } from './task-list/ListGroups'
import { ProjectionsMenuItem } from './calendar/projectionSwitches'
import { STICKY_QUICK_ADD, useStickyQuickAdd } from './task-list/stickyQuickAdd'
import { useAddLines } from './task-list/belowLine'
import type { ListRoute } from './task-list/useListModel'
import { useListScreen } from './task-list/useListScreen'
import { InboxMenu } from './SampleNotice'
import { canPrint, PrintMenuItem } from './menus/printItem'
import { TodayAgenda } from './calendar/TodayAgenda'
import { UpcomingEventsNote } from './calendar/UpcomingAgenda'
import { RoutinesInboxSlot } from './routines/InboxSlot'
import { ClosedListMenuItems } from './task-list/ClosedListActions'
import { ReplanTodayItem } from './calendar/ReplanMenuItem'
import { closedListOffered } from '../lib/closedListPrefs'
import { dayPartsOn, setDayParts } from '../lib/dayParts'
import { readMethodMode } from '../lib/method/mode'
import { isReusable } from '../lib/reusable'

export { BLOCKED_OPEN_KEY } from '../lib/listGroups'

/** The guide section of each list page (user-documentation "Contextual help"); projects use their header's. */
const HELP_SCREENS: Partial<Record<Route['view'], string>> = {
  inbox: 'inbox', today: 'today', upcoming: 'upcoming', anytime: 'anytime', someday: 'someday', completed: 'completed', assigned: 'assigned', label: 'label',
}


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
    selection, ticked, contextIds, inline, renderInline, editTitle, ui, actions, actionsFrom, selectMode, setSelectMode, addingTo, expandedId, rowMenu,
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
    swipeEditTitle: !useMediaQuery(DESKTOP_HEADER_QUERY) && !timeline,
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
              editTitle={board || timeline ? undefined : editTitle}
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
      <Button variant="ghost" size="sm" icon="list" aria-pressed={on} data-columns-toggle
        className={on ? 'bg-sunken text-default dark:bg-raised' : undefined} onClick={onToggle}>
        {t('Columns')}
      </Button>
    </div>
  )
}


/**
 * The page header of a list that is not a project (ux-overhaul, app-shell "Page template";
 * task-list-presentation "Nothing between the header and the list"): title, meta, actions,
 * Help. On a phone the actions are the bar's slots and the rest joins its menu (phone-v2 D1).
 */
function ListHeader({ route, title, label, meta, subtitle, briefing, actions, phone, agenda, upcomingEvents }: {
  route: ListRoute
  title: string
  label?: Label
  meta: ReactNode
  subtitle: ReactNode
  /** A day page's briefing, read before the list is shown (today-no-shift). */
  briefing: Briefing | null
  actions: ReactNode
  phone: { slots: ReactNode; items: PhoneItem[] } | null
  /** Today's calendar events option (today-agenda D2): undefined when not offered, else whether it is on. */
  agenda?: boolean
  /** Upcoming's calendar events option: undefined when not offered, else whether it is on. */
  upcomingEvents?: boolean
}) {
  const items = phone?.items ?? []
  // The briefing under a day page's title (OpenSpec change briefing), unless the account hid it (briefing-links D4).
  const day = route.view === 'today' || route.view === 'upcoming'
  const hidden = briefingHidden(useUserPrefsRow())
  const menu = route.view === 'label' && label ? <LabelMenu label={label} extra={phoneGroups(items)} />
    : route.view === 'inbox' ? <InboxMenu extra={items.length > 0 ? <PhoneMenuItems items={items} /> : undefined} /> : undefined
  const toggle = day && (
    <MenuItem icon={hidden ? 'eye' : 'eye-off'} label={hidden ? t('Show briefing') : t('Hide briefing')} data-briefing-toggle
      onSelect={() => act(setBriefingShown(hidden))} />
  )
  // Day parts (day-parts D4): offered here in the method modes; Settings has it in every mode.
  const prefs = useUserPrefsRow()
  const mode = readMethodMode(prefs)
  const partsOn = dayPartsOn(prefs)
  const partsItem = route.view === 'today' && mode !== 'lists' && (
    <MenuItem icon="sun" label={partsOn ? t('Stop grouping by part of the day') : t('Group by part of the day')} data-day-parts-toggle
      onSelect={() => act(setDayParts(!partsOn))} />
  )
  // The closed list (today-closed-list D5): in the method modes, or once a limit is set.
  const closedItems = route.view === 'today' && closedListOffered(prefs) && <ClosedListMenuItems prefs={prefs} />
  // Start with Today (upcoming-start-with-today D1): Today's own groups lead Upcoming; synced per account.
  const withToday = upcomingStartsWithToday(prefs)
  const startItem = route.view === 'upcoming' && (
    <MenuItem icon="sun" label={t('Start with Today')} checked={withToday} description={t('Show Today’s tasks before Tomorrow')} data-upcoming-today-toggle
      onSelect={() => act(setUpcomingStartsWithToday(!withToday))} />
  )
  const agendaItem = agenda !== undefined && (
    <MenuItem icon="calendar-range" label={agenda ? t('Hide calendar events') : t('Show calendar events')} data-today-events-toggle
      onSelect={() => act(setTodayEventsShown(!agenda))} />
  )
  const upcomingItem = upcomingEvents !== undefined && (
    <MenuItem icon="calendar-range" label={upcomingEvents ? t('Hide calendar events') : t('Show calendar events')} data-upcoming-events-toggle
      onSelect={() => act(setUpcomingEventsShown(!upcomingEvents))} />
  )
  // Show tasks assigned to others (others-tasks-toggle D3): the personal lists, in a shared workspace; checked while on.
  const me = useMe()
  const shared = useMemberships().some((ms) => (ms.members ?? []).some((u) => !!me && !!u.userId && u.userId !== me))
  const othersShown = othersTasksShown(prefs)
  const othersItem = shared && (day || route.view === 'anytime' || route.view === 'someday') && (
    <MenuItem icon="eye" label={t('Show tasks assigned to others')} checked={othersShown} data-others-tasks-toggle
      onSelect={() => act(setOthersTasksShown(!othersShown))} />
  )
  // Brief me (assistant-in-context): the brief-today skill, from Today while the assistant is available.
  const assistantAvailable = !!useAssistantStatus()?.available
  const briefItem = route.view === 'today' && assistantAvailable && (
    <MenuGroup label={t('Assistant')}>
      <MenuItem icon="sparkles" label={t('Brief me')} data-assistant-brief onSelect={() => openAssistantWith({ skill: 'brief-today', text: t('Brief me'), send: true })} />
    </MenuGroup>
  )
  const phoneItems = route.view !== 'inbox' && route.view !== 'label' && items.length > 0 ? <PhoneMenuItems items={items} /> : null
  const own = phoneItems || toggle || othersItem ? <>{phoneItems}{phoneItems && (toggle || othersItem) && <MenuSeparator />}{toggle}{othersItem}{startItem}{route.view === 'upcoming' && <ProjectionsMenuItem surface="upcoming" />}{upcomingItem}{agendaItem}{partsItem}{closedItems}{route.view === 'today' && <><ReplanTodayItem /><AwayMenuItems /></>}{briefItem}</> : briefItem || null
  // Print… ends every list's menu (print-lists); the Inbox and a label have their own menu.
  return (
    <>
      <PageHeader title={title} help={HELP_SCREENS[route.view] ?? 'inbox'} actions={phone ? phone.slots : actions} barActions={!!phone}
        overflow={menu || (!own && !canPrint()) ? undefined : <>{own}{own && canPrint() && <MenuSeparator />}<PrintMenuItem /></>}
        leading={label && <span className="h-3 w-3 rounded-full bg-hue-solid" data-hue={hueFor(label.color)} />}
        meta={meta} subtitle={subtitle} menu={menu} kind={route.view === 'today' || route.view === 'upcoming' ? 'day' : 'tool'}
        briefing={briefing && <BriefingText briefing={briefing} />} />
      {route.view === 'today' && <AwayHost />}
    </>
  )
}

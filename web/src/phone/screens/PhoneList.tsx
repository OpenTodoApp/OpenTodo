// A task list on a phone (OpenSpec change phone-lists): the Inbox, Today, Upcoming,
// Anytime, Someday, Assigned to me, Completed, a label, a place and a project in its
// List layout. The list is the one the desktop screen wires (useListScreen), so the
// tasks, groups, order, selection, drag and every write are the same; this file
// draws it for a phone: the phone header, each list's own parts, the groups with the
// phone row, the selection bar and the prompts. No add line: the add button adds.
import { Suspense } from 'react'
import { lazy } from '../../lib/lazy'
import { setCompletedDisplay } from '../../lib/completedDisplay'
import { completedOpenKey } from '../../lib/listGroups'
import { LOGBOOK_PAGE } from '../../lib/logbook'
import { canEditTasks, roleOf } from '../../lib/sharing'
import type { AccountRole } from '../../lib/types'
import { useMediaQuery } from '../../ui'
import { BulkActionsMenu, ListReorderContext, SelectionBar } from '../../app/bulk/BulkActions'
import { TodayAgenda } from '../../app/calendar/TodayAgenda'
import { UpcomingEventsNote } from '../../app/calendar/UpcomingAgenda'
import { CloseDayRow } from '../../app/CloseDayRow'
import { TodayStrip } from '../../app/habits/TodayStrip'
import { LinkedRefs } from '../../app/Markdown'
import { ProjectHeader } from '../../app/ProjectHeader'
import { ProjectNote } from '../../app/ProjectNote'
import { RoutinesInboxSlot } from '../../app/routines/InboxSlot'
import { AddSection } from '../../app/Sections'
import { useAddLines } from '../../app/task-list/belowLine'
import { EarlierActions } from '../../app/task-list/EarlierActions'
import { CompleteParentPrompt, EmptyState, FilteredEmpty, HiddenNote, MissingTarget, phoneGroups, RowPickerDialogs } from '../../app/task-list/ListChrome'
import { GroupedList, LogbookMore, useRowRenderer } from '../../app/task-list/ListGroups'
import { ListHeader } from '../../app/task-list/ListHeader'
import { useListSwipe } from '../../app/task-list/RowSwipe'
import type { ListRoute } from '../../app/task-list/useListModel'
import { useListScreen } from '../../app/task-list/useListScreen'
import { UrgencyContext } from '../../app/useUrgency'
import { t } from '../../lib/i18n'
import { PhoneChrome } from '../PhoneChrome'

const CompletedSearch = lazy(() => import('../../app/completed/CompletedBar').then((m) => ({ default: m.CompletedSearch })))

const NO_DONE = new Map<string, never[]>()
const earlierActions = (ids: readonly string[]) => <EarlierActions ids={ids} />

export function PhoneList({ route, userId, userRole, onMenu }: { route: ListRoute; userId?: string; userRole?: AccountRole; onMenu: () => void }) {
  const s = useListScreen(route, userId, userRole)
  const { m, rows, taskGroups, groups, projectId, today, isReadOnly, upcomingCal, selectedId, revealed, setRevealed, collapsedGroups, summarised,
    selection, ticked, contextIds, inline, ui, actions, actionsFrom, selectMode, setSelectMode, addingTo, rowMenu, ownOrder, manual, drag, own, hiddenDone, showCompleted,
    completedNarrowed, currentProject, currentLabel, currentPlace, phoneActions, agenda } = s
  const coarse = useMediaQuery('(pointer: coarse)')
  const renderRow = useRowRenderer({
    view: route.view, labelId: route.view === 'label' ? route.id : undefined, userId, projectMap: m.projectMap, labelMap: m.labelMap, memberMap: m.memberMap, selectedId, progress: m.progress, blocked: m.blocked, flow: m.flow,
    habits: m.habits, isReadOnly, board: false, manual, ownOrder: !!ownOrder, dayOrderIds: s.dayOrderIds, treeView: m.treeView || m.nested, dropAt: drag.dropAt, draggingId: drag.draggingId, ticked: selection.ticked,
    showCheckbox: selectMode, selectMode, fieldColumns: false, projectFieldDefs: m.projectFieldDefs, siblingPos: m.siblingPos,
    timeColumn: false, slotsOff: m.slotsOff, rowLayout: m.display?.rowLayout, actions: s.rowActions, ...useAddLines(rows, ui), edgeOf: s.edgeOf, cardNotes: s.cardNotes,
    inlineId: inline?.id ?? null, renderInline: s.renderInline, expandedId: null, swipe: useListSwipe(s.listRoot, coarse && selection.ticked.size === 0 && !selectMode, rows.length),
    swipeEditTitle: false,
  })

  if (route.view === 'project' && m.projects.length > 0 && !currentProject) return <MissingTarget kind="project" />
  if (route.view === 'label' && m.labels.length > 0 && (!currentLabel || currentLabel.deleted_at)) return <MissingTarget kind="label" />
  if (route.view === 'place' && currentPlace !== undefined && (!currentPlace || currentPlace.deleted_at)) return <MissingTarget kind="place" />
  if (!s.ready) return <div className="min-h-full bg-canvas" data-list-loading />

  return (
    <ListReorderContext.Provider value={s.listReorder}><UrgencyContext.Provider value={m.urgency}><PhoneChrome onMenu={onMenu}>
      <div ref={s.room} data-phone-screen="list" data-phone-list={route.view} className="min-h-full bg-canvas pb-6">
        <div className="px-4" data-phone-list-body>
        {route.view === 'project' && currentProject ? (
            <ProjectHeader project={currentProject} userId={userId} extraGroups={s.boardGroups} print
              phone={{ slots: phoneActions.slots, groups: phoneGroups(phoneActions.projectItems) }} />
          ) : (
            <ListHeader route={route} title={s.title} label={currentLabel} meta={s.meta} subtitle={s.methodSubtitle} briefing={s.briefing} actions={null} phone={phoneActions} agenda={agenda.toggle} upcomingEvents={upcomingCal.toggle} />
          )}

          {route.view === 'completed' && <Suspense fallback={<div className="mb-3 h-9" />}><CompletedSearch value={m.completedQuery} onChange={m.setCompletedQuery} /></Suspense>}
          {agenda.toggle && <TodayAgenda cal={agenda.cal} zone={m.zone} />}{m.todayHabits && <TodayStrip tasks={m.allTasks} projects={m.projects} today={today} />}

          {/* Close ends the selection whole (phone-lists "Selecting tasks"): nothing stays ticked behind rows that show their checks again. */}
          <SelectionBar ids={ticked} onClear={selection.clear} menuOpen={actions.forTicked}
            onMenuOpenChange={actions.onOpenChange} startPicker={actions.picker} onDone={selectMode ? () => { selection.clear(); setSelectMode(false) } : undefined} />
          {actions.forCursor && selectedId && (
            <BulkActionsMenu ids={[selectedId]} open onOpenChange={actions.onOpenChange} startPicker={actions.picker} anchor={actionsFrom} editTitle={s.editTitle}
              trigger={<span className="sr-only">{t('Actions')}</span>} triggerClassName="sr-only" />
          )}
          {rowMenu.element}{s.queryHost}

          {route.view === 'project' && currentProject && <><ProjectNote project={currentProject} phone /><LinkedRefs kind="project" id={currentProject.id} folded /></>}
          {own.length === 0 && !upcomingCal.hasEvents && !taskGroups.find((g) => g.key === 'all')?.folded && m.liveSections.length === 0 && (m.duration || m.queryFilter?.query || completedNarrowed
            ? <FilteredEmpty onClear={() => { m.chooseDuration(null); m.queryFilter?.setQuery(''); m.setCompletedQuery(''); if (completedNarrowed) setCompletedDisplay({ projects: [] }) }} />
            : <EmptyState view={route.view} waiting={groups.find((g) => g.key === 'blocked')?.count ?? 0} readOnly={m.projectReadOnly} completed={hiddenDone} onShowCompleted={showCompleted} />)}

          <GroupedList groups={groups} view={route.view} project={currentProject} fieldColumns={false} projectFieldDefs={m.projectFieldDefs} siblingPos={m.treeView || m.nested ? m.siblingPos : undefined} reveal={selectedId}
            todayDropTarget={ownOrder?.todayDrop?.canEdit} activeTodayDrop={drag.dropGroup} contextualDrag={!!drag.draggingId && contextIds.has(drag.draggingId)}
            editable={m.projectEditable} canEdit={(id) => canEditTasks(roleOf(id, m.memberMap))} renderRow={renderRow} addingTo={addingTo} setAddingTo={ui.setAddingTo} onToggleSection={s.toggleSection}
            doneBySection={m.showCompleted ? NO_DONE : m.doneBySection} revealed={revealed}
            completed={m.showCompleted && projectId ? { tasks: m.completedTasks, open: m.completedOpen, onToggle: () => m.toggleCollapsed(completedOpenKey(projectId)) } : undefined} toggleCollapsed={m.toggleCollapsed} collapsedGroups={collapsedGroups} projects={m.projects} labels={m.labels}
            earlierActions={route.view === 'today' || m.upcomingToday ? earlierActions : undefined}
            eventsFor={upcomingCal.eventsFor} summarised={summarised}
            onReveal={(key) => setRevealed((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n })} />

          {upcomingCal.hasEvents && <UpcomingEventsNote status={upcomingCal.status} fetchedAt={upcomingCal.fetchedAt} />}
          {own.length > 0 && hiddenDone > 0 && showCompleted && <HiddenNote count={hiddenDone} onShow={showCompleted} />}
          {route.view === 'today' && <CloseDayRow />}{route.view === 'inbox' && <RoutinesInboxSlot />}
          {m.logbook && <LogbookMore total={m.logbook.total} limit={m.logbookLimit} onMore={() => m.setLogbookLimit((n) => n + LOGBOOK_PAGE)} />}
          {route.view === 'project' && m.projectEditable && <div className="mb-4"><AddSection projectId={route.id} layout="list" /></div>}
        </div>
        {ui.prompt && <CompleteParentPrompt parent={ui.prompt} onAccept={s.acceptPrompt} onDismiss={() => s.setPrompt(null)} />}
        <RowPickerDialogs assignFor={ui.assignFor} pickerFor={ui.pickerFor} userId={userId} onCloseAssign={() => ui.setAssignFor(null)} onClosePicker={() => ui.setPickerFor(null)} />
      </div>
    </PhoneChrome></UrgencyContext.Provider></ListReorderContext.Provider>
  )
}

// A task list on a phone (OpenSpec change phone-lists): the Inbox, Today, Upcoming,
// Anytime, Someday, Assigned to me, Completed, a label, a place and a project in its
// List layout. The list is the one the desktop screen wires (useListScreen), so the
// tasks, groups, order, selection, drag and every write are the same; this file
// draws it for a phone: the phone header, each list's own parts, the groups with the
// phone row, the selection bar and the prompts. No add line: the add button adds.
import { Suspense, useMemo } from 'react'
import { lazy } from '../../lib/lazy'
import { setCompletedDisplay } from '../../lib/completedDisplay'
import type { Briefing } from '../../lib/briefing'
import { completedOpenKey, DONE_OPEN_KEY } from '../../lib/listGroups'
import { LOGBOOK_PAGE } from '../../lib/logbook'
import { canEditTasks, roleOf } from '../../lib/sharing'
import type { AccountRole } from '../../lib/types'
import { hueFor, PageHeader, useMediaQuery } from '../../ui'
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
import { doneToday, glanceOf, TodayGlance } from '../components/TodayGlance'
import { BarProgressContext } from '../chrome'
import { useDayClosed } from '../dayClosed'
import { WeekStrip } from '../components/WeekStrip'

const CompletedSearch = lazy(() => import('../../app/completed/CompletedBar').then((m) => ({ default: m.CompletedSearch })))

const NO_DONE = new Map<string, never[]>()
const earlierActions = (ids: readonly string[]) => <EarlierActions ids={ids} compact />

/**
 * Today's briefing on a phone, without what the Late card says (phone-calm D4): the late facts go,
 * and a briefing that had nothing else to say goes with them.
 */
function withoutLate(b: Briefing | null): Briefing | null {
  if (b?.mode !== 'today' || !b.facts.some((f) => f.kind === 'late')) return b
  const facts = b.facts.filter((f) => f.kind !== 'late')
  return facts.length ? { ...b, facts } : null
}

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

  const isToday = route.view === 'today'
  const late = (() => { const e = groups.find((g) => g.key === 'earlier'); return e ? e.count ?? e.rows.length : 0 })()
  // The day's numbers for the tiles' ring in the bar and the closed day (phone-delight D1, D9); the time does not change them.
  const day = useMemo(() => isToday ? glanceOf(s.listedTasks, m.allTasks, late, today, 0) : null, [isToday, s.listedTasks, m.allTasks, late, today])
  const doneNow = useMemo(() => isToday ? doneToday(m.allTasks, today) : 0, [isToday, m.allTasks, today])
  const openNow = isToday ? s.listedTasks.filter((x) => !x.completed_at).length : 0
  useDayClosed(isToday && s.ready, openNow, doneNow)

  const missing = route.view === 'project' && m.projects.length > 0 && !currentProject ? 'project' as const
    : route.view === 'label' && m.labels.length > 0 && (!currentLabel || currentLabel.deleted_at) ? 'label' as const
      : route.view === 'place' && currentPlace !== undefined && (!currentPlace || currentPlace.deleted_at) ? 'place' as const : null
  // What is gone is said inside the phone screen, under the phone header: its menu button is the way out.
  if (missing) return (
    <PhoneChrome onMenu={onMenu}>
      <div data-phone-screen="list" data-phone-list={route.view} data-phone-missing={missing} className="min-h-full bg-canvas">
        <div className="px-4"><PageHeader title={s.title} /></div>
        <MissingTarget kind={missing} />
      </div>
    </PhoneChrome>
  )
  if (!s.ready) return <div className="min-h-full bg-canvas" data-list-loading />

  return (
    <ListReorderContext.Provider value={s.listReorder}><UrgencyContext.Provider value={m.urgency}><BarProgressContext value={day ? { done: day.done, total: day.total } : null}><PhoneChrome onMenu={onMenu}>
      <div ref={s.room} data-phone-screen="list" data-phone-list={route.view} data-page-project={route.view === 'project' ? '' : undefined} className="relative isolate min-h-full bg-canvas pb-6">
        <div aria-hidden className="phone-glow" data-hue={route.view === 'project' && currentProject?.color ? hueFor(currentProject.color) : undefined} />
        <div className="px-4" data-phone-list-body>
        {route.view === 'project' && currentProject ? (
            <ProjectHeader project={currentProject} userId={userId} extraGroups={s.boardGroups} print
              phone={{ slots: phoneActions.slots, groups: phoneGroups(phoneActions.projectItems) }} />
          ) : (
            <ListHeader route={route} title={s.title} label={currentLabel} meta={s.meta} subtitle={s.methodSubtitle} briefing={isToday ? withoutLate(s.briefing) : s.briefing} actions={null} phone={phoneActions} agenda={agenda.toggle} upcomingEvents={upcomingCal.toggle} />
          )}

          {route.view === 'completed' && <Suspense fallback={<div className="mb-3 h-9" />}><CompletedSearch value={m.completedQuery} onChange={m.setCompletedQuery} /></Suspense>}
          {route.view === 'today' && <TodayGlance listed={s.listedTasks} all={m.allTasks} late={late} today={today}
            onLate={() => s.listRoot.current?.querySelector('[data-group="earlier"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            onDone={!groups.some((g) => g.key === 'done') ? undefined : () => {
              // Open the Done today group, folded by default, then bring it into view (phone-calm D6).
              if (!m.collapsed.has(DONE_OPEN_KEY)) m.toggleCollapsed(DONE_OPEN_KEY)
              requestAnimationFrame(() => s.listRoot.current?.querySelector('[data-group="done"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
            }} />}
          {route.view === 'upcoming' && <WeekStrip today={today} counts={new Map(groups.map((g) => [g.key, g.count ?? g.rows.length]))}
            onDay={(date) => s.listRoot.current?.querySelector(`[data-group="${date}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />}
          {agenda.toggle && <TodayAgenda cal={agenda.cal} zone={m.zone} />}{m.todayHabits && <TodayStrip tasks={m.allTasks} projects={m.projects} today={today} />}

          {/* Close ends the selection whole (phone-lists "Selecting tasks"): nothing stays ticked behind rows that show their checks again. */}
          <SelectionBar ids={ticked} onClear={selection.clear} menuOpen={actions.forTicked}
            onMenuOpenChange={actions.onOpenChange} startPicker={actions.picker} onDone={selectMode ? () => { selection.clear(); setSelectMode(false) } : undefined} />
          {actions.forCursor && selectedId && (
            <BulkActionsMenu ids={[selectedId]} open onOpenChange={actions.onOpenChange} startPicker={actions.picker} anchor={actionsFrom} {...s.menuItems} expandedId={s.expandedId}
              trigger={<span className="sr-only">{t('Actions')}</span>} triggerClassName="sr-only" />
          )}
          {rowMenu.element}{s.queryHost}

          {route.view === 'project' && currentProject && <><ProjectNote project={currentProject} phone /><LinkedRefs kind="project" id={currentProject.id} folded /></>}
          {own.length === 0 && !upcomingCal.hasEvents && !taskGroups.find((g) => g.key === 'all')?.folded && m.liveSections.length === 0 && (m.duration || m.queryFilter?.query || completedNarrowed
            ? <FilteredEmpty onClear={() => { m.chooseDuration(null); m.queryFilter?.setQuery(''); m.setCompletedQuery(''); if (completedNarrowed) setCompletedDisplay({ projects: [] }) }} />
            : <div data-phone-empty><EmptyState view={route.view} waiting={groups.find((g) => g.key === 'blocked')?.count ?? 0} readOnly={m.projectReadOnly} completed={hiddenDone} onShowCompleted={showCompleted} /></div>)}

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
    </PhoneChrome></BarProgressContext></UrgencyContext.Provider></ListReorderContext.Provider>
  )
}

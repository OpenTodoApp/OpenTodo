// Today on a phone (OpenSpec change phone-ui-trial, "Phone Today"): the container.
// The list is the one the desktop Today computes (`useListModel`), so the tasks,
// the groups, their order and the Today limit are the same; this file only turns
// that into the drawing's props and wires the row's gestures to the shared writes.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatTime as minutesToTime } from '../../lib/calendar'
import { formatDate, formatTime } from '../../lib/dates'
import { t } from '../../lib/i18n'
import type { ListGroup } from '../../lib/listGroups'
import type { Task } from '../../lib/types'
import { Icon, Menu, MenuItem, useMediaQuery } from '../../ui'
import { act } from '../../app/actionError'
import { useTodayAgenda } from '../../app/calendar/TodayAgenda'
import { TodayStrip } from '../../app/habits/TodayStrip'
import { GroupDateDialog, RescheduleChoices, runGroupDue } from '../../app/task-list/EarlierActions'
import { useRowSwipe } from '../../app/task-list/RowSwipe'
import { closedListMeta } from '../../app/task-list/useClosedList'
import { useListModel } from '../../app/task-list/useListModel'
import { completeWithUndo } from '../../app/undoable'
import { useOwnBar } from '../chrome'
import { PhoneRow, type PhoneRowModel } from '../components/PhoneRow'
import { rowModel } from '../rowModel'
import { openTaskFromList } from '../transition'
import { PhoneTodayView, type PhoneEvent, type PhoneTodayGroup } from './PhoneTodayView'
import { TaskDateSheet } from './TaskDateSheet'

const ROUTE = { view: 'today' } as const

export function PhoneToday({ userId, onMenu }: { userId: string; onMenu: () => void }) {
  const m = useListModel(ROUTE, userId)
  useOwnBar()
  const { cal, toggle } = useTodayAgenda(true, m.today, m.zone)
  const [dating, setDating] = useState<string | null>(null)
  const coarse = useMediaQuery('(pointer: coarse)')
  // The task page's chunk is fetched now, so the first task opens with its transition and no blank frame.
  useEffect(() => { void import('./PhoneTaskPage').catch(() => {}) }, [])

  const ctx = useMemo(() => ({ today: m.today, zone: m.zone, dateTime: m.dt.resolved, projects: m.projectMap, progress: m.progress }),
    [m.today, m.zone, m.dt.resolved, m.projectMap, m.progress])
  const tasks = useMemo(() => new Map(m.groups.flatMap((g) => g.rows.map((r) => [r.task.id, r.task] as const))), [m.groups])

  const done = m.groups.find((g) => g.key === 'done')
  const fold = useCallback((key: string) => {
    const g = m.groups.find((x) => x.key === key)
    if (g?.openKey) m.toggleCollapsed(g.openKey)
  }, [m])
  const group = (g: ListGroup): PhoneTodayGroup => ({
    id: g.key,
    title: g.heading ?? t('Today'),
    tone: g.key === 'earlier' ? 'danger' : undefined,
    rows: g.rows.map((r) => rowModel(r, ctx)),
    count: g.count ?? g.rows.length,
    folded: g.folded,
    note: g.hint,
    action: g.key === 'earlier' ? <EarlierMenu ids={g.rows.map((r) => r.task.id)} /> : undefined,
  })
  // Done today is a row at the end while folded, and a group like the others once opened.
  const groups = m.groups.filter((g) => g.key !== 'done' || g.folded === false).map(group)
  const open = groups.filter((g) => g.id !== 'done').reduce((n, g) => n + g.count, 0)
  const late = m.groups.find((g) => g.key === 'earlier')?.rows.length ?? 0
  // With a Today limit the line is the closed list's own ("3 of 5 · 4 done"), as on the desktop Today.
  const limit = closedListMeta(m.closed)
  const summary = !m.loaded ? undefined : limit || [
    t('{n, plural, one {# task} other {# tasks}}', { n: open }),
    ...(late ? [t('{n} late', { n: late })] : []),
  ].join(' · ')

  const events: PhoneEvent[] = toggle ? [
    ...cal.allDay.map((e) => ({ id: e.id, title: e.summary || t('Untitled'), time: '', color: cal.subMap.get(e.subscriptionId)?.color ?? 'var(--color-faint)' })),
    ...cal.timed.map((b) => ({ id: b.id, title: b.event.summary || t('Untitled'), time: formatTime(minutesToTime(b.start), m.dt.resolved), color: cal.subMap.get(b.event.subscriptionId)?.color ?? 'var(--color-faint)' })),
  ] : []

  const dated = dating ? tasks.get(dating) ?? m.taskMap.get(dating) : undefined
  if (!m.loaded) return null
  return (
    <>
      <PhoneTodayView date={formatDate(m.today, 'full', m.dt.resolved, m.today)} summary={summary} events={events} groups={groups}
        doneCount={done?.folded ? done.count ?? 0 : 0}
        above={m.todayHabits ? <TodayStrip tasks={m.allTasks} projects={m.projects} today={m.today} /> : undefined}
        onMenu={onMenu} onToggle={(id) => act(completeWithUndo(id, !tasks.get(id)?.completed_at))} onOpen={openTaskFromList}
        onFold={fold} onDone={() => fold('done')}
        renderRow={(row) => {
          const task = tasks.get(row.id)
          return task ? <TodayRow key={row.id} row={row} task={task} readOnly={m.isReadOnly(task)} swipes={coarse} onDate={setDating} /> : null
        }} />
      {dated && <TaskDateSheet task={dated} someday onClose={() => setDating(null)} />}
    </>
  )
}

/** A row with its gestures: a swipe right completes, a swipe left opens the date sheet, both through the shared hook. */
function TodayRow({ row, task, readOnly, swipes, onDate }: { row: PhoneRowModel; task: Task; readOnly: boolean; swipes: boolean; onDate: (id: string) => void }) {
  const toggle = useCallback(() => act(completeWithUndo(task.id, !task.completed_at)), [task.id, task.completed_at])
  const schedule = useCallback(() => onDate(task.id), [onDate, task.id])
  const swipe = useRowSwipe({ task, enabled: swipes && !readOnly, onComplete: toggle, onSchedule: schedule })
  return <PhoneRow row={row} readOnly={readOnly} swipe={swipe} onToggle={toggle} onOpen={openTaskFromList} />
}

/** The overdue group's actions (page-rhythm D5), behind one control on a phone. */
function EarlierMenu({ ids }: { ids: readonly string[] }) {
  const [dating, setDating] = useState(false)
  return (
    <>
      <Menu kind="menu" label={t('More actions')} title={t('Earlier')} trigger={<Icon name="ellipsis" size="md" />}
        triggerClassName="flex h-11 w-11 items-center justify-center rounded-control text-muted focus-visible:outline-2 focus-visible:outline-focus" width="sm:w-56" triggerProps={{ 'data-earlier-menu': true }}>
        <MenuItem label={t('Move all to today')} icon="calendar-check" onSelect={() => act(runGroupDue(ids, 'today'))} />
        <RescheduleChoices ids={ids} onPickDate={() => setDating(true)} />
      </Menu>
      {dating && <GroupDateDialog ids={ids} onClose={() => setDating(false)} />}
    </>
  )
}

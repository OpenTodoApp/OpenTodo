// A task in one of the calendar's lists on a phone (OpenSpec change phone-calendar):
// the phone row with what the calendar says of the task on that day (its time or
// "all day", a span's place, the deadline, the estimate). A tap opens the task page,
// the circle completes with Undo, and the swipes are the task lists' own.
import { useCallback, useState } from 'react'
import { formatMinutes } from '../../lib/duration'
import { useMembershipMap } from '../../lib/localData'
import { t } from '../../lib/i18n'
import { usePendingDone } from '../../lib/pendingDone'
import { canEditTasks, roleOf } from '../../lib/sharing'
import { act } from '../../app/actionError'
import { ProjectMark } from '../../app/ProjectMark'
import { useRowSwipe } from '../../app/task-list/RowSwipe'
import type { CalendarRowProps } from '../../app/task-list/rowDraw'
import { completeWithUndo } from '../../app/undoable'
import { PhoneRow, type PhoneRowFact } from '../components/PhoneRow'
import { shownTitle } from '../rowModel'
import { openTaskFromList } from '../transition'
import { TaskDateSheet } from './TaskDateSheet'

/** The row's facts, in the order a calendar row reads: when, where in a span, the deadline, how long, whose. */
export function calendarFacts({ task, date, today, time, note, project }: CalendarRowProps): PhoneRowFact[] {
  const facts: PhoneRowFact[] = [{ id: 'time', text: time || t('all day'), tone: date < today && !task.completed_at ? 'danger' : undefined }]
  if (note) facts.push({ id: 'span', text: note })
  if (task.deadline === date && !task.completed_at) facts.push({ id: 'deadline', text: t('deadline today'), icon: 'hourglass', tone: date < today ? 'danger' : 'accent' })
  if (task.estimate_minutes) facts.push({ id: 'estimate', text: formatMinutes(task.estimate_minutes), icon: 'clock' })
  if (project) facts.push({ id: 'project', text: project.name, mark: <ProjectMark project={project} /> })
  return facts
}

export function PhoneCalendarRow(p: CalendarRowProps) {
  const { task } = p
  // A task of a project the person may only read has no circle and takes no swipe.
  const memberships = useMembershipMap()
  const readOnly = p.readOnly ?? !canEditTasks(roleOf(task.project_id, memberships))
  const [dating, setDating] = useState(false)
  const toggle = useCallback(() => act(completeWithUndo(task.id, !task.completed_at)), [task.id, task.completed_at])
  const swiping = useRowSwipe({ task, enabled: !readOnly, onComplete: toggle, onSchedule: () => setDating(true) })
  const done = usePendingDone(task)
  const priority = (task.priority >= 1 && task.priority <= 4 ? task.priority : 4) as 1 | 2 | 3 | 4
  return (
    <>
      <PhoneRow row={{ id: task.id, title: shownTitle(task), done, priority, facts: calendarFacts(p) }} readOnly={readOnly}
        swipe={readOnly ? undefined : swiping} onToggle={toggle} onOpen={openTaskFromList}
        attrs={{ 'data-cal-id': task.id, 'data-calendar-row': p.date, 'data-swipeable': readOnly ? undefined : '' }} />
      {dating && <TaskDateSheet task={task} onClose={() => setDating(false)} />}
    </>
  )
}

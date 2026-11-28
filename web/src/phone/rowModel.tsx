// A task as a phone row (OpenSpec change phone-ui-trial, "Phone task rows"): the
// words of its one line of facts, from the functions the desktop row and the task
// page read (`describeDue`, the subtask progress, the project), in a fixed order:
// when, subtasks, repeat, project. At most four.
import { addDaysISO, describeDue } from '../lib/dates'
import type { ResolvedDateTime } from '../lib/dates'
import { t } from '../lib/i18n'
import type { ListRow } from '../lib/listGroups'
import type { Progress } from '../lib/subtasks'
import type { Project, Task } from '../lib/types'
import { ProjectMark } from '../app/ProjectMark'
import { MAX_ROW_FACTS, type PhoneRowFact, type PhoneRowModel } from './components/PhoneRow'

/** The title as shown: an encrypted title that cannot be read, or none, reads Untitled. */
export function shownTitle(task: Pick<Task, 'title' | '_e2ee'>): string {
  return task._e2ee?.raw?.title || !task.title ? t('Untitled') : task.title
}

/** What one row's facts are read from: the day, and the task's own project and subtask progress. */
export interface FactsOf {
  today: string
  zone?: string
  dateTime?: ResolvedDateTime
  project?: Project
  progress?: Progress
}

/** The facts of one task, for a row that is given its project and progress (the list's rows, phone-lists D4). */
export function factsOf(task: Task, implied: ListRow['implied'], of: FactsOf): PhoneRowFact[] {
  const facts: PhoneRowFact[] = []
  const due = describeDue(task.due ?? null, of.today, of.zone, of.dateTime)
  if (due) {
    // Under a heading that names the day, the time alone; a task of another day keeps its day.
    const sameDay = !!implied?.date && due.tone === 'today'
    // The day before today is Yesterday, as tomorrow is Tomorrow (phone-calm D7).
    const yesterday = due.date === addDaysISO(of.today, -1)
    const text = sameDay ? due.time : yesterday ? [t('Yesterday'), due.time].filter(Boolean).join(' ') : due.label
    if (text) facts.push({ id: 'due', text, tone: due.tone === 'overdue' ? 'danger' : due.tone === 'today' ? 'accent' : undefined })
  }
  const sub = of.progress
  if (sub && sub.total > 0) facts.push({ id: 'subtasks', text: `${sub.done}/${sub.total}`, icon: 'list-checks' })
  if (task.recurrence) facts.push({ id: 'repeat', text: task.recurrence, icon: 'repeat' })
  if (of.project && !implied?.project) facts.push({ id: 'project', text: of.project.name, mark: <ProjectMark project={of.project} /> })
  return facts.slice(0, MAX_ROW_FACTS)
}

/** A task as the phone row draws it. */
export function rowOf(task: Task, implied: ListRow['implied'], of: FactsOf): PhoneRowModel {
  return { id: task.id, title: shownTitle(task), done: !!task.completed_at, priority: (task.priority >= 1 && task.priority <= 4 ? task.priority : 4) as 1 | 2 | 3 | 4, facts: factsOf(task, implied, of) }
}

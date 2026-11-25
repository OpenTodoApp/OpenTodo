// A task as a phone row (OpenSpec change phone-ui-trial, "Phone task rows"): the
// words of its one line of facts, from the functions the desktop row and the task
// page read (`describeDue`, the subtask progress, the project), in a fixed order:
// when, subtasks, repeat, project. At most four.
import { describeDue } from '../lib/dates'
import type { ResolvedDateTime } from '../lib/dates'
import { t } from '../lib/i18n'
import type { ListRow } from '../lib/listGroups'
import type { Progress } from '../lib/subtasks'
import type { Project, Task } from '../lib/types'
import { ProjectMark } from '../app/ProjectMark'
import { MAX_ROW_FACTS, type PhoneRowFact, type PhoneRowModel } from './components/PhoneRow'

export interface RowContext {
  today: string
  zone?: string
  dateTime?: ResolvedDateTime
  projects: ReadonlyMap<string, Project>
  progress: ReadonlyMap<string, Progress>
}

/** The title as shown: an encrypted title that cannot be read, or none, reads Untitled. */
export function shownTitle(task: Pick<Task, 'title' | '_e2ee'>): string {
  return task._e2ee?.raw?.title || !task.title ? t('Untitled') : task.title
}

export function rowFacts(row: Pick<ListRow, 'task' | 'implied'>, ctx: RowContext): PhoneRowFact[] {
  const { task, implied } = row
  const facts: PhoneRowFact[] = []
  const due = describeDue(task.due ?? null, ctx.today, ctx.zone, ctx.dateTime)
  if (due) {
    // Under a heading that names the day, the time alone; a task of another day keeps its day.
    const sameDay = !!implied?.date && due.tone === 'today'
    const text = sameDay ? due.time : due.label
    if (text) facts.push({ id: 'due', text, tone: due.tone === 'overdue' ? 'danger' : due.tone === 'today' ? 'accent' : undefined })
  }
  const sub = ctx.progress.get(task.id)
  if (sub && sub.total > 0) facts.push({ id: 'subtasks', text: `${sub.done}/${sub.total}`, icon: 'list-checks' })
  if (task.recurrence) facts.push({ id: 'repeat', text: task.recurrence, icon: 'repeat' })
  const project = task.project_id ? ctx.projects.get(task.project_id) : undefined
  if (project && !implied?.project) facts.push({ id: 'project', text: project.name, mark: <ProjectMark project={project} /> })
  return facts.slice(0, MAX_ROW_FACTS)
}

export function rowModel(row: Pick<ListRow, 'task' | 'implied'>, ctx: RowContext): PhoneRowModel {
  const { task } = row
  return { id: task.id, title: shownTitle(task), done: !!task.completed_at, priority: (task.priority >= 1 && task.priority <= 4 ? task.priority : 4) as 1 | 2 | 3 | 4, facts: rowFacts(row, ctx) }
}

// The groups of the Next and Waiting views (OpenSpec change open-loops-method,
// spec method-views): Next by context, Waiting by person then blockers. Pure; a
// task can be in several Next groups, so rows are keyed by group and task.
import { openBlockers } from '../dependencies'
import { t } from '../i18n'
import { memberName } from '../sharing'
import type { Label, Membership, Project, Task } from '../types'
import { contextsOf, MethodRules, nextActions, waitingTasks, type MethodInput } from './rules'

export interface MethodGroup {
  key: string
  heading: string
  tasks: Task[]
  /** Per task: the project shown on the row, and for a blocked task its first open blocker. */
  notes?: ReadonlyMap<string, string>
}

/** Next (method-views "Next view"): each project's next action under each of its contexts, "Anywhere" last. */
export function nextGroups(input: MethodInput, labels: readonly Label[]): MethodGroup[] {
  const labelMap = new Map(labels.map((l) => [l.id, l]))
  const byContext = new Map<string, { label: Label | null; tasks: Task[] }>()
  for (const { task } of nextActions(input)) {
    const contexts = contextsOf(task, labelMap)
    for (const label of contexts.length ? contexts : [null]) {
      const key = label?.id ?? ''
      const g = byContext.get(key) ?? { label, tasks: [] }
      g.tasks.push(task)
      byContext.set(key, g)
    }
  }
  const named = [...byContext.entries()].filter(([key]) => key !== '').sort(([, a], [, b]) => a.label!.name.localeCompare(b.label!.name))
  const out: MethodGroup[] = named.map(([key, g]) => ({ key, heading: g.label!.name, tasks: g.tasks }))
  const anywhere = byContext.get('')
  if (anywhere) out.push({ key: 'anywhere', heading: t('Anywhere'), tasks: anywhere.tasks })
  return out
}

/** Waiting (method-views "Waiting view"): by assignee name, then "Blocked by another task" with the first open blocker named. */
export function waitingGroups(input: MethodInput): MethodGroup[] {
  const memberships = input.memberships as Map<string, Membership>
  const rules = new MethodRules(input)
  const byId = new Map(input.tasks.map((x) => [x.id, x]))
  const people = new Map<string, Task[]>()
  const blocked: Task[] = []
  for (const task of waitingTasks(input)) {
    if (rules.delegated(task)) {
      const list = people.get(task.assignee_id!) ?? []
      list.push(task)
      people.set(task.assignee_id!, list)
    } else blocked.push(task)
  }
  const nameOf = (id: string) => memberName(id, memberships) ?? t('Someone else')
  const out: MethodGroup[] = [...people.entries()]
    .sort(([a], [b]) => nameOf(a).localeCompare(nameOf(b)))
    .map(([id, tasks]) => ({ key: `person:${id}`, heading: nameOf(id), tasks }))
  if (blocked.length) {
    const notes = new Map<string, string>()
    for (const task of blocked) {
      const first = openBlockers(task, byId)[0]
      if (first) notes.set(task.id, t('Waits for {title}', { title: first.title }))
    }
    out.push({ key: 'blocked', heading: t('Blocked by another task'), tasks: blocked, notes })
  }
  return out
}

/** The project of each task, for rows of cross-project views. */
export const projectOf = (task: Task, projects: ReadonlyMap<string, Project>): Project | undefined => (task.project_id ? projects.get(task.project_id) : undefined)

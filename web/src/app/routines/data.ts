// What the routine screens read from this device (OpenSpec change
// routines-editor): names for the words and run details, the data the live
// preview plans with, and the condition matcher's task shape.
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { logicalDay, logicalToday } from '../../lib/dates'
import { useOpenTasks } from '../../lib/liveTasks'
import { useAllTaskRows, useLabels, useLiveSections, useProjects, useViewRows } from '../../lib/localData'
import { matchesCondition, type MatchTask } from '../../lib/rules/match'
import type { PreviewData } from '../../lib/rules/preview'
import { inFindScope, projectScope } from '../../lib/rules/stepData'
import type { Label, Project, RoutineStep, RuleCondition, Section, Task, View, Webhook } from '../../lib/types'

/** A task as the matcher reads it. */
export function matchTaskOf(task: Task): MatchTask {
  return {
    id: task.id, project_id: task.project_id, section_id: task.section_id ?? null, labels: task.labels, priority: task.priority,
    dueDate: task.due?.date ?? null, deadline: task.deadline ?? null, start: task.start ?? null, evening: !!task.evening,
    blocked_by: task.blocked_by ?? [], assignee_id: task.assignee_id ?? null, origin: task.origin ?? null, habit: !!task.habit,
    estimate_minutes: task.estimate_minutes ?? null,
  }
}

export interface RoutineNames {
  labels: readonly Label[]
  projects: readonly Project[]
  sections: readonly Section[]
  views: readonly View[]
  webhooks: readonly Webhook[] | null
  tasks: readonly Task[]
  /** A task's title from local data ('' when this device has no such task). */
  title: (id: string) => string
  projectName: (id: string) => string
}

/** Names an output by its value where it has one: Get a task by the task's title, Find a project by the name it looks for. */
export function valueNamer(names: Pick<RoutineNames, 'title'>): (s: RoutineStep) => string | undefined {
  return (s) => {
    const a = s.kind === 'get_task' ? s.in?.task : s.kind === 'find_project' ? s.in?.name : undefined
    if (!a || !('literal' in a)) return undefined
    if (s.kind === 'get_task') return names.title((a.literal as { task?: string })?.task ?? '') || undefined
    return typeof a.literal === 'string' && a.literal ? a.literal : undefined
  }
}

/** Names of everything a routine can point at, from local data (webhooks from the server while online). */
export function useRoutineNames(): RoutineNames {
  const labels = useLabels()
  const projects = useProjects()
  const sections = useLiveSections()
  const views = useViewRows()
  const tasks = useAllTaskRows()
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null)
  useEffect(() => { api.listWebhooks().then((r) => setWebhooks(r.webhooks), () => setWebhooks(null)) }, [])
  return useMemo(() => {
    const byTask = new Map(tasks.filter((x) => !x.deleted_at).map((x) => [x.id, x.title]))
    const byProject = new Map(projects.map((p) => [p.id, p.name]))
    return { labels, projects, sections, views: views.filter((v) => !v.deleted_at), webhooks, tasks, title: (id) => byTask.get(id) ?? '', projectName: (id) => byProject.get(id) ?? '' }
  }, [labels, projects, sections, views, tasks, webhooks])
}

/** The matcher's context for a user now. */
function matchContext(projects: readonly Project[], open: readonly Task[], me: string) {
  const parent = new Map(projects.map((p) => [p.id, p.parent_id]))
  const ids = new Set(open.map((x) => x.id))
  const byId = new Map(open.map((x) => [x.id, x]))
  return {
    userId: me, today: logicalToday(), parent: (id: string) => parent.get(id) ?? null, open: (id: string) => ids.has(id), tracked: () => 0,
    // The day of a task's newest field change, from its field clocks (`unchanged`, routines-dynamic-data D5).
    changed: (id: string) => lastChangedDay(byId.get(id)),
  }
}

/** The logical day of a task's newest field change, or '' without clocks. */
export function lastChangedDay(task: Pick<Task, '_clock'> | undefined): string {
  const ts = Math.max(0, ...Object.values(task?._clock ?? {}).map((c) => c.ts))
  return ts > 0 ? logicalDay(ts) : ''
}

/** How many open tasks a condition matches now on this device. */
export function useMatchCount(condition: RuleCondition | null, me: string): number {
  const tasks = useOpenTasks()
  const projects = useProjects()
  return useMemo(() => {
    const ctx = matchContext(projects, tasks, me)
    // The scope a scheduled run gathers in (routines-find-scope D2): no archived projects.
    const scope = projectScope(projects)
    return tasks.filter((x) => inFindScope(x, scope) && matchesCondition(condition, matchTaskOf(x), ctx)).length
  }, [tasks, projects, condition, me])
}

/** The data the live preview plans with; the trigger's sample is the newest open task matching the condition (D4). */
export function usePreviewData(condition: RuleCondition | null, triggerHasTask: boolean, me: string): PreviewData {
  const open = useOpenTasks()
  const projects = useProjects()
  return useMemo(() => {
    const match = matchContext(projects, open, me)
    const sample = triggerHasTask
      ? [...open].sort((a, b) => b.created_at - a.created_at).find((x) => matchesCondition(condition, matchTaskOf(x), match)) ?? null
      : null
    return { tasks: open, projects, today: match.today, match, matchTask: matchTaskOf, triggerTask: sample }
  }, [open, projects, condition, triggerHasTask, me])
}

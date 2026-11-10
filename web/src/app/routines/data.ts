// What the routine screens read from this device (OpenSpec change
// routines-editor): names for the words and run details, the data the live
// preview plans with, and the condition matcher's task shape.
import { useEffect, useMemo, useState } from 'react'
import { api } from '../../lib/api'
import { logicalDay, logicalToday } from '../../lib/dates'
import { useOpenTasks } from '../../lib/liveTasks'
import { t } from '../../lib/i18n'
import { useAllTaskRows, useLabelsOfEveryWorkspace, useLiveSections, useProjects, useProjectsOfEveryWorkspace, useViewRows, useWorkspaceState } from '../../lib/localData'
import { Partition, type WorkspaceState } from '../../lib/workspaces'
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
  /**
   * The live labels and projects of every workspace, for naming what a routine
   * points at: one of another workspace than the current one is named with its
   * workspace ("Website (Work)"), never as removed (routine-conditions D5).
   */
  labels: readonly Label[]
  projects: readonly Project[]
  /** What the pickers offer: the routine's workspace, or every workspace for a routine of every workspace. */
  pickLabels?: readonly Label[]
  pickProjects?: readonly Project[]
  sections: readonly Section[]
  views: readonly View[]
  webhooks: readonly Webhook[] | null
  tasks: readonly Task[]
  /** A task's title from local data ('' when this device has no such task). */
  title: (id: string) => string
  projectName: (id: string) => string
}

/** The names a picker offers: the routine's workspace's labels and projects (the full lists without them). */
export function pickerNames<T extends Pick<RoutineNames, 'labels' | 'projects' | 'pickLabels' | 'pickProjects'>>(n: T): T {
  return { ...n, labels: n.pickLabels ?? n.labels, projects: n.pickProjects ?? n.projects }
}

/**
 * Every workspace's live labels and projects, named for a routine
 * (routine-conditions D5): one outside the current workspace carries its
 * workspace's name; the pickers offer those of `workspace` (every workspace
 * for null; the current one when undefined).
 */
export function workspaceNames<L extends Pick<Label, 'id' | 'name' | 'workspace_id' | 'deleted_at'>, P extends Pick<Project, 'id' | 'name' | 'workspace_id' | 'parent_id' | 'deleted_at'>>(
  state: WorkspaceState, labels: readonly L[], projects: readonly P[], workspace: string | null | undefined,
): { labels: L[]; projects: P[]; pickLabels: L[]; pickProjects: P[] } {
  const liveLabels = labels.filter((l) => !l.deleted_at)
  const liveProjects = projects.filter((p) => !p.deleted_at)
  if (state.list.length <= 1) return { labels: liveLabels, projects: liveProjects, pickLabels: liveLabels, pickProjects: liveProjects }
  const part = new Partition(state.defaultId, state.list.map((w) => w.id), liveProjects)
  const here = part.own(state.current)
  const wsName = new Map(state.list.map((w) => [w.id, w.name]))
  const named = <X extends { name: string }>(x: X, ws: string): X => (ws === here ? x : { ...x, name: t('{name} ({workspace})', { name: x.name, workspace: wsName.get(ws) ?? '' }) })
  const pick = workspace === undefined ? here : workspace === null ? null : part.own(workspace)
  const labelWs = (l: L) => part.own(l.workspace_id)
  const projectWs = (p: P) => part.project(p.id)
  return {
    labels: liveLabels.map((l) => named(l, labelWs(l))),
    projects: liveProjects.map((p) => named(p, projectWs(p))),
    pickLabels: liveLabels.filter((l) => pick === null || labelWs(l) === pick).map((l) => named(l, labelWs(l))),
    pickProjects: liveProjects.filter((p) => pick === null || projectWs(p) === pick).map((p) => named(p, projectWs(p))),
  }
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

/**
 * Names of everything a routine can point at, from local data (webhooks from
 * the server while online); `workspace` is the routine's (null: every
 * workspace; undefined: the current one) and decides what the pickers offer.
 */
export function useRoutineNames(workspace?: string | null): RoutineNames {
  const everyLabel = useLabelsOfEveryWorkspace()
  const everyProject = useProjectsOfEveryWorkspace()
  const state = useWorkspaceState()
  const { labels, projects, pickLabels, pickProjects } = useMemo(() => workspaceNames(state, everyLabel, everyProject, workspace), [state, everyLabel, everyProject, workspace])
  const sections = useLiveSections()
  const views = useViewRows()
  const tasks = useAllTaskRows()
  const [webhooks, setWebhooks] = useState<Webhook[] | null>(null)
  useEffect(() => { api.listWebhooks().then((r) => setWebhooks(r.webhooks), () => setWebhooks(null)) }, [])
  return useMemo(() => {
    const byTask = new Map(tasks.filter((x) => !x.deleted_at).map((x) => [x.id, x.title]))
    const byProject = new Map(projects.map((p) => [p.id, p.name]))
    return { labels, projects, pickLabels, pickProjects, sections, views: views.filter((v) => !v.deleted_at), webhooks, tasks, title: (id) => byTask.get(id) ?? '', projectName: (id) => byProject.get(id) ?? '' }
  }, [labels, projects, pickLabels, pickProjects, sections, views, tasks, webhooks])
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

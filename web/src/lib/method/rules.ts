// The Open Loops rules (OpenSpec change open-loops-method, design D3, spec
// method-views): what is actionable, a project's next action, projects without a
// next action, stalled projects, what waits, and contexts. Pure functions over
// local rows, nothing stored. `withoutNextAction` has a Go port in
// internal/digest (WithoutNextAction); both evaluate
// internal/digest/testdata/next_action_fixture.json and must agree.
import { openBlockers } from '../dependencies'
import { availability, projectFlowOf, type FlowState } from '../flow'
import { byPosition } from '../ordering'
import { effectiveSection } from '../sections'
import { canEditTasks, roleOf } from '../sharing'
import type { Label, Membership, Project, Section, Task } from '../types'
import { isDeferred, isSomeday } from '../views'
import { inMaintenance } from '../reviewCadence'

/** A project with no completion for this long, and open tasks older than it, is stalled. */
export const STALLED_DAYS = 21
/** Someday tasks created longer ago than this are "old" in the Monthly look. */
export const OLD_SOMEDAY_DAYS = 90
const DAY_MS = 86_400_000

export interface MethodInput {
  tasks: readonly Task[]
  projects: readonly Project[]
  sections?: readonly Section[]
  memberships: ReadonlyMap<string, Membership>
  me: string | null
  /** The user's local date, YYYY-MM-DD. */
  today: string
}

const open = (t: Task): boolean => !t.deleted_at && !t.completed_at

/** Live, unarchived projects in which the user may edit tasks: the ones the method works on. */
export function workingProjects(input: Pick<MethodInput, 'projects' | 'memberships'>): Project[] {
  const memberships = input.memberships as Map<string, Membership>
  return input.projects.filter((p) => !p.deleted_at && !p.archived && canEditTasks(roleOf(p.id, memberships)))
}

/** Prepared lookups for one input, so per-project rules do not rescan everything. */
export class MethodRules {
  readonly working: Project[]
  private readonly workingIds: Set<string>
  private readonly byId: Map<string, Task>
  private readonly sectionMap: Map<string, Section>
  private readonly openTop = new Map<string, Task[]>()
  /** Available and waiting in sequence (project-flow), from the same rows. */
  readonly flow: FlowState
  constructor(readonly input: MethodInput) {
    this.flow = availability({ tasks: input.tasks, projects: input.projects, sections: input.sections ?? [], today: input.today })
    this.working = workingProjects(input).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
    this.workingIds = new Set(this.working.map((p) => p.id))
    this.byId = new Map(input.tasks.map((t) => [t.id, t]))
    this.sectionMap = new Map((input.sections ?? []).map((s) => [s.id, s]))
    for (const t of input.tasks) {
      if (!open(t) || t.parent_id || !t.project_id) continue
      const list = this.openTop.get(t.project_id) ?? []
      list.push(t)
      this.openTop.set(t.project_id, list)
    }
  }

  /** Blocked by at least one live, open task. */
  blocked(t: Task): boolean {
    return openBlockers(t, this.byId).length > 0
  }

  /** Assigned to someone other than the user. */
  delegated(t: Task): boolean {
    return !!t.assignee_id && t.assignee_id !== this.input.me
  }

  /**
   * Actionable (method-views "Actionable tasks"): top-level, in a working project,
   * available (project-flow: live, open, not blocked, not waiting in sequence,
   * neither Someday nor deferred), and unassigned or assigned to the user.
   */
  actionable(t: Task): boolean {
    return !t.parent_id && !!t.project_id && this.workingIds.has(t.project_id) && this.flow.available(t.id) && !this.delegated(t)
  }

  /** Waiting (method-views "Waiting view"): live, open, blocked or assigned to someone else, and not waiting in sequence. */
  waiting(t: Task): boolean {
    return open(t) && (this.blocked(t) || this.delegated(t)) && !this.flow.waits(t.id)
  }

  /** An area (project-flow "Areas") is never without a next action. */
  isArea(projectId: string): boolean {
    return projectFlowOf(this.working.find((p) => p.id === projectId)) === 'area'
  }

  /** In maintenance (project-review-cadence, method-views "Maintenance projects are not flagged"): never stalled, never without a next action. */
  inMaintenance(projectId: string): boolean {
    return inMaintenance(this.working.find((p) => p.id === projectId))
  }

  /** The project's open top-level tasks in list order: no section first, then sections in order, manual order within. */
  inListOrder(projectId: string): Task[] {
    const sections = (this.input.sections ?? []).filter((s) => s.project_id === projectId && !s.deleted_at).sort(byPosition)
    const rank = new Map<string, number>(sections.map((s, i) => [s.id, i + 1]))
    const sectionRank = (t: Task) => rank.get(effectiveSection(t, this.sectionMap) ?? '') ?? 0
    return [...(this.openTop.get(projectId) ?? [])].sort((a, b) => sectionRank(a) - sectionRank(b) || byPosition(a, b))
  }

  /** The project's next action: its first actionable task in list order, or null. */
  nextActionOf(projectId: string): Task | null {
    return this.inListOrder(projectId).find((t) => this.actionable(t)) ?? null
  }

  /** The project's open top-level tasks that wait (blocked or delegated). */
  waitingIn(projectId: string): Task[] {
    return (this.openTop.get(projectId) ?? []).filter((t) => this.waiting(t))
  }

  /** The project's open top-level tasks deferred to a later start date. */
  deferredIn(projectId: string): Task[] {
    return (this.openTop.get(projectId) ?? []).filter((t) => isDeferred(t, this.input.today))
  }

  /** Without a next action: not an area, not in maintenance, and nothing actionable, nothing waiting and nothing deferred. */
  needsNextAction(projectId: string): boolean {
    if (this.isArea(projectId) || this.inMaintenance(projectId)) return false
    const list = this.openTop.get(projectId) ?? []
    return !list.some((t) => this.actionable(t) || this.waiting(t) || isDeferred(t, this.input.today))
  }

  /**
   * Stalled (method-views "Stalled projects"): open tasks, the oldest created more
   * than STALLED_DAYS ago, and no task of the project completed since then.
   */
  stalled(projectId: string, now: number): boolean {
    if (this.inMaintenance(projectId)) return false
    const list = this.openTop.get(projectId) ?? []
    if (!list.length) return false
    const since = now - STALLED_DAYS * DAY_MS
    if (Math.min(...list.map((t) => t.created_at)) >= since) return false
    return !this.input.tasks.some((t) => t.project_id === projectId && !t.deleted_at && !!t.completed_at && t.completed_at >= since)
  }
}

/** The working projects without a next action, in sidebar order (the review, the Loop home and the digest). */
export function withoutNextAction(input: MethodInput): Project[] {
  const rules = new MethodRules(input)
  return rules.working.filter((p) => rules.needsNextAction(p.id))
}

/** Every working project's next action, in project order. */
export function nextActions(input: MethodInput): { project: Project; task: Task }[] {
  const rules = new MethodRules(input)
  const out: { project: Project; task: Task }[] = []
  for (const project of rules.working) {
    const task = rules.nextActionOf(project.id)
    if (task) out.push({ project, task })
  }
  return out
}

/** Every waiting task the user can see, top-level or not, in the order given. */
export function waitingTasks(input: MethodInput): Task[] {
  const rules = new MethodRules(input)
  const archived = new Set(input.projects.filter((p) => p.deleted_at || p.archived).map((p) => p.id))
  return input.tasks.filter((t) => rules.waiting(t) && !(t.project_id && archived.has(t.project_id)))
}

/** A context is a label whose name starts with "@" (open-loops "Context labels"). */
export const isContext = (label: Pick<Label, 'name' | 'deleted_at'>): boolean => !label.deleted_at && label.name.trim().startsWith('@')

/** The context labels of a task, by label id; none means "Anywhere". */
export function contextsOf(task: Pick<Task, 'labels'>, labels: ReadonlyMap<string, Label>): Label[] {
  return task.labels.map((id) => labels.get(id)).filter((l): l is Label => !!l && isContext(l))
}

/** Someday tasks created more than OLD_SOMEDAY_DAYS ago, oldest first. */
export function oldSomeday(tasks: readonly Task[], now: number): Task[] {
  const before = now - OLD_SOMEDAY_DAYS * DAY_MS
  return tasks.filter((t) => open(t) && isSomeday(t) && t.created_at < before).sort((a, b) => a.created_at - b.created_at)
}

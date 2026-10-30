// How a project's tasks flow (OpenSpec change project-flow-modes): Parallel,
// Sequential or an Area, and the one derived "available" rule every list, view,
// filter and tool asks. Pure functions over local rows; nothing is stored, so a
// completion, a reorder or a flow change on any device converges with the rows.
//
// The Go twin is internal/flow; both evaluate internal/flow/testdata/flow_fixture.json
// and must agree. Change them together.
import { compareByPosition } from './ordering'
import type { Project, Section, Task } from './types'

export type ProjectFlow = 'parallel' | 'sequential' | 'area'
export type SectionFlow = '' | 'parallel' | 'sequential'

export const PROJECT_FLOWS: readonly ProjectFlow[] = ['parallel', 'sequential', 'area']
export const SECTION_FLOWS: readonly SectionFlow[] = ['', 'parallel', 'sequential']

/** A project's flow: empty, missing or unknown values read as Parallel (stored values are never rewritten). */
export function projectFlowOf(p: Pick<Project, 'flow_mode'> | undefined | null): ProjectFlow {
  const v = p?.flow_mode
  return v === 'sequential' || v === 'area' ? v : 'parallel'
}

/** A section's stored flow: '' (follow the project) for empty, missing, unknown and `area`. */
export function sectionFlowOf(s: Pick<Section, 'flow_mode'> | undefined | null): SectionFlow {
  const v = s?.flow_mode
  return v === 'parallel' || v === 'sequential' ? v : ''
}

/** The flow a section works by: its own, else its project's (an area's sections read as Parallel). */
export function effectiveSectionFlow(s: Pick<Section, 'flow_mode'>, project: ProjectFlow): 'parallel' | 'sequential' {
  const own = sectionFlowOf(s)
  if (own) return own
  return project === 'sequential' ? 'sequential' : 'parallel'
}

export type FlowTask = Pick<Task, 'id' | 'project_id' | 'parent_id' | 'section_id' | 'position' | 'completed_at' | 'deleted_at' | 'start' | 'blocked_by' | 'recurrence' | 'habit'>

export interface FlowInput {
  tasks: readonly FlowTask[]
  projects: readonly Pick<Project, 'id' | 'flow_mode'>[]
  sections: readonly Pick<Section, 'id' | 'project_id' | 'position' | 'deleted_at' | 'flow_mode'>[]
  /** The user's logical today, YYYY-MM-DD. */
  today: string
}

/** What holds a waiting task: the open step it comes after (a task) or the section that is the current step. */
export type HeldBy = { kind: 'task'; id: string } | { kind: 'section'; id: string }

export interface TaskFlow {
  available: boolean
  waits: boolean
  heldBy: HeldBy | null
}

const NOT: TaskFlow = { available: false, waits: false, heldBy: null }
const open = (t: FlowTask) => !t.deleted_at && !t.completed_at
/** Recurring tasks, habits and Someday never hold or wait in a sequence (design D4). */
const skipped = (t: FlowTask) => !!t.recurrence || !!t.habit || t.start === 'someday'
const MAX_DEPTH = 64

/** The flow state of every task in the input, by id. */
export class FlowState {
  private readonly out = new Map<string, TaskFlow>()
  private readonly holds = new Map<string, HeldBy>()

  constructor(input: FlowInput) {
    const byId = new Map(input.tasks.map((t) => [t.id, t]))
    this.sequence(input)
    for (const t of input.tasks) {
      if (!open(t)) { this.out.set(t.id, NOT); continue }
      // A subtask follows its top-level task's place in the sequence.
      let top = t
      for (let d = 0; top.parent_id && d < MAX_DEPTH; d++) {
        const p = byId.get(top.parent_id)
        if (!p) break
        top = p
      }
      const heldBy = this.holds.get(top.id) ?? null
      const blocked = (t.blocked_by ?? []).some((id) => { const b = byId.get(id); return !!b && open(b) })
      const later = !!t.start && t.start !== 'someday' && t.start > input.today
      this.out.set(t.id, { available: !heldBy && !blocked && t.start !== 'someday' && !later, waits: !!heldBy, heldBy })
    }
  }

  /** Marks the open top-level tasks that wait in sequence, per project (spec "Waiting in sequence"). */
  private sequence(input: FlowInput) {
    const flows = new Map(input.projects.map((p) => [p.id, projectFlowOf(p)]))
    const sections = new Map(input.sections.map((s) => [s.id, s]))
    const byProject = new Map<string, FlowTask[]>()
    for (const t of input.tasks) {
      if (!open(t) || t.parent_id || !t.project_id) continue
      const list = byProject.get(t.project_id) ?? []
      list.push(t)
      byProject.set(t.project_id, list)
    }
    for (const [projectId, tasks] of byProject) {
      const flow = flows.get(projectId) ?? 'parallel'
      const live = input.sections.filter((s) => s.project_id === projectId && !s.deleted_at).sort(compareByPosition)
      const sectionOf = (t: FlowTask) => {
        const s = t.section_id ? sections.get(t.section_id) : undefined
        return s && !s.deleted_at && s.project_id === projectId ? s.id : null
      }
      const loose = tasks.filter((t) => !sectionOf(t)).sort(compareByPosition)
      const inSection = (id: string) => tasks.filter((t) => sectionOf(t) === id).sort(compareByPosition)
      // Inside one sequential group, the first candidate is offered and every later candidate waits on it.
      const oneByOne = (list: FlowTask[]) => {
        const cand = list.filter((t) => !skipped(t))
        for (const t of cand.slice(1)) this.holds.set(t.id, { kind: 'task', id: cand[0].id })
      }
      if (flow !== 'sequential') {
        for (const s of live) if (effectiveSectionFlow(s, flow) === 'sequential') oneByOne(inSection(s.id))
        continue
      }
      // Sequential: loose tasks are one step each, then each section is one step.
      const steps: { held: HeldBy; tasks: FlowTask[]; section?: Pick<Section, 'flow_mode'> }[] = [
        ...loose.map((t) => ({ held: { kind: 'task', id: t.id } as HeldBy, tasks: [t] })),
        ...live.map((s) => ({ held: { kind: 'section', id: s.id } as HeldBy, tasks: inSection(s.id), section: s })),
      ]
      let current: HeldBy | null = null
      for (const step of steps) {
        const cand = step.tasks.filter((t) => !skipped(t))
        if (current) { for (const t of cand) this.holds.set(t.id, current); continue }
        if (!cand.length) continue
        // The current step: a section offers all its tasks (Parallel) or one by one.
        if (step.section && effectiveSectionFlow(step.section, flow) === 'sequential') oneByOne(step.tasks)
        current = step.held
      }
    }
  }

  get(id: string): TaskFlow {
    return this.out.get(id) ?? NOT
  }

  /** Available (project-flow "Available tasks"): live, open, not blocked, not waiting, neither Someday nor deferred. */
  available(id: string): boolean {
    return this.get(id).available
  }

  /** Waiting in sequence (for itself or through its top-level task). */
  waits(id: string): boolean {
    return this.get(id).waits
  }
}

/** The flow state of every task. Compute once per view and ask it per row. */
export function availability(input: FlowInput): FlowState {
  return new FlowState(input)
}

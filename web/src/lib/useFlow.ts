// The flow state of the live rows for a screen (OpenSpec change project-flow-modes):
// one computation per change of tasks, projects, sections or the day, shared by
// a view's rows, its Today grouping and its filter.
import { useMemo, useRef } from 'react'
import { availability, type FlowState } from './flow'
import { t } from './i18n'
import { useAllProjects, useLiveSections } from './localData'
import type { Project, Section, Task } from './types'
import { changesBetween, noteKeys } from './taskDelta'

export interface FlowView {
  state: FlowState
  /** The title of the step a task waits for (a task or a section), or null when it does not wait. */
  waitsFor(id: string): string | null
  /** Blocked or waiting in sequence: what Today folds into its Blocked group. */
  held(blocked: { has(id: string): boolean }): { has(id: string): boolean }
  /** The live sections it was computed from (a filter context needs them too). */
  sections: readonly Section[]
}

const NO_TASKS: Task[] = []

/** The flow view over the given live tasks (every task, so steps outside the view still hold). */
export function flowView(tasks: readonly Task[], state: FlowState, sections: readonly Section[], known?: ReadonlyMap<string, Task>): FlowView {
  // Built when first asked: a list asks only for the steps its rows wait for (list-rendering-at-scale D6).
  let byId: ReadonlyMap<string, Task> | null = known ?? null
  let sectionById: Map<string, Section> | null = null
  return {
    state, sections,
    waitsFor(id) {
      const held = state.get(id).heldBy
      if (!held) return null
      if (held.kind === 'section') return (sectionById ??= new Map(sections.map((s) => [s.id, s]))).get(held.id)?.name || t('Untitled')
      return (byId ??= new Map(tasks.map((x) => [x.id, x]))).get(held.id)?.title || t('Untitled')
    },
    held: (blocked) => ({ has: (id) => blocked.has(id) || state.waits(id) }),
  }
}

/**
 * The flow view of `tasks` after the last one's (incremental-list-updates D2): when `tasks`
 * was patched from `last.tasks` and nothing else changed, the new state keeps the
 * sequences of the projects the write did not touch, and the view notes the tasks whose
 * wait may differ (noteKeys) so rows compare only those.
 */
export function nextFlowView(last: { tasks: readonly Task[]; projects: readonly Project[]; sections: readonly Section[]; today: string; view: FlowView } | null,
  tasks: readonly Task[], projects: readonly Project[], sections: readonly Section[], today: string, byId?: ReadonlyMap<string, Task>): FlowView {
  const input = { tasks, projects, sections, today, byId }
  const changes = last && last.projects === projects && last.sections === sections && last.today === today ? changesBetween(last.tasks, tasks) : null
  if (!last || !changes) return flowView(tasks, availability(input), sections, byId)
  if (!changes.length) return last.view
  const { state, keys } = last.view.state.next(input, changes)
  const view = flowView(tasks, state, sections, byId)
  if (keys) noteKeys(last.view, view, keys)
  return view
}

/** `byId`: the same tasks by id, when the caller has that map already. */
export function useFlowView(tasks: readonly Task[] | undefined, today: string, byId?: ReadonlyMap<string, Task>): FlowView {
  const projects = useAllProjects()
  const sections = useLiveSections()
  const list = tasks ?? NO_TASKS
  const last = useRef<Parameters<typeof nextFlowView>[0]>(null)
  return useMemo(() => {
    const view = nextFlowView(last.current, list, projects, sections, today, byId)
    last.current = { tasks: list, projects, sections, today, view }
    return view
  }, [list, projects, sections, today, byId])
}

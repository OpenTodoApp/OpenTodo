// The flow state of the live rows for a screen (OpenSpec change project-flow-modes):
// one computation per change of tasks, projects, sections or the day, shared by
// a view's rows, its Today grouping and its filter.
import { useMemo } from 'react'
import { availability, type FlowState } from './flow'
import { t } from './i18n'
import { useAllProjects, useLiveSections } from './localData'
import type { Section, Task } from './types'

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
export function flowView(tasks: readonly Task[], state: FlowState, sections: readonly Section[]): FlowView {
  const byId = new Map(tasks.map((x) => [x.id, x]))
  const sectionById = new Map(sections.map((s) => [s.id, s]))
  return {
    state, sections,
    waitsFor(id) {
      const held = state.get(id).heldBy
      if (!held) return null
      if (held.kind === 'section') return sectionById.get(held.id)?.name || t('Untitled')
      return byId.get(held.id)?.title || t('Untitled')
    },
    held: (blocked) => ({ has: (id) => blocked.has(id) || state.waits(id) }),
  }
}

export function useFlowView(tasks: readonly Task[] | undefined, today: string): FlowView {
  const projects = useAllProjects()
  const sections = useLiveSections()
  const list = tasks ?? NO_TASKS
  return useMemo(() => flowView(list, availability({ tasks: list, projects, sections, today }), sections), [list, projects, sections, today])
}

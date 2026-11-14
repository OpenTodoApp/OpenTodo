// The Completed view's own display options (OpenSpec change completed-view-review):
// the projects it is narrowed to and whether it groups by day or by project, kept on
// this device and never synced, like the Calendar's filter. The search text is the
// view's own state and is not kept. Pure filtering over local data, offline included.
import { createPersistedStore } from './deviceStorage'
import type { Task } from './types'

export type CompletedGroupBy = 'day' | 'project'

export interface CompletedDisplay {
  groupBy: CompletedGroupBy
  /** Project ids the logbook is narrowed to; '' is the Inbox (no project); empty shows every task. */
  projects: string[]
}

export const COMPLETED_DISPLAY_KEY = 'completed.display'
const DEFAULT: CompletedDisplay = { groupBy: 'day', projects: [] }

/** A stored value, or the default when absent or not understood. */
export function parseCompletedDisplay(raw: string | null): CompletedDisplay {
  if (!raw) return DEFAULT
  try {
    const v = JSON.parse(raw) as Partial<CompletedDisplay>
    return {
      groupBy: v.groupBy === 'project' ? 'project' : 'day',
      projects: Array.isArray(v.projects) ? [...new Set(v.projects.filter((p): p is string => typeof p === 'string'))] : [],
    }
  } catch {
    return DEFAULT
  }
}

const store = createPersistedStore<CompletedDisplay>('completed-display', COMPLETED_DISPLAY_KEY, {
  parse: parseCompletedDisplay,
  serialize: (v) => (v.groupBy === 'day' && v.projects.length === 0 ? null : JSON.stringify(v)),
})

export const useCompletedDisplay = store.use
export const completedDisplay = store.get

export function setCompletedDisplay(patch: Partial<CompletedDisplay>): void {
  store.update((d) => ({ ...d, ...patch }))
}

/** Is the view showing anything other than every completion by day? */
export function isNarrowed(d: CompletedDisplay, query: string): boolean {
  return d.projects.length > 0 || query.trim() !== ''
}

/** Text for comparison: decomposed, lower-cased, without combining marks. */
export function foldSearch(s: string): string {
  return s.normalize('NFKD').toLowerCase().replace(/\p{M}/gu, '')
}

/**
 * The tasks the view lists: in one of the chosen projects (the Inbox as ''), and
 * with every word of the search in the title or the notes. Order is kept.
 */
export function filterCompleted(tasks: readonly Task[], d: CompletedDisplay, query: string): Task[] {
  const projects = d.projects.length ? new Set(d.projects) : null
  const words = foldSearch(query).split(/\s+/).filter(Boolean)
  if (!projects && words.length === 0) return tasks as Task[]
  return tasks.filter((task) => {
    if (projects && !projects.has(task.project_id ?? '')) return false
    if (words.length === 0) return true
    const text = foldSearch(`${task.title ?? ''}\n${task.description ?? ''}`)
    return words.every((w) => text.includes(w))
  })
}

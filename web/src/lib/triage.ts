// Processing the Inbox one task at a time (OpenSpec change inbox-triage, design
// D2): the queue is a snapshot of the Inbox when the mode opens plus tasks that
// arrive meanwhile, minus tasks that leave it. Pure; the view feeds it the live
// tasks and renders the current one.
import type { Task } from './types'
import { t } from './i18n'
import { isInboxTask } from './inbox'

export interface TriageState {
  /** The queue in order: the Inbox order when the mode opened, arrivals appended. */
  ids: string[]
  /** Position of the current task in ids; ids.length when the queue is done. */
  index: number
  /** Tasks decided or skipped this session; a revisit (k) does not count twice. */
  handled: Set<string>
}

type QueueTask = Pick<Task, 'id' | 'project_id' | 'parent_id' | 'completed_at' | 'deleted_at' | 'position' | 'due'> & { start?: string | null }

/** Whether a task belongs in the queue: a top-level Inbox task (lib/inbox, inbox-means-unplaced). */
export function qualifies(item: QueueTask): boolean {
  return item.parent_id === null && isInboxTask(item)
}

const byInboxOrder = (a: QueueTask, b: QueueTask) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/** The queue for a set of tasks, in the Inbox's manual order (or a given comparator). */
export function buildQueue(tasks: readonly QueueTask[], order: (a: QueueTask, b: QueueTask) => number = byInboxOrder): string[] {
  return tasks.filter(qualifies).sort(order).map((item) => item.id)
}

export function startTriage(tasks: readonly QueueTask[]): TriageState {
  return { ids: buildQueue(tasks), index: 0, handled: new Set() }
}

/** The current task id, or null when the queue is done. */
export function current(state: TriageState): string | null {
  return state.ids[state.index] ?? null
}

/** A decision or a skip on the current task: it counts once and the queue moves on. */
export function advance(state: TriageState): TriageState {
  const id = current(state)
  if (id === null) return state
  const handled = new Set(state.handled)
  handled.add(id)
  return { ...state, index: state.index + 1, handled }
}

/** k: back to the previous task, without changing what was counted. */
export function back(state: TriageState): TriageState {
  return { ...state, index: Math.max(0, state.index - 1) }
}

/**
 * Follow the live tasks: ids that no longer qualify leave the queue, new
 * qualifying ids join its end. `left` reports whether the current task left
 * (the view announces it was moved elsewhere).
 */
export function advanceQueue(state: TriageState, live: readonly QueueTask[]): { state: TriageState; left: boolean } {
  const ok = new Set(live.filter(qualifies).map((item) => item.id))
  const cur = current(state)
  // Tasks decided this session keep their place (the count stays stable after a
  // complete, trash or move); only undecided tasks that stop qualifying leave.
  const stays = (id: string) => ok.has(id) || state.handled.has(id)
  const kept = state.ids.filter(stays)
  const removedBefore = state.ids.slice(0, state.index).filter((id) => !stays(id)).length
  const arrivals = buildQueue(live).filter((id) => !state.ids.includes(id))
  const ids = [...kept, ...arrivals]
  const left = cur !== null && !stays(cur)
  return { state: { ids, index: state.index - removedBefore, handled: state.handled }, left }
}

/** "n of N": n is the position of the task on screen (inbox-triage "Queue and progress"). */
export function progress(state: TriageState): { n: number; total: number; done: boolean } {
  const total = state.ids.length
  const done = state.index >= total
  return { n: done ? total : state.index + 1, total, done }
}

/** What the live region says for the task on screen: "4 of 17: Call the plumber". */
export function positionText(state: TriageState, title: string): string {
  const p = progress(state)
  return t('{n} of {total}: {title}', { n: p.n, total: p.total, title })
}

export type Outcome =
  | { kind: 'completed' }
  | { kind: 'trashed' }
  | { kind: 'scheduled'; date: string }
  | { kind: 'moved'; project: string }
  | { kind: 'delegated'; person: string }
  | { kind: 'someday' }
  | { kind: 'skipped' }
  | { kind: 'left' }

/** The words announced for a decision, before the next task is announced. */
export function outcomeText(o: Outcome): string {
  switch (o.kind) {
    case 'completed': return t('Completed.')
    case 'trashed': return t('Moved to the Trash.')
    case 'scheduled': return t('Scheduled for {date}.', { date: o.date })
    case 'moved': return t('Moved to {project}.', { project: o.project })
    case 'delegated': return t('Assigned to {name}.', { name: o.person })
    case 'someday': return t('Parked for someday.')
    case 'skipped': return t('Skipped.')
    case 'left': return t('This task was moved elsewhere.')
  }
}

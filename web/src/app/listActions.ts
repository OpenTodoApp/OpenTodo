// List actions as a small imperative API (OpenSpec `vim-keybindings`, design D3).
// TaskListView registers the state of the list it shows while it is mounted (a few
// getters and setters, the only part in the main bundle); the optional Vim layer
// turns it into actions with makeListActions (vim/actions.ts). Every write goes
// through the same mutate()-backed helpers as the buttons and default shortcuts,
// so it works offline and converges.
import { todayISO } from '../lib/dates'
import type { Priority, Task } from '../lib/types'
import type { Route } from './router'

export interface ListActions {
  /** Move the selection by n rows (negative = up), clamped; within the column on a board. */
  moveSelection(n: number): void
  /** Select the row at index i (0-based, clamped); a negative index selects the last row. */
  selectIndex(i: number): void
  selectFirst(): void
  selectLast(): void
  /** Open the selected task's detail panel; returns its id, or null when nothing is selected. */
  openSelected(): string | null
  toggleCompleteSelected(): Promise<void>
  deleteSelected(): Promise<void>
  setPrioritySelected(p: Priority): Promise<void>
  /** Move the selected task n places within its list (manually ordered views only). */
  moveSelectedBy(n: number): Promise<void>
  /** Focus quick add; in a manually ordered view the next task lands after the selection. */
  openQuickAdd(): boolean
  /** Close the detail panel, else clear the selection. */
  closePanel(): void
}

/** What a list exposes to build its actions; getters read the latest render. */
export interface ListState {
  rows(): Task[]
  /** Board columns (top-level cards per column), or null outside the board. */
  columns(): Task[][] | null
  selected(): string | null
  select(id: string | null): void
  openId(): string | null
  open(id: string | null): void
  readOnly(t: Task): boolean
  /** Whether the view is manually ordered (manual-ordering). */
  manual(): boolean
  /** Focus the quick-add line, remembering the task to insert after; false when there is none. */
  focusQuickAdd(after: string | null): boolean
  /** Complete or reopen, with the list's follow-ups (parent prompt, archive offer). */
  toggleComplete(id: string, completed: boolean): Promise<void>
}

let current: ListState | null = null

/** TaskListView registers its state while mounted; the returned function unregisters. */
export function registerListState(state: ListState): () => void {
  current = state
  return () => {
    if (current === state) current = null
  }
}

/** The state of the list on screen, or null outside task lists. */
export function listState(): ListState | null {
  return current
}

/**
 * The defaults a view gives a new task (quick add and `:new`): the project of a
 * project view, today / tomorrow in Today / Upcoming, the label of a label view,
 * yourself in Assigned to me. Typed attributes override them.
 */
export function taskDefaults(route: Route, today: string, userId?: string): { project_id: string | null; due: Task['due']; labels: string[]; assignee_id?: string } {
  return {
    project_id: route.view === 'project' ? route.id : null,
    due: route.view === 'today' ? { date: today } : route.view === 'upcoming' ? { date: addDays(today, 1) } : null,
    labels: route.view === 'label' ? [route.id] : [],
    ...(route.view === 'assigned' && userId ? { assignee_id: userId } : {}),
  }
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return todayISO(new Date(y, m - 1, d + n))
}

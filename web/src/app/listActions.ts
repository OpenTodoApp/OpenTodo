// List actions as a small imperative API (OpenSpec `vim-keybindings`, design D3).
// TaskListView registers the actions of the list it shows while it is mounted; the
// optional Vim layer calls them. Every write goes through the same mutate()-backed
// helpers as the buttons and default shortcuts, so it works offline and converges.
import { todayISO } from '../lib/dates'
import { deleteTask, updateTask } from '../lib/ops'
import { moveTaskBy } from '../lib/move'
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

export function makeListActions(s: ListState): ListActions {
  const selectedRow = () => {
    const rows = s.rows()
    const idx = rows.findIndex((t) => t.id === s.selected())
    return { rows, idx, task: idx >= 0 ? rows[idx] : undefined }
  }
  const writable = (t: Task | undefined): t is Task => !!t && !s.readOnly(t)
  const a: ListActions = {
    moveSelection(n) {
      const cols = s.columns()
      if (cols) {
        const col = cols.findIndex((c) => c.some((t) => t.id === s.selected()))
        if (col < 0) {
          s.select(cols.find((c) => c.length)?.[0]?.id ?? null)
          return
        }
        const cards = cols[col]
        const pos = cards.findIndex((t) => t.id === s.selected())
        s.select(cards[Math.max(0, Math.min(cards.length - 1, pos + n))].id)
        return
      }
      const { rows, idx } = selectedRow()
      if (!rows.length) return
      s.select(rows[Math.max(0, Math.min(rows.length - 1, idx + n))].id)
    },
    selectIndex(i) {
      const rows = s.rows()
      if (!rows.length) return
      s.select(rows[i < 0 ? rows.length - 1 : Math.min(rows.length - 1, i)].id)
    },
    selectFirst: () => a.selectIndex(0),
    selectLast: () => a.selectIndex(-1),
    openSelected() {
      const id = s.selected()
      if (id) s.open(id)
      return id
    },
    async toggleCompleteSelected() {
      const { task } = selectedRow()
      if (writable(task)) await s.toggleComplete(task.id, !task.completed_at)
    },
    async deleteSelected() {
      const { rows, idx, task } = selectedRow()
      if (!writable(task)) return
      // Same as Delete: the selection moves to the next row (or the previous one).
      s.select(rows[idx + 1]?.id ?? rows[idx - 1]?.id ?? null)
      if (s.openId() === task.id) s.open(null)
      await deleteTask(task.id)
    },
    async setPrioritySelected(p) {
      const { task } = selectedRow()
      if (writable(task)) await updateTask(task.id, { priority: p })
    },
    async moveSelectedBy(n) {
      const { task } = selectedRow()
      if (!writable(task) || !s.manual()) return
      for (let i = 0; i < Math.abs(n); i++) if (!(await moveTaskBy(task.id, n < 0 ? -1 : 1))) break
    },
    openQuickAdd() {
      return s.focusQuickAdd(s.manual() ? s.selected() : null)
    },
    closePanel() {
      if (s.openId()) s.open(null)
      else s.select(null)
    },
  }
  return a
}

let current: ListActions | null = null

/** TaskListView registers while mounted; the returned function unregisters. */
export function registerListActions(actions: ListActions): () => void {
  current = actions
  return () => {
    if (current === actions) current = null
  }
}

/** The actions of the list on screen, or null outside task lists. */
export function listActions(): ListActions | null {
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

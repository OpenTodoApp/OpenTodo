// Actions over a registered list (vim-keybindings, design D3). Lives in the lazy
// Vim chunk; the main bundle only carries the ListState registry.
import { deleteTask, updateTask } from '../../lib/ops'
import { moveTaskBy } from '../../lib/move'
import type { Task } from '../../lib/types'
import { listState, type ListActions, type ListState } from '../listActions'
import { runBulk } from '../bulk/BulkActions'

export function makeListActions(s: ListState): ListActions {
  const selectedRow = () => {
    const rows = s.rows()
    const idx = rows.findIndex((tk) => tk.id === s.selected())
    return { rows, idx, task: idx >= 0 ? rows[idx] : undefined }
  }
  const writable = (item: Task | undefined): item is Task => !!item && !s.readOnly(item)
  const a: ListActions = {
    moveSelection(n) {
      const cols = s.columns()
      if (cols) {
        const col = cols.findIndex((c) => c.some((tVar) => tVar.id === s.selected()))
        if (col < 0) {
          s.select(cols.find((c) => c.length)?.[0]?.id ?? null)
          return
        }
        const cards = cols[col]
        const pos = cards.findIndex((tVar) => tVar.id === s.selected())
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
      // With tasks ticked, `x` acts on the whole selection (bulk-edit D2).
      const ticked = s.ticked?.() ?? []
      if (ticked.length) { await runBulk(ticked, { kind: 'complete' }); return }
      const { task } = selectedRow()
      if (writable(task)) await s.toggleComplete(task.id, !task.completed_at)
    },
    async deleteSelected() {
      const ticked = s.ticked?.() ?? []
      if (ticked.length) { await runBulk(ticked, { kind: 'trash' }); return }
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

const cache = new WeakMap<ListState, ListActions>()

/** The actions of the list on screen, or null outside task lists. */
export function listActions(): ListActions | null {
  const s = listState()
  if (!s) return null
  let a = cache.get(s)
  if (!a) cache.set(s, (a = makeListActions(s)))
  return a
}

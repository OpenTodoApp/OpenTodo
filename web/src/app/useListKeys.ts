// Keyboard handling shared by the Filter view and saved views: j / k (or arrows) move
// the selection, Enter opens, c completes, 1–4 set priority, L opens labels, Delete
// deletes, e edits the estimate, d the deadline, n parks, Shift+N defers, Shift+E
// toggles This Evening, Esc closes the innermost layer. Keys typed into text fields are ignored.
import { useEffect, useRef } from 'react'
import { deleteTask, parkTask, setTaskCompleted, unparkTask, updateTask } from '../lib/ops'
import type { Priority, Task } from '../lib/types'
import { deadlineFocus, deferFocus, estimateFocus, isGPending } from './signals'
import { isTyping } from './useViews'
import { registerListState } from './listActions'
import type { BulkList } from './bulk/useBulkList'
import { runBulk } from './bulk/BulkActions'
import { isVimEnabled } from './vim/prefs'

export interface KeyRow {
  key: string
  task: Task
}

export interface ListKeys {
  rows: KeyRow[]
  selected: string | null
  setSelected: (key: string | null) => void
  openId: string | null
  setOpenId: (id: string | null) => void
  pickerFor: string | null
  setPickerFor: (id: string | null) => void
  /** Esc with nothing open and nothing to close. */
  onIdleEscape: () => void
  /** Extra keys; return true when handled. */
  extra?: (e: KeyboardEvent, row: Task | undefined) => boolean
  /** While set (e.g. the view's own modal is open) no key is handled. */
  paused?: boolean
  /** Bulk selection (bulk-edit D2): x / Space tick, Shift+↓/↑ extend, `.`, Ctrl/⌘+A, and the action keys on the ticked set. */
  bulk?: BulkList
}

export function useListKeys(opts: ListKeys): void {
  const ref = useRef(opts)
  ref.current = opts
  // The Filter view and saved views expose their list to the command palette too
  // (search-and-command-palette D5), as TaskListView does.
  useEffect(() => registerListState({
    rows: () => ref.current.rows.map((r) => r.task),
    columns: () => null,
    selected: () => ref.current.rows.find((r) => r.key === ref.current.selected)?.task.id ?? null,
    select: (id) => ref.current.setSelected(id === null ? null : ref.current.rows.find((r) => r.task.id === id)?.key ?? null),
    openId: () => ref.current.openId,
    open: (id) => ref.current.setOpenId(id),
    readOnly: () => false,
    ticked: () => ref.current.bulk?.ticked ?? [],
    tick: (ids) => ref.current.bulk?.selection.set(ids),
    openActions: (picker) => ref.current.bulk?.openActions(picker ?? null),
    manual: () => false,
    focusQuickAdd: () => false,
    toggleComplete: (id, completed) => setTaskCompleted(id, completed),
    openLabels: (id) => ref.current.setPickerFor(id),
  }), [])
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const o = ref.current
      const b = o.bulk
      if (b && (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'a' && b.ticked.length > 0 && !isTyping(e) && !o.paused && !document.querySelector('[role="dialog"]')) {
        e.preventDefault()
        b.selection.selectAll()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e) || o.paused || isGPending()) return
      if (e.key === 'Escape' && b && b.ticked.length && !o.pickerFor && !o.openId) {
        b.selection.clear()
        return
      }
      if (e.key === 'Escape') {
        if (o.pickerFor) o.setPickerFor(null)
        else if (o.openId) o.setOpenId(null)
        else o.onIdleEscape()
        return
      }
      // No list keys behind a dialog (label picker, name prompt).
      if (document.querySelector('[role="dialog"]')) return
      const { rows } = o
      const idx = rows.findIndex((r) => r.key === o.selected)
      const row = idx >= 0 ? rows[idx].task : undefined
      if (o.extra?.(e, row)) return
      if (b) {
        if ((e.key === 'x' || e.key === ' ') && row) { e.preventDefault(); b.selection.toggle(row.id); return }
        if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || (!isVimEnabled() && (e.key === 'J' || e.key === 'K')))) {
          e.preventDefault()
          const at = row ? b.order.indexOf(row.id) : -1
          const next = b.order[Math.max(0, Math.min(b.order.length - 1, at + (e.key === 'ArrowDown' || e.key === 'J' ? 1 : -1)))]
          if (!next) return
          if (b.ticked.length === 0 && row) b.selection.toggle(row.id)
          b.selection.extendTo(next)
          o.setSelected(rows.find((r) => r.task.id === next)?.key ?? null)
          return
        }
        if (e.key === '.' && (b.ticked.length || row)) { e.preventDefault(); b.openActions(); return }
        if (b.ticked.length) {
          switch (e.key) {
            case 'c': e.preventDefault(); void runBulk(b.ticked, { kind: 'complete' }); return
            case '1': case '2': case '3': case '4': e.preventDefault(); void runBulk(b.ticked, { kind: 'priority', priority: Number(e.key) as Priority }); return
            case 'L': e.preventDefault(); b.openActions('labels'); return
            case 'Delete': case 'Backspace': e.preventDefault(); void runBulk(b.ticked, { kind: 'trash' }); return
          }
        }
      }
      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault()
          o.setSelected(rows[Math.min(rows.length - 1, idx + 1)]?.key ?? null)
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          o.setSelected(rows[Math.max(0, idx - 1)]?.key ?? null)
          break
        case 'Enter':
          if (row) {
            e.preventDefault()
            o.setOpenId(row.id)
          }
          break
        case 'c':
          if (row) void setTaskCompleted(row.id, !row.completed_at)
          break
        case 'L':
          if (row) {
            e.preventDefault()
            o.setPickerFor(row.id)
          }
          break
        case 'e':
          if (row) {
            e.preventDefault()
            estimateFocus.request(row.id)
            o.setOpenId(row.id)
          }
          break
        case 'n':
          // Park or un-park (someday-and-evening D5).
          if (row) {
            e.preventDefault()
            void (row.start === 'someday' ? unparkTask(row.id) : parkTask(row.id))
          }
          break
        case 'N':
          if (row) {
            e.preventDefault()
            deferFocus.request(row.id)
            o.setOpenId(row.id)
          }
          break
        case 'E':
          if (row) {
            e.preventDefault()
            void updateTask(row.id, { evening: !row.evening })
          }
          break
        case 'd':
          if (row) {
            e.preventDefault()
            deadlineFocus.request(row.id)
            o.setOpenId(row.id)
          }
          break
        case '1':
        case '2':
        case '3':
        case '4':
          if (row) void updateTask(row.id, { priority: Number(e.key) as Priority })
          break
        case 'Delete':
        case 'Backspace':
          if (row) {
            e.preventDefault()
            void deleteTask(row.id)
            o.setSelected(rows[idx + 1]?.key ?? rows[idx - 1]?.key ?? null)
          }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

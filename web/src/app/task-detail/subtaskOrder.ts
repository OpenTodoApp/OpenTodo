// Reordering subtasks where a task lists them (OpenSpec change subtask-panel-order,
// GitHub issue 1577): each open subtask has a handle to drag, to press Alt+Up or
// Alt+Down on, or to open for Move up and Move down. The write is lib/move's, the
// same one a project list uses, so the order is the one every list shows.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { t } from '../../lib/i18n'
import { moveRowWithUndo, stepRowWithUndo } from '../undoable'
import type { Task } from '../../lib/types'

/** `list` with the item at `from` put at `to`. */
function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list]
  out.splice(to, 0, ...out.splice(from, 1))
  return out
}

/**
 * The order of a task's subtasks while one is dragged, and the handle of each open
 * one. Completed subtasks keep their place and have no handle: a move is among the
 * open ones, as in a project list.
 */
export function useSubtaskOrder(parent: Task, items: Task[]) {
  // While a handle is dragged, the order shown before it is written.
  const [draft, setDraft] = useState<Task[] | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  const rows = useRef<(HTMLLIElement | null)[]>([])
  const drag = useRef<{ id: string; from: number } | null>(null)
  const list = draft ?? items
  const open = list.filter((c) => !c.completed_at)

  const say = (c: Task, place: number) => setAnnounce(t('{name} moved to position {n} of {count}', { name: c.title || t('Untitled'), n: place, count: open.length }))
  const step = async (c: Task, delta: -1 | 1 | 'top' | 'bottom') => {
    const to = delta === 'top' ? 0 : delta === 'bottom' ? open.length - 1 : open.indexOf(c) + delta
    if (!(await stepRowWithUndo(c.id, delta))) return
    say(c, to + 1)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-subtask-row="${c.id}"] [data-move-handle]`)?.focus())
  }
  const onMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d || !draft) return
    const at = rows.current.findIndex((el) => { const r = el?.getBoundingClientRect(); return !!r && e.clientY >= r.top && e.clientY < r.bottom })
    const from = draft.findIndex((c) => c.id === d.id)
    if (at >= 0 && at < draft.length && at !== from) setDraft(moved(draft, from, at))
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    const at = d && draft ? draft.findIndex((c) => c.id === d.id) : -1
    if (d && draft && at !== d.from) {
      // The place among the open subtasks: after the open one above it, else before the open one below.
      const above = draft.slice(0, at).reverse().find((c) => !c.completed_at)
      const below = draft.slice(at + 1).find((c) => !c.completed_at)
      const place = above ? { after: above.id } : below ? { before: below.id } : null
      const c = draft[at]
      if (place) void moveRowWithUndo(d.id, { parent_id: parent.id, at: place }).then((ok) => { if (ok) say(c, open.indexOf(c) + 1) })
    }
    setDraft(null)
    setDragging(null)
  }
  const handle = (c: Task) => ({
    label: t('Move {name} (Alt+Up or Alt+Down)', { name: c.title || t('Untitled') }),
    first: open[0] === c,
    last: open[open.length - 1] === c,
    onMove: (delta: -1 | 1) => { void step(c, delta) },
    onKeyDown: (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
      e.preventDefault()
      // Alt+Shift goes to the top or the bottom, as in a project list (manual-ordering "Keyboard moves").
      void step(c, e.shiftKey ? (e.key === 'ArrowUp' ? 'top' : 'bottom') : e.key === 'ArrowUp' ? -1 : 1)
    },
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture?.(e.pointerId)
      drag.current = { id: c.id, from: list.indexOf(c) }
      setDragging(c.id)
      setDraft(list)
    },
  })
  return { list, rows, dragging, announce, handle, listProps: { onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp } }
}

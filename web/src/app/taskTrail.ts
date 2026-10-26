// The way into and out of the task page (OpenSpec change task-full-page, design D2):
// opening a task from a list remembers where it was opened (the address, the page's
// name, the list's tasks in order, the scroll position), so the page can show "4 / 12",
// step to the next or previous task with j and k, and Esc returns to the same list
// with the same row selected at the same scroll position. Module state, like the
// panel slot: it survives the route change it causes and is dropped once the user
// goes anywhere other than a task page.
import { useSyncExternalStore } from 'react'
import { listState } from './listActions'
import { navigate, parseRoute } from './router'
import { selectTask } from './signals'
import { resettable } from '../lib/moduleState'

export interface TaskTrail {
  /** The address the task was opened from (path, query and hash). */
  from: string
  /** That page's name, for the breadcrumb and the phone's Back ("Today"). */
  label: string
  /** The tasks of that list in display order; the page counts and steps through them. */
  ids: string[]
  /** The content's scroll position when the task was opened. */
  scroll: number
  /** The opener was a task list, which selects a row it is handed on return. */
  list: boolean
  /** `history.length` right after the page was pushed: Esc can go back instead of forward. */
  depth: number
}

let trail: TaskTrail | null = null
/** A return in progress: the task to select and the scroll to restore once `from` shows. */
let returning: { from: string; id: string; scroll: number } | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

const TASK_PATH = /^\/task\//

function content(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.getElementById('content')
}

/** The open page's name: its heading, else the phone bar's title. */
function pageLabel(): string {
  if (typeof document === 'undefined') return ''
  const el = document.querySelector<HTMLElement>('[data-page-title]') ?? document.querySelector<HTMLElement>('[data-phone-title]')
  return el?.textContent?.trim() ?? ''
}

/** The tasks on screen in order: the registered list's rows, else the rows in the document. */
function listedIds(): { ids: string[]; list: boolean } {
  const state = listState()
  if (state) return { ids: state.rows().filter((t) => !t.deleted_at).map((t) => t.id), list: true }
  if (typeof document === 'undefined') return { ids: [], list: false }
  const seen = new Set<string>()
  for (const el of document.querySelectorAll<HTMLElement>('[data-task-id]')) {
    const id = el.dataset.taskId
    if (id) seen.add(id)
  }
  return { ids: [...seen], list: false }
}

/** The page's address with its query (a filter's text), which is what Esc returns to. */
export function currentAddress(): string {
  return typeof location === 'undefined' ? '/' : `${location.pathname}${location.search}`
}

/**
 * Open a task as a page. From a list: remember the list and push the page. From the
 * task page (a subtask, the parent, the next task): replace the page, keeping the trail,
 * so Esc still returns to the list in one step. `origin` names the list to return to
 * when the task is opened from somewhere that is not one.
 */
export function openTaskPage(id: string, origin?: { from: string; label?: string }): void {
  const here = currentAddress()
  if (TASK_PATH.test(here)) {
    if (origin) trail = { from: origin.from, label: origin.label ?? '', ids: [], scroll: 0, list: true, depth: 0 }
    navigate({ view: 'task', id }, { replace: true })
    emit()
    return
  }
  if (origin) {
    // Opened from outside a list (a reminder, the palette, a notification): Esc goes to the task's own list.
    trail = { from: origin.from, label: origin.label ?? '', ids: [], scroll: 0, list: true, depth: 0 }
    navigate({ view: 'task', id })
  } else {
    const { ids, list } = listedIds()
    trail = { from: here, label: pageLabel(), ids, scroll: content()?.scrollTop ?? 0, list, depth: 0 }
    navigate({ view: 'task', id })
    trail.depth = typeof history === 'undefined' ? 0 : history.length
  }
  emit()
}

/** Where the open task sits in the trail's list: "4 / 12", or null when it is not listed there. */
export function trailPosition(id: string): { index: number; total: number } | null {
  if (!trail) return null
  const index = trail.ids.indexOf(id)
  return index < 0 ? null : { index, total: trail.ids.length }
}

/** The task before (-1) or after (+1) this one in the trail's list, or null at either end. */
export function trailNeighbour(id: string, step: 1 | -1): string | null {
  const pos = trailPosition(id)
  if (!pos || !trail) return null
  return trail.ids[pos.index + step] ?? null
}

/** Step to the next or previous task of the list; false at the end (nothing happens). */
export function stepTask(id: string, step: 1 | -1): boolean {
  const next = trailNeighbour(id, step)
  if (!next) return false
  openTaskPage(next)
  return true
}

/**
 * Leave the task page for the list it was opened from, with `id` selected there and
 * the list scrolled where it was. Without a trail (a shared link, a reload), `fallback`
 * runs instead: the task's own list.
 */
export function leaveTaskPage(id: string, fallback: () => void): void {
  const t = trail
  if (!t) { fallback(); return }
  returning = { from: t.from, id, scroll: t.scroll }
  if (t.list) selectTask.set(id)
  trail = null
  emit()
  // The page was pushed over the list and only replaced since: going back is the list's own entry.
  if (typeof history !== 'undefined' && t.depth > 0 && history.length === t.depth) history.back()
  else navigate(parseRoute(t.from))
}

/**
 * The shell calls this on every route change: a return finishes once its list shows
 * (scroll restored as the rows arrive, the selected row kept in view), and a trail is
 * dropped once the user goes anywhere other than a task page.
 */
export function settleTrail(address: string): void {
  if (trail && !TASK_PATH.test(address)) { trail = null; emit() }
  const r = returning
  if (!r) return
  returning = null
  if (address !== r.from) return
  restoreScroll(r.scroll, r.id)
}

/** Rows arrive from the local database a moment after the route: try for about a second. */
function restoreScroll(top: number, id: string): void {
  if (typeof requestAnimationFrame === 'undefined') return
  let frames = 0
  const tick = () => {
    const el = content()
    if (!el) return
    const row = el.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(id)}"]`)
    if (el.scrollHeight - el.clientHeight >= top || row || frames > 60) {
      el.scrollTop = top
      row?.scrollIntoView?.({ block: 'nearest' })
      return
    }
    frames++
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

export function taskTrail(): TaskTrail | null {
  return trail
}

export function useTaskTrail(): TaskTrail | null {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn) } }, () => trail, () => null)
}

/** Tests: forget the trail and any return in progress. */
export function resetTaskTrail(): void {
  trail = null
  returning = null
  emit()
}
resettable('taskTrail', resetTaskTrail)

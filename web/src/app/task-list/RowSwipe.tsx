// The row side of swipe actions (OpenSpec change phone-v2, design D3, D4): the hook
// that moves a touch row with the finger and fires complete (right) or schedule
// (left), the tinted edge it uncovers, the Schedule sheet, and the one-time cue.
// Moves are applied to the row's children directly, so a gesture re-renders the
// row once (when it locks a direction), not on every pixel.
import { type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useTask } from '../../lib/localData'
import { addDaysISO, logicalToday, quickChoices } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { parkTask, updateTask } from '../../lib/ops'
import type { Task } from '../../lib/types'
import { Dialog, Icon } from '../../ui'
import { act } from '../actionError'
import { DateField } from '../datetime/DateField'
import { prefersReducedMotion } from '../motion'
import { beginSwipe, revealed, SWIPE, type SwipeDir } from '../rowSwipe'
import { showBulkToast } from '../bulk/toastStore'

const EDGE = 'data-swipe-edge'

/** Every child of the row but the edge: what the finger moves. */
const movable = (row: HTMLElement) => [...row.children].filter((c): c is HTMLElement => c instanceof HTMLElement && !c.hasAttribute(EDGE))

function place(row: HTMLElement, offset: number, animate: boolean) {
  const ease = animate ? `transform ${SWIPE.returnMs}ms var(--ease-calm)` : ''
  for (const c of movable(row)) { c.style.transition = ease; c.style.transform = offset ? `translateX(${offset}px)` : '' }
  const edge = row.querySelector<HTMLElement>(`[${EDGE}]`)
  if (edge) {
    edge.style.transition = animate ? `width ${SWIPE.returnMs}ms var(--ease-calm)` : ''
    edge.style.width = `${Math.abs(offset)}px`
    edge.toggleAttribute('data-revealed', revealed(offset))
  }
}

export interface RowSwipe {
  /** Compose into the row's onPointerDown (before the drag's). */
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  /** The tinted edge while a swipe runs, and the Schedule sheet when it is open. */
  layers: ReactNode
}

/**
 * Swipe right completes (reopens a done task), swipe left opens the Schedule sheet.
 * `enabled` is false on a fine pointer, read-only rows, while anything is ticked, in
 * the Trash, on cards and while the inline editor is open (design D3).
 */
export function useRowSwipe({ task, enabled, onComplete, force, rowEl }: {
  task: Task
  enabled: boolean
  onComplete: () => void
  /** Stories: hold the row at this offset (positive: the complete edge, negative: schedule). */
  force?: number
  rowEl?: RefObject<HTMLElement | null>
}): RowSwipe {
  const [dir, setDir] = useState<SwipeDir | null>(force ? (force > 0 ? 'right' : 'left') : null)
  useLayoutEffect(() => {
    const el = rowEl?.current
    if (!force || !el) return
    el.style.overflow = 'hidden'
    place(el, force, false)
  }, [force, rowEl, dir])
  const row = useRef<HTMLElement | null>(null)
  // A long press that ticked the row turns swipes off mid-gesture; the lock reads the latest value.
  const live = useRef(enabled)
  live.current = enabled
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (!enabled) return
    const el = e.currentTarget
    row.current = el
    beginSwipe(e, {
      canStart: () => live.current,
      onLock: (d) => { el.style.overflow = 'hidden'; setDir(d) },
      onMove: (offset) => place(el, offset, false),
      onEnd: (fire) => {
        const reduced = prefersReducedMotion()
        place(el, 0, !reduced && !fire)
        const done = () => { el.style.overflow = ''; for (const c of movable(el)) { c.style.transition = ''; c.style.transform = '' }; setDir(null) }
        if (fire || reduced) done()
        else setTimeout(done, SWIPE.returnMs)
        if (fire === 'right') onComplete()
        if (fire === 'left') openRowSchedule(task.id)
      },
    })
  }, [enabled, onComplete, task.id])
  const doneTask = !!task.completed_at
  const layers = (
    <>
      {dir && (
        <span aria-hidden="true" {...{ [EDGE]: dir }}
          // The icon over its word, so both fit from the reveal distance (64 px) on.
          className={`group/edge pointer-events-none absolute inset-y-0 flex w-0 flex-col items-center justify-center gap-0.5 overflow-hidden px-1 text-hint font-medium ${dir === 'right' ? 'left-0 bg-success-soft text-on-success-soft' : 'right-0 bg-accent-soft text-on-accent-soft'}`}>
          <Icon name={dir === 'right' ? (doneTask ? 'rotate-ccw' : 'check') : 'calendar-days'} size="sm" />
          <span className="whitespace-nowrap opacity-0 transition-opacity duration-(--duration-ui) group-data-revealed/edge:opacity-100">
            {dir === 'right' ? (doneTask ? t('Reopen') : t('Complete')) : t('Schedule')}
          </span>
        </span>
      )}
    </>
  )
  return { onPointerDown, layers }
}

// The Schedule sheet lives outside the row and the menu that ask for it (both may unmount
// as it opens: a menu closes, a row departs); the list renders its host once.
let scheduleId: string | null = null
const scheduleSubs = new Set<() => void>()
export function openRowSchedule(id: string | null): void {
  scheduleId = id
  scheduleSubs.forEach((fn) => fn())
}

/** The Schedule sheet of the task a swipe or the touch menu asked for. */
export function RowScheduleHost() {
  const id = useSyncExternalStore((fn) => { scheduleSubs.add(fn); return () => { scheduleSubs.delete(fn) } }, () => scheduleId, () => null)
  const task = useTask(id)
  if (!id || !task) return null
  return <RowScheduleSheet task={task} onClose={() => openRowSchedule(null)} />
}

type Choice = { id: string; label: string; apply: () => Promise<void> }

/** The day a choice sets: the task keeps its time, a parked task comes back. */
async function schedule(task: Task, date: string): Promise<void> {
  const patch: Partial<Task> = { due: task.due ? { ...task.due, date } : { date } }
  if (task.start === 'someday') patch.start = null
  await updateTask(task.id, patch)
}

/** The Schedule sheet of a left swipe and of the touch row menu: five choices (design D3). */
export function RowScheduleSheet({ task, onClose }: { task: Task; onClose: () => void }) {
  const [picking, setPicking] = useState(false)
  const today = logicalToday()
  const nextWeek = quickChoices('start', today).find((c) => c.id === 'next-week')?.date ?? addDaysISO(today, 7)
  const choices: Choice[] = [
    { id: 'today', label: t('Today'), apply: () => schedule(task, today) },
    { id: 'tomorrow', label: t('Tomorrow'), apply: () => schedule(task, addDaysISO(today, 1)) },
    { id: 'next-week', label: t('Next week'), apply: () => schedule(task, nextWeek) },
    { id: 'someday', label: t('Someday'), apply: () => parkTask(task.id) },
  ]
  const run = (c: Choice) => { onClose(); void act(c.apply()) }
  return (
    <Dialog title={t('Schedule')} onClose={onClose} size="sm" placement="sheet" testId="row-schedule-sheet">
      {picking ? (
        <DateField label={t('Date')} autoFocus value={task.due?.date ?? null} onChange={(iso) => { onClose(); if (iso) void act(schedule(task, iso)) }} />
      ) : (
        <div className="grid gap-1" role="group" aria-label={t('Schedule')}>
          {choices.slice(0, 3).map((c) => <SheetChoice key={c.id} id={c.id} label={c.label} onClick={() => run(c)} />)}
          <SheetChoice id="pick" label={t('Pick a day…')} onClick={() => setPicking(true)} />
          <SheetChoice id="someday" label={choices[3].label} onClick={() => run(choices[3])} />
        </div>
      )}
    </Dialog>
  )
}

function SheetChoice({ id, label, onClick }: { id: string; label: string; onClick: () => void }) {
  return (
    <button type="button" data-schedule-choice={id} onClick={onClick}
      className="flex min-h-12 items-center rounded-control px-3 text-left text-body hover:bg-sunken dark:hover:bg-raised">
      {label}
    </button>
  )
}

const CUE_KEY = 'opentodo.swipe-cue'

/** Whether the list's rows swipe (coarse pointer, nothing ticked, not select mode); runs the one-time cue. */
export function useListSwipe(root: React.RefObject<HTMLElement | null>, on: boolean, rowCount: number): boolean {
  useSwipeCue(root, on, rowCount)
  return on
}

/**
 * The one-time cue (design D4): on the first touch list with a swipeable row, the
 * first row peeks 40 px right and back over 400 ms, then a toast names the gesture
 * and its menu twin. Once per device; under reduced motion only the toast.
 */
export function useSwipeCue(root: React.RefObject<HTMLElement | null>, enabled: boolean, rowCount: number): void {
  const shown = useRef(false)
  useEffect(() => {
    if (!enabled || rowCount === 0 || shown.current) return
    let seen = false
    try { seen = localStorage.getItem(CUE_KEY) === '1' } catch { /* private mode: show it */ }
    if (seen) return
    // The rows may land a frame after the count (large lists render in steps): look a few times.
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const look = () => {
      const first = root.current?.querySelector<HTMLElement>('[data-swipeable]')
      if (!first) { if (++tries < 10) timer = setTimeout(look, 50); return }
      shown.current = true
      try { localStorage.setItem(CUE_KEY, '1') } catch { /* nothing to remember with */ }
      if (!prefersReducedMotion()) {
        for (const c of movable(first)) c.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(40px)' }, { transform: 'translateX(0)' }], { duration: 400, easing: 'ease-in-out' })
      }
      showBulkToast(t('Swipe right to complete, left to schedule. Also in a task\'s menu.'), null)
    }
    look()
    return () => clearTimeout(timer)
  }, [root, enabled, rowCount])
}

/**
 * A long press selects on touch (phone-v2 D8): the row is ticked, every checkbox and
 * the selection bar show, and the device ticks once where it can vibrate.
 */
export function holdSelect(id: string, selection: { ticked: ReadonlySet<string>; toggle: (id: string) => void }, setSelectMode: (on: boolean) => void): void {
  if (!selection.ticked.has(id)) selection.toggle(id)
  setSelectMode(true)
  navigator.vibrate?.(10)
}

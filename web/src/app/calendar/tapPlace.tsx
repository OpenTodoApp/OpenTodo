// Tap to place from the planning list (OpenSpec plan-list-tap-to-place). Where the panel
// slot covers the calendar, a tap on a list task starts the usual placement (D1), the
// list steps aside (D2), a tap on an empty time places the task there (D3), and this
// bar names the task with Cancel (D4). From 1024 px nothing here runs (D5).
import { useEffect, useRef, useState, type RefObject } from 'react'
import { t } from '../../lib/i18n'
import { Button, useMediaQuery } from '../../ui'
import { closePanel, SPLIT_QUERY } from '../panel'
import { isEmptyPlace } from './addHere'
import { openPlanPanel } from './PlanPanel'

/** Whether a tap on a list task places it: the list covers the calendar and the view shows times. */
export function useTapToPlace(gridShown: boolean): boolean {
  const beside = useMediaQuery(SPLIT_QUERY)
  return !beside && gridShown
}

/**
 * The tap placement of a calendar view: `start(id)` begins the usual placement and says
 * whether it did; then the list steps aside (D2) and taps on a day place the task (D3).
 */
export function useTapPlace(gridShown: boolean, placing: boolean, start: (id: string) => boolean, place: (date: string, at: number) => void) {
  const enabled = useTapToPlace(gridShown)
  const [tapping, setTapping] = useState(false)
  return {
    tapping: tapping && placing,
    end: () => setTapping(false),
    onTap: enabled ? (id: string) => { if (!start(id)) return; setTapping(true); closePanel() } : undefined,
    onTapTime: tapping && placing ? place : undefined,
  }
}

/** The list task a placement started from: where focus goes back to after it (GitHub issue 352). */
export interface PlaceFrom { id: string; next: string | null; placed: boolean; tap?: boolean }

/**
 * When a placement from the planning list ends, focus goes back to the list: to the next
 * task after it was placed, to the same one after Escape. A tap placement first brings
 * the list back (D2), so focus waits a frame for it.
 */
export function usePlacementReturn(placing: unknown, placeFrom: RefObject<PlaceFrom | null>, scroller: RefObject<HTMLElement | null>, endTap: () => void) {
  const end = useRef(endTap)
  end.current = endTap
  useEffect(() => {
    const from = placeFrom.current
    if (placing || !from) return
    placeFrom.current = null
    const focusBack = () => {
      const list = document.querySelector('[data-panel-frame="calendar-plan"]')
      const item = (id: string | null) => (id ? list?.querySelector<HTMLElement>(`[data-tray-task="${id}"]`) : null)
      const back = (from.placed ? item(from.next) ?? item(from.id) : item(from.id)) ?? list?.querySelector<HTMLElement>('[data-tray-task]') ?? scroller.current
      back?.focus({ preventScroll: true })
    }
    if (!from.tap) return focusBack()
    end.current()
    openPlanPanel()
    const frame = requestAnimationFrame(focusBack)
    return () => cancelAnimationFrame(frame)
  }, [placing, placeFrom, scroller])
}

/**
 * Where a tap on a day column places the task: the quarter hour under an empty place,
 * the ghost's own start on the ghost, and nowhere on a block, an event or a control.
 */
export function tapTarget(target: EventTarget | null, root: Element, at: () => number, ghostStart: number | null): number | null {
  if (target instanceof Element && ghostStart !== null && target.closest('[data-cal-id="placement-ghost"]')) return ghostStart
  return isEmptyPlace(target, root) ? at() : null
}

/** The bar at the bottom of the calendar while a tapped task waits for its time (D4); below 768 px it sits above the Add button. */
export function TapPlaceBar({ title, onCancel }: { title: string; onCancel: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => { cancel.current?.focus({ preventScroll: true }) }, [])
  return (
    <div className="flex items-center gap-3 border-t border-default bg-surface px-4 py-2 max-md:mb-[var(--add-room,0px)]" data-tap-place>
      <p role="status" className="min-w-0 flex-1 truncate text-body">{t('Tap a time to plan {title}', { title: title || t('Untitled') })}</p>
      <Button ref={cancel} variant="secondary" size="sm" onClick={onCancel}>{t('Cancel')}</Button>
    </div>
  )
}

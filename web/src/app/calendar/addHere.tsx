// Adding with the pointer (OpenSpec change calendar-clarity, design D2; GitHub issue
// 555): a double-click on an empty place of Day, Week or Month opens the add dialog for
// that day (and, on the grid, that quarter hour); a right-click, or a 500 ms long press
// on touch, opens a small menu there: Add task here…, and on the grid New frame here…
// (calendar-frames) and New slot here… (calendar-slots). Below 640 px the menu is a
// bottom sheet, like every menu. The keyboard has `q` for the same dialog.
import { useCallback, useState, type ReactNode } from 'react'
import { isoWeekday } from '../../lib/frames'
import { t } from '../../lib/i18n'
import type { ProjectRef } from '../../lib/nlp'
import { Menu, MenuItem } from '../../ui'
import { AddOnDayDialog } from './AddOnDayDialog'
import { requestFrameAt } from './framesRequest'
import { newSlotAt } from './slotActions'
import { HOLD_MS, startHold } from './hold'

/** A place to add at: a day, and on the Day and Week grid the quarter hour (minutes from midnight). */
export interface AddPlace {
  date: string
  start?: number
}

/** How long a finger rests on an empty place before the menu opens (design D2). */
export const ADD_HOLD_MS = HOLD_MS

/** Things on the grid that have their own meaning under the pointer: never an empty place. */
const OCCUPIED = '[data-cal-id],[data-event],[data-event-chip],[data-frame-name],[data-overflow],[data-deadline-marker-for],[data-month-task],[data-month-more],button,a,input,[role="button"]'

/** True when `target` is an empty part of `root` (no block, event, chip, frame title or control under it). */
export function isEmptyPlace(target: EventTarget | null, root: Element): boolean {
  if (!(target instanceof Element) || !root.contains(target)) return false
  const hit = target.closest(OCCUPIED)
  return !hit || !root.contains(hit) || hit === root
}

/**
 * A long press of a finger on an empty place: `onHold(x, y)` after ADD_HOLD_MS when the
 * finger has not moved; any movement (a scroll) or a release ends it. Other pointers never hold.
 */
export const startAddHold = startHold

export interface AddHere {
  /** Opens the add dialog for a place. */
  add: (place: AddPlace) => void
  /** Opens the menu for a place at a point of the screen. */
  menuAt: (place: AddPlace, x: number, y: number) => void
  /** The dialog and the menu, to render once. */
  element: ReactNode
}

/** The add dialog and the add menu of one calendar view. */
export function useAddHere(projects: readonly ProjectRef[]): AddHere {
  const [adding, setAdding] = useState<AddPlace | null>(null)
  const [menu, setMenu] = useState<(AddPlace & { x: number; y: number }) | null>(null)
  const add = useCallback((place: AddPlace) => { setMenu(null); setAdding(place) }, [])
  const menuAt = useCallback((place: AddPlace, x: number, y: number) => setMenu({ ...place, x, y }), [])
  const element = (
    <>
      {menu && (
        // The menu's hidden trigger sits at the pointer, so the panel opens there (as the row menu's does).
        <Menu kind="menu" label={t('Add here')} trigger={<span className="sr-only" />} triggerClassName="sr-only"
          triggerProps={{ style: { position: 'fixed', left: menu.x, top: menu.y } }} align="start" width="sm:w-60" open
          onOpenChange={(open) => { if (!open) setMenu(null) }}>
          <AddHereItems place={menu} onAdd={add} />
        </Menu>
      )}
      {adding && <AddOnDayDialog date={adding.date} time={adding.start} projects={projects} onClose={() => setAdding(null)} />}
    </>
  )
  return { add, menuAt, element }
}

/** The menu's items: Add task here…, and on the grid the frame and the slot of that quarter hour. */
export function AddHereItems({ place, onAdd }: { place: AddPlace; onAdd: (place: AddPlace) => void }) {
  const timed = place.start !== undefined
  return (
    <>
      <MenuItem label={t('Add task here…')} icon="plus" data-add-here="task" onSelect={() => onAdd(place)} />
      {timed && <MenuItem label={t('New frame here…')} icon="rows-2" data-add-here="frame" onSelect={() => requestFrameAt(isoWeekday(place.date), place.start!)} />}
      {timed && <MenuItem label={t('New slot here…')} icon="layers" data-add-here="slot" onSelect={() => newSlotAt(place.date, place.start!)} />}
    </>
  )
}

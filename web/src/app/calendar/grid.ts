// Shared measures of the Day and Week grids (OpenSpec `time-blocking`).
import { DAY_MINUTES, formatTime as toHHMM } from '../../lib/calendar'
import { formatTime as formatWallTime } from '../../lib/dates'

/** 48 px per hour, 12 px per 15-minute slot. */
export const PX_PER_MIN = 0.8
export const GRID_HEIGHT = DAY_MINUTES * PX_PER_MIN
/** Pointer-down this close to a block's lower edge starts a resize. */
export const RESIZE_ZONE_PX = 7
/** The same for a finger (OpenSpec change phone-calendar, design D5): WCAG 2.2's target size. */
export const TOUCH_RESIZE_ZONE_PX = 24

/**
 * How tall the zone at a block's top and at its bottom is that starts a resize: a few
 * pixels for a mouse or a pen, more for a finger, and never more than a third of the
 * block, so its middle always moves it.
 */
export function resizeZone(blockHeight: number, pointerType: string): number {
  return Math.min(pointerType === 'touch' ? TOUCH_RESIZE_ZONE_PX : RESIZE_ZONE_PX, blockHeight / 3)
}

/** Placement mode (`s`): the task and where its ghost sits. */
export interface Placement {
  taskId: string
  date: string
  start: number
}

/** A dashed ghost block: a drag, a resize or a placement in progress. */
export interface Preview {
  id: string
  start: number
  length: number
  title: string
}

/** Minutes from midnight as shown to the user, in their time format (date-time-preferences D2). */
export const formatTime = (minutes: number): string => formatWallTime(toHHMM(minutes))

export function minutesOf(ms: number): number {
  const d = new Date(ms)
  return d.getHours() * 60 + d.getMinutes()
}

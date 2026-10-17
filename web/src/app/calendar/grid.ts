// Shared measures of the Day and Week grids (OpenSpec `time-blocking`).
import { DAY_MINUTES, formatTime as toHHMM } from '../../lib/calendar'
import { formatTime as formatWallTime } from '../../lib/dates'

/** 48 px per hour, 12 px per 15-minute slot. */
export const PX_PER_MIN = 0.8
export const GRID_HEIGHT = DAY_MINUTES * PX_PER_MIN
/** Pointer-down this close to a block's lower edge starts a resize. */
export const RESIZE_ZONE_PX = 7

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

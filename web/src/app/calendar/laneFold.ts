// The unscheduled lane on a touch screen or a narrow window (GitHub issue 775,
// time-blocking "Unscheduled lane on a phone"): folded behind a header with its
// count once it holds more than a few items, the header's choice remembered on
// this device, never synced. One choice for every day's lane, so the columns of
// a Week stay aligned.
import { createStoredValue } from '../../lib/deviceStorage'
import { useMediaQuery } from '../../ui'

export const LANE_FOLD_KEY = 'calendar.laneFold'
/** A lane with more items than this is folded until this device chooses otherwise. */
export const LANE_FEW = 3
/** Where the lane folds: a touch screen, or a window narrower than the desktop header (48rem). */
export const COMPACT_LANE_QUERY = '(pointer: coarse), (max-width: 47.99rem)'

export type LaneFold = 'open' | 'closed' | null

const fold = createStoredValue<LaneFold>(LANE_FOLD_KEY, {
  parse: (raw) => (raw === 'open' || raw === 'closed' ? raw : null),
  serialize: (v) => v,
})

export const useLaneFold = fold.use
export const setLaneFold = (v: LaneFold) => fold.set(v)
export const useCompactLane = () => useMediaQuery(COMPACT_LANE_QUERY)

/**
 * How a lane of `count` items shows: `toggle` whether it has the fold header,
 * `open` whether its rows show. Without a choice a lane of more than LANE_FEW
 * items is folded; after "closed" every non-empty lane is; after "open" a long
 * lane keeps its header, so it can be folded again.
 */
export function laneShape(count: number, choice: LaneFold): { toggle: boolean; open: boolean } {
  if (count === 0) return { toggle: false, open: true }
  if (choice === 'closed') return { toggle: true, open: false }
  if (count <= LANE_FEW) return { toggle: false, open: true }
  return { toggle: true, open: choice === 'open' }
}

/** The tallest the all-day strips and lanes grow before they scroll: three and a half rows, at most a quarter of the screen. */
export const LANE_REGION_MAX = 'min(calc(var(--size-row) * 3.5), 25dvh)'

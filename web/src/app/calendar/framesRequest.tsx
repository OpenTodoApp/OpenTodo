// Opening the Frames dialog (OpenSpec change calendar-frames, design D5): the Day
// and Week overflow item, the command palette's New frame, a frame's Edit and the
// empty-slot menu of calendar-clarity ask for it here; the shell renders the host,
// which loads the dialog only when it is first asked for.
import { lazy, Suspense } from 'react'
import { createStore } from '../../lib/store'
import { PanelBoundary } from '../PanelBoundary'

/** What the dialog opens on: the list, a new frame (optionally prefilled) or one frame's form. */
export type FramesRequest =
  | { mode: 'list' }
  | { mode: 'new'; prefill?: { weekday?: number; start?: string; end?: string } }
  | { mode: 'edit'; id: string }

const requested = createStore<FramesRequest | null>('framesDialog', null)

/** Opens the Frames dialog. */
export function requestFrames(r: FramesRequest = { mode: 'list' }): void {
  requested.set(r)
}

/**
 * New frame here… for an empty slot of the grid (design D5, for the empty-slot menu
 * of OpenSpec change calendar-clarity): that weekday, from the slot's start to an
 * hour later.
 */
export function requestFrameAt(weekday: number, startMinutes: number): void {
  const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const start = Math.max(0, Math.min(22 * 60 + 45, startMinutes))
  requested.set({ mode: 'new', prefill: { weekday, start: clock(start), end: clock(Math.min(start + 60, 23 * 60 + 59)) } })
}

const FramesDialog = lazy(() => import('./FramesDialog'))

/** Mounted once by the shell. */
export function FramesHost() {
  const r = requested.use()
  if (!r) return null
  return <PanelBoundary><Suspense fallback={null}><FramesDialog request={r} onClose={() => requested.set(null)} /></Suspense></PanelBoundary>
}

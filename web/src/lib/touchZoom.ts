// Allow pinch zoom (OpenSpec change disable-touch-zoom, design-system "Fields never
// zoom the screen on touch", GitHub issue 1386): a per-device switch, on by default and
// never synced, that turns the page's own pinch zoom off for a more app-like feel. On it
// is the usual viewport; off adds `maximum-scale=1, user-scalable=no`. It never touches
// the >=16 px field rule (a field still never zooms on focus) nor the device's own system
// text size and accessibility zoom. The switch shows only on a touch device.
import { useEffect } from 'react'
import { createStoredValue } from './deviceStorage'

export const ZOOM_KEY = 'opentodo.allowZoom'

/** The viewport with pinch zoom allowed — the same one index.html ships with. */
export const VIEWPORT_ALLOW = 'width=device-width, initial-scale=1, viewport-fit=cover'
/** The viewport with pinch zoom off: the browser does not scale the page to the finger. */
export const VIEWPORT_NO_ZOOM = `${VIEWPORT_ALLOW}, maximum-scale=1, user-scalable=no`

/** The viewport content for the setting. */
export function zoomViewport(allow: boolean): string {
  return allow ? VIEWPORT_ALLOW : VIEWPORT_NO_ZOOM
}

// Default on: only the literal "off" turns it off, and nothing stored reads as on, so a
// device that never touched it keeps pinch zoom. Cross-tab so a change in one tab applies
// in the others; `server` on, so static rendering never writes the no-zoom viewport.
const allowZoom = createStoredValue<boolean>(ZOOM_KEY, {
  parse: (raw) => raw !== 'off',
  serialize: (on) => (on ? null : 'off'),
}, { crossTab: true, server: true })

/** Whether pinch zoom is allowed on this device (default true). */
export function allowZoomOn(): boolean {
  return allowZoom.get()
}

export const useAllowZoom = allowZoom.use

/** Turns pinch zoom on or off for this device; the viewport follows through the hook. */
export function setAllowZoom(on: boolean): void {
  allowZoom.set(on)
}

/** Writes the viewport meta for the setting; a no-op where there is no such meta. */
export function applyZoomViewport(allow: boolean, doc: Document = document): void {
  const meta = doc.querySelector('meta[name="viewport"]')
  if (meta) meta.setAttribute('content', zoomViewport(allow))
}

/** The switch belongs on a touch device only: it is where the page's own pinch zoom is. */
export function canSetZoom(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
}

/** Keeps the page viewport in step with the device's "Allow pinch zoom" setting. */
export function useTouchZoom(): void {
  const allow = useAllowZoom()
  useEffect(() => { applyZoomViewport(allow) }, [allow])
}

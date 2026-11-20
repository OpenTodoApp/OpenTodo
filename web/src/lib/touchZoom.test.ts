// @vitest-environment happy-dom
// Allow pinch zoom (design-system "Fields never zoom the screen on touch", #1386): a
// per-device switch, on by default, that writes the page viewport. On keeps the shipped
// viewport; off adds maximum-scale/user-scalable so the browser does not pinch-zoom.
import { beforeEach, describe, expect, it } from 'vitest'
import { allowZoomOn, applyZoomViewport, setAllowZoom, VIEWPORT_ALLOW, VIEWPORT_NO_ZOOM, ZOOM_KEY, zoomViewport } from './touchZoom'

beforeEach(() => {
  localStorage.clear()
})

describe('the setting', () => {
  it('defaults to allowing zoom; off is stored, on clears the key (so a fresh device allows zoom)', () => {
    expect(allowZoomOn()).toBe(true)
    setAllowZoom(false)
    expect(allowZoomOn()).toBe(false)
    expect(localStorage.getItem(ZOOM_KEY)).toBe('off')
    setAllowZoom(true)
    expect(allowZoomOn()).toBe(true)
    expect(localStorage.getItem(ZOOM_KEY)).toBeNull()
  })
})

describe('the viewport', () => {
  it('allows user scaling when on, and forbids it when off', () => {
    expect(zoomViewport(true)).toBe(VIEWPORT_ALLOW)
    expect(zoomViewport(false)).toBe(VIEWPORT_NO_ZOOM)
    expect(VIEWPORT_NO_ZOOM).toContain('maximum-scale=1')
    expect(VIEWPORT_NO_ZOOM).toContain('user-scalable=no')
    // On is the viewport index.html ships with, so turning it on is a no-op there.
    expect(VIEWPORT_ALLOW).not.toContain('user-scalable')
    expect(VIEWPORT_ALLOW).not.toContain('maximum-scale')
  })

  it('writes the content of the viewport meta both ways', () => {
    document.head.innerHTML = '<meta name="viewport" content="placeholder">'
    const meta = () => document.querySelector('meta[name="viewport"]')!.getAttribute('content')
    applyZoomViewport(false)
    expect(meta()).toBe(VIEWPORT_NO_ZOOM)
    applyZoomViewport(true)
    expect(meta()).toBe(VIEWPORT_ALLOW)
  })

  it('is a no-op where there is no viewport meta', () => {
    document.head.innerHTML = ''
    expect(() => applyZoomViewport(false)).not.toThrow()
  })
})

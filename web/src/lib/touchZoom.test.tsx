// @vitest-environment happy-dom
// Allow pinch zoom (design-system "Fields never zoom the screen on touch", #1386): a
// per-device switch, on by default, that writes the page viewport. On keeps the shipped
// viewport; off adds maximum-scale/user-scalable so the browser does not pinch-zoom.
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { render } from '../ui/test-utils'
import { applyZoomViewport, setAllowZoom, useTouchZoom, VIEWPORT_ALLOW, VIEWPORT_NO_ZOOM, ZOOM_KEY, zoomViewport } from './touchZoom'

const meta = () => document.querySelector('meta[name="viewport"]')?.getAttribute('content')

beforeEach(() => {
  localStorage.clear()
  document.head.innerHTML = '<meta name="viewport" content="placeholder">'
})

function Harness() {
  useTouchZoom()
  return null
}

describe('the viewport string', () => {
  it('allows user scaling when on, and forbids it when off', () => {
    expect(zoomViewport(true)).toBe(VIEWPORT_ALLOW)
    expect(zoomViewport(false)).toBe(VIEWPORT_NO_ZOOM)
    expect(VIEWPORT_NO_ZOOM).toContain('maximum-scale=1')
    expect(VIEWPORT_NO_ZOOM).toContain('user-scalable=no')
    // On is the viewport index.html ships with, so turning it on is a no-op there.
    expect(VIEWPORT_ALLOW).not.toContain('user-scalable')
    expect(VIEWPORT_ALLOW).not.toContain('maximum-scale')
  })

  it('applyZoomViewport writes the meta both ways, and is a no-op without one', () => {
    applyZoomViewport(false)
    expect(meta()).toBe(VIEWPORT_NO_ZOOM)
    applyZoomViewport(true)
    expect(meta()).toBe(VIEWPORT_ALLOW)
    document.head.innerHTML = ''
    expect(() => applyZoomViewport(false)).not.toThrow()
  })
})

describe('the setting through the hook', () => {
  it('allows zoom by default, and turning it off writes the no-zoom viewport and stores off', async () => {
    const r = await render(<Harness />)
    // A fresh device: nothing stored, zoom allowed, the viewport unchanged.
    expect(localStorage.getItem(ZOOM_KEY)).toBeNull()
    expect(meta()).toBe(VIEWPORT_ALLOW)
    // Turn it off: the viewport forbids scaling and "off" is stored.
    await act(async () => { setAllowZoom(false) })
    expect(meta()).toBe(VIEWPORT_NO_ZOOM)
    expect(localStorage.getItem(ZOOM_KEY)).toBe('off')
    // Back on: the viewport allows it again and the key is cleared.
    await act(async () => { setAllowZoom(true) })
    expect(meta()).toBe(VIEWPORT_ALLOW)
    expect(localStorage.getItem(ZOOM_KEY)).toBeNull()
    await r.unmount()
  })
})

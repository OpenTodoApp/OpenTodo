// @vitest-environment happy-dom
// The Notes page's note pane width (OpenSpec change note-pane-width): the docked note
// is resized by its left edge like the docked task (drag, click for the widest and
// back, ← and → with focus), each device keeps its own width under its own key, and
// the text keeps a readable column.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDatabase } from '../../lib/db'
import { createNote } from '../../lib/noteOps'
import { resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { key, render, waitFor } from '../../ui/test-utils'
import { NOTE_PANEL_WIDTH, PANEL_WIDTH_KEY, resetPanel } from '../panel'
import { NotePanel } from './NoteEditor'

const ME = 'u-me'
const NOTE_KEY = NOTE_PANEL_WIDTH.key
const DEFAULT = 600
let run = 0
const root = document.documentElement
const cssWidth = () => root.style.getPropertyValue('--note-panel-w')
const innerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth')

beforeEach(() => {
  useDatabase(`note-pane-width-${run++}`)
  resetDeviceId()
  setCurrentUserId(ME)
  localStorage.clear()
  resetPanel()
  root.style.removeProperty('--note-panel-w')
  root.style.removeProperty('--task-panel-w')
  // A 1600 px window: the widest note pane is 1600 − 38 rem = 992 px.
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 })
})
afterEach(() => {
  if (innerWidth) Object.defineProperty(window, 'innerWidth', innerWidth)
  document.body.innerHTML = ''
})

/** The docked note, its pane laid out at the width the root gives it (600 px by default). */
async function docked() {
  const id = await createNote({ title: 'Packing list', description: 'Passport' })
  const r = await render(<NotePanel id={id} />)
  await waitFor(() => !!document.querySelector('[data-panel-frame="note"] [data-panel-resize]'), 'the resize handle')
  const pane = document.querySelector<HTMLElement>('[data-panel-frame="note"]')!
  pane.getBoundingClientRect = () => {
    const w = parseFloat(cssWidth()) || DEFAULT
    return { width: w, height: 800, top: 0, left: 1600 - w, right: 1600, bottom: 800, x: 1600 - w, y: 0, toJSON() {} } as DOMRect
  }
  const handle = pane.querySelector<HTMLElement>('[data-panel-resize]')!
  return { r, pane, handle }
}

const pointer = (type: string, x: number) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', button: 0, clientX: x })
async function press(el: HTMLElement, type: string, x: number) {
  await act(async () => { el.dispatchEvent(pointer(type, x)) })
}

describe('the note pane width', () => {
  it('has its own handle on the left edge, and the note a readable column', async () => {
    const { pane, handle } = await docked()
    expect(handle.getAttribute('role')).toBe('separator')
    expect(handle.getAttribute('aria-label')).toBe('Resize the note')
    expect(handle.parentElement).toBe(pane)
    expect(pane.className).toContain('lg:relative')
    expect(pane.querySelector('[data-note-column] [data-note-form]')).toBeTruthy()
    expect(root.hasAttribute('data-note-split')).toBe(true)
  })

  it('a drag sets the width, kept on this device apart from the task panel', async () => {
    const { handle } = await docked()
    await press(handle, 'pointerdown', 1000)
    await press(handle, 'pointermove', 950)
    await press(handle, 'pointermove', 880)
    // While dragging the width follows the pointer and is not yet stored.
    expect(cssWidth()).toBe('720px')
    expect(localStorage.getItem(NOTE_KEY)).toBeNull()
    await press(handle, 'pointerup', 880)
    expect(localStorage.getItem(NOTE_KEY)).toBe('720')
    expect(cssWidth()).toBe('720px')
    expect(localStorage.getItem(PANEL_WIDTH_KEY)).toBeNull()
    expect(root.style.getPropertyValue('--task-panel-w')).toBe('')
  })

  it('a click without dragging makes it the widest, a second click brings the default back', async () => {
    const { handle } = await docked()
    await press(handle, 'pointerdown', 1000)
    await press(handle, 'pointerup', 1000)
    expect(localStorage.getItem(NOTE_KEY)).toBe('992')
    await press(handle, 'pointerdown', 608)
    await press(handle, 'pointerup', 608)
    expect(localStorage.getItem(NOTE_KEY)).toBeNull()
    expect(cssWidth()).toBe('')
  })

  it('← widens and → narrows with focus on the handle, within its bounds; Home restores the default', async () => {
    const { handle } = await docked()
    handle.focus()
    await key(handle, 'ArrowLeft')
    expect(localStorage.getItem(NOTE_KEY)).toBe('616')
    await key(handle, 'ArrowRight', { shiftKey: true })
    expect(localStorage.getItem(NOTE_KEY)).toBe('552')
    for (let i = 0; i < 20; i++) await key(handle, 'ArrowRight', { shiftKey: true })
    expect(localStorage.getItem(NOTE_KEY)).toBe(String(22 * 16))
    expect(handle.getAttribute('aria-valuenow')).toBe(String(22 * 16))
    await key(handle, 'Home')
    expect(localStorage.getItem(NOTE_KEY)).toBeNull()
  })

  it('opens at the width this device kept, and leaves the root as it was when it closes', async () => {
    localStorage.setItem(NOTE_KEY, '760')
    const { r } = await docked()
    expect(cssWidth()).toBe('760px')
    await r.unmount()
    expect(root.hasAttribute('data-note-split')).toBe(false)
    const again = await docked()
    expect(cssWidth()).toBe('760px')
    await again.r.unmount()
  })
})

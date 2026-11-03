// @vitest-environment happy-dom
// Keeping the focus reachable and in sight (OpenSpec change accessibility-aa): a modal
// dialog makes the app behind it inert (ui/overlay/stack inertBehind), and a focused
// element under a sticky bar is scrolled clear of it (lib/focusClearance).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inertBehind } from '../../ui/overlay/stack'
import { clearFocusOfBars } from '../focusClearance'

const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 300, width: 300, height: bottom - top, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('inertBehind', () => {
  it('makes #root inert while a dialog outside it is open, counting stacked dialogs', () => {
    document.body.innerHTML = '<div id="root"><button>page</button></div><div id="d1"></div><div id="d2"></div>'
    const root = document.getElementById('root')!
    const one = inertBehind(document.getElementById('d1'))
    const two = inertBehind(document.getElementById('d2'))
    expect(root.inert).toBe(true)
    one()
    expect(root.inert).toBe(true)
    two()
    expect(root.inert).toBe(false)
    // Released twice: still counted once.
    two()
    expect(root.inert).toBe(false)
  })

  it('leaves the app alone for a panel inside it, or without a root', () => {
    document.body.innerHTML = '<div id="root"><div id="inside"></div></div>'
    const release = inertBehind(document.getElementById('inside'))
    expect(document.getElementById('root')!.inert).toBe(false)
    release()
    document.body.innerHTML = '<div id="d"></div>'
    expect(() => inertBehind(document.getElementById('d'))()).not.toThrow()
  })
})

describe('clearFocusOfBars', () => {
  function page() {
    document.body.innerHTML = '<div id="scroller" style="overflow-y:auto"><div id="bar" style="position:sticky;top:0">Save as view</div><button id="b">Edit as text</button></div>'
    const scroller = document.getElementById('scroller')!
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000 })
    Object.defineProperty(scroller, 'clientHeight', { value: 500 })
    const scrollBy = vi.fn(function (this: HTMLElement, o: ScrollToOptions) { this.scrollTop += o.top ?? 0 })
    scroller.scrollBy = scrollBy as unknown as typeof scroller.scrollBy
    scroller.getBoundingClientRect = () => rect(0, 500)
    return { scroller, scrollBy, bar: document.getElementById('bar')!, button: document.getElementById('b')! }
  }

  it('scrolls a button that sits under a sticky bar at the top down into view', () => {
    const { scrollBy, bar, button } = page()
    bar.getBoundingClientRect = () => rect(0, 60)
    button.getBoundingClientRect = () => rect(40, 72)
    // The bar is painted over the button's top edge; its bottom edge shows.
    document.elementFromPoint = ((_x: number, y: number) => (y < 60 ? bar : button)) as typeof document.elementFromPoint
    clearFocusOfBars(button)
    expect(scrollBy).toHaveBeenCalledWith({ top: 40 - 60 - 8, behavior: 'instant' })
  })

  it('scrolls down an element entirely under the header, even above the header’s middle', () => {
    const { scrollBy, bar, button } = page()
    bar.getBoundingClientRect = () => rect(0, 60)
    button.getBoundingClientRect = () => rect(2, 24)
    document.elementFromPoint = (() => bar) as typeof document.elementFromPoint
    clearFocusOfBars(button)
    expect(scrollBy).toHaveBeenCalledWith({ top: 2 - 60 - 8, behavior: 'instant' })
  })

  it('leaves a button that nothing covers', () => {
    const { scrollBy, bar, button } = page()
    bar.getBoundingClientRect = () => rect(0, 60)
    button.getBoundingClientRect = () => rect(100, 132)
    document.elementFromPoint = (() => button) as typeof document.elementFromPoint
    expect(clearFocusOfBars(button)).toBe(0)
    expect(scrollBy).not.toHaveBeenCalled()
  })
})

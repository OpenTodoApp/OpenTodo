// @vitest-environment happy-dom
// status-bar-scroll-top D3: the shell's event scrolls the frontmost scroller to its top:
// an open sheet or panel when there is one, else the page's main scroller.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listenForScrollTop, SCROLL_TOP_EVENT, scrollTopTarget } from './scrollTop'

/** An element that scrolls (content taller than its box) or not. */
function box(attrs: Record<string, string>, tall = true, parent: HTMLElement = document.body): HTMLElement {
  const el = document.createElement('div')
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  el.style.overflowY = 'auto'
  Object.defineProperty(el, 'clientHeight', { value: 500 })
  Object.defineProperty(el, 'scrollHeight', { value: tall ? 3000 : 500 })
  el.scrollTo = vi.fn() as unknown as HTMLElement['scrollTo']
  parent.appendChild(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
  delete document.documentElement.dataset.motion
})

describe('what a status bar tap scrolls', () => {
  it('the innermost main scroller that scrolls (the calendar inside the page)', () => {
    const content = box({ id: 'content', 'data-main-scroller': '' })
    expect(scrollTopTarget()).toBe(content)
    const calendar = box({ 'data-main-scroller': '' }, true, content)
    expect(scrollTopTarget()).toBe(calendar)
    box({ 'data-main-scroller': '' }, false, content)
    expect(scrollTopTarget()).toBe(calendar)
  })

  it('an open task panel scrolls itself and the list keeps its place (the scenario "An open task panel")', () => {
    const content = box({ 'data-main-scroller': '' })
    const panel = document.createElement('aside')
    panel.setAttribute('data-panel-frame', 'Task')
    document.body.appendChild(panel)
    const body = box({ 'data-panel-frame-body': '' }, true, panel)
    window.dispatchEvent(new CustomEvent(SCROLL_TOP_EVENT))
    const stop = listenForScrollTop()
    window.dispatchEvent(new CustomEvent(SCROLL_TOP_EVENT))
    stop()
    window.dispatchEvent(new CustomEvent(SCROLL_TOP_EVENT))
    expect(body.scrollTo).toHaveBeenCalledTimes(1)
    expect(body.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    expect(content.scrollTo).not.toHaveBeenCalled()
  })

  it('the topmost layer wins, and a sheet with nothing to scroll scrolls nothing', () => {
    box({ 'data-main-scroller': '' })
    const panel = box({ 'data-panel-frame': 'Task' })
    expect(scrollTopTarget()).toBe(panel)
    const sheet = document.createElement('div')
    sheet.setAttribute('data-overlay-root', '')
    document.body.appendChild(sheet)
    expect(scrollTopTarget()).toBeNull()
    const list = box({}, true, sheet)
    expect(scrollTopTarget()).toBe(list)
  })

  it('jumps without a smooth scroll when motion is off', () => {
    const content = box({ 'data-main-scroller': '' })
    document.documentElement.dataset.motion = 'none'
    const stop = listenForScrollTop()
    window.dispatchEvent(new CustomEvent(SCROLL_TOP_EVENT))
    stop()
    expect(content.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
  })
})

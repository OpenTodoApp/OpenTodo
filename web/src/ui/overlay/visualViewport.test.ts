// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KEYBOARD_GAP, keepAboveKeyboard, watchVisualViewport } from './stack'

// A stand-in for window.visualViewport: its size and scale, and the listeners the watcher adds.
function fakeViewport() {
  const listeners: Array<() => void> = []
  const vv = {
    height: window.innerHeight, offsetTop: 0, scale: 1,
    addEventListener: (_: string, fn: () => void) => { listeners.push(fn) },
    removeEventListener: () => {},
    set(h: number, scale = 1) { vv.height = h; vv.scale = scale; for (const fn of listeners) fn() },
  }
  Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true })
  return vv
}

describe('the on-screen keyboard (issue #724)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('puts a document Safari left scrolled back at the top when the keyboard closes', () => {
    const vv = fakeViewport()
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const stop = watchVisualViewport()
    vv.set(window.innerHeight - 300)
    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true })
    expect(scrollTo).not.toHaveBeenCalled()
    vv.set(window.innerHeight)
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
    stop()
  })

  it('does not lift a sheet twice when the browser shrinks the page for the keyboard', () => {
    const vv = fakeViewport()
    const full = window.innerHeight
    const stop = watchVisualViewport()
    vv.set(full - 300)
    expect(document.documentElement.style.getPropertyValue('--vv-bottom')).toBe('300px')
    // Chrome on iPhone: the page now ends where the keyboard starts, and only a window resize follows.
    Object.defineProperty(document.documentElement, 'clientHeight', { value: full - 300, configurable: true })
    window.dispatchEvent(new Event('resize'))
    expect(document.documentElement.style.getPropertyValue('--vv-bottom')).toBe('0px')
    stop()
    Reflect.deleteProperty(document.documentElement, 'clientHeight')
  })

  it('leaves a pinch zoom alone', () => {
    const vv = fakeViewport()
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const stop = watchVisualViewport()
    vv.set(window.innerHeight - 300)
    Object.defineProperty(window, 'scrollY', { value: 120, configurable: true })
    vv.set(window.innerHeight - 40, 1.1)
    expect(scrollTo).not.toHaveBeenCalled()
    stop()
  })
})

// ios-keyboard-bar D2: the field's own scroller moves; the document stays.
describe('the focused field above the keyboard', () => {
  afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

  function sheetWith(field: { top: number; height: number }) {
    document.body.innerHTML = '<div id="sheet" style="overflow-y:auto"><div style="height:2000px"><textarea id="f"></textarea></div></div>'
    const sheet = document.getElementById('sheet')!
    const el = document.getElementById('f') as HTMLElement
    Object.defineProperty(sheet, 'scrollHeight', { value: 2000, configurable: true })
    Object.defineProperty(sheet, 'clientHeight', { value: 600, configurable: true })
    vi.spyOn(el, 'getBoundingClientRect').mockImplementation(() => ({ top: field.top - sheet.scrollTop, bottom: field.top + field.height - sheet.scrollTop, height: field.height, left: 0, right: 100, width: 100, x: 0, y: field.top, toJSON: () => ({}) }) as DOMRect)
    return { sheet, el }
  }

  it('scrolls the sheet by the shortfall plus the gap, not the document', () => {
    // A field 40 px tall at 700 px, the keyboard leaves 500 px: its bottom must reach 488.
    const { sheet, el } = sheetWith({ top: 700, height: 40 })
    const scrollTo = vi.spyOn(window, 'scrollTo')
    const into = vi.fn(); el.scrollIntoView = into
    keepAboveKeyboard(el, { offsetTop: 0, height: 500 })
    expect(sheet.scrollTop).toBe(740 - (500 - KEYBOARD_GAP))
    expect(into).not.toHaveBeenCalled()
    expect(scrollTo).not.toHaveBeenCalled()
  })

  it('leaves a field that is already in view where it is', () => {
    const { sheet, el } = sheetWith({ top: 100, height: 40 })
    keepAboveKeyboard(el, { offsetTop: 0, height: 500 })
    expect(sheet.scrollTop).toBe(0)
  })

  it('shows the top of a field taller than the room', () => {
    const { sheet, el } = sheetWith({ top: 300, height: 900 })
    keepAboveKeyboard(el, { offsetTop: 0, height: 500 })
    expect(sheet.scrollTop).toBe(300 - KEYBOARD_GAP)
  })

  it('with no scroller, falls back to the browser', () => {
    document.body.innerHTML = '<input id="f">'
    const el = document.getElementById('f') as HTMLElement
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: 700, bottom: 740, height: 40, left: 0, right: 100, width: 100, x: 0, y: 700, toJSON: () => ({}) } as DOMRect)
    const into = vi.fn(); el.scrollIntoView = into
    keepAboveKeyboard(el, { offsetTop: 0, height: 500 })
    expect(into).toHaveBeenCalledWith({ block: 'nearest' })
  })

  // The composer's send button sits under its field: on a phone's task page the keyboard cut it (seen in the Android app).
  it('keeps a composer with its send button above the keyboard, not only its field', () => {
    const vv = fakeViewport()
    document.body.innerHTML = '<div id="page" style="overflow-y:auto"><div style="height:2000px"><div id="frame" data-composer-frame="true"><div id="f" contenteditable="true"></div><button>Comment</button></div></div></div>'
    const page = document.getElementById('page')!
    Object.defineProperty(page, 'scrollHeight', { value: 2000, configurable: true })
    Object.defineProperty(page, 'clientHeight', { value: 530, configurable: true })
    // The field ends at 518, just inside the room; the frame with its send row ends at 579.
    vi.spyOn(document.getElementById('frame')!, 'getBoundingClientRect').mockImplementation(() => ({ top: 341 - page.scrollTop, bottom: 579 - page.scrollTop, height: 238, left: 0, right: 100, width: 100, x: 0, y: 341, toJSON: () => ({}) }) as DOMRect)
    const field = document.getElementById('f') as HTMLElement
    vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({ top: 406, bottom: 518, height: 112, left: 0, right: 100, width: 100, x: 0, y: 406, toJSON: () => ({}) } as DOMRect)
    field.focus()
    const stop = watchVisualViewport()
    vv.set(530)
    expect(page.scrollTop).toBe(579 - (530 - KEYBOARD_GAP))
    stop()
  })

  // touch-title-editing D4: the touch title editor's Save and Cancel sit under its field.
  it('keeps the whole touch title editor above the keyboard, not only its field', () => {
    const vv = fakeViewport()
    document.body.innerHTML = '<div id="list" style="overflow-y:auto"><div style="height:2000px"><div id="ed" data-inline-compact="true"><input id="f"><button>Save</button></div></div></div>'
    const list = document.getElementById('list')!
    Object.defineProperty(list, 'scrollHeight', { value: 2000, configurable: true })
    Object.defineProperty(list, 'clientHeight', { value: 600, configurable: true })
    // The field ends at 440, inside the room; the editor with its buttons ends at 520.
    vi.spyOn(document.getElementById('ed')!, 'getBoundingClientRect').mockImplementation(() => ({ top: 400 - list.scrollTop, bottom: 520 - list.scrollTop, height: 120, left: 0, right: 100, width: 100, x: 0, y: 400, toJSON: () => ({}) }) as DOMRect)
    const field = document.getElementById('f') as HTMLInputElement
    vi.spyOn(field, 'getBoundingClientRect').mockReturnValue({ top: 400, bottom: 440, height: 40, left: 0, right: 100, width: 100, x: 0, y: 400, toJSON: () => ({}) } as DOMRect)
    field.focus()
    const stop = watchVisualViewport()
    vv.set(500)
    expect(list.scrollTop).toBe(520 - (500 - KEYBOARD_GAP))
    stop()
  })
})

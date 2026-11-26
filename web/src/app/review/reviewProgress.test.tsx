// @vitest-environment happy-dom
// The review's stepper when its phase names do not fit (WCAG 1.4.10): German at 360 px ran past the screen.
import { afterEach, describe, expect, it } from 'vitest'
import { render } from '../../ui/test-utils'
import { ReviewProgress } from './ReviewProgress'

const none = { inbox: false, sweep: false, past: false, upcoming: false, projects: false, waiting: false, someday: false } as never
const steps = { done: none, left: none }
/** happy-dom lays nothing out: the row's width, where it starts and the screen's width are given. */
const widths = (scroll: number, screen: number, left = 16) => {
  const proto = HTMLElement.prototype
  const s = Object.getOwnPropertyDescriptor(proto, 'scrollWidth'), c = Object.getOwnPropertyDescriptor(proto, 'clientWidth'), r = proto.getBoundingClientRect
  Object.defineProperty(proto, 'scrollWidth', { configurable: true, get() { return (this as HTMLElement).tagName === 'OL' ? scroll : 0 } })
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get() { return (this as HTMLElement) === document.documentElement ? screen : screen - 2 * left } })
  proto.getBoundingClientRect = function () { return { left, right: screen - left, top: 0, bottom: 0, width: screen - 2 * left, height: 0, x: left, y: 0, toJSON() {} } as DOMRect }
  return () => { if (s) Object.defineProperty(proto, 'scrollWidth', s); if (c) Object.defineProperty(proto, 'clientWidth', c); proto.getBoundingClientRect = r }
}
let restore: (() => void) | undefined
afterEach(() => { restore?.(); restore = undefined })

describe('the review\'s phases', () => {
  const list = () => document.querySelector<HTMLElement>('[data-review-progress] > ol')!

  it('stay one row where their names fit', async () => {
    restore = widths(328, 360)
    const r = await render(<ReviewProgress steps={steps} step={'inbox' as never} onStep={() => {}} />)
    expect(list().hasAttribute('data-tight')).toBe(false)
    await r.unmount()
  })

  it('stay one row when they run a pixel or two into the page\'s gutter, as English at 360 px does', async () => {
    restore = widths(330, 360)
    const r = await render(<ReviewProgress steps={steps} step={'inbox' as never} onStep={() => {}} />)
    expect(list().hasAttribute('data-tight')).toBe(false)
    await r.unmount()
  })

  it('wrap onto more rows where the names are wider than the screen, instead of scrolling sideways', async () => {
    restore = widths(432, 360)
    const r = await render(<ReviewProgress steps={steps} step={'inbox' as never} onStep={() => {}} />)
    expect(list().hasAttribute('data-tight')).toBe(true)
    expect(list().className).toContain('data-[tight]:flex-wrap')
    await r.unmount()
  })
})

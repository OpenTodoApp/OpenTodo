// @vitest-environment happy-dom
// The review's stepper when its phase names do not fit (WCAG 1.4.10): German at 360 px ran past the screen.
import { afterEach, describe, expect, it } from 'vitest'
import { render } from '../../ui/test-utils'
import { ReviewProgress } from './ReviewProgress'

const none = { inbox: false, sweep: false, past: false, upcoming: false, projects: false, waiting: false, someday: false } as never
const steps = { done: none, left: none }
const widths = (scroll: number, client: number) => {
  // happy-dom lays nothing out: the list's measured widths are given.
  const proto = HTMLElement.prototype
  const s = Object.getOwnPropertyDescriptor(proto, 'scrollWidth'), c = Object.getOwnPropertyDescriptor(proto, 'clientWidth')
  Object.defineProperty(proto, 'scrollWidth', { configurable: true, get() { return (this as HTMLElement).tagName === 'OL' ? scroll : 0 } })
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get() { return client } })
  return () => { if (s) Object.defineProperty(proto, 'scrollWidth', s); if (c) Object.defineProperty(proto, 'clientWidth', c) }
}
let restore: (() => void) | undefined
afterEach(() => { restore?.(); restore = undefined })

describe('the review\'s phases', () => {
  const list = () => document.querySelector<HTMLElement>('[data-review-progress] > ol')!

  it('stay one row where their names fit', async () => {
    restore = widths(328, 328)
    const r = await render(<ReviewProgress steps={steps} step={'inbox' as never} onStep={() => {}} />)
    expect(list().hasAttribute('data-tight')).toBe(false)
    await r.unmount()
  })

  it('wrap onto more rows where the names are wider than the screen, instead of scrolling sideways', async () => {
    restore = widths(432, 328)
    const r = await render(<ReviewProgress steps={steps} step={'inbox' as never} onStep={() => {}} />)
    expect(list().hasAttribute('data-tight')).toBe(true)
    expect(list().className).toContain('data-[tight]:flex-wrap')
    await r.unmount()
  })
})

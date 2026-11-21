// @vitest-environment happy-dom
// GitHub issue 1689: a key typed in the task page's pinned composer scrolled the page to
// its end, so the thread jumped. The browser's scroll is simulated here (no layout in
// the test DOM): a scroll a key starts is undone, the reader's own scroll is kept.
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from '../../ui/test-utils'
import { useFooterKeepsScroll } from './pinnedFooterScroll'

function Page() {
  const [footer, setFooter] = useState<HTMLDivElement | null>(null)
  useFooterKeepsScroll(footer)
  return (
    <div data-scroller style={{ overflowY: 'auto' }}>
      <p>Thread</p>
      <div ref={setFooter} data-footer><div contentEditable data-field /></div>
    </div>
  )
}

async function setup() {
  const { container } = await render(<Page />)
  const scroller = container.querySelector<HTMLElement>('[data-scroller]')!
  let top = 300
  Object.defineProperty(scroller, 'scrollHeight', { value: 2000 })
  Object.defineProperty(scroller, 'clientHeight', { value: 800 })
  Object.defineProperty(scroller, 'scrollTop', { get: () => top, set: (v: number) => { top = v } })
  // What the browser does: moves the page, then reports it.
  const browserScrolls = (to: number) => { top = to; scroller.dispatchEvent(new Event('scroll')) }
  const field = container.querySelector<HTMLElement>('[data-field]')!
  return { scroller, field, browserScrolls, top: () => top }
}

describe('the pinned composer keeps the page where the reader left it (issue 1689)', () => {
  it('undoes the scroll a typed key starts', async () => {
    const s = await setup()
    s.field.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    s.browserScrolls(520)
    s.browserScrolls(1100)
    expect(s.top()).toBe(300)
    s.field.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertText', data: 'b', bubbles: true }))
    s.browserScrolls(900)
    expect(s.top()).toBe(300)
  })

  it('keeps the reader\'s own scroll and the scroll after sending', async () => {
    const s = await setup()
    s.field.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    s.scroller.dispatchEvent(new Event('wheel'))
    s.browserScrolls(100)
    expect(s.top()).toBe(100)

    s.field.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    s.field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
    s.browserScrolls(1200)
    expect(s.top()).toBe(1200)
  })
})

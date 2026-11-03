// @vitest-environment happy-dom
// Cut text in content the browser skips (list-rendering-at-scale D6): not measured
// until it is drawn, then measured as any other.
import { act, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetModuleState } from '../lib/moduleState'
import { render, waitFor } from './test-utils'
import { useOverflowing } from './useOverflowing'

function Title({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const cut = useOverflowing(ref, text)
  return <div ref={ref} data-title data-cut={cut ? '' : undefined}>{text}</div>
}

class StateChange extends Event {
  skipped: boolean
  constructor(type: string, init: EventInit & { skipped: boolean }) {
    super(type, init)
    this.skipped = init.skipped
  }
}

const frame = () => act(() => new Promise<void>((ok) => requestAnimationFrame(() => ok())))

describe('useOverflowing in skipped content', () => {
  let reads = 0
  const proto = HTMLElement.prototype
  const own = proto as unknown as Record<string, unknown>
  const saved = { sh: Object.getOwnPropertyDescriptor(proto, 'scrollHeight'), ch: Object.getOwnPropertyDescriptor(proto, 'clientHeight'), cv: own.checkVisibility }

  beforeEach(() => {
    resetModuleState()
    reads = 0
    vi.stubGlobal('ContentVisibilityAutoStateChangeEvent', StateChange)
    // Skipped: inside an element marked data-skipped (the browser's content-visibility: auto).
    own.checkVisibility = function (this: HTMLElement) { return !this.closest('[data-skipped]') }
    Object.defineProperty(proto, 'scrollHeight', { configurable: true, get() { if ((this as HTMLElement).hasAttribute('data-title')) { reads++; return 60 } return 0 } })
    Object.defineProperty(proto, 'clientHeight', { configurable: true, get() { return (this as HTMLElement).hasAttribute('data-title') ? 40 : 0 } })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (saved.sh) Object.defineProperty(proto, 'scrollHeight', saved.sh); else delete own.scrollHeight
    if (saved.ch) Object.defineProperty(proto, 'clientHeight', saved.ch); else delete own.clientHeight
    if (saved.cv) own.checkVisibility = saved.cv; else delete own.checkVisibility
  })

  it('measures a drawn title at once', async () => {
    const r = await render(<Title text="A long title" />)
    await waitFor(() => r.container.querySelector('[data-title]')!.hasAttribute('data-cut'), 'the cut title')
    await r.unmount()
  })

  it('leaves a skipped title alone until its content is drawn', async () => {
    const r = await render(<ul><li data-skipped=""><Title text="A long title" /></li></ul>)
    await frame()
    await frame()
    const title = r.container.querySelector('[data-title]')!
    expect(reads).toBe(0)
    expect(title.hasAttribute('data-cut')).toBe(false)

    // The row comes near the viewport: the browser draws it and says so.
    const li = r.container.querySelector('li')!
    li.removeAttribute('data-skipped')
    await act(async () => { li.dispatchEvent(new StateChange('contentvisibilityautostatechange', { skipped: false })) })
    await waitFor(() => title.hasAttribute('data-cut'), 'the title measured once drawn')
    expect(reads).toBeGreaterThan(0)
    await r.unmount()
  })

  it('measures every title where the browser cannot say what it skips', async () => {
    vi.unstubAllGlobals()
    const r = await render(<ul><li data-skipped=""><Title text="A long title" /></li></ul>)
    await waitFor(() => r.container.querySelector('[data-title]')!.hasAttribute('data-cut'), 'the cut title')
    await r.unmount()
  })
})

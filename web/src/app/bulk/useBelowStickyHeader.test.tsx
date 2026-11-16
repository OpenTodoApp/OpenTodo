// @vitest-environment happy-dom
// An element pinned below the sticky page header (issue 518; the quick add, #1441).
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'
import { render, waitFor } from '../../ui/test-utils'
import { useBelowStickyHeader } from './useBelowStickyHeader'

function Probe({ sticky, stuckAt, margin }: { sticky: boolean; stuckAt?: string; margin?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const { top, gap } = useBelowStickyHeader(ref, true)
  return (
    <div data-page-body>
      <header data-page-header style={{ position: sticky ? 'sticky' : 'static', top: stuckAt, marginBottom: margin }} ref={(el) => { if (el) Object.defineProperty(el, 'offsetHeight', { value: 47, configurable: true }) }} />
      <div ref={ref} data-probe={top} data-gap={gap} />
    </div>
  )
}

describe('useBelowStickyHeader', () => {
  it('sits right under a sticky header', async () => {
    const r = await render(<Probe sticky />)
    await waitFor(() => r.container.querySelector('[data-probe]')?.getAttribute('data-probe') === '47', 'the header height')
  })

  // The list page's header sticks under its top padding with a margin below it (#1441):
  // the element sticks where it rests, below both, and paints the margin.
  it('counts the header\'s own sticky top and its bottom margin', async () => {
    const r = await render(<Probe sticky stuckAt="20px" margin="8px" />)
    await waitFor(() => r.container.querySelector('[data-probe]')?.getAttribute('data-probe') === '75', 'top + height + margin')
    expect(r.container.querySelector('[data-probe]')?.getAttribute('data-gap')).toBe('8')
  })

  it('stays at the top when the header scrolls away', async () => {
    const r = await render(<Probe sticky={false} />)
    await waitFor(() => r.container.querySelector('[data-probe]')?.getAttribute('data-probe') === '0', 'no offset')
  })
})

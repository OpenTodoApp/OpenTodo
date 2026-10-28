// @vitest-environment happy-dom
// The selection bar is pinned below the sticky page header (issue 518).
import { useRef } from 'react'
import { describe, it } from 'vitest'
import { render, waitFor } from '../../ui/test-utils'
import { useBelowStickyHeader } from './useBelowStickyHeader'

function Probe({ sticky }: { sticky: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  const top = useBelowStickyHeader(ref, true)
  return (
    <div data-page-body>
      <header data-page-header style={{ position: sticky ? 'sticky' : 'static' }} ref={(el) => { if (el) Object.defineProperty(el, 'offsetHeight', { value: 47, configurable: true }) }} />
      <div ref={ref} data-probe={top} />
    </div>
  )
}

describe('useBelowStickyHeader', () => {
  it('sits right under a sticky header', async () => {
    const r = await render(<Probe sticky />)
    await waitFor(() => r.container.querySelector('[data-probe]')?.getAttribute('data-probe') === '47', 'the header height')
  })

  it('stays at the top when the header scrolls away', async () => {
    const r = await render(<Probe sticky={false} />)
    await waitFor(() => r.container.querySelector('[data-probe]')?.getAttribute('data-probe') === '0', 'no offset')
  })
})

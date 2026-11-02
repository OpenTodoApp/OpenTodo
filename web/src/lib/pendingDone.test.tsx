// @vitest-environment happy-dom
// The tick in the frame of the click (OpenSpec change list-rendering-at-scale, D3).
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { markPendingDone, PENDING_MS, usePendingDone } from './pendingDone'
import { render } from '../ui/test-utils'
import type { Task } from './types'

const row = (completed_at: number | null, clock = {}): Task => ({ id: 't1', title: 'T', completed_at, _clock: clock }) as unknown as Task

function Probe({ task }: { task: Task }) {
  return <span data-done={String(usePendingDone(task))} />
}

afterEach(() => { vi.useRealTimers() })

describe('a pending completion', () => {
  it('shows at once, gives way to the stored row, and expires', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const clock = {}
    const stored = row(null, clock)
    const r = await render(<Probe task={stored} />)
    const done = () => r.container.querySelector('span')!.getAttribute('data-done')
    expect(done()).toBe('false')
    await act(async () => markPendingDone(stored, true))
    expect(done()).toBe('true')
    // A copy of the same stored row (same clocks) still shows the tick.
    await r.rerender(<Probe task={{ ...stored }} />)
    expect(done()).toBe('true')
    // The write arrives: the stored row decides (a series moved on: open again).
    await r.rerender(<Probe task={row(null, {})} />)
    expect(done()).toBe('false')
    // A failed write: the tick goes after PENDING_MS.
    await r.rerender(<Probe task={stored} />)
    await act(async () => markPendingDone(stored, true))
    expect(done()).toBe('true')
    await act(async () => { vi.advanceTimersByTime(PENDING_MS) })
    expect(done()).toBe('false')
    await r.unmount()
  })
})

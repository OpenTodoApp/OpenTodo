// @vitest-environment happy-dom
// Now for the waiting tasks' passed times (OpenSpec change today-waiting-time-passed,
// design D3): read again on each minute boundary while tasks wait, none otherwise.
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '../../ui/test-utils'
import { useWaitingNow } from './useClosedList'

let seen: (string | undefined)[] = []
function Probe({ active }: { active: boolean }) {
  seen.push(useWaitingNow(active))
  return null
}

afterEach(() => {
  vi.useRealTimers()
  seen = []
})

describe('useWaitingNow', () => {
  it('follows the minute while tasks wait', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date(2026, 9, 30, 8, 59, 30))
    const r = await render(<Probe active />)
    expect(seen.at(-1)).toBe('08:59')
    await act(async () => { vi.advanceTimersByTime(31_000) })
    expect(seen.at(-1)).toBe('09:00')
    await act(async () => { vi.advanceTimersByTime(60_000) })
    expect(seen.at(-1)).toBe('09:01')
    await r.unmount()
  })

  it('is undefined and sets no timer while nothing waits', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date(2026, 9, 30, 8, 59, 30))
    const r = await render(<Probe active={false} />)
    expect(seen.at(-1)).toBeUndefined()
    expect(vi.getTimerCount()).toBe(0)
    await r.unmount()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_FUTURE_SKEW_MS, hlcClockRefused, hlcLast, hlcNow, hlcObserveServerTime, hlcReset, hlcSeed, wins } from './hlc'

// Unit tests of the hybrid logical clock (test-integrity); the sync behaviour
// around it (clock_skew refusals, restamping) is in clockSkew.test.ts.
const T = 1_800_000_000_000

beforeEach(() => {
  hlcReset()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('hlcNow', () => {
  it('follows the wall clock and is strictly increasing within one millisecond', () => {
    expect(hlcNow()).toBe(T)
    expect(hlcNow()).toBe(T + 1)
    expect(hlcNow()).toBe(T + 2)
    vi.setSystemTime(T + 1000)
    expect(hlcNow()).toBe(T + 1000)
  })

  it('never goes back when the system clock jumps backwards', () => {
    vi.setSystemTime(T + 60_000)
    const before = hlcNow()
    vi.setSystemTime(T - 3_600_000)
    const seen = [hlcNow(), hlcNow(), hlcNow()]
    expect(seen).toEqual([before + 1, before + 2, before + 3])
  })

  it('continues after the seed a reload restores, never reusing a timestamp', () => {
    hlcSeed(T + 500)
    expect(hlcNow()).toBe(T + 501)
    // An older seed does not move the clock back.
    hlcSeed(T)
    expect(hlcNow()).toBe(T + 502)
  })
})

describe('server time', () => {
  it('ignores a missing or invalid server time', () => {
    hlcObserveServerTime(undefined)
    hlcObserveServerTime(Number.NaN)
    hlcObserveServerTime(Number.POSITIVE_INFINITY)
    expect(hlcNow()).toBe(T)
  })

  it('leaves a skew within the tolerance alone and follows a larger one in both directions', () => {
    hlcObserveServerTime(T + 1500)
    expect(hlcNow()).toBe(T)
    // The device runs ten minutes slow: its stamps follow the server.
    hlcObserveServerTime(T + 600_000)
    expect(hlcNow()).toBe(T + 600_000)
    // The device runs ten minutes fast: the offset is negative, the clock stays monotonic.
    hlcReset()
    hlcObserveServerTime(T - 600_000)
    expect(hlcNow()).toBe(T - 600_000)
  })

  it('keeps every timestamp it issues within the window the server accepts after observing it', () => {
    vi.setSystemTime(T + 2 * 3_600_000) // two hours fast
    hlcSeed(T + 2 * 3_600_000)
    hlcObserveServerTime(T)
    for (let i = 0; i < 100; i++) expect(hlcNow()).toBeLessThanOrEqual(T + MAX_FUTURE_SKEW_MS)
  })

  it('restarts from server time after a refusal, even from a seed inside the accepted window', () => {
    hlcSeed(T + MAX_FUTURE_SKEW_MS - 10)
    hlcObserveServerTime(T)
    expect(hlcLast()).toBe(T + MAX_FUTURE_SKEW_MS - 10)
    hlcClockRefused(T)
    expect(hlcLast()).toBe(T)
    expect(hlcNow()).toBe(T + 1)
  })
})

describe('wins', () => {
  it('orders by timestamp, then by device id, like the server', () => {
    expect(wins(2, 'a')).toBe(true)
    expect(wins(2, 'a', { ts: 1, device: 'z' })).toBe(true)
    expect(wins(1, 'z', { ts: 2, device: 'a' })).toBe(false)
    expect(wins(2, 'b', { ts: 2, device: 'a' })).toBe(true)
    expect(wins(2, 'a', { ts: 2, device: 'b' })).toBe(false)
    // The same op again changes nothing.
    expect(wins(2, 'a', { ts: 2, device: 'a' })).toBe(false)
  })
})

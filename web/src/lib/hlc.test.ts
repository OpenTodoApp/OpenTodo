import { readFileSync, writeFileSync } from 'node:fs'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_FUTURE_SKEW_MS, hlcClockRefused, hlcReceive, hlcLast, hlcNow, hlcObserveServerTime, hlcOffset, hlcReset, hlcSeed, wins } from './hlc'

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

describe('hlcReceive', () => {
  it('moves the clock past a received timestamp, never back', () => {
    hlcReceive(T + 5000)
    expect(hlcNow()).toBe(T + 5001)
    hlcReceive(T)
    expect(hlcNow()).toBe(T + 5002)
    hlcReceive(Number.NaN)
    expect(hlcNow()).toBe(T + 5003)
  })

  it('breaks a tie with the received op by moving one past it', () => {
    hlcReceive(T)
    expect(hlcNow()).toBe(T + 1)
  })
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

  it('keeps the stamps of an earlier refusal in order when a later batch is refused too (#651)', () => {
    vi.setSystemTime(T + 2 * 3_600_000) // two hours fast
    hlcNow() // an edit, refused in the first request
    hlcNow() // a later edit, refused in the second
    hlcClockRefused(T)
    const first = hlcNow()
    hlcClockRefused(T)
    const second = hlcNow()
    expect(first).toBeLessThanOrEqual(T + MAX_FUTURE_SKEW_MS)
    expect(second).toBeGreaterThan(first)
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

// The shared vectors (docs/contracts.md): the same steps drive the Go property
// test's model of this clock (propDevice, internal/sync/hlc_vectors_test.go),
// so a change here that the model does not follow fails one of the two tests.
// UPDATE_HLC_VECTORS=1 writes the want values from this implementation.
interface HLCStep { do: 'stamp' | 'receive' | 'observe' | 'refused'; at?: number; ts?: number; server?: number; skew?: number; want?: number; want_last?: number; want_offset?: number }
interface HLCVectors {
  clocks: { name: string; skew: number; steps: HLCStep[] }[]
  wins: { ts: number; device: string; existing: { ts: number; device: string } | null; want: boolean }[]
}
const VECTORS = new URL('./hlc.vectors.json', import.meta.url)

describe('hlc.vectors.json', () => {
  const vectors = JSON.parse(readFileSync(VECTORS, 'utf8')) as HLCVectors
  const update = !!process.env.UPDATE_HLC_VECTORS

  for (const clock of vectors.clocks) {
    it(clock.name, () => {
      let skew = clock.skew
      clock.steps.forEach((step, i) => {
        if (step.skew !== undefined) skew = step.skew
        if (step.at !== undefined) vi.setSystemTime(step.at + skew)
        let stamped: number | undefined
        if (step.do === 'stamp') stamped = hlcNow()
        else if (step.do === 'receive') hlcReceive(step.ts!)
        else if (step.do === 'observe') hlcObserveServerTime(step.server)
        else hlcClockRefused(step.server!)
        if (update) {
          if (stamped !== undefined) step.want = stamped
          step.want_last = hlcLast()
          step.want_offset = hlcOffset()
          return
        }
        const at = `step ${i} (${step.do})`
        if (step.do === 'stamp') expect(stamped, at).toBe(step.want)
        expect(hlcLast(), at).toBe(step.want_last)
        expect(hlcOffset(), at).toBe(step.want_offset)
      })
    })
  }

  it('compares like the vectors', () => {
    for (const c of vectors.wins) expect(wins(c.ts, c.device, c.existing ?? undefined), JSON.stringify(c)).toBe(c.want)
  })

  if (update) {
    afterAll(() => writeFileSync(VECTORS, JSON.stringify(vectors, null, 2) + '\n'))
  }
})

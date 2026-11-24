// The derivation's time budget (theme-engine task 2.4): deriving a theme runs when a
// theme is chosen or edited, on the device, and stays under 5 ms a theme (about 2.5 ms
// measured on the CI runner, no faster than a mid-range phone for this work).
//
// Measured as this thread's CPU time, not wall-clock time: another process taking the
// core (parallel test workers, a busy runner) stops the clock instead of adding to it.
// Each theme's cost is the median of five runs, and the budget holds for the median
// theme of the sweep, so a garbage collection or a cache-cold run does not decide it.
// It runs in the perf suite (`npm run test:perf`), alone, never beside the unit suite.
import { describe, expect, it } from 'vitest'
import { deriveTheme } from './derive'
import { SWEEP, sweepDocument } from './sweep'

const cpuMs = () => {
  const { user, system } = process.threadCpuUsage()
  return (user + system) / 1000
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1]

describe('deriving a theme', () => {
  it('takes under 5 ms of CPU for the median theme of the sweep', () => {
    const docs = SWEEP.map(sweepDocument)
    for (const d of docs.slice(0, 20)) deriveTheme(d)
    const costs = docs.map((d) => median(Array.from({ length: 5 }, () => {
      const t0 = cpuMs()
      deriveTheme(d)
      return cpuMs() - t0
    })))
    const each = median(costs)
    expect(each, `${each.toFixed(2)} ms a theme`).toBeLessThan(5)
    // 1,200 derivations: a few seconds of CPU, which a busy machine spreads over many
    // more of wall-clock time. The budget is the CPU time above; this ceiling only
    // has to catch a hang.
  }, 120_000)
})

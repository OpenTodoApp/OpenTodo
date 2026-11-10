// The hybrid clock's shared vectors (docs/contracts.md), run on the app's runtime
// against the same module the web app runs: web/src/lib/hlc.ts.
import { hlcClockRefused, hlcLast, hlcNow, hlcObserveServerTime, hlcOffset, hlcReceive, wins } from '@shared/hlc'
import { resetModuleState } from '@shared/moduleState'
import vectors from '../../../web/src/lib/hlc.vectors.json'

interface Step { do: string; at?: number; ts?: number; server?: number; skew?: number; want?: number; want_last?: number; want_offset?: number }

beforeEach(() => {
  resetModuleState()
  jest.useFakeTimers()
})
afterEach(() => jest.useRealTimers())

describe('hlc.vectors.json', () => {
  for (const clock of vectors.clocks) {
    it(clock.name, () => {
      let skew = clock.skew
      ;(clock.steps as Step[]).forEach((step, i) => {
        if (step.skew !== undefined) skew = step.skew
        if (step.at !== undefined) jest.setSystemTime(step.at + skew)
        let stamped: number | undefined
        if (step.do === 'stamp') stamped = hlcNow()
        else if (step.do === 'receive') hlcReceive(step.ts!)
        else if (step.do === 'observe') hlcObserveServerTime(step.server)
        else hlcClockRefused(step.server!)
        const at = `step ${i} (${step.do})`
        if (step.do === 'stamp') expect({ at, stamped }).toEqual({ at, stamped: step.want })
        expect({ at, last: hlcLast(), offset: hlcOffset() }).toEqual({ at, last: step.want_last, offset: step.want_offset })
      })
    })
  }

  it('compares like the vectors', () => {
    for (const c of vectors.wins) expect({ c, got: wins(c.ts, c.device, c.existing ?? undefined) }).toEqual({ c, got: c.want })
  })
})

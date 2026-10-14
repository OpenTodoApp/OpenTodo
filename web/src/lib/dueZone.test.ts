// setDueZone (task-detail-redesign D4): fix a due to any zone, keeping its wall time.
import { describe, expect, it } from 'vitest'
import { localDueOf, setDueZone } from './dates'

const BERLIN = 'Europe/Berlin'
const NY = 'America/New_York'

describe('setDueZone', () => {
  it('floating to New York keeps the wall time; a Berlin viewer sees 21:00', () => {
    const due = setDueZone({ date: '2026-11-02', time: '15:00' }, NY)
    expect(due).toEqual({ date: '2026-11-02', time: '15:00', tz: NY })
    expect(localDueOf(due!, BERLIN)).toEqual({ date: '2026-11-02', time: '21:00' })
  })
  it('zoned to another zone keeps the stored wall time and replaces the zone', () => {
    expect(setDueZone({ date: '2026-11-02', time: '15:00', tz: BERLIN }, NY)).toEqual({ date: '2026-11-02', time: '15:00', tz: NY })
  })
  it('rejects a due without a time and an unknown zone', () => {
    expect(setDueZone({ date: '2026-11-02' }, NY)).toBeNull()
    expect(setDueZone({ date: '2026-11-02', time: '15:00' }, 'Mars/Olympus_Mons')).toBeNull()
  })
})

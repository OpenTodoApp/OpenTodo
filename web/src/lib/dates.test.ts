import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  compareDue, currentDayStart, describeDue, logicalDay, logicalToday, setDayStart, todayISO, dueFromView, dueToInstant, fixDueToZone, instantToLocalDue, localDueOf, onViewerZoneChange,
  refreshViewerZone, releaseDue, viewerZone, watchViewerZone, zonedInstant, zoneHint, quickChoices, setDateTime,
} from './dates'
import vectors from './zoned.vectors.json'
import { dayInZone } from './stats'
import type { Due } from './types'

const LA = 'America/Los_Angeles'
const BERLIN = 'Europe/Berlin'

describe('shared zoned vectors (internal/zoned agrees)', () => {
  for (const v of vectors.instant) {
    it(`instant: ${v.note}`, () => {
      expect(new Date(zonedInstant(v.date, v.time, v.tz)).toISOString().replace('.000', '')).toBe(v.utc)
    })
  }
  for (const v of vectors.local) {
    it(`local: ${v.note}`, () => {
      expect(instantToLocalDue(Date.parse(v.utc), v.zone)).toEqual({ date: v.date, time: v.time })
    })
  }
})

describe('display in the viewer zone', () => {
  const berlin9: Due = { date: '2026-10-11', time: '09:00', tz: BERLIN }

  it('Berlin 09:00 seen from Los Angeles is 00:00 on the 11th with a hint', () => {
    expect(localDueOf(berlin9, LA)).toEqual({ date: '2026-10-11', time: '00:00' })
    expect(zoneHint(berlin9, LA)).toBe('09:00 Berlin')
  })

  it('Tokyo 02:00 on the 12th seen from Berlin crosses midnight', () => {
    const tokyo: Due = { date: '2026-10-12', time: '02:00', tz: 'Asia/Tokyo' }
    expect(localDueOf(tokyo, BERLIN)).toEqual({ date: '2026-10-11', time: '19:00' })
    const hint = zoneHint(tokyo, BERLIN)!
    expect(hint).toMatch(/02:00 Tokyo$/)
    expect(hint).toMatch(/12/)
  })

  it('no hint in the same zone; floating dues have none and are unchanged', () => {
    expect(zoneHint(berlin9, BERLIN)).toBeNull()
    expect(localDueOf(berlin9, BERLIN)).toEqual({ date: '2026-10-11', time: '09:00' })
    const floating: Due = { date: '2026-10-11', time: '09:00' }
    expect(localDueOf(floating, LA)).toBe(floating)
    expect(zoneHint(floating, LA)).toBeNull()
  })

  it('spring-forward 02:30 is 03:00 in Berlin and 02:00 in London', () => {
    const gap: Due = { date: '2026-03-29', time: '02:30', tz: BERLIN }
    expect(localDueOf(gap, BERLIN)).toEqual({ date: '2026-03-29', time: '03:00' })
    expect(localDueOf(gap, 'Europe/London')).toEqual({ date: '2026-03-29', time: '02:00' })
  })

  it('autumn overlap resolves to the first occurrence', () => {
    const overlap: Due = { date: '2026-10-25', time: '02:30', tz: BERLIN }
    expect(dueToInstant(overlap)).toBe(Date.UTC(2026, 9, 25, 0, 30))
    expect(localDueOf(overlap, 'UTC')).toEqual({ date: '2026-10-25', time: '00:30' })
  })

  it('across a transition in one zone only, the shown time differs by an hour', () => {
    const ny = 'America/New_York'
    expect(localDueOf({ date: '2026-10-18', time: '09:00', tz: BERLIN }, ny).time).toBe('03:00')
    expect(localDueOf({ date: '2026-10-28', time: '09:00', tz: BERLIN }, ny).time).toBe('04:00')
  })

  it('sorts a zoned 09:00 Berlin before a floating 08:00 when viewed from Los Angeles', () => {
    const floating8: Due = { date: '2026-10-11', time: '08:00' }
    expect(compareDue(berlin9, floating8, LA)).toBe(-1)
    expect(compareDue(berlin9, floating8, BERLIN)).toBe(1)
    const sorted = [floating8, berlin9].sort((a, b) => compareDue(a, b, LA))
    expect(sorted[0]).toBe(berlin9)
  })

  it('describeDue labels the local date and time', () => {
    expect(describeDue(berlin9, '2026-10-11', LA)).toEqual({ label: 'Today 00:00', tone: 'today', time: '00:00' })
    expect(describeDue({ date: '2026-10-12', time: '02:00', tz: 'Asia/Tokyo' }, '2026-10-11', BERLIN)).toEqual({ label: 'Today 19:00', tone: 'today', time: '19:00' })
  })

  it('floating dues resolve in the given zone', () => {
    expect(dueToInstant({ date: '2026-10-11', time: '09:00' }, LA)).toBe(Date.UTC(2026, 9, 11, 16, 0))
  })
})

describe('fix and release', () => {
  it('fix keeps the shown time and sets the viewer zone', () => {
    const fixed = fixDueToZone({ date: '2026-10-11', time: '09:00' }, BERLIN)
    expect(fixed).toEqual({ date: '2026-10-11', time: '09:00', tz: BERLIN })
    expect(localDueOf(fixed, BERLIN)).toEqual({ date: '2026-10-11', time: '09:00' })
  })

  it('a due without time cannot be fixed', () => {
    const d: Due = { date: '2026-10-11' }
    expect(fixDueToZone(d, BERLIN)).toBe(d)
  })

  it('release in another zone keeps the displayed time', () => {
    expect(releaseDue({ date: '2026-10-11', time: '09:00', tz: BERLIN }, LA)).toEqual({ date: '2026-10-11', time: '00:00' })
  })

  it('fix then release round-trips without changing the displayed time', () => {
    for (const zone of [BERLIN, LA, 'Asia/Kolkata']) {
      const d: Due = { date: '2026-03-08', time: '14:35' }
      const back = releaseDue(fixDueToZone(d, zone), zone)
      expect(back).toEqual(d)
    }
  })

  it('editing a zoned due as displayed keeps its zone; clearing the time drops it', () => {
    const berlin9: Due = { date: '2026-10-11', time: '09:00', tz: BERLIN }
    expect(dueFromView(berlin9, { date: '2026-10-11', time: '01:00' }, LA)).toEqual({ date: '2026-10-11', time: '10:00', tz: BERLIN })
    expect(dueFromView(berlin9, { date: '2026-10-11' }, LA)).toEqual({ date: '2026-10-11' })
    expect(dueFromView(berlin9, null, LA)).toBeNull()
    expect(dueFromView({ date: '2026-10-11' }, { date: '2026-10-12', time: '08:00' }, LA)).toEqual({ date: '2026-10-12', time: '08:00' })
  })
})

describe('viewer zone resolution', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    refreshViewerZone()
  })

  it('re-resolves on visibility change and notifies subscribers', () => {
    let zone = 'Europe/Berlin'
    const real = Intl.DateTimeFormat.prototype.resolvedOptions
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (this: Intl.DateTimeFormat) {
      return { ...real.call(this), timeZone: zone }
    })
    refreshViewerZone()
    expect(viewerZone()).toBe('Europe/Berlin')
    const seen: string[] = []
    const off = onViewerZoneChange(() => seen.push(viewerZone()))
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' }) as unknown as Document
    const stop = watchViewerZone(doc)
    const berlin9: Due = { date: '2026-10-11', time: '09:00', tz: BERLIN }
    expect(localDueOf(berlin9).time).toBe('09:00')

    zone = LA
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(viewerZone()).toBe(LA)
    expect(localDueOf(berlin9).time).toBe('00:00')
    expect(zoneHint(berlin9)).toBe('09:00 Berlin')

    zone = BERLIN
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(seen).toEqual([LA, BERLIN])
    // Unchanged zone: no notification.
    doc.dispatchEvent(new Event('visibilitychange'))
    expect(seen).toHaveLength(2)
    stop()
    off()
  })
})

describe('logical day (day-boundary D2)', () => {
  const local = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime()
  afterEach(() => setDayStart(0))

  it('before the day start an instant belongs to the previous day, from it on to its own', () => {
    expect(logicalDay(local(2026, 10, 15, 1, 30), 240)).toBe('2026-10-14')
    expect(logicalDay(local(2026, 10, 15, 3, 59), 240)).toBe('2026-10-14')
    expect(logicalDay(local(2026, 10, 15, 4, 0), 240)).toBe('2026-10-15')
    expect(logicalDay(local(2026, 10, 15, 3, 29), 210)).toBe('2026-10-14')
    expect(logicalDay(local(2026, 10, 15, 3, 30), 210)).toBe('2026-10-15')
  })

  it('at 0 it is the calendar date', () => {
    for (const at of [local(2026, 10, 15, 0, 0), local(2026, 10, 15, 1, 30), local(2026, 10, 15, 23, 59)]) {
      expect(logicalDay(at, 0)).toBe(todayISO(new Date(at)))
    }
  })

  it('crosses month and year ends', () => {
    expect(logicalDay(local(2026, 11, 1, 2), 240)).toBe('2026-10-31')
    expect(logicalDay(local(2027, 1, 1, 2), 240)).toBe('2026-12-31')
    expect(logicalDay(local(2028, 3, 1, 5), 360)).toBe('2028-02-29')
  })

  it('logicalToday reads the snapshot the provider sets, and ignores invalid values', () => {
    const now = local(2026, 10, 15, 1, 30)
    expect(logicalToday(undefined, now)).toBe('2026-10-15')
    setDayStart(240)
    expect(currentDayStart()).toBe(240)
    expect(logicalToday(undefined, now)).toBe('2026-10-14')
    expect(logicalDay(now)).toBe('2026-10-14')
    setDayStart(600)
    expect(currentDayStart()).toBe(0)
  })

  it('keeps the stated local time on daylight-saving nights (Europe/Zurich)', () => {
    const zurich = (ds: number) => dayInZone('Europe/Zurich', ds)
    // 2026-03-29: 02:00 CET jumps to 03:00 CEST.
    expect(zurich(240)(Date.parse('2026-03-29T03:30:00+02:00'))).toBe('2026-03-28')
    expect(zurich(240)(Date.parse('2026-03-29T04:00:00+02:00'))).toBe('2026-03-29')
    expect(zurich(180)(Date.parse('2026-03-29T03:00:00+02:00'))).toBe('2026-03-29')
    // 2026-10-25: 03:00 CEST falls back to 02:00 CET; both 02:30s are before 03:00.
    expect(zurich(180)(Date.parse('2026-10-25T02:30:00+02:00'))).toBe('2026-10-24')
    expect(zurich(180)(Date.parse('2026-10-25T02:30:00+01:00'))).toBe('2026-10-24')
    expect(zurich(180)(Date.parse('2026-10-25T03:00:00+01:00'))).toBe('2026-10-25')
    expect(zurich(0)(Date.parse('2026-10-25T00:30:00+02:00'))).toBe('2026-10-25')
  })
})

// Quick choices of the When popover (OpenSpec change task-panel-polish, design D2).
describe('quickChoices', () => {
  const monday = { order: 'DM', hour12: false, weekStart: 1 } as const
  const sunday = { order: 'MD', hour12: true, weekStart: 0 } as const
  const dates = (kind: Parameters<typeof quickChoices>[0], today: string, p: typeof monday | typeof sunday) => {
    setDateTime({ date_format: 'system', time_format: 'system', week_start: p.weekStart === 1 ? 'mon' : 'sun' }, p)
    return Object.fromEntries(quickChoices(kind, today).map((c) => [c.id, c.date]))
  }
  afterEach(() => setDateTime({ date_format: 'system', time_format: 'system', week_start: 'system' }))

  it('Do on: today, tomorrow, the coming Saturday, the next week start and no date', () => {
    expect(dates('due', '2026-10-21', monday)).toEqual({ today: '2026-10-21', tomorrow: '2026-10-22', weekend: '2026-10-24', 'next-week': '2026-10-26', none: null })
    expect(dates('due', '2026-10-21', sunday)['next-week']).toBe('2026-10-25')
  })

  it('This weekend is today on a Saturday or a Sunday', () => {
    expect(dates('due', '2026-10-24', monday).weekend).toBe('2026-10-24')
    expect(dates('due', '2026-10-25', monday).weekend).toBe('2026-10-25')
  })

  it('Deadline: the end of the user\'s week, the end of the month, two weeks out', () => {
    expect(dates('deadline', '2026-10-21', monday)).toEqual({ 'end-of-week': '2026-10-25', 'end-of-month': '2026-10-31', 'two-weeks': '2026-11-04' })
    expect(dates('deadline', '2026-10-21', sunday)['end-of-week']).toBe('2026-10-24')
    expect(dates('deadline', '2026-02-10', monday)['end-of-month']).toBe('2026-02-28')
  })

  it('Start offers Someday', () => {
    expect(dates('start', '2026-10-21', monday)).toMatchObject({ today: '2026-10-21', someday: 'someday' })
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  compareDue, describeDue, dueFromView, dueToInstant, fixDueToZone, instantToLocalDue, localDueOf, onViewerZoneChange,
  refreshViewerZone, releaseDue, viewerZone, watchViewerZone, zonedInstant, zoneHint,
} from './dates'
import vectors from './zoned.vectors.json'
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
    expect(describeDue(berlin9, '2026-10-11', LA)).toEqual({ label: 'Today 00:00', tone: 'today' })
    expect(describeDue({ date: '2026-10-12', time: '02:00', tz: 'Asia/Tokyo' }, '2026-10-11', BERLIN)).toEqual({ label: 'Today 19:00', tone: 'today' })
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

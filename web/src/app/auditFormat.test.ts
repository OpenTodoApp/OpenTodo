// Recent activity grouped by day and folded (OpenSpec change settings-refresh D4;
// audit-log "Compact recent activity").
import { describe, expect, it } from 'vitest'
import type { AuditEvent } from '../lib/types'
import { activityDayHeading, activityWarns, firstLines, groupActivity, lineCount } from './auditFormat'

const chrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const firefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'
// 14 October 2026, 18:00 on this device.
const now = new Date(2026, 9, 14, 18, 0).getTime()
const HOUR = 3_600_000
let n = 0
const ev = (name: AuditEvent['name'], hoursAgo: number, over: Partial<AuditEvent> = {}): AuditEvent => ({
  id: ++n, ts: now - hoursAgo * HOUR, name, outcome: 'success', actorId: 'm', actorEmail: 'me@example.com',
  targetId: null, targetEmail: null, ip: '192.0.2.10', userAgent: chrome, details: {}, ...over,
})

describe('groupActivity', () => {
  it('Compact recent activity: four sign-ins today from one Chrome fold into one line, yesterday\'s token stays its own line', () => {
    const days = groupActivity([
      ev('login.succeeded', 1), ev('login.succeeded', 3), ev('login.succeeded', 5), ev('login.succeeded', 7),
      ev('token.created', 24, { details: { token_name: 'laptop' } }),
    ])
    expect(days.map((d) => d.day)).toEqual(['2026-10-14', '2026-10-13'])
    expect(days[0].lines).toHaveLength(1)
    expect(days[0].lines[0]).toMatchObject({ count: 4, warn: false })
    // The folded line keeps the newest sign-in.
    expect(days[0].lines[0].event.ts).toBe(now - HOUR)
    expect(days[1].lines.map((l) => [l.event.name, l.count])).toEqual([['token.created', 1]])
  })

  it('folds per client and per day, never failed sign-ins', () => {
    const days = groupActivity([
      ev('login.succeeded', 1), ev('login.succeeded', 2, { userAgent: firefox }), ev('login.succeeded', 4),
      ev('login.failed', 5, { outcome: 'failure' }), ev('login.failed', 6, { outcome: 'failure' }),
      ev('login.succeeded', 26),
    ])
    expect(days[0].lines.map((l) => [l.event.name, l.count])).toEqual([
      ['login.succeeded', 2], ['login.succeeded', 1], ['login.failed', 1], ['login.failed', 1],
    ])
    expect(days[1].lines.map((l) => l.count)).toEqual([1])
  })

  it('sorts newest first whatever order the events come in', () => {
    const days = groupActivity([ev('logout', 30), ev('token.revoked', 2)])
    expect(days.map((d) => d.lines[0].event.name)).toEqual(['token.revoked', 'logout'])
  })

  it('names failed and unusual events in the warning tone', () => {
    expect(activityWarns(ev('login.failed', 1, { outcome: 'failure' }))).toBe(true)
    expect(activityWarns(ev('mfa.disabled', 1))).toBe(true)
    expect(activityWarns(ev('password.reset_completed', 1))).toBe(true)
    expect(activityWarns(ev('token.created', 1))).toBe(false)
    expect(groupActivity([ev('mfa.disabled', 1)])[0].lines[0].warn).toBe(true)
  })
})

describe('ten lines and Show all', () => {
  it('keeps the first ten lines across days, with their headings', () => {
    const many = Array.from({ length: 30 }, (_, i) => ev('token.created', i * 5))
    const days = groupActivity(many)
    expect(lineCount(days)).toBe(30)
    const first = firstLines(days, 10)
    expect(lineCount(first)).toBe(10)
    expect(first[0].day).toBe(days[0].day)
    expect(first.map((d) => d.day)).toEqual(days.slice(0, first.length).map((d) => d.day))
    expect(lineCount(firstLines(days, 100))).toBe(30)
  })

  it('heads days Today, Yesterday, then the date', () => {
    const date = (iso: string) => `date:${iso}`
    expect(activityDayHeading('2026-10-14', '2026-10-14', date)).toBe('Today')
    expect(activityDayHeading('2026-10-13', '2026-10-14', date)).toBe('Yesterday')
    expect(activityDayHeading('2026-10-01', '2026-10-14', date)).toBe('date:2026-10-01')
  })
})

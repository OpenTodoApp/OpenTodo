import { describe, expect, it } from 'vitest'
import ruleRaw from '../../../internal/timetrack/testdata/rule_fixture.json?raw'
import csvRaw from '../../../internal/timetrack/testdata/csv_fixture.json?raw'
import { csvCell, durationMinutes, entryDay, minutesOf, ownMinutesOnDay, repairs, running, startBatch, toCSV, totalsByTask, type EntryLike } from './time'

// The shared fixtures of internal/timetrack (OpenSpec time-tracking, task 2.2):
// both implementations agree on the running rule and byte for byte on the CSV.

interface RuleCase {
  name: string
  user: string
  now: number
  entries: EntryLike[]
  running: string | null
  repairs: { id: string; ended_at: number }[]
  start_batch: { id: string; ended_at: number }[]
  minutes: Record<string, number>
  zone: string
  day_start: number
  days: Record<string, string>
}

describe('time: the shared rule fixture', () => {
  const cases = (JSON.parse(ruleRaw) as { cases: RuleCase[] }).cases
  it('has the cases the Go test runs', () => expect(cases.length).toBeGreaterThanOrEqual(5))
  for (const c of cases) {
    it(c.name, () => {
      expect(running(c.entries, c.user)?.id ?? null).toBe(c.running)
      expect(repairs(c.entries, c.user)).toEqual(c.repairs)
      expect(startBatch(c.entries, c.user, c.now)).toEqual(c.start_batch)
      for (const e of c.entries) {
        if (e.id in c.minutes) expect(minutesOf(e, c.now)).toBe(c.minutes[e.id])
        if (e.id in c.days) expect(entryDay(e.started_at, c.zone, c.day_start)).toBe(c.days[e.id])
      }
    })
  }
})

describe('time: the shared CSV fixture', () => {
  it('produces the expected file byte for byte ("Export a week")', () => {
    const f = JSON.parse(csvRaw)
    const got = toCSV({ entries: f.entries, tasks: f.tasks, projects: f.projects, labels: f.labels, fields: f.fields, zone: f.zone, dayStart: f.day_start, now: f.now, from: f.from, to: f.to })
    expect(got).toBe(f.expected)
    expect(got.startsWith('﻿date,start,end,minutes,task,project,labels,note,')).toBe(true)
  })
  it('quotes and defuses cells like the Go writer', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('=1+1')).toBe("'=1+1")
    expect(csvCell('-5')).toBe('-5')
    expect(csvCell('- note')).toBe("'- note")
  })
})

describe('time: totals and durations', () => {
  const e = (id: string, task: string, user: string, start: number, end: number | null, deleted: number | null = null): EntryLike =>
    ({ id, task_id: task, user_id: user, started_at: start, ended_at: end, deleted_at: deleted })
  it('two devices tracking the same task add up', () => {
    const totals = totalsByTask([e('a', 't', 'u1', 0, 20 * 60000), e('b', 't', 'u2', 0, 30 * 60000), e('c', 't', 'u1', 0, 9e6, 1)], 0)
    expect(totals.get('t')).toBe(50)
  })
  it("counts the user's own entries that started on the day, running to now", () => {
    const day = (ms: number) => (ms < 1000 ? '2026-10-19' : '2026-10-20')
    const list = [e('y', 't', 'me', 500, 600 + 3600000), e('a', 't', 'me', 2000, 2000 + 20 * 60000), e('b', 't', 'me', 5000, null), e('o', 't', 'them', 5000, null)]
    expect(ownMinutesOnDay(list, 'me', '2026-10-20', 5000 + 60 * 60000, () => true, day)).toBe(80)
  })
  it('reads the typed durations of the filter grammar', () => {
    for (const [s, n] of [['30m', 30], ['45min', 45], ['1h', 60], ['1h30', 90], ['1h30m', 90], ['1.5h', 90], ['90', 90], ['0', 0], ['2H', 120]] as const) expect(durationMinutes(s)).toBe(n)
    for (const s of ['soon', '+30m', '1h75', '1,5h', '', '30s']) expect(durationMinutes(s)).toBeNull()
  })
})

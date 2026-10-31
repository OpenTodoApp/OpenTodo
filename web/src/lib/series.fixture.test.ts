import { describe, expect, it } from 'vitest'
import { occurrenceId } from './ids'
import { planActOn, planCarry, planRepair, type OccurrenceAction } from './seriesPlan'
import type { Due, Task } from './types'
// Shared with internal/sync (Go): PlanActOn and PlanRepair must agree (series-exceptions D2).
import fixture from './series.fixture.json'

interface FixtureRecord { date: string; state: 'open' | 'done' | 'skipped'; due?: Due; title?: string; legacy?: boolean }
interface FixtureCase {
  name: string
  client_only?: boolean
  today: string
  series: Partial<Task> & { recurrence: string; due: Due }
  records: FixtureRecord[]
  act?: { date: string | null; kind: 'complete' | 'skip' | 'move' | 'edit'; due?: Due; patch?: Record<string, unknown> }
  repair?: boolean
  carry?: Record<string, unknown>
  expect: {
    ok?: false
    end?: true
    record_date?: string
    record?: Record<string, unknown> | null
    series?: Record<string, unknown> | null
    carries?: Record<string, Record<string, unknown>>
  }
}

const NOW = 1000

function fixtureSeries(c: FixtureCase): Task {
  return {
    id: 's', title: 'Study', description: '', project_id: null, parent_id: null, priority: 4, labels: [], position: 1,
    created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, deadline: null, start: null, series_id: null,
    ...c.series,
  } as Task
}

function fixtureRecord(series: Task, r: FixtureRecord): Task {
  const due = r.due ?? (series.due?.time ? { date: r.date, time: series.due.time } : { date: r.date })
  return {
    ...series, id: occurrenceId('s', r.date), recurrence: null, series_id: 's', due, title: r.title ?? series.title,
    completed_at: r.state === 'open' ? null : 1, skipped: r.state === 'skipped', habit: false,
    ...(r.legacy ? {} : { occurrence_date: r.date }),
  } as Task
}

function actionOf(act: NonNullable<FixtureCase['act']>): OccurrenceAction {
  if (act.kind === 'move') return { kind: 'move', due: act.due as Due }
  if (act.kind === 'edit') return { kind: 'edit', patch: act.patch ?? {} }
  return { kind: act.kind }
}

describe('shared series fixture', () => {
  const cases = fixture.cases as FixtureCase[]
  it('covers the scenarios the design names', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20)
  })

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const series = fixtureSeries(c)
    const tasks = [series, ...c.records.map((r) => fixtureRecord(series, r))]
    if (c.carry) {
      const out = planCarry(series, c.carry, tasks)
      const byDate = Object.fromEntries(out.map((ch) => [tasks.find((t) => t.id === ch.entityId)?.occurrence_date, ch.patch]))
      expect(byDate).toEqual(c.expect.carries)
      return
    }
    if (c.repair) {
      const out = planRepair(series, tasks, c.today, NOW)
      if (c.expect.series === null) expect(out).toEqual([])
      else expect(out).toEqual([{ entity: 'task', entityId: 's', patch: c.expect.series }])
      return
    }
    const plan = planActOn(series, c.act!.date, actionOf(c.act!), tasks, NOW, c.today)
    if (c.expect.ok === false) {
      expect(plan).toBeNull()
      return
    }
    expect(plan).not.toBeNull()
    if (c.expect.end) {
      expect(plan!.end).toBe(true)
      return
    }
    expect(plan!.end).toBeUndefined()
    const seriesChange = plan!.changes.find((ch) => ch.entityId === 's')
    if (c.expect.series === null) expect(seriesChange).toBeUndefined()
    else expect(seriesChange?.patch).toEqual(c.expect.series)
    const recordChanges = plan!.changes.filter((ch) => ch.entity === 'task' && ch.entityId !== 's')
    if (c.expect.record === null) {
      expect(recordChanges).toEqual([])
      return
    }
    expect(recordChanges.map((ch) => ch.entityId)).toEqual([occurrenceId('s', c.expect.record_date!)])
    expect(recordChanges[0].patch).toMatchObject(c.expect.record!)
  })
})

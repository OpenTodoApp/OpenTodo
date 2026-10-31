import { describe, expect, it } from 'vitest'
import { occurrenceId, pieceId } from './ids'
import { occurrencesInRange } from './occurrences'
import { hasPast, planPast } from './seriesPast'
import { planActOn, planCarry, planRepair, type OccurrenceAction } from './seriesPlan'
import { planEndFrom, planSplit } from './seriesSplit'
import type { Due, SplitFrom, Task } from './types'
// Shared with internal/sync (Go): PlanActOn, PlanRepair, PlanSplit and the lineage
// bounds must agree (series-exceptions D2, series-split D1, D3).
import fixture from './series.fixture.json'

interface FixtureRecord { date: string; state: 'open' | 'done' | 'skipped'; due?: Due; title?: string; legacy?: boolean; series?: string }
interface FixturePiece { id: string; recurrence: string; due: Due; split_from: SplitFrom; completed_at?: number }
interface FixtureCase {
  name: string
  client_only?: boolean
  today: string
  series: Partial<Task> & { recurrence: string; due: Due }
  pieces?: FixturePiece[]
  target?: string
  records: FixtureRecord[]
  act?: { date: string | null; kind: 'complete' | 'skip' | 'move' | 'edit' | 'split' | 'end_from'; due?: Due; patch?: Record<string, unknown> }
  repair?: boolean
  carry?: Record<string, unknown>
  carry_past?: Record<string, unknown>
  range?: { from: string; to: string }
  expect: {
    ok?: false
    invalid?: true
    end?: true
    record_date?: string
    record?: Record<string, unknown> | null
    series?: Record<string, unknown> | null
    piece?: Record<string, unknown>
    carries?: Record<string, Record<string, unknown>>
    occurrences?: Record<string, string[]>
    past?: Record<string, Record<string, unknown>>
    has_past?: boolean
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

function fixturePiece(series: Task, p: FixturePiece): Task {
  return { ...series, id: p.id, recurrence: p.recurrence, due: p.due, split_from: p.split_from, completed_at: p.completed_at ?? null } as Task
}

function fixtureRecord(rows: Task[], r: FixtureRecord): Task {
  const of = rows.find((t) => t.id === (r.series ?? 's'))!
  const due = r.due ?? (of.due?.time ? { date: r.date, time: of.due.time } : { date: r.date })
  return {
    ...of, id: occurrenceId(of.id, r.date), recurrence: null, series_id: of.id, due, title: r.title ?? of.title, split_from: null,
    completed_at: r.state === 'open' ? null : 1, skipped: r.state === 'skipped', habit: false,
    ...(r.legacy ? {} : { occurrence_date: r.date }),
  } as Task
}

function actionOf(act: NonNullable<FixtureCase['act']>): OccurrenceAction {
  if (act.kind === 'move') return { kind: 'move', due: act.due as Due }
  if (act.kind === 'edit') return { kind: 'edit', patch: act.patch ?? {} }
  return { kind: act.kind as 'complete' | 'skip' }
}

/** The carries of a plan by the date of the record they write. */
function carriesOf(changes: { entity: string; entityId: string; patch: Record<string, unknown> }[], tasks: Task[], skip: string[]) {
  return Object.fromEntries(changes.filter((ch) => ch.entity === 'task' && !skip.includes(ch.entityId))
    .map((ch) => [tasks.find((t) => t.id === ch.entityId)?.occurrence_date, ch.patch]))
}

describe('shared series fixture', () => {
  const cases = fixture.cases as FixtureCase[]
  it('covers the scenarios the design names', () => {
    expect(cases.length).toBeGreaterThanOrEqual(40)
  })

  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const series = fixtureSeries(c)
    const rows = [series, ...(c.pieces ?? []).map((p) => fixturePiece(series, p))]
    const tasks = [...rows, ...c.records.map((r) => fixtureRecord(rows, r))]
    const target = rows.find((t) => t.id === (c.target ?? 's'))!
    if (c.range) {
      for (const [id, dates] of Object.entries(c.expect.occurrences ?? {})) {
        const got = occurrencesInRange(rows.find((t) => t.id === id)!, tasks, c.today, c.range.from, c.range.to).projections.map((p) => p.occurrence)
        expect(got, id).toEqual(dates)
      }
      return
    }
    if (c.carry_past) {
      // Also past ones (series-all-scope D2): by record date, or by piece id.
      const out = planPast(target, c.carry_past, tasks)
      expect(Object.fromEntries(out.map((ch) => [tasks.find((t) => t.id === ch.entityId)?.occurrence_date ?? ch.entityId, ch.patch]))).toEqual(c.expect.past)
      if (c.expect.has_past !== undefined) expect(hasPast(target, tasks)).toBe(c.expect.has_past)
      return
    }
    if (c.carry) {
      expect(carriesOf(planCarry(series, c.carry, tasks), tasks, [])).toEqual(c.expect.carries)
      return
    }
    if (c.repair) {
      const out = planRepair(target, tasks, c.today, NOW)
      if (c.expect.series === null) expect(out).toEqual([])
      else expect(out).toEqual([{ entity: 'task', entityId: target.id, patch: c.expect.series }])
      return
    }
    if (c.act!.kind === 'end_from') {
      expect(planEndFrom(target, c.act!.date!, tasks, c.today)).toEqual([{ entity: 'task', entityId: target.id, patch: c.expect.series }])
      return
    }
    if (c.act!.kind === 'split') {
      const plan = planSplit(target, c.act!.date!, c.act!.patch ?? {}, tasks, NOW, c.today)
      if (c.expect.ok === false) {
        expect(plan).toBeNull()
        return
      }
      const id = pieceId(target.id, c.act!.date!)
      expect(plan!.pieceId).toBe(id)
      expect(plan!.changes.find((ch) => ch.entityId === target.id)?.patch).toEqual(c.expect.series)
      expect(plan!.changes.find((ch) => ch.entityId === id)?.patch).toMatchObject(c.expect.piece!)
      expect(carriesOf(plan!.changes, tasks, [target.id, id])).toEqual(c.expect.carries)
      return
    }
    const plan = planActOn(target, c.act!.date, actionOf(c.act!), tasks, NOW, c.today)
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
    const seriesChange = plan!.changes.find((ch) => ch.entityId === target.id)
    if (c.expect.series === null) expect(seriesChange).toBeUndefined()
    else expect(seriesChange?.patch).toEqual(c.expect.series)
    const recordChanges = plan!.changes.filter((ch) => ch.entity === 'task' && ch.entityId !== target.id)
    if (c.expect.record === null) {
      expect(recordChanges).toEqual([])
      return
    }
    expect(recordChanges.map((ch) => ch.entityId)).toEqual([occurrenceId(target.id, c.expect.record_date!)])
    expect(recordChanges[0].patch).toMatchObject(c.expect.record!)
  })
})

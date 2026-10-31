import { describe, expect, it } from 'vitest'
import { addDaysISO } from './dates'
import { habitStats } from './habits'
import { occurrenceId, pieceId } from './ids'
import { lineageOf, MAX_PIECES } from './lineage'
import { occurrencesInRange } from './occurrences'
import type { Change } from './ops'
import { seriesBudget } from './recurring'
import { planRepair } from './seriesPlan'
import { planEndFrom, planSplit, splittable } from './seriesSplit'
import type { Reminder, Task } from './types'

// OpenSpec change series-split: planning on the device (the shared cases are in
// series.fixture.json); these follow a split through to what the views draw.

function series(over: Partial<Task>): Task {
  return {
    id: 's', title: 'Study', description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 1,
    created_at: 0, completed_at: null, deleted_at: null, estimate_minutes: null, recurrence: null, series_id: null,
    assignee_id: null, section_id: null, ical_extra: null, _clock: {}, ...over,
  } as Task
}

/** The rows after writing `changes` (field patches merged, new rows created). */
function apply(rows: Task[], changes: Change[]): Task[] {
  const out = new Map(rows.map((r) => [r.id, r]))
  for (const c of changes) {
    if (c.entity !== 'task') continue
    out.set(c.entityId, { ...(out.get(c.entityId) ?? series({ id: c.entityId })), ...(c.patch as Partial<Task>), id: c.entityId })
  }
  return [...out.values()]
}

const TODAY = '2026-10-12'

describe('This and following', () => {
  const study = series({ recurrence: 'every weekday', due: { date: '2026-10-12', time: '18:00' } })

  it('Study at 19:00 from Wednesday: Tuesday keeps its 18:00 projection', () => {
    const plan = planSplit(study, '2026-10-14', { due: { date: '2026-10-14', time: '19:00' } }, [study], 1000, TODAY)!
    const rows = apply([study], plan.changes)
    const old = rows.find((r) => r.id === 's')!
    const piece = rows.find((r) => r.id === pieceId('s', '2026-10-14'))!
    expect(old.recurrence).toBe('every weekday until 2026-10-13')
    expect(old.due).toEqual({ date: '2026-10-12', time: '18:00' })
    expect(piece.due).toEqual({ date: '2026-10-14', time: '19:00' })
    const draw = (t: Task) => occurrencesInRange(t, rows, TODAY, '2026-10-12', '2026-10-16').projections.map((p) => `${p.occurrence} ${p.time}`)
    expect(draw(old)).toEqual(['2026-10-13 18:00'])
    expect(draw(piece)).toEqual(['2026-10-15 19:00', '2026-10-16 19:00'])
  })

  it('offers no split at the current occurrence or for a completion-relative rule', () => {
    expect(splittable(study, '2026-10-12', [study], TODAY)).toBe(false)
    expect(splittable(study, '2026-10-14', [study], TODAY)).toBe(true)
    const after = series({ recurrence: 'every 3 days after completion', due: { date: '2026-10-12' } })
    expect(splittable(after, '2026-10-15', [after], TODAY)).toBe(false)
  })

  it('copies the relative reminders onto the piece with derived ids', () => {
    const reminders = [
      { id: 'r1', task_id: 's', kind: 'relative', offset_minutes: -15, fire_at: 0, delivered_at: null, dismissed_at: null, created_at: 0, deleted_at: null },
      { id: 'r2', task_id: 's', kind: 'absolute', offset_minutes: null, fire_at: 5, delivered_at: null, dismissed_at: null, created_at: 0, deleted_at: null },
    ] as unknown as Reminder[]
    const plan = planSplit(study, '2026-10-14', { title: 'Spanish' }, [study], 1000, TODAY, reminders)!
    const copies = plan.changes.filter((c) => c.entity === 'reminder')
    expect(copies).toHaveLength(1)
    expect(copies[0].patch).toMatchObject({ task_id: plan.pieceId, kind: 'relative', offset_minutes: -15 })
    expect(planSplit(study, '2026-10-14', { title: 'Spanish' }, [study], 2000, TODAY, reminders)!.changes.find((c) => c.entity === 'reminder')!.entityId).toBe(copies[0].entityId)
  })

  it('Delete this and following ends the series the day before, no piece', () => {
    const spanish = series({ title: 'Spanish class', recurrence: 'every tuesday', due: { date: '2026-10-13' } })
    const changes = planEndFrom(spanish, '2026-12-15', [spanish], TODAY)!
    expect(changes).toEqual([{ entity: 'task', entityId: 's', patch: { recurrence: 'every tuesday until 2026-12-14' } }])
    const rows = apply([spanish], changes)
    expect(occurrencesInRange(rows[0], rows, TODAY, '2026-12-01', '2026-12-31').projections.map((p) => p.occurrence)).toEqual(['2026-12-01', '2026-12-08'])
  })
})

describe('pieces of one lineage', () => {
  it('two splits at different dates converge after the until repair', () => {
    const root = series({ recurrence: 'every day', due: { date: '2026-10-12' } })
    // Device A splits at the 14th, device B at the 20th, both offline.
    const a = apply([root], planSplit(root, '2026-10-14', { title: 'A' }, [root], 1, TODAY)!.changes)
    const b = apply([root], planSplit(root, '2026-10-20', { title: 'B' }, [root], 2, TODAY)!.changes)
    // B's rule for the root wins last-writer-wins; both pieces arrive.
    let rows = [...a.filter((r) => r.id !== 's'), ...b]
    for (const r of rows.filter((x) => x.recurrence)) rows = apply(rows, planRepair(r, rows, TODAY, 3))
    const rule = (id: string) => rows.find((r) => r.id === id)!.recurrence
    expect(rule('s')).toBe('every day until 2026-10-13')
    expect(rule(pieceId('s', '2026-10-14'))).toBe('every day until 2026-10-19')
    expect(rule(pieceId('s', '2026-10-20'))).toBe('every day')
    const dates = rows.filter((r) => r.recurrence).flatMap((r) => [r.due!.date, ...occurrencesInRange(r, rows, TODAY, TODAY, '2026-10-24').projections.map((p) => p.occurrence)])
    expect(dates.sort()).toEqual(Array.from({ length: 13 }, (_, i) => addDaysISO(TODAY, i)))
    // Repairs are done: nothing more to write.
    expect(rows.flatMap((r) => (r.recurrence ? planRepair(r, rows, TODAY, 4) : []))).toEqual([])
  })

  it('caps a lineage walk at 50 pieces', () => {
    const rows: Task[] = []
    for (let i = 0; i < 60; i++) {
      const date = addDaysISO('2026-01-01', i * 2)
      rows.push(series({ id: `p${i}`, recurrence: 'every day', due: { date }, ...(i ? { split_from: { series: `p${i - 1}`, date } } : {}) }))
    }
    const pieces = lineageOf(rows[59], rows)
    expect(pieces).toHaveLength(MAX_PIECES)
    expect(pieces.at(-1)!.task.id).toBe('p59')
    expect(seriesBudget(rows[0], rows, undefined, '2026-01-01').end).toBeNull()
    expect(seriesBudget(rows[30], rows, undefined, '2026-01-01').end).toBe(addDaysISO('2026-01-01', 61))
  })

  it('shows the same streak on two devices whatever order the rows arrived in', () => {
    const root = series({ id: 'r', habit: true, recurrence: 'every day until 2026-10-13', due: { date: '2026-10-13' }, completed_at: 5 })
    const piece = series({ id: 'p', habit: true, recurrence: 'every day', due: { date: '2026-10-15' }, split_from: { series: 'r', date: '2026-10-14' } })
    const rec = (of: string, date: string): Task => series({ id: occurrenceId(of, date), series_id: of, occurrence_date: date, due: { date }, completed_at: 1 })
    const rows = [root, piece, rec('r', '2026-10-11'), rec('r', '2026-10-12'), rec('p', '2026-10-14')]
    const one = habitStats(piece, rows, '2026-10-15')
    // The 13th is the root's last occurrence, completed when it ended.
    expect(one).toEqual({ current: 4, best: 4, pending: true, atRisk: false })
    expect(habitStats(piece, [...rows].reverse(), '2026-10-15')).toEqual(one)
  })
})

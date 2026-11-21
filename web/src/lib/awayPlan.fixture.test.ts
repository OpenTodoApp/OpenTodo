// The skips of an away period against the cases internal/sync/away_plan.go is
// pinned to (internal/sync/testdata/away_plan.fixture.json).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { occurrenceId } from './ids'
import { planAway } from './awayPlan'
import type { Task } from './types'

interface Case {
  name: string; today: string; from: string; to: string
  series: { rule: string; due: string; habit?: boolean }
  records?: { date: string; state: 'done' | 'skipped' }[]
  skipped: string[]; due: string; occurrences: number
}
const { cases } = JSON.parse(readFileSync(resolve(__dirname, '../../../internal/sync/testdata/away_plan.fixture.json'), 'utf8')) as { cases: Case[] }

const base = { title: 'x', description: '', project_id: null, parent_id: null, priority: 4, labels: [], position: 0, created_at: 0, deleted_at: null, completed_at: null, estimate_minutes: null, series_id: null, occurrence_date: null, skipped: false } as unknown as Task

describe('away plan fixture', () => {
  it.each(cases)('$name', (c) => {
    const series = { ...base, id: 's1', recurrence: c.series.rule, due: { date: c.series.due }, habit: !!c.series.habit } as Task
    const records = (c.records ?? []).map((r) => ({ ...base, id: occurrenceId('s1', r.date), series_id: 's1', occurrence_date: r.date, due: { date: r.date }, completed_at: 1, skipped: r.state === 'skipped' }) as Task)
    const plan = planAway([series], { all: true }, c.from, c.to, () => [series, ...records], () => true, 5, c.today)
    const move = plan.changes.find((ch) => ch.entityId === 's1')
    const skipped = plan.changes.filter((ch) => ch.entityId !== 's1' && ch.patch.skipped === true).map((ch) => ch.patch.occurrence_date as string).sort()
    expect(skipped).toEqual(c.skipped)
    expect((move?.patch.due as { date: string } | undefined)?.date ?? c.series.due).toBe(c.due)
    expect(plan.occurrences).toBe(c.occurrences)
  })
})

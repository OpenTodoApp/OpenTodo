// The filter evaluator against the shared vectors (routines-engine "Evaluation
// on the server for routines"): internal/filter/evaluate_test.go runs the same
// file, so a routine's Find tasks lists what the device lists.
import { describe, expect, it } from 'vitest'
import type { FieldDef, Label, Project, Task } from '../types'
import { runFilter } from './evaluate'
import vectors from './evaluate.vectors.json'

function task(row: Record<string, unknown>): Task {
  const fields: Record<string, unknown> = {}
  const base: Record<string, unknown> = {
    title: '', description: '', labels: [], priority: 4, due: null, project_id: null, section_id: null, parent_id: null, start: null,
    deadline: null, evening: false, day_part: null, completed_at: null, deleted_at: null, created_at: 1792454400000, habit: false,
    origin: null, energy: '', blocked_by: [], position: 0,
  }
  for (const [k, v] of Object.entries(row)) {
    if (k.startsWith('fields.')) fields[k.slice(7)] = v
    else base[k] = v
  }
  return { ...base, fields } as unknown as Task
}

describe('filter evaluation (shared vectors with internal/filter)', () => {
  const tasks = vectors.tasks.map((r) => task(r as Record<string, unknown>))
  const ctx = {
    today: vectors.today,
    weekStart: vectors.week_start,
    labels: vectors.labels as unknown as Label[],
    projects: vectors.projects as unknown as Project[],
    fields: vectors.fields as unknown as FieldDef[],
    tasks,
    tracked: new Map(Object.entries(vectors.tracked)),
  }
  it('has the vectors', () => expect(vectors.cases.length).toBeGreaterThanOrEqual(50))
  for (const c of vectors.cases) {
    it(c.query || '(empty)', () => {
      const res = runFilter(c.query, tasks, ctx)
      if (!res.ok) throw new Error(res.error)
      expect(res.tasks.map((t) => t.id)).toEqual(c.ids)
      expect(res.warnings.length).toBe((c as { warnings?: number }).warnings ?? 0)
    })
  }
})

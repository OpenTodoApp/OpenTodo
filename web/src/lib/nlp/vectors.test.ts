import { describe, expect, it } from 'vitest'
import { parse } from './parse'
import vectors from './quickadd.vectors.json'

interface Case {
  name: string
  line: string
  ctx: { today: string; now: string; languages: string[]; projects: { id: string; name: string }[] }
  expect: Record<string, unknown>
}

describe('shared quick-add vectors (quick-add-recurrence)', () => {
  for (const c of (vectors as { cases: Case[] }).cases) {
    it(c.name, () => {
      const r = parse(c.line, c.ctx)
      expect({
        title: r.title, due: r.due, projectId: r.projectId, labels: r.labels, priority: r.priority,
        estimateMinutes: r.estimateMinutes, spentMinutes: r.spentMinutes, recurrence: r.recurrence, reminders: r.reminders,
      }).toEqual(c.expect)
    })
  }
})

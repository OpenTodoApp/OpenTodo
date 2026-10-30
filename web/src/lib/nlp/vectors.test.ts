import { describe, expect, it } from 'vitest'
import { parse } from './parse'
import vectors from './quickadd.vectors.json'

interface Case {
  name: string
  line: string
  ctx: { today: string; now: string; languages: string[]; projects: { id: string; name: string }[]; dayParts?: boolean; energy?: boolean }
  expect: Record<string, unknown>
}

describe('shared quick-add vectors (quick-add-recurrence)', () => {
  for (const c of (vectors as { cases: Case[] }).cases) {
    it(c.name, () => {
      const r = parse(c.line, c.ctx)
      // The part of the day (day-parts) is compared when the case states it.
      const parts = 'dayPart' in c.expect ? { dayPart: r.dayPart, evening: r.evening } : {}
      // And the energy (task-energy), '' for none as the Go result has it.
      const energy = 'energy' in c.expect ? { energy: r.energy ?? '' } : {}
      expect({
        title: r.title, due: r.due, projectId: r.projectId, labels: r.labels, priority: r.priority,
        estimateMinutes: r.estimateMinutes, spentMinutes: r.spentMinutes, recurrence: r.recurrence, reminders: r.reminders, ...parts, ...energy,
      }).toEqual(c.expect)
    })
  }
})

// The quick-add vectors shared with internal/quickadd (docs/contracts.md), run on the
// app's runtime against web/src/lib/nlp.
import { parse } from '@shared/nlp/parse'
import vectors from '../../../web/src/lib/nlp/quickadd.vectors.json'

interface Case {
  name: string
  line: string
  ctx: { today: string; now: string; languages: string[]; projects: { id: string; name: string }[]; dayParts?: boolean; energy?: boolean; sectors?: boolean; weekStart?: number }
  expect: Record<string, unknown>
}

describe('quickadd.vectors.json', () => {
  for (const c of (vectors as { cases: Case[] }).cases) {
    it(c.name, () => {
      const r = parse(c.line, c.ctx)
      // The optional fields are compared when the case states them, '' for none as in Go.
      const opt = (k: 'energy' | 'sector' | 'deadline') => (k in c.expect ? { [k]: r[k] ?? '' } : {})
      const parts = 'dayPart' in c.expect ? { dayPart: r.dayPart, evening: r.evening } : {}
      expect({
        title: r.title, due: r.due, projectId: r.projectId, labels: r.labels, priority: r.priority,
        estimateMinutes: r.estimateMinutes, spentMinutes: r.spentMinutes, recurrence: r.recurrence, reminders: r.reminders,
        ...parts, ...opt('energy'), ...opt('sector'), ...opt('deadline'),
      }).toEqual(c.expect)
    })
  }
})

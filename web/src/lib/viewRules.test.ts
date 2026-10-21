// Someday and Anytime membership, pinned by the vectors internal/inbox reads too
// (OpenSpec change agent-planning-fields, design D4): the assistant tools and
// `ot list` list exactly what these views list.
import { describe, expect, it } from 'vitest'
import vectors from './views.vectors.json'
import type { Due } from './types'
import { inAnytime, isSomeday } from './views'

type Vector = { name: string; task: { due: Due | null; deadline: string | null; start: string | null; completed_at: number | null }; someday: boolean; anytime: boolean }

describe('Someday and Anytime (shared vectors with internal/inbox)', () => {
  for (const v of vectors as Vector[]) {
    it(v.name, () => {
      expect(!v.task.completed_at && isSomeday(v.task)).toBe(v.someday)
      expect(inAnytime(v.task, '2026-10-22')).toBe(v.anytime)
    })
  }
})

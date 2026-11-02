// Set today's focus (routines-engine 2.3): shared vectors with internal/ruleval/focus.go.
import { describe, expect, it } from 'vitest'
import { planSetFocus } from './focusSet'
import type { Task, UserPrefs } from './types'
import vectors from './focusSet.vectors.json'

describe('set today’s focus (shared vectors)', () => {
  for (const v of vectors) {
    it(v.name, () => {
      const tasks = v.tasks.map((x) => ({ completed_at: null, deleted_at: null, estimate_minutes: null, ...x })) as unknown as Task[]
      const prefs = { focus_style: v.style, bento_order: v.order } as Partial<UserPrefs>
      expect(planSetFocus(v.ids, tasks, prefs, '2026-11-04')).toEqual(v.out)
    })
  }
})

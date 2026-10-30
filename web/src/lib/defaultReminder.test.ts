import { describe, expect, it } from 'vitest'
import vectors from './defaultReminder.vectors.json'
import { defaultReminderId, MAX_DEFAULT_OFFSET, parseDefaultReminder, planDefaultReminder, readDefaultReminders, type DefaultReminderRow, type DefaultReminderTask } from './defaultReminder'

type Vector = {
  name: string
  before: DefaultReminderTask | null
  patch: Record<string, unknown>
  reminders: DefaultReminderRow[]
  batch: { id: string; patch: Record<string, unknown> }[]
  prefs: { reminder_default_timed: string; reminder_default_dated: string }
  expect: { id: string; patch: Record<string, unknown> }[]
}

const id = (s: string) => (s === '$default' ? vectors.default_id : s)

describe('default reminder rule (shared vectors with internal/defaultreminder)', () => {
  it('derives the id from the person and the task', () => {
    expect(defaultReminderId(vectors.user_id, vectors.task_id)).toBe(vectors.default_id)
    expect(defaultReminderId('u2', vectors.task_id)).not.toBe(vectors.default_id)
  })

  it('reads stored values', () => {
    for (const [raw, want] of vectors.parse as [string, number | null][]) expect(parseDefaultReminder(raw), raw).toBe(want)
    expect(parseDefaultReminder(undefined)).toBeNull()
    expect(MAX_DEFAULT_OFFSET).toBe(525600)
  })

  for (const v of vectors.cases as Vector[]) {
    it(v.name, () => {
      const got = planDefaultReminder({
        userId: vectors.user_id, taskId: vectors.task_id, before: v.before, patch: v.patch,
        reminders: v.reminders.map((r) => ({ ...r, id: id(r.id) })),
        batch: v.batch.map((c) => ({ entityId: id(c.id), patch: c.patch })),
        prefs: readDefaultReminders(v.prefs), now: vectors.now,
      })
      expect(got).toEqual(v.expect.map((e) => ({ entity: 'reminder', entityId: id(e.id), patch: e.patch })))
    })
  }
})

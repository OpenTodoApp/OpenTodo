import { beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from './db'
import { createTask, resetDeviceId } from './ops'
import { parse } from './nlp/parse'
import { toTaskInput } from './nlp/quickadd'

let n = 0
beforeEach(() => {
  useDatabase(`qar-${Date.now()}-${n++}`)
  resetDeviceId()
})

const at = (iso: string, hhmm: string) => new Date(`${iso}T${hhmm}:00`)

async function add(line: string, now: Date, defaults: { due?: { date: string } } = {}) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const r = parse(line, { today, now: hhmm, languages: ['en'], projects: [] })
  const input = await toTaskInput(r, { labels: [], createLabel: async () => 'l' })
  const id = await createTask({ ...defaults, ...input }, now)
  return { id, task: (await db.tasks.get(id))!, reminders: await db.reminders.where('task_id').equals(id).toArray() }
}

describe('quick-add reminders resolved by createTask (quick-add-recurrence D3)', () => {
  it('a moment on a timed task is relative: −360 minutes', async () => {
    const { reminders } = await add('Dentist tomorrow at 15:00 remind me at 9', at('2026-10-09', '10:00'))
    expect(reminders).toHaveLength(1)
    expect(reminders[0]).toMatchObject({ kind: 'relative', offset_minutes: -360 })
    expect(reminders[0].fire_at).toBe(at('2026-10-10', '09:00').getTime())
  })

  it('a moment on a date-only task counts from 09:00', async () => {
    const { reminders } = await add('Pay rent 3 Nov remind me at 8', at('2026-10-09', '10:00'))
    expect(reminders[0]).toMatchObject({ kind: 'relative', offset_minutes: -60 })
  })

  it('a moment on an undated task is absolute, tomorrow when the time has passed', async () => {
    const { task, reminders } = await add('Call mum remind me at 9', at('2026-10-09', '10:00'))
    expect(task.due).toBeNull()
    expect(reminders[0]).toMatchObject({ kind: 'absolute', offset_minutes: null, fire_at: at('2026-10-10', '09:00').getTime() })
  })

  it('an offset without a due waits for one; the view default supplies a due', async () => {
    const waiting = await add('Prepare slides remind me 1 day before', at('2026-10-09', '10:00'))
    expect(waiting.reminders[0]).toMatchObject({ kind: 'relative', offset_minutes: -1440, fire_at: null })
    const today = await add('Call mum remind me at 9', at('2026-10-09', '10:00'), { due: { date: '2026-10-09' } })
    expect(today.reminders[0]).toMatchObject({ kind: 'relative', offset_minutes: 0 })
  })

  it('task, rule and reminder are one batch in the outbox', async () => {
    const { id, task } = await add('Water plants every Monday remind me at 8', at('2026-10-09', '10:00'))
    expect(task.recurrence).toBe('every monday')
    expect(task.due).toEqual({ date: '2026-10-12' })
    const outbox = await db.outbox.toArray()
    expect(outbox.some((o) => o.entity === 'task' && o.entityId === id && o.field === 'recurrence')).toBe(true)
    expect(outbox.some((o) => o.entity === 'reminder' && o.field === 'offset_minutes' && o.value === -60)).toBe(true)
  })
})

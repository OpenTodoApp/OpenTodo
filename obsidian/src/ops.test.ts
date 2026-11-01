import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { OP_DEFAULTS } from '../../web/src/generated/opSchema'
import { obsidianLink, obsidianURL } from '../../web/src/lib/taskOrigin'
import { noteOrigin, taskOps, trashOps, type Op } from './ops'

const vectors = JSON.parse(readFileSync(new URL('../../internal/origin/testdata/origin_vectors.json', import.meta.url), 'utf8')) as {
  obsidian: { name: string; origin: { id?: string; url?: string }; valid: boolean }[]
}

/** Every op names a field the op schema declares for its entity (web/src/generated/opSchema). */
function expectSchema(ops: Op[]) {
  for (const op of ops) {
    const defaults = (OP_DEFAULTS as Record<string, Record<string, unknown>>)[op.entity]
    expect(defaults, op.entity).toBeDefined()
    expect(Object.keys(defaults), `${op.entity}.${op.field}`).toContain(op.field)
    expect(typeof op.id === 'string' && op.id.length > 0 && typeof op.ts === 'number').toBe(true)
  }
}

describe('ops', () => {
  const ctx = { device: 'obsidian:test', userId: 'u1', labels: [{ id: 'l1', name: 'Errand' }], today: '2026-10-29', now: 1_800_000_000_000 }

  it('a task with every field the line can set, a new label once and the time already spent', () => {
    const created = new Map<string, string>()
    const origin = noteOrigin('Work notes', 'Meetings/Kick-off.md')
    const a = taskOps({ title: ' Write report ', projectId: 'p1', origin, fields: {
      labels: ['errand', 'new one', 'New One'], due: { date: '2026-10-30', time: '09:00' }, priority: 2, deadline: '2026-11-30', start: '2026-10-29', estimate: 45, spent: 30,
      dayPart: 'morning', energy: 'deep', recurrence: 'every monday',
    } }, { ...ctx, createdLabels: created })
    expectSchema(a.ops)
    const task = Object.fromEntries(a.ops.filter((o) => o.entity === 'task').map((o) => [o.field, o.value]))
    expect(task).toMatchObject({ title: 'Write report', project_id: 'p1', priority: 2, due: { date: '2026-10-30', time: '09:00' }, deadline: '2026-11-30', start: '2026-10-29', estimate_minutes: 45, day_part: 'morning', energy: 'deep', recurrence: 'every monday', origin, deleted_at: null, completed_at: null })
    const labels = a.ops.filter((o) => o.entity === 'label' && o.field === 'name')
    expect(labels.map((o) => o.value)).toEqual(['new one'])
    expect(task.labels).toEqual(['l1', labels[0].entityId])
    const entry = Object.fromEntries(a.ops.filter((o) => o.entity === 'time_entry').map((o) => [o.field, o.value]))
    expect(entry).toMatchObject({ task_id: a.taskId, user_id: 'u1', started_at: ctx.now - 30 * 60000, ended_at: ctx.now, device_id: 'obsidian:test' })
    expect(a.ops.every((o) => o.device === 'obsidian:test')).toBe(true)
    // The next line of the same send reuses the label it created.
    const b = taskOps({ title: 'Other', projectId: null, origin, fields: { labels: ['NEW ONE'] } }, { ...ctx, createdLabels: created })
    expect(b.ops.some((o) => o.entity === 'label')).toBe(false)
    expectSchema(trashOps(a.taskId, 'obsidian:test'))
  })

  it('a recurring line without a date starts on its first occurrence', () => {
    const a = taskOps({ title: 'Water plants', projectId: null, origin: noteOrigin('V', 'a.md'), fields: { labels: [], recurrence: 'every monday' } }, ctx)
    expect(a.ops.find((o) => o.field === 'due')!.value).toEqual({ date: '2026-11-02' })
  })

  it('the note origin follows obsidian-origin for every valid vector note', () => {
    let n = 0
    for (const v of vectors.obsidian) {
      if (!v.valid || !v.origin.url || !v.origin.id) continue
      const link = obsidianLink(v.origin.url)!
      const o = noteOrigin(link.vault, v.origin.id)
      expect(obsidianURL(o.url, o.id), v.name).toEqual({ vault: link.vault, file: v.origin.id })
      n++
    }
    expect(n).toBeGreaterThan(3)
    for (const path of ['Notes/a & b #1 + c?.md', 'Ünïcode/日本語 メモ.md', "It's (100%).md"]) {
      const o = noteOrigin('My vault', path)
      expect(obsidianURL(o.url, o.id)).toEqual({ vault: 'My vault', file: path })
      expect(o.title).toBe(path.slice(path.lastIndexOf('/') + 1, -3))
    }
  })
})

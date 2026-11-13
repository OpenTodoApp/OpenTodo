// Note templates (OpenSpec change note-templates, tasks 2.1 and 2.2): the
// shared placeholder vectors, and a note made from a template in one batch.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import vectors from '../../../internal/templatelib/testdata/placeholders.vectors.json'
import filled from '../../../internal/templatelib/testdata/builtins.filled.json'
import { db, useDatabase } from './db'
import { setDateTime } from './dates'
import { createNote } from './noteOps'
import { createProject, mutate, resetDeviceId } from './ops'
import { builtinNoteTemplates, createFromTemplate, fillTemplate, unknownPlaceholders, type FillContext } from './noteTemplates'
import { undoBatch } from './undo'

describe('placeholders (shared with internal/templatelib)', () => {
  for (const c of vectors.fill) {
    it(c.name, () => {
      expect(fillTemplate(c.title, c.text, c.context as FillContext)).toEqual({ title: c.want_title, text: c.want_text })
    })
  }
  it('every built-in, in every language, fills as on the server', async () => {
    const order = (lang: string) => (lang === 'en' ? 'MD' : lang === 'zh' ? 'YMD' : 'DM')
    for (const b of await builtinNoteTemplates()) {
      for (const lang of Object.keys(b.title)) {
        const got = fillTemplate(b.title[lang], b.body[lang] ?? b.body.en, { date: '2026-11-16', time: '09:30', order: order(lang), hour12: lang === 'en', lang })
        expect([got.title, got.text]).toEqual((filled as Record<string, Record<string, string[]>>)[b.slug][lang])
      }
    }
  })
  it('names the unknown ones', () => expect(unknownPlaceholders('{{destination}} {{date}} {{ date }}')).toEqual(['{{destination}}']))
})

let run = 0
beforeEach(async () => {
  useDatabase(`note-templates-${run++}`)
  resetDeviceId()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' })
})

describe('creating a note from a template', () => {
  it('"A meeting note", "Template edited later" and "Offline and undo"', async () => {
    const work = await createProject({ name: 'Work' })
    const id = await createNote({ title: 'Meeting {{date}}', description: '## Attendees\n\n## Notes\n\n## Actions\n- [ ] ', project_id: work, labels: ['meeting'] })
    await mutate('note', id, { template: true })
    const tpl = (await db.notes.get(id))!
    const made = await createFromTemplate({ kind: 'note', note: tpl }, { now: new Date(2026, 10, 12, 10, 0).getTime() })
    const note = (await db.notes.get(made.id))!
    expect(note.title).toBe('Meeting 12/11/2026')
    expect(note.project_id).toBe(work)
    expect(note.labels).toEqual(['meeting'])
    expect(note.template ?? false).toBe(false)
    await mutate('note', id, { description: '## Attendees\n## Extra' })
    expect((await db.notes.get(made.id))!.description).toContain('## Actions')
    await undoBatch(made.entry!.id)
    expect((await db.notes.get(made.id))?.deleted_at).toBeTruthy()
  })

  it('"Viewer uses a template": the copy has no project', async () => {
    await db.memberships.put({ projectId: 'team', role: 'viewer', ownerId: 'other', members: [] })
    const made = await createFromTemplate({ kind: 'note', note: { title: 'Retro', description: 'went well', project_id: 'team', labels: ['l1'] } })
    const note = (await db.notes.get(made.id))!
    expect(note.project_id).toBeNull()
    expect(note.labels).toEqual(['l1'])
  })

  it('"Built-in offline": a built-in makes a note without a request', async () => {
    const list = await builtinNoteTemplates()
    const weekly = list.find((b) => b.slug === 'weekly-review')!
    const made = await createFromTemplate({ kind: 'builtin', template: weekly })
    expect((await db.notes.get(made.id))!.title).toBe('Weekly review')
  })
})

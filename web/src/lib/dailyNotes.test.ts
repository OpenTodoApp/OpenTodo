// Daily notes (OpenSpec change daily-notes, task 2.1): the id shared with Go
// sync.DailyNoteID, today after the day start, the draft that writes nothing,
// one note per day, the template text once, and a trashed day brought back.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { setDateTime, setDayStart } from './dates'
import { db, useDatabase } from './db'
import { dailyDraft, dailyNoteId, dailyNotesOn, dailyTemplateOf, dailyToday, ensureDailyNote, isDay, planDailyNote, shiftDay } from './dailyNotes'
import { createNote } from './noteOps'
import { createProject, mutate, resetDeviceId } from './ops'
import { setCurrentUserId } from './sharing'
import type { Note } from './types'

let run = 0
beforeEach(async () => {
  useDatabase(`daily-notes-${run++}`)
  resetDeviceId()
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' })
  setDayStart(0)
  await setCurrentUserId('u1')
})

describe('the day and its id', () => {
  it('is the same id as on the server (internal/sync/daily_note_check_test.go)', () => {
    expect(dailyNoteId('u1', '2026-11-12')).toBe('6f0c9949-ee25-8d73-9da1-0a7e22bd7396')
    expect(dailyNoteId('u2', '2026-11-12')).not.toBe(dailyNoteId('u1', '2026-11-12'))
  })

  it('"Day start": at 01:30 with the day starting at 04:00 it is still yesterday', () => {
    setDayStart(4 * 60)
    expect(dailyToday(new Date(2026, 10, 13, 1, 30).getTime())).toBe('2026-11-12')
    setDayStart(0)
    expect(dailyToday(new Date(2026, 10, 13, 1, 30).getTime())).toBe('2026-11-13')
  })

  it('moves between days and checks dates', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01')
    expect(isDay('2026-11-12')).toBe(true)
    expect(isDay('2026-02-30')).toBe(false)
    expect(isDay('12/11/2026')).toBe(false)
  })

  it('is off until turned on', () => {
    expect(dailyNotesOn(null)).toBe(false)
    expect(dailyNotesOn({ daily_notes: true })).toBe(true)
  })
})

describe('the template', () => {
  it('"Template removed": an unknown or trashed id reads as the built-in Daily; none is none', () => {
    const tpl = { id: 't1', template: true, deleted_at: null, title: 'Day {{date}}', description: '## Wins', labels: ['journal'] } as unknown as Note
    expect(dailyTemplateOf({ daily_notes_template: 't1' }, [tpl])).toEqual({ kind: 'note', note: tpl })
    expect(dailyTemplateOf({ daily_notes_template: 't1' }, [{ ...tpl, deleted_at: 5 } as Note])).toEqual({ kind: 'builtin' })
    expect(dailyTemplateOf({ daily_notes_template: 'gone' }, [])).toEqual({ kind: 'builtin' })
    expect(dailyTemplateOf({ daily_notes_template: 'none' }, [])).toEqual({ kind: 'none' })
    expect(dailyTemplateOf({}, [])).toEqual({ kind: 'builtin' })
  })

  it('fills the placeholders for the note\'s own day, with the date as the title', async () => {
    const d = await dailyDraft('2026-11-12', { kind: 'note', note: { title: 't', description: 'On {{date}}', labels: ['journal'] } })
    expect(d.description).toBe('On 12/11/2026')
    expect(d.labels).toEqual(['journal'])
    expect(d.title).toContain('2026')
    const b = await dailyDraft('2026-11-12', { kind: 'builtin' })
    expect(b.description.length).toBeGreaterThan(0)
  })
})

describe('one note per day', () => {
  it('"Browse without writing": a draft writes nothing', async () => {
    await dailyDraft('2026-11-12', { kind: 'builtin' })
    expect(await db.notes.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('"First keystroke": the note is created with its day, project, text only, then folded once', async () => {
    const journal = await createProject({ name: 'Journal' })
    const prefs = { daily_notes: true, daily_notes_project: journal, daily_notes_template: 'none' }
    const id = await ensureDailyNote('2026-11-12', prefs)
    const note = (await db.notes.get(id!))!
    expect(id).toBe(dailyNoteId('u1', '2026-11-12'))
    expect(note.day).toBe('2026-11-12')
    expect(note.project_id).toBe(journal)
    // Opening it again changes nothing: one note for the day.
    await ensureDailyNote('2026-11-12', prefs)
    expect((await db.notes.toArray()).filter((n) => n.day === '2026-11-12')).toHaveLength(1)
  })

  it('writes the template as text only, then the document from it', async () => {
    const tpl = await createNote({ title: 'Day', description: '## Wins\n\n## Lessons' })
    await mutate('note', tpl, { template: true })
    const id = await ensureDailyNote('2026-11-12', { daily_notes: true, daily_notes_template: tpl })
    const note = (await db.notes.get(id!))!
    expect(note.description).toBe('## Wins\n\n## Lessons')
    expect(note.notes_doc).toBeTruthy()
  })

  it('"Two devices offline": both build the same body, so both lines merge under the template once', async () => {
    const docOn = async (name: string, at: number) => {
      useDatabase(name)
      resetDeviceId()
      await setCurrentUserId('u1')
      const tpl = await createNote({ title: 'Day', description: '## Plan\n\n## Log' })
      await mutate('note', tpl, { template: true })
      const id = await ensureDailyNote('2026-11-12', { daily_notes: true, daily_notes_template: tpl }, at)
      return (await db.notes.get(id!))!.notes_doc!
    }
    const laptop = await docOn(`daily-laptop-${run}`, 1_000)
    const phone = await docOn(`daily-phone-${run}`, 9_000)
    const rt = await import('./richtext')
    const a = rt.foldAppend(laptop, 'x1', 'Call the bank')!
    const b = rt.foldAppend(phone, 'x2', 'Ferry at 9')!
    const text = rt.projectDoc(rt.mergeDocs(a, b))
    expect(text.match(/## Plan/g)).toHaveLength(1)
    expect(text).toContain('Call the bank')
    expect(text).toContain('Ferry at 9')
  })

  it('"Routine and offline device": the server\'s creation folds into the phone\'s body, both texts once', async () => {
    const id = await ensureDailyNote('2026-11-12', { daily_notes: true, daily_notes_template: 'none' })
    const tpl = '## Plan\n\n## Log'
    await mutate('note', id!, { description: tpl })
    const rt = await import('./richtext')
    const { reconcileNote } = await import('./ops')
    // The phone, offline: the day's creation, folded as every creator folds it, then a line typed into it.
    const mine = rt.foldAppend(rt.foldDaily('', tpl, '2026-11-12'), 'x1', 'Ferry at 9')!
    // The routine's creation wins the text: `day` and `description` at one later server clock.
    const server = { ts: Date.now() + 60_000, device: 'rule:r1' }
    const row = { notes_doc: mine, description: tpl, day: '2026-11-12', _clock: { day: server, description: server, notes_doc: { ts: Date.now(), device: 'phone' } } }
    const text = reconcileNote(rt as never, row as never)!.description
    expect(text.match(/## Plan/g)).toHaveLength(1)
    expect(text).toContain('Ferry at 9')
    // The same day with another text is another body, never the same one twice.
    expect(rt.activeBodyName(rt.decodeDoc(rt.foldDaily('', tpl + ' 09:14', '2026-11-12'))!)).not.toBe(rt.activeBodyName(rt.decodeDoc(rt.foldDaily('', tpl, '2026-11-12'))!))
  })

  it('"Deleted and opened again": the trashed note comes back, still one note', async () => {
    const id = (await ensureDailyNote('2026-11-10', { daily_notes: true, daily_notes_template: 'none' }))!
    await mutate('note', id, { deleted_at: Date.now() })
    const plan = await planDailyNote('u1', '2026-11-10', {}, { title: 'x', description: '', labels: [] })
    expect(plan).toEqual([{ entity: 'note', entityId: id, patch: { deleted_at: null } }])
    await ensureDailyNote('2026-11-10', { daily_notes: true, daily_notes_template: 'none' })
    expect((await db.notes.get(id))!.deleted_at).toBeNull()
    expect(await db.notes.count()).toBe(1)
  })

  it('a project in the Trash leaves the note without one', async () => {
    const gone = await createProject({ name: 'Old' })
    await mutate('project', gone, { deleted_at: Date.now() })
    const plan = await planDailyNote('u1', '2026-11-12', { daily_notes_project: gone }, { title: 'x', description: '', labels: [] })
    expect(plan[0].patch.project_id).toBeNull()
  })
})

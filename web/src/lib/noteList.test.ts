import { describe, expect, it, vi } from 'vitest'
import { filterEntries, NO_NOTE_FILTERS, NoteIndex, noteEntries, NOTES_PAGE, updatedOf } from './noteList'
import * as search from './noteSearch'
import type { Note, Project, Task } from './types'

// The Notes page's list and search (OpenSpec notes-overview, tasks 4.1 and 4.2).

const c = (ts: number) => ({ ts, device: 'd' })
const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: id, description: '', project_id: null, parent_id: null, priority: 4, due: null, labels: [], position: 0, created_at: 0, completed_at: null, deleted_at: null, _clock: {}, ...over } as Task)
const project = (id: string, over: Partial<Project> = {}): Project => ({ id, name: id, color: '', position: 0, archived: false, parent_id: null, created_at: 0, deleted_at: null, _clock: {}, ...over } as Project)
const note = (id: string, over: Partial<Note> = {}): Note => ({ id, title: id, description: '', project_id: null, labels: [], position: 0, created_at: 0, deleted_at: null, _clock: {}, ...over } as Note)

describe('the notes list (D3)', () => {
  it('lists the three sources newest first, by the note fields only', () => {
    const tasks = [
      task('old', { description: 'a month ago', _clock: { description: c(10), notes_doc: c(10), due: c(500) } }),
      task('none', { description: '  ' }),
      task('done', { description: 'x', completed_at: 5, _clock: { description: c(30) } }),
      task('gone', { description: 'x', deleted_at: 1, _clock: { description: c(90) } }),
      task('orphan', { description: 'x', project_id: 'trashed', _clock: { description: c(95) } }),
    ]
    const projects = [project('p', { description: 'plan', archived: true, _clock: { description: c(20) } }), project('trashed', { deleted_at: 1, description: 'x' })]
    const notes = [note('n', { title: 'Trip', _clock: { title: c(40) } }), note('dead', { deleted_at: 3 })]
    const list = noteEntries(tasks, projects, notes)
    // The task's due date changed at 500, but its note was last edited at 10.
    expect(list.map((e) => e.key)).toEqual(['note:n', 'task:done', 'project:p', 'task:old'])
    expect(list.find((e) => e.id === 'done')?.marker).toBe('completed')
    expect(list.find((e) => e.id === 'p')?.marker).toBe('archived')
  })

  it('counts pending appends as the note and as a change', () => {
    const t = task('t', { description: 'base', appends: { a: 'more' }, _clock: { description: c(1), 'appends.a': c(9) } })
    const [e] = noteEntries([t], [], [])
    expect(e.text).toBe('base\n\nmore')
    expect(e.updated).toBe(9)
    expect(updatedOf({ title: c(50), labels: c(60) }, ['title'])).toBe(50)
  })

  it('filters by source, project and label; a label filter leaves project notes out', () => {
    const list = noteEntries(
      [task('t1', { description: 'x', project_id: 'p', labels: ['ref'], _clock: { description: c(3) } })],
      [project('p', { description: 'plan', _clock: { description: c(2) } })],
      [note('n1', { project_id: 'p', labels: ['ref'], _clock: { title: c(1) } }), note('n2', { _clock: { title: c(4) } })],
    )
    expect(filterEntries(list, { ...NO_NOTE_FILTERS, source: 'note', projectId: 'p' }).map((e) => e.key)).toEqual(['note:n1'])
    expect(filterEntries(list, { ...NO_NOTE_FILTERS, labelId: 'ref' }).map((e) => e.key)).toEqual(['task:t1', 'note:n1'])
    expect(filterEntries(list, { ...NO_NOTE_FILTERS, projectId: 'p' }).map((e) => e.key)).toEqual(['task:t1', 'project:p', 'note:n1'])
  })

  it('pages 50 at a time', () => {
    const notes = Array.from({ length: 312 }, (_, i) => note(`n${i}`, { _clock: { title: c(i) } }))
    const list = noteEntries([], [], notes)
    expect(list.length).toBe(312)
    expect(list.slice(0, NOTES_PAGE)[0].id).toBe('n311')
  })
})

describe('searching notes (D4)', () => {
  const entries = noteEntries([task('call', { title: 'Call the plumber', description: 'about the tap', _clock: { description: c(1) } })], [], [
    note('trip', { title: 'Trip', description: 'the ferry leaves at 7', _clock: { title: c(5) } }),
    note('cafe', { title: 'Berlin', description: 'Café Müller on **oat** milk', _clock: { title: c(3) } }),
    note('ferry', { title: 'Ferry times', description: 'see the table', _clock: { title: c(2) } }),
  ])

  it('finds a word in the text with a highlighted snippet, title matches first', () => {
    const idx = new NoteIndex()
    const hits = idx.search(entries, 'ferry')
    expect(hits.map((h) => h.note.id)).toEqual(['ferry', 'trip'])
    const seg = hits[1].snippet
    expect(seg.map((s) => s.text).join('')).toBe('the ferry leaves at 7')
    expect(seg.filter((s) => s.mark).map((s) => s.text)).toEqual(['ferry'])
  })

  it('ignores case, accents and Markdown', () => {
    const idx = new NoteIndex()
    expect(idx.search(entries, 'cafe muller').map((h) => h.note.id)).toEqual(['cafe'])
    const [hit] = idx.search(entries, '"oat milk"')
    expect(hit.note.id).toBe('cafe')
    expect(hit.snippet.map((s) => s.text).join('')).toContain('oat milk')
    expect(hit.snippet.map((s) => s.text).join('')).not.toContain('*')
  })

  it('prepares each note once; a keystroke only matches', () => {
    const idx = new NoteIndex()
    const spy = vi.spyOn(search, 'prepareNote')
    idx.search(entries, 'f')
    idx.search(entries, 'fe')
    idx.search(entries, 'fer')
    expect(spy).toHaveBeenCalledTimes(entries.length)
    expect(idx.size).toBe(entries.length)
    idx.prune(entries.slice(0, 1))
    expect(idx.size).toBe(1)
    idx.clear()
    expect(idx.size).toBe(0)
    spy.mockRestore()
  })
})

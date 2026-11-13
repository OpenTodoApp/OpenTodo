// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { NoteEntry } from './noteList'
import { DEFAULT_NOTE_SORT, pickNoteSort, readNoteSort, sortNotes, writeNoteSort } from './noteSort'

const DAY = 86_400_000
const entry = (id: string, title: string, updated: number, created = updated, source: NoteEntry['source'] = 'note'): NoteEntry =>
  ({ key: `${source}:${id}`, source, id, title, text: 'x', projectId: null, labels: [], updated, created })

const titles = (list: NoteEntry[]) => list.map((e) => e.title || 'Untitled note')

afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('note sort', () => {
  const notes = [entry('a', 'Week 10', 4), entry('b', 'Wi-Fi', 3), entry('c', 'Week 2', 2), entry('d', '', 5)]

  it('By title: numbers in numeric order, untitled last', () => {
    expect(titles(sortNotes(notes, { by: 'title', reversed: false }, 'en'))).toEqual(['Week 2', 'Week 10', 'Wi-Fi', 'Untitled note'])
  })

  it('Reverse: Z to A, untitled still last', () => {
    const sort = pickNoteSort({ by: 'title', reversed: false }, 'title')
    expect(sort).toEqual({ by: 'title', reversed: true })
    expect(titles(sortNotes(notes, sort, 'en'))).toEqual(['Wi-Fi', 'Week 10', 'Week 2', 'Untitled note'])
    expect(pickNoteSort(sort, 'created')).toEqual({ by: 'created', reversed: false })
  })

  it('Created: the creation of the note, the task or the project, ties by the last change', () => {
    const now = 400 * DAY
    const list = [entry('log', 'Reading log', now, now - 300 * DAY), entry('ideas', 'Ideas', now - DAY, now - DAY),
      entry('t', 'Task', now - 2 * DAY, now - DAY, 'task')]
    expect(titles(sortNotes(list, { by: 'created', reversed: false }))).toEqual(['Ideas', 'Task', 'Reading log'])
    expect(titles(sortNotes(list, { by: 'created', reversed: true }))).toEqual(['Reading log', 'Ideas', 'Task'])
    expect(titles(sortNotes(list, DEFAULT_NOTE_SORT))).toEqual(['Reading log', 'Ideas', 'Task'])
  })

  it('stores the order on the device and holds it when storage is refused', () => {
    expect(readNoteSort()).toEqual(DEFAULT_NOTE_SORT)
    expect(writeNoteSort({ by: 'title', reversed: true })).toBe(true)
    expect(readNoteSort()).toEqual({ by: 'title', reversed: true })
    localStorage.setItem('ot.notes.sort', '{"by":"size"}')
    expect(readNoteSort()).toEqual(DEFAULT_NOTE_SORT)
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('quota') }, removeItem: () => {} })
    expect(writeNoteSort({ by: 'created', reversed: false })).toBe(false)
    expect(readNoteSort()).toEqual(DEFAULT_NOTE_SORT)
  })
})

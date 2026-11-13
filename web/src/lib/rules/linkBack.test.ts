// Link back to the note (OpenSpec change note-checklist-tasks, task 2.1): offered on
// Create tasks only when its text comes from Get note text, through text steps and a
// Repeat's item; the link line written by the device's planner.
import { describe, expect, it } from 'vitest'
import type { RoutineStep } from '../types'
import { noteLinkLine } from './run/kinds'
import { addableInputs } from './sentence'
import { noteSource, parseSteps } from './steps'

const fromNote: RoutineStep[] = [
  { id: 'a', kind: 'note_text', in: { of: { ref: 'trigger' } } },
  { id: 'b', kind: 'split_lines', in: { text: { ref: 'a' }, only: { literal: 'open_checkboxes' } } },
  { id: 'c', kind: 'create_tasks', in: { text: { ref: 'b' } } },
]
const fromFormat: RoutineStep[] = [
  { id: 'a', kind: 'format', in: { template: { literal: 'Call the plumber' } } },
  { id: 'b', kind: 'create_tasks', in: { text: { ref: 'a' } } },
]

describe('Link back to the note', () => {
  it('is offered only when the text comes from a note', () => {
    expect(noteSource(fromNote, 'c')).toBe('a')
    expect(addableInputs(fromNote[2], fromNote)).toContain('link_back')
    expect(noteSource(fromFormat, 'b')).toBe('')
    expect(addableInputs(fromFormat[1], fromFormat)).not.toContain('link_back')
  })

  it('follows a Repeat item to the note read in each iteration, and is refused without a note', () => {
    const repeat: RoutineStep[] = [
      { id: 'a', kind: 'find_tasks', in: { query: { literal: '@meeting' } } },
      { id: 'r', kind: 'repeat', in: { list: { ref: 'a' } }, do: [
        { id: 'b', kind: 'note_text', in: { of: { ref: 'item' } } },
        { id: 'c', kind: 'create_tasks', in: { text: { ref: 'b' }, link_back: { literal: true } } },
      ] },
    ]
    expect(noteSource(repeat, 'c')).toBe('b')
    expect(() => parseSteps(repeat)).not.toThrow()
    expect(() => parseSteps([fromFormat[0], { ...fromFormat[1], in: { ...fromFormat[1].in, link_back: { literal: true } } }])).toThrow(/link_back/)
  })

  it('writes the link in the form of note links, brackets escaped', () => {
    expect(noteLinkLine('task', 'm1', 'Planning meeting [Q4]')).toBe('[Planning meeting \\[Q4\\]](?task=m1)')
    expect(noteLinkLine('project', 'p', ' ')).toBe('[Note](?project=p)')
  })
})

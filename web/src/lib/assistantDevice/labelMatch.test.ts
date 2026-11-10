// The gaps a real-model eval run found (OpenSpec change assistant-eval-gaps), on
// the device: label matching (labelMatch.vectors.json, shared with
// internal/agenttools/labelmatch_test.go), sections in list_projects and the
// text of rounds after tool calls.
import { describe, expect, it } from 'vitest'
import type { Snapshot, Row } from './data'
import { labelFilterMatches, labelSearchMatches } from './labelMatch'
import { answerText } from './loop'
import { listProjects, listTasks, searchTasks } from './read'
import vectors from './labelMatch.vectors.json'

describe('label matching vectors', () => {
  for (const c of vectors.cases) {
    it(`${JSON.stringify(c.name)} by ${JSON.stringify(c.query)}`, () => {
      expect(labelFilterMatches(c.name, c.query)).toBe(c.filter)
      expect(labelSearchMatches(c.name, c.query)).toBe(c.search)
    })
  }
})

function snapshot(): Snapshot {
  const project = { id: 'web', name: 'Website launch', position: 1, created_at: 1 }
  const labels: Row[] = [{ id: 'l-errand', name: 'errand' }, { id: 'l-home', name: 'Home' }]
  const sections: Row[] = [
    { id: 'doing', name: 'In progress', project_id: 'web', position: 2 },
    { id: 'todo', name: 'To do', project_id: 'web', position: 1, flow_mode: 'sequential' },
  ]
  const tasks: Row[] = [
    { id: 'milk', title: 'Buy milk', labels: ['l-errand'], created_at: 1 },
    { id: 'parcel', title: 'Pick up the parcel', labels: ['l-errand', 'l-home'], created_at: 2 },
    { id: 'other', title: 'Email the landlord', labels: ['l-home'], created_at: 3 },
    { id: 'title', title: 'Run errands in town', labels: [], created_at: 4 },
  ]
  return {
    userId: 'u1', projects: new Map([['web', project]]), projList: [project], labels: new Map(labels.map((l) => [l.id as string, l])), labelList: labels,
    sections: new Map(sections.map((s) => [s.id as string, s])), tasks, byId: new Map(tasks.map((t) => [t.id as string, t])), memberships: new Map(),
  }
}

const ids = (r: { tasks: Record<string, unknown>[] }) => r.tasks.map((t) => t.id).sort()

describe('the read tools', () => {
  it('find tasks by a plural of their label', () => {
    const snap = snapshot()
    expect(ids(searchTasks(snap, { query: 'errands' }, 0, 200))).toEqual(['milk', 'parcel', 'title'])
    expect(ids(listTasks(snap, { label: 'Errands' }, 0, 200))).toEqual(['milk', 'parcel'])
    expect(() => listTasks(snap, { label: 'errandss' }, 0, 200)).toThrow(/no such label/)
  })

  it('list each project with its sections in board order', () => {
    const [p] = listProjects(snapshot(), {}, 200).projects as Record<string, unknown>[]
    expect(p.sections).toEqual([
      { id: 'todo', flow_mode: 'sequential', untrusted_text: { name: 'To do' } },
      { id: 'doing', flow_mode: '', untrusted_text: { name: 'In progress' } },
    ])
  })
})

describe('answerText', () => {
  it('starts a round after tool calls on a new paragraph and notes that the answer has words', () => {
    for (const [first, want] of [
      ['Today you have one task:', 'Today you have one task:\n\nIt is done.'],
      ['Looking.\n', 'Looking.\n\nIt is done.'],
      ['Looking.\n\n', 'Looking.\n\nIt is done.'],
      ['', 'It is done.'],
    ]) {
      const out: string[] = []
      const turn = { shown: 0, chat: true, wrote: false }
      const a = answerText((t) => out.push(t), turn)
      a.write(first)
      expect(turn.wrote).toBe(first !== '')
      a.gap = true
      a.write('It is ')
      a.write('done.')
      expect(out.join('')).toBe(want)
      expect(turn.wrote).toBe(true)
    }
  })
})

// Blocks in the assistant's answers (OpenSpec change assistant-generative-ui, task
// 3.1): the stream event read into a block, where blocks sit in the text, labels,
// and an answer as Markdown for Copy.
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { SSEParser } from './assistant'
import { answerMarkdown, blockLabel, blockOf, splitAnswer } from './assistantBlocks'
import { db } from './db'
import { createTask, mutate, resetDeviceId } from './ops'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

describe('blockOf', () => {
  it('reads every kind from a stream event and skips what it does not know', () => {
    const p = new SSEParser()
    const evs = p.feed('event: block\ndata: {"kind":"tasks","ids":["t1","t2"],"title":"Overdue"}\n\nevent: block\ndata: {"kind":"hologram","ids":["x"]}\n\n')
    expect(evs.map((e) => (e.type === 'block' ? blockOf(e) : null))).toEqual([{ kind: 'tasks', ids: ['t1', 't2'], title: 'Overdue' }, null])
    expect(blockOf({ kind: 'calendar', date: '2026-11-12', span: 'week' })).toEqual({ kind: 'calendar', date: '2026-11-12', span: 'week' })
    expect(blockOf({ kind: 'calendar', date: 'Thursday', span: 'day' })).toBeNull()
    expect(blockOf({ kind: 'choice', question: 'Sat or Sun?', options: ['Saturday', 'Sunday'] })).toEqual({ kind: 'choice', question: 'Sat or Sun?', options: ['Saturday', 'Sunday'] })
    expect(blockOf({ kind: 'choice', question: 'Only one?', options: ['Yes'] })).toBeNull()
    expect(blockOf({ kind: 'map', task_ids: ['t1'] })).toEqual({ kind: 'map', task_ids: ['t1'], place_ids: [] })
    expect(blockOf({ kind: 'note', id: 'n1' })).toEqual({ kind: 'note', id: 'n1' })
    expect(blockOf({ kind: 'project', id: '<script>' })).toBeNull()
    expect(blockOf({ kind: 'tasks', ids: [] })).toBeNull()
  })
})

describe('splitAnswer', () => {
  it('cuts the text where each block arrived, clamping offsets past the end', () => {
    const tasks = { kind: 'tasks' as const, ids: ['t1'] }
    const note = { kind: 'note' as const, id: 'n1' }
    expect(splitAnswer('Here is what is due:\n\nStart with the first.', [{ at: 21, block: tasks }, { at: 999, block: note }])).toEqual([
      { kind: 'text', text: 'Here is what is due:\n' },
      { kind: 'block', block: tasks, index: 0 },
      { kind: 'text', text: '\nStart with the first.' },
      { kind: 'block', block: note, index: 1 },
    ])
    expect(splitAnswer('Plain.', undefined)).toEqual([{ kind: 'text', text: 'Plain.' }])
  })
})

describe('labels and Copy', () => {
  it('names a block by its kind and size', () => {
    expect(blockLabel({ kind: 'tasks', ids: ['a', 'b', 'c'] })).toBe('3 tasks')
    expect(blockLabel({ kind: 'map', task_ids: ['a'], place_ids: ['b'] })).toBe('Map, 2 places')
    expect(blockLabel({ kind: 'choice', question: 'Move it?', options: ['a', 'b'] })).toBe('Choice: Move it?')
  })

  it('writes an answer as Markdown with each block as plain text from the current rows', async () => {
    const a = await createTask({ title: 'Pay taxes' })
    const b = await createTask({ title: 'Call Anna' })
    await mutate('task', b, { completed_at: 1 })
    const md = await answerMarkdown({ text: 'Two things:\n\nThat is all.', blocks: [{ at: 12, block: { kind: 'tasks', ids: [a, b, 'gone'] } }] })
    expect(md).toBe('Two things:\n\n- [ ] Pay taxes\n- [x] Call Anna\n\nThat is all.')
  })
})

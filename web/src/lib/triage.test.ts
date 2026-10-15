import { describe, expect, it } from 'vitest'
import { advance, advanceQueue, back, current, outcomeText, positionText, progress, startTriage } from './triage'

const t = (id: string, position: number, extra: Record<string, unknown> = {}) =>
  ({ id, position, project_id: null, parent_id: null, completed_at: null, deleted_at: null, ...extra }) as never

const inbox = (n: number) => Array.from({ length: n }, (_, i) => t(`t${i + 1}`, i + 1))

describe('triage queue (inbox-triage D2)', () => {
  it('counts decisions and skips: 5 of 17 after three decisions and a skip', () => {
    let s = startTriage(inbox(17))
    for (let i = 0; i < 4; i++) s = advance(s)
    expect(progress(s)).toEqual({ n: 5, total: 17, done: false })
    expect(current(s)).toBe('t5')
  })

  it('a task arriving from another device joins the end: 4 of 18', () => {
    let s = startTriage(inbox(17))
    for (let i = 0; i < 3; i++) s = advance(s)
    s = advanceQueue(s, [...inbox(17), t('new', 0)]).state
    expect(positionText(s, 'Call the plumber')).toBe('4 of 18: Call the plumber')
    expect(s.ids.at(-1)).toBe('new')
  })

  it('the current task leaving moves on with one task fewer', () => {
    let s = startTriage(inbox(5))
    s = advance(s)
    const live = inbox(5).map((x: { id: string }) => (x.id === 't2' ? { ...x, project_id: 'p' } : x)) as never[]
    const r = advanceQueue(s, live)
    expect(r.left).toBe(true)
    expect(current(r.state)).toBe('t3')
    expect(progress(r.state)).toEqual({ n: 2, total: 4, done: false })
    expect(outcomeText({ kind: 'left' })).toBe('This task was moved elsewhere.')
  })

  it('subtasks and other projects are never queued', () => {
    const s = startTriage([t('a', 1), t('sub', 2, { parent_id: 'a' }), t('p', 3, { project_id: 'x' }), t('done', 4, { completed_at: 5 })])
    expect(s.ids).toEqual(['a'])
  })

  it('k goes back without counting the task twice', () => {
    let s = startTriage(inbox(3))
    s = advance(s)
    s = back(s)
    expect(current(s)).toBe('t1')
    s = advance(s)
    expect(progress(s)).toEqual({ n: 2, total: 3, done: false })
    s = advance(advance(s))
    expect(progress(s).done).toBe(true)
  })
})

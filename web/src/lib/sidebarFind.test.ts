// Find in the sidebar (OpenSpec change sidebar-groups, task 3.1): accent-insensitive,
// ancestors kept for a nested match, everything on an empty query, nothing on no match.
import { describe, expect, it } from 'vitest'
import { matchSidebar } from './sidebarFind'

const rows = [
  { id: 'work', parent: null, name: 'Work' },
  { id: 'hiring', parent: 'work', name: 'Hiring' },
  { id: 'designer', parent: 'hiring', name: 'Designer' },
  { id: 'site', parent: 'work', name: 'Website launch' },
  { id: 'design', parent: 'site', name: 'Design' },
  { id: 'home', parent: null, name: 'Home' },
  { id: 'cafe', parent: 'home', name: 'Café plans' },
]
const labels = [{ id: 'l1', name: 'errand' }, { id: 'l2', name: 'waiting' }]
const views = [{ id: 'v1', name: 'Waiting for' }, { id: 'v2', name: 'Deep work' }]
const input = { rows, labels, views }

describe('matchSidebar', () => {
  it('an empty query shows everything and names no first match', () => {
    const r = matchSidebar('   ', input)
    expect(r.projects.size).toBe(rows.length)
    expect(r.labels.size).toBe(2)
    expect(r.views.size).toBe(2)
    expect(r.matched.size).toBe(0)
    expect(r.order).toEqual([])
    expect(r.empty).toBe(false)
  })

  it('a nested match keeps its ancestors, in tree order, and only the match counts as matched', () => {
    const r = matchSidebar('des', input)
    expect([...r.projects]).toEqual(['designer', 'hiring', 'work', 'design', 'site'])
    expect([...r.matched]).toEqual(['designer', 'design'])
    expect(r.order).toEqual([{ kind: 'project', id: 'designer' }, { kind: 'project', id: 'design' }])
    expect(r.labels.size).toBe(0)
    expect(r.views.size).toBe(0)
    expect(r.empty).toBe(false)
  })

  it('matches across groups, case- and accent-insensitive, labels before filters', () => {
    const r = matchSidebar('WAIT', input)
    expect(r.projects.size).toBe(0)
    expect([...r.labels]).toEqual(['l2'])
    expect([...r.views]).toEqual(['v1'])
    expect(r.order).toEqual([{ kind: 'label', id: 'l2' }, { kind: 'view', id: 'v1' }])
    expect([...matchSidebar('cafe', input).matched]).toEqual(['cafe'])
    expect([...matchSidebar('cafe', input).projects]).toEqual(['cafe', 'home'])
  })

  it('no match: every group empty', () => {
    const r = matchSidebar('zzz', input)
    expect(r.projects.size + r.labels.size + r.views.size).toBe(0)
    expect(r.empty).toBe(true)
  })

  it('letters in order still find a long name', () => {
    expect([...matchSidebar('wsl', input).matched]).toEqual(['site'])
  })
})

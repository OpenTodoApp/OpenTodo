import { beforeEach, describe, expect, it } from 'vitest'
import { getMeta, useDatabase } from '../db'
import { FILTER_HISTORY_KEY, FILTER_HISTORY_LIMIT, addFilterHistory, getFilterHistory, pushHistory } from './history'

let n = 0
beforeEach(() => {
  useDatabase(`filter-history-${Date.now()}-${n++}`)
})

describe('filter history', () => {
  it('keeps the most recent first, distinct, trimmed, at most 20', () => {
    let h: string[] = []
    h = pushHistory(h, 'p1')
    h = pushHistory(h, '  @errand ')
    h = pushHistory(h, 'p1')
    h = pushHistory(h, '   ')
    expect(h).toEqual(['p1', '@errand'])
    for (let i = 0; i < 30; i++) h = pushHistory(h, `p${i}`)
    expect(h).toHaveLength(FILTER_HISTORY_LIMIT)
    expect(h[0]).toBe('p29')
    expect(new Set(h).size).toBe(h.length)
  })

  it('persists in the local meta table only (never as an op)', async () => {
    expect(await getFilterHistory()).toEqual([])
    await addFilterHistory('overdue')
    await addFilterHistory('#Work | p1')
    expect(await getFilterHistory()).toEqual(['#Work | p1', 'overdue'])
    expect(await getMeta(FILTER_HISTORY_KEY, null)).toEqual(['#Work | p1', 'overdue'])
    // A second device has its own database and therefore no history.
    useDatabase(`filter-history-other-${n++}`)
    expect(await getFilterHistory()).toEqual([])
  })
})

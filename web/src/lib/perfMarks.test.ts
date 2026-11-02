// The measurement points of the performance budgets (OpenSpec change
// performance-10k, design D4, task 1.2): entries in the browser's own timeline,
// one per event, never sent anywhere.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LIST_READY, markFirstSyncIdle, perfMark, perfMarkAfterPaint, REMOTE_APPLIED, resetPerfMarks, SEARCH_RESULTS, SYNC_IDLE } from './perfMarks'

const marks = (name: string) => performance.getEntriesByName(name, 'mark')

beforeEach(() => {
  performance.clearMarks()
  resetPerfMarks()
})
afterEach(() => { vi.unstubAllGlobals() })

describe('performance marks', () => {
  it('adds an entry to the timeline and keeps only the latest of each kind', () => {
    perfMark(LIST_READY, { view: 'today' })
    perfMark(LIST_READY, { view: 'project' })
    perfMark(SEARCH_RESULTS)
    expect(marks(LIST_READY)).toHaveLength(1)
    expect((marks(LIST_READY)[0] as PerformanceMark).detail).toEqual({ view: 'project' })
    expect(marks(SEARCH_RESULTS)).toHaveLength(1)
  })

  it('marks the end of the first sync once per page load', () => {
    markFirstSyncIdle()
    const first = marks(SYNC_IDLE)[0].startTime
    markFirstSyncIdle()
    expect(marks(SYNC_IDLE)).toHaveLength(1)
    expect(marks(SYNC_IDLE)[0].startTime).toBe(first)
  })

  it('marks a pulled batch after the next frame', async () => {
    let frame: (() => void) | null = null
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => { frame = fn; return 1 })
    perfMarkAfterPaint(REMOTE_APPLIED)
    expect(marks(REMOTE_APPLIED)).toHaveLength(0)
    frame!()
    await new Promise((r) => setTimeout(r, 0))
    expect(marks(REMOTE_APPLIED)).toHaveLength(1)
  })

  it('never sends a mark: the module makes no request', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: fetch })
    perfMark(LIST_READY)
    markFirstSyncIdle()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('a browser without the timeline is simply not measured', () => {
    vi.stubGlobal('performance', { now: () => 0 })
    expect(() => perfMark(LIST_READY)).not.toThrow()
  })
})

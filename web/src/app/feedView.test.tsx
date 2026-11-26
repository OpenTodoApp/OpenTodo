// @vitest-environment happy-dom
// Updates by touch (OpenSpec change touch-open-and-controls, "A tap opens a feed row
// by touch"): with a coarse pointer a tap on a row opens its task, or its project when
// the entry has no task, and a control inside the row does only its own thing; with a
// fine pointer a click selects and a double click opens, as before.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, useDatabase } from '../lib/db'
import { applyOps, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import type { Op } from '../lib/types'
import { click, render, waitFor } from '../ui/test-utils'
import { FeedView } from './FeedView'
import { navigate } from './router'

const original = window.matchMedia
let coarse = false
let n = 0
let seq = 0
beforeEach(async () => {
  useDatabase(`feed-view-${Date.now()}-${n++}`)
  resetDeviceId()
  await setCurrentUserId('alice')
  coarse = false
  window.matchMedia = ((q: string) => ({
    matches: /pointer:\s*coarse/.test(q) ? coarse : /pointer:\s*fine/.test(q) ? !coarse : false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  navigate({ view: 'feed' })
})
afterEach(() => {
  window.matchMedia = original
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

const op = (entity: Op['entity'], entityId: string, field: string, value: unknown, ts: number): Op =>
  ({ id: `o-${seq++}`, entity, entityId, field, value, ts, device: 'd', actor: 'bob' })

/** A shared project Bob created, and a task he added to it: one entry without a task, one with. */
async function seed() {
  const now = Date.now()
  await db.memberships.put({ projectId: 'house', role: 'editor', ownerId: 'bob', members: [] })
  await applyOps([
    op('project', 'house', 'name', 'House', now - 40_000), op('project', 'house', 'created_at', now - 40_000, now - 40_000),
    op('task', 'quotes', 'title', 'Get three quotes', now - 30_000), op('task', 'quotes', 'project_id', 'house', now - 30_000),
    op('task', 'quotes', 'created_at', now - 30_000, now - 30_000),
  ])
}

const rows = () => [...document.querySelectorAll<HTMLElement>('[data-feed-id]')]
const taskRow = () => rows().find((li) => li.textContent?.includes('Get three quotes'))!
const projectRow = () => rows().find((li) => !li.textContent?.includes('Get three quotes'))!
const selected = (li: HTMLElement) => li.className.includes('bg-selected-row')

async function feed() {
  await seed()
  const r = await render(<FeedView />)
  await waitFor(() => rows().length === 2, 'the two entries')
  return r
}

describe('Updates by touch', () => {
  it('a tap on a row\'s text opens the entry\'s task', async () => {
    coarse = true
    const r = await feed()
    expect(location.pathname).toBe('/updates')
    // The words of the entry, not a control inside it.
    await click(taskRow().querySelector('strong')!)
    expect(location.pathname).toBe('/task/quotes')
    await r.unmount()
  })

  it('a tap on the project inside the row opens the project and not the task', async () => {
    coarse = true
    const r = await feed()
    const project = [...taskRow().querySelectorAll('button')].find((b) => b.textContent === 'House')!
    await click(project)
    expect(location.pathname).toBe('/project/house')
    await r.unmount()
  })

  it('a tap on the task\'s name inside the row opens the task once', async () => {
    coarse = true
    const r = await feed()
    const before = history.length
    await click([...taskRow().querySelectorAll('button')].find((b) => b.textContent === 'Get three quotes')!)
    expect(location.pathname).toBe('/task/quotes')
    expect(history.length).toBe(before + 1)
    await r.unmount()
  })

  it('an entry with no task opens its project', async () => {
    coarse = true
    const r = await feed()
    expect(projectRow().textContent).toContain('created the project')
    await click(projectRow().querySelector('strong')!)
    expect(location.pathname).toBe('/project/house')
    await r.unmount()
  })
})

describe('Updates with a mouse', () => {
  it('one click selects the row and opens nothing, and a double click opens', async () => {
    const r = await feed()
    expect(selected(taskRow())).toBe(false)
    await click(taskRow().querySelector('strong')!)
    expect(selected(taskRow())).toBe(true)
    expect(selected(projectRow())).toBe(false)
    expect(location.pathname).toBe('/updates')
    await act(async () => { taskRow().querySelector('strong')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) })
    expect(location.pathname).toBe('/task/quotes')
    await r.unmount()
  })
})

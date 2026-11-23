// @vitest-environment happy-dom
// Unlinked mentions (OpenSpec change unlinked-mentions, tasks 2.1 and 2.2): the folded
// line under Linked references with its count, a plain mention listed and linked with
// one action, an already linked note left to Linked references, a viewer without Link,
// and a mention arriving from another device.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { resetLinkIndex } from '../lib/noteLinks'
import { clearMentionCache } from '../lib/noteMentions'
import { createNote } from '../lib/noteOps'
import { createProject, mutate, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import { click, render, waitFor } from '../ui/test-utils'
import LinkedReferences from './LinkedReferences'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  setCurrentUserId('u-me')
  localStorage.clear()
  clearMentionCache()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetLinkIndex()
})

const toggle = (root: ParentNode) => root.querySelector<HTMLButtonElement>('[data-unlinked-mentions] .linked-refs__toggle')
const mentionRows = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-unlinked-mention]')]

describe('Unlinked mentions', () => {
  it('A plain mention: counted, listed with the title marked, linked with one action', async () => {
    const trip = await createNote({ title: 'Trip to Lisbon' })
    const ideas = await createNote({ title: 'Lisbon ideas', description: 'Ask Ana about the trip to lisbon ferry' })
    const r = await render(<LinkedReferences kind="note" id={trip} />)
    await waitFor(() => !!toggle(r.container), 'the line', 5000)
    expect(r.container.querySelector('[data-linked-references]')).toBeNull()
    expect(toggle(r.container)!.textContent).toBe('Unlinked mentions1')
    await click(toggle(r.container)!)
    expect(mentionRows(r.container).map((x) => x.dataset.unlinkedMention)).toEqual([`note:${ideas}`])
    expect(r.container.querySelector('[data-unlinked-mention] mark')!.textContent).toBe('trip to lisbon')
    await click(r.container.querySelector('[data-mention-link]')!)
    await waitFor(() => !!r.container.querySelector('[data-linked-references]'), 'now a linked reference', 5000)
    await waitFor(() => !toggle(r.container), 'no mention left', 5000)
    expect((await db.notes.get(ideas))!.description).toBe(`Ask Ana about the [Trip to Lisbon](?note=${trip}) ferry`)
    await r.unmount()
  })

  it('Already linked: listed under Linked references only; a viewer sees no Link', async () => {
    const trip = await createNote({ title: 'Trip to Lisbon' })
    await createNote({ title: 'Packing list', description: `For the [Trip to Lisbon](?note=${trip}), and the trip to Lisbon again` })
    const shared = await createProject({ name: 'Shared' })
    await db.memberships.put({ projectId: shared, role: 'viewer', ownerId: 'someone', members: [] })
    await createNote({ title: 'Their plan', project_id: shared, description: 'the trip to Lisbon in May' })
    const r = await render(<LinkedReferences kind="note" id={trip} />)
    await waitFor(() => !!toggle(r.container), 'the line', 5000)
    expect(toggle(r.container)!.textContent).toBe('Unlinked mentions1')
    await click(toggle(r.container)!)
    expect(mentionRows(r.container)[0].textContent).toContain('Their plan')
    expect(r.container.querySelector('[data-mention-link]')).toBeNull()
    await r.unmount()
  })

  it('Mentioned from another device: the count grows without a reload', async () => {
    const trip = await createNote({ title: 'Trip to Lisbon' })
    await createNote({ title: 'One', description: 'trip to lisbon' })
    const two = await createNote({ title: 'Two', description: 'nothing yet' })
    const r = await render(<LinkedReferences kind="note" id={trip} />)
    await waitFor(() => toggle(r.container)?.textContent === 'Unlinked mentions1', 'one mention', 5000)
    await mutate('note', two, { description: 'we planned the Trip to Lisbon' })
    await waitFor(() => toggle(r.container)?.textContent === 'Unlinked mentions2', 'two mentions', 5000)
    await r.unmount()
  })
})

// note-links "Finding unlinked mentions … SHALL run after Linked references are painted":
// idle time can come before the references mark's frame-and-timer, so the match waits for both.
describe('the match waits for the Linked references mark', () => {
  it('asks for idle time only after a frame and a timer, then runs; cancelling at any stage stops it', async () => {
    vi.useFakeTimers()
    const frames: FrameRequestCallback[] = []
    const idles: IdleRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', (h: number) => { frames[h - 1] = () => {} })
    vi.stubGlobal('requestIdleCallback', (cb: IdleRequestCallback) => idles.push(cb))
    vi.stubGlobal('cancelIdleCallback', (h: number) => { idles[h - 1] = () => {} })
    try {
      const { afterPaintIdle } = await import('./UnlinkedMentions')
      const order: string[] = []
      afterPaintIdle(() => order.push('match'))
      // The references mark is queued the same way, in the same frame.
      expect(idles).toHaveLength(0)
      frames.shift()!(0)
      setTimeout(() => order.push('mark'), 0)
      expect(idles).toHaveLength(0)
      vi.advanceTimersByTime(0)
      expect(idles).toHaveLength(1)
      idles[0]!({ didTimeout: false, timeRemaining: () => 10 })
      expect(order).toEqual(['mark', 'match'])

      const ran = vi.fn()
      afterPaintIdle(ran)()
      afterPaintIdle(ran)
      expect(frames).toHaveLength(2)
      for (const f of frames.splice(0)) f(0)
      vi.advanceTimersByTime(0)
      const stopAtIdle = afterPaintIdle(ran)
      for (const f of frames.splice(0)) f(0)
      vi.advanceTimersByTime(0)
      stopAtIdle()
      for (const cb of idles.splice(1)) cb({ didTimeout: false, timeRemaining: () => 10 })
      expect(ran).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
      vi.unstubAllGlobals()
    }
  })
})

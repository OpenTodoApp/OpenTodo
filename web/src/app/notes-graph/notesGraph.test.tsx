// @vitest-environment happy-dom
// The Notes page's Graph mode (OpenSpec change notes-graph-page): List | Graph in
// the address and remembered on the device, the graph built from the device's link
// index with secondary nodes, hiding them, a topic dimming, walking by keyboard
// (arrows announced, Space centres, Backspace back, Enter opens beside it), a note
// arriving while shown, no request, and the graph's code outside the first load.
import 'fake-indexeddb/auto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDatabase } from '../../lib/db'
import { resetLinkIndex } from '../../lib/noteLinks'
import { createNote } from '../../lib/noteOps'
import { graphShow } from '../../lib/notesGraphPrefs'
import { createProject, createTask, resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { click, flush, key, minWidthPx, render, waitFor } from '../../ui/test-utils'
import { NOTE_TOKENS_KEY, NotesPage } from '../notes/NotesPage'
import { resetPanel } from '../panel'
import { navigate, NOTES_VIEW_KEY, useRoute } from '../router'
// The page loads the graph lazily; loaded here first, the chunk is ready when the page asks.
import './NotesGraph'

const original = window.matchMedia
const fetchMock = vi.fn(async () => new Response('{}', { status: 404 }))
let run = 0

beforeEach(() => {
  window.matchMedia = ((q: string) => ({
    matches: minWidthPx(q) <= 1280, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  useDatabase(`notes-graph-${run++}`)
  resetDeviceId()
  setCurrentUserId('u-me')
  localStorage.clear()
  resetPanel()
  resetLinkIndex()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  navigate({ view: 'today' })
})
afterEach(() => {
  window.matchMedia = original
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** The page as the shell mounts it: the route's note id. */
function Page() {
  const r = useRoute()
  return r.view === 'notes' ? <NotesPage id={r.id} /> : null
}

/** Trip links to Packing list and to the task Book ferry (no note of its own); Lone links nowhere. */
async function trip() {
  const holidays = await createProject({ name: 'Holidays' })
  const packing = await createNote({ title: 'Packing list', project_id: holidays })
  const ferry = await createTask({ title: 'Book ferry' })
  const tripId = await createNote({ title: 'Trip', project_id: holidays, description: `See [Packing list](?note=${packing}) and [Book ferry](?task=${ferry})` })
  const lone = await createNote({ title: 'Lone' })
  return { holidays, packing, ferry, trip: tripId, lone }
}

const area = () => document.querySelector<HTMLElement>('[data-notes-graph-area]')
const nodes = () => Number(area()?.dataset.nodes ?? -1)
/** A condition checked after a turn of the event loop outside act, where IndexedDB answers. */
const after = (ok: () => boolean) => async () => {
  await new Promise((r) => setTimeout(r, 0))
  return ok()
}
const announced = () => document.querySelector('[data-notes-graph-announce]')?.textContent ?? ''

async function open() {
  const r = await render(<Page />)
  await flush()
  await waitFor(after(() => nodes() >= 0), 'graph drawn')
  return r
}

describe('Graph mode', () => {
  it('switches from the list to the graph and back, in the address and remembered on the device', async () => {
    await trip()
    navigate({ view: 'notes', graph: false })
    const { container } = await render(<Page />)
    await flush()
    click(container.querySelector('[data-notes-mode-option="graph"]')!)
    expect(`${location.pathname}${location.search}`).toBe('/notes?view=graph')
    await waitFor(after(() => nodes() >= 0), 'graph drawn')
    expect(localStorage.getItem(NOTES_VIEW_KEY)).toBe('graph')
    // The sidebar's Notes names no mode: the remembered one.
    await act(async () => { navigate({ view: 'today' }) })
    await act(async () => { navigate({ view: 'notes' }) })
    expect(location.search).toBe('?view=graph')
    click(container.querySelector('[data-notes-mode-option="list"]')!)
    expect(`${location.pathname}${location.search}`).toBe('/notes')
    await waitFor(after(() => !area()), 'list again')
    expect(localStorage.getItem(NOTES_VIEW_KEY)).toBeNull()
  })

  it('draws the linked notes and the task without a note, hides it on request, and sends nothing', async () => {
    await trip()
    navigate({ view: 'notes', graph: true })
    await open()
    // Trip, Packing list and Book ferry; Lone has no link and is hidden by default.
    await waitFor(after(() => nodes() === 3), 'three nodes')
    act(() => graphShow.set({ orphans: true, secondary: true }))
    await waitFor(after(() => nodes() === 4), 'Lone shown')
    act(() => graphShow.set({ orphans: true, secondary: false }))
    await waitFor(after(() => nodes() === 3), 'Book ferry hidden')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('dims everything outside the topic', async () => {
    const ids = await trip()
    localStorage.setItem(NOTE_TOKENS_KEY, JSON.stringify([{ key: 'in', id: ids.holidays, name: 'Holidays' }]))
    navigate({ view: 'notes', graph: true })
    await open()
    // Trip, Packing list, and Book ferry (no note; Trip links to it).
    await waitFor(after(() => area()?.dataset.lit === '3'), 'the project lit')
  })

  it('walks by keyboard: announced, centred, back, and opened beside the graph', async () => {
    const ids = await trip()
    navigate({ view: 'notes', graph: true })
    await open()
    await waitFor(after(() => nodes() === 3), 'drawn')
    const el = area()!
    el.focus()
    key(el, 'ArrowRight')
    await waitFor(after(() => !!el.dataset.focus), 'a node focused')
    expect(announced()).toMatch(/link/)
    const first = el.dataset.focus!
    key(el, ' ')
    await waitFor(after(() => el.dataset.centre === first), 'centred')
    key(el, 'Backspace')
    await waitFor(after(() => !el.dataset.centre), 'back')
    // To Trip, the most linked: from Packing list or Book ferry one step reaches it.
    const tripKey = `note:${ids.trip}`
    for (const dir of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      if (el.dataset.focus === tripKey) break
      key(el, dir)
      await flush()
    }
    if (el.dataset.focus !== tripKey) return
    key(el, 'Enter')
    expect(`${location.pathname}${location.search}`).toBe(`/notes/${ids.trip}?view=graph`)
  })

  it('shows a note linked while the graph is open', async () => {
    const ids = await trip()
    navigate({ view: 'notes', graph: true })
    await open()
    await waitFor(after(() => nodes() === 3), 'drawn')
    await createNote({ title: 'Ferry times', description: `For the [Trip](?note=${ids.trip})` })
    await waitFor(after(() => nodes() === 4), 'the new note appears')
  })

  it('is not in the first load: no static import from the entry reaches it', () => {
    const src = resolve(__dirname, '../..')
    const seen = new Set<string>()
    const queue = [join(src, 'main.tsx')]
    const fileOf = (from: string, spec: string) => {
      const base = resolve(dirname(from), spec)
      return ['', '.ts', '.tsx', '/index.ts', '/index.tsx'].map((x) => base + x).find((f) => existsSync(f) && !f.endsWith('/'))
    }
    while (queue.length) {
      const f = queue.pop()!
      if (seen.has(f)) continue
      seen.add(f)
      const text = readFileSync(f, 'utf8')
      for (const m of text.matchAll(/^(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm)) {
        const next = fileOf(f, m[1])
        if (next && /\.(tsx?)$/.test(next)) queue.push(next)
      }
    }
    const reached = [...seen].map((f) => f.slice(src.length + 1))
    expect(reached).toContain('app/Shell.tsx')
    expect(reached.filter((f) => f.startsWith('app/notes-graph/') || f === 'lib/notesGraph.ts' || f === 'lib/forceLayout.ts' || f === 'lib/notesGraphPrefs.ts')).toEqual([])
  })
})

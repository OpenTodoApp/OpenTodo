// @vitest-environment happy-dom
// The graph's labels are drawn on the canvas, so their placement (measureText) and glyphs
// depend on the web font (notes-graph-page). A font that loads after the first frame must
// trigger a redraw — otherwise the labels stay on the fallback font until the next
// interaction, which also makes the Screens/Notes graph visual story settle late and its
// capture non-deterministic. This pins the redraw.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { NoteEntry } from '../../lib/noteList'
import { buildGraph } from '../../lib/notesGraph'
import { resetDeviceId } from '../../lib/ops'
import { flush, render, waitFor } from '../../ui/test-utils'
import { GraphView } from './GraphView'

const ENTRIES: NoteEntry[] = [
  { key: 'note:a', source: 'note', id: 'a', title: 'Alpha', text: '', projectId: null, labels: [], updated: 0 },
  { key: 'note:b', source: 'note', id: 'b', title: 'Beta', text: '', projectId: null, labels: [], updated: 0 },
]
const GRAPH = buildGraph(ENTRIES, (fn) => fn('note:a', 'note:b'), () => null)

// requestAnimationFrame as a queue we drain by hand: a scheduled frame is a scheduled redraw.
let rafQ: FrameRequestCallback[] = []
const drainRAF = () => { for (let i = 0; i < 100 && rafQ.length; i++) { const batch = rafQ; rafQ = []; for (const cb of batch) cb(0) } }

// A controllable FontFaceSet: still loading, with a ready promise we resolve on cue.
function stubFonts() {
  let resolve!: () => void
  const ready = new Promise<void>((r) => { resolve = r })
  const fonts = { status: 'loading' as string, ready, addEventListener() {}, removeEventListener() {} }
  const prev = Object.getOwnPropertyDescriptor(document, 'fonts')
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts })
  return {
    finish: () => { fonts.status = 'loaded'; resolve() },
    restore: () => { if (prev) Object.defineProperty(document, 'fonts', prev); else delete (document as unknown as { fonts?: unknown }).fonts },
  }
}

beforeEach(() => {
  resetDeviceId()
  rafQ = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafQ.push(cb); return rafQ.length })
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })

it('redraws when the web font finishes loading, so labels leave the fallback font', async () => {
  const f = stubFonts()
  try {
    const r = await render(
      <GraphView graph={GRAPH} topic={null} topicKey="" matches={null} hueOf={() => null} onOpen={() => {}} onClosePane={() => false} persist={false} />,
    )
    // The layout settles (slices on timers) and the first frame runs; then the graph is quiet.
    await waitFor(async () => { drainRAF(); return !!document.querySelector('[data-notes-graph][data-ready]') }, 'graph laid out')
    drainRAF()
    const before = rafQ.length

    // The font arrives after that first frame: the graph must schedule another frame.
    f.finish()
    await flush()
    expect(rafQ.length).toBeGreaterThan(before)

    await r.unmount()
  } finally {
    f.restore()
  }
})

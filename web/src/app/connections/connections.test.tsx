// @vitest-environment happy-dom
// The Connections dialog (OpenSpec change notes-graph): two steps around an item
// from the device's link index, keyboard walking (arrows, Space, Enter, Backspace,
// Escape), the List view remembered on the device, the hub's cap, a link arriving
// while open, an unlocked encrypted account offline, and Show connections offered
// only for an item with a link. Plus the first-load rule: the dialog's code is not
// reachable from the entry by static imports.
import 'fake-indexeddb/auto'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { publishEncryption } from '../../lib/e2ee'
import { readString } from '../../lib/deviceStorage'
import { resetLinkIndex } from '../../lib/noteLinks'
import { createNote } from '../../lib/noteOps'
import { createTask, mutate, resetDeviceId } from '../../lib/ops'
import { click, key, render, waitFor } from '../../ui/test-utils'
import { useConnected } from '../signals'
import ConnectionsDialog, { CONNECTIONS_VIEW_KEY } from './ConnectionsDialog'

const opened = vi.hoisted(() => [] as { source: string; id: string }[])
vi.mock('../notes/openNote', () => ({ openNote: (ref: { source: string; id: string }) => { opened.push(ref) } }))

const fetchMock = vi.fn(async () => new Response('{}', { status: 404 }))
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  opened.length = 0
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetLinkIndex()
  publishEncryption({ enabled: false, unlocked: false })
})

/** Trip links to Book ferry, to a note now in the Trash and to one the device cannot read; Packing list links to Trip; Book ferry links to Ferry times, which links back to Packing list (a cycle). */
async function trip() {
  const times = await createNote({ title: 'Ferry times' })
  const ferry = await createTask({ title: 'Book ferry', description: `Times in [Ferry times](?note=${times})` })
  const gone = await createNote({ title: 'Old plan' })
  // Old plan goes to the Trash; Their notes is another member's personal note, never on this device (No access).
  const tripId = await createNote({ title: 'Trip', description: `Next: [Book ferry](?task=${ferry}), see [Old plan](?note=${gone}) and [Their notes](?note=n0tOnThisDevice)` })
  const packing = await createNote({ title: 'Packing list', description: `For the [Trip](?note=${tripId})` })
  await mutate('note', times, { description: `Bring the [Packing list](?note=${packing})` })
  await mutate('note', gone, { deleted_at: Date.now() })
  return { trip: tripId, ferry, times, packing, gone }
}

const graph = () => document.querySelector<HTMLElement>('[data-connections-graph]')
const node = (k: string) => document.querySelector<HTMLButtonElement>(`[data-node="${k}"]`)
const ring = (r: number) => [...document.querySelectorAll<HTMLElement>(`[data-ring="${r}"]`)].map((n) => n.dataset.node)
const rows = (hook: string) => [...document.querySelectorAll<HTMLElement>(`[data-connections-list="${hook}"] [data-linked-ref]`)].map((n) => n.dataset.linkedRef)

describe('Connections', () => {
  it('shows two steps around the item, focus on the centre, without what the device cannot read', async () => {
    const ids = await trip()
    const onClose = vi.fn()
    const r = await render(<ConnectionsDialog kind="note" id={ids.trip} onClose={onClose} />)
    await waitFor(() => !!graph(), 'the graph', 5000)
    expect(graph()!.dataset.connectionsGraph).toBe(`note:${ids.trip}`)
    expect(graph()!.getAttribute('role')).toBe('group')
    expect(graph()!.getAttribute('aria-label')).toBe('Connections of Trip')
    expect(ring(0)).toEqual([`note:${ids.trip}`])
    expect(ring(1)).toEqual([`note:${ids.packing}`, `task:${ids.ferry}`])
    expect(ring(2)).toEqual([`note:${ids.times}`])
    // The note in the Trash is not drawn.
    expect(node(`note:${ids.gone}`)).toBeNull()
    expect(node('note:n0tOnThisDevice')).toBeNull()
    // The cycle: Ferry times and Packing list are joined too.
    const pair = [`note:${ids.packing}`, `note:${ids.times}`].sort().join('|')
    expect(document.querySelector(`[data-edge="${pair}"]`)).not.toBeNull()
    await waitFor(() => document.activeElement === node(`note:${ids.trip}`), 'focus on the centre')
    expect(node(`note:${ids.packing}`)!.getAttribute('aria-label')).toBe('Packing list, note, linked directly')
    expect(node(`note:${ids.times}`)!.getAttribute('aria-label')).toBe('Ferry times, note, two steps away')
    // The switch to List is the first control after the title.
    const dialog = document.querySelector('[data-testid="connections"]')!
    const controls = [...dialog.querySelectorAll<HTMLElement>('button')]
    expect(controls[0].getAttribute('role')).toBe('radio')
    expect(fetchMock).not.toHaveBeenCalled()
    await r.unmount()
  })

  it('walks by keyboard: arrows move, Space centres, Backspace goes back, Enter opens, Escape closes', async () => {
    const ids = await trip()
    const onClose = vi.fn()
    const r = await render(<ConnectionsDialog kind="note" id={ids.trip} onClose={onClose} />)
    await waitFor(() => document.activeElement === node(`note:${ids.trip}`), 'focus on the centre', 5000)
    await key(document.activeElement!, 'ArrowRight')
    expect(document.activeElement).toBe(node(`note:${ids.packing}`))
    await key(document.activeElement!, 'ArrowRight')
    expect(document.activeElement).toBe(node(`task:${ids.ferry}`))
    await key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement).toBe(node(`note:${ids.times}`))
    // Up goes to the inner node that reaches it first: Packing list, which Ferry times links to.
    await key(document.activeElement!, 'ArrowUp')
    expect(document.activeElement).toBe(node(`note:${ids.packing}`))
    await key(document.activeElement!, 'ArrowLeft')
    expect(document.activeElement).toBe(node(`task:${ids.ferry}`))
    await key(document.activeElement!, ' ')
    await waitFor(() => graph()?.dataset.connectionsGraph === `task:${ids.ferry}`, 'centred on Book ferry')
    await waitFor(() => document.activeElement === node(`task:${ids.ferry}`), 'focus on the new centre')
    expect(ring(1).sort()).toEqual([`note:${ids.times}`, `note:${ids.trip}`].sort())
    await key(document.activeElement!, 'Backspace')
    await waitFor(() => graph()?.dataset.connectionsGraph === `note:${ids.trip}`, 'back on Trip')
    await waitFor(() => document.activeElement === node(`note:${ids.trip}`), 'focus back on Trip')
    await key(document.activeElement!, 'ArrowRight')
    await key(document.activeElement!, 'ArrowRight')
    await key(document.activeElement!, 'Enter')
    expect(opened).toEqual([{ source: 'task', id: ids.ferry }])
    expect(onClose).toHaveBeenCalledTimes(1)
    await key(document.activeElement ?? document.body, 'Escape')
    await r.unmount()
  })

  it('a click centres on a node and a click on the centre opens it; Escape closes', async () => {
    const ids = await trip()
    const onClose = vi.fn()
    const r = await render(<ConnectionsDialog kind="note" id={ids.trip} onClose={onClose} />)
    await waitFor(() => !!node(`note:${ids.packing}`), 'the graph', 5000)
    await click(node(`note:${ids.packing}`)!)
    await waitFor(() => graph()?.dataset.connectionsGraph === `note:${ids.packing}`, 'centred on Packing list')
    expect(opened).toEqual([])
    await click(node(`note:${ids.packing}`)!)
    expect(opened).toEqual([{ source: 'note', id: ids.packing }])
    onClose.mockClear()
    await key(node(`note:${ids.packing}`)!, 'Escape')
    expect(onClose).toHaveBeenCalled()
    await r.unmount()
  })

  it('the List view shows Links and Linked from, centres from a row, and is remembered on the device', async () => {
    const ids = await trip()
    const r = await render(<ConnectionsDialog kind="note" id={ids.trip} onClose={() => {}} />)
    await waitFor(() => !!graph(), 'the graph', 5000)
    await click(document.querySelector('[data-segment="list"]')!)
    await waitFor(() => rows('links').length > 0, 'the list')
    expect(graph()).toBeNull()
    expect(rows('links')).toEqual([`task:${ids.ferry}`])
    expect(rows('from')).toEqual([`note:${ids.packing}`])
    expect(readString(CONNECTIONS_VIEW_KEY)).toBe('list')
    await click(document.querySelector(`[data-connections-centre="task:${ids.ferry}"]`)!)
    await waitFor(() => rows('links').includes(`note:${ids.times}`), 'centred on Book ferry')
    expect(rows('from')).toEqual([`note:${ids.trip}`])
    await r.unmount()
    // Another note, later: the dialog opens in List.
    const r2 = await render(<ConnectionsDialog kind="note" id={ids.packing} onClose={() => {}} />)
    await waitFor(() => rows('links').length > 0, 'the list again', 5000)
    expect(document.querySelector('[data-segment="list"]')!.getAttribute('aria-checked')).toBe('true')
    await r2.unmount()
  })

  it('a hub draws 24 on the inner ring with 16 more; the List lists all 40', async () => {
    const hub = await createNote({ title: 'Index' })
    for (let i = 0; i < 40; i++) await createNote({ title: `Note ${i}`, description: `[Index](?note=${hub})` })
    const r = await render(<ConnectionsDialog kind="note" id={hub} onClose={() => {}} />)
    await waitFor(() => !!graph(), 'the graph', 5000)
    expect(ring(1)).toHaveLength(24)
    expect(document.querySelector('[data-more="1"]')!.textContent).toContain('16 more')
    await click(document.querySelector('[data-segment="list"]')!)
    await waitFor(() => rows('from').length === 40, 'all forty')
    await r.unmount()
  })

  it('a link written by another device appears while open', async () => {
    const ids = await trip()
    const r = await render(<ConnectionsDialog kind="note" id={ids.trip} onClose={() => {}} />)
    await waitFor(() => !!graph(), 'the graph', 5000)
    const late = await createNote({ title: 'Late' })
    // As a pulled change lands: a row written to the device.
    await mutate('note', late, { description: `About the [Trip](?note=${ids.trip})` })
    await waitFor(() => ring(1).includes(`note:${late}`), 'the new note on the inner ring')
    await r.unmount()
  })

  it('works on an unlocked encrypted account offline and sends nothing', async () => {
    publishEncryption({ enabled: true, unlocked: true, keyVersion: 1 })
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    const ids = await trip()
    fetchMock.mockClear()
    const r = await render(<ConnectionsDialog kind="note" id={ids.trip} onClose={() => {}} />)
    await waitFor(() => ring(2).length === 1, 'the graph', 5000)
    expect(fetchMock).not.toHaveBeenCalled()
    await r.unmount()
  })
})

function Probe({ kind, id }: { kind: 'task' | 'note'; id: string }) {
  return <span data-connected={useConnected(kind, id) ? 'yes' : 'no'} />
}

describe('Show connections', () => {
  it('is offered only for an item with a link either way', async () => {
    const lone = await createTask({ title: 'Alone' })
    const ids = await trip()
    const r = await render(<><Probe kind="task" id={lone} /><Probe kind="task" id={ids.ferry} /><Probe kind="note" id={ids.packing} /></>)
    await waitFor(() => r.container.querySelectorAll('[data-connected="yes"]').length === 2, 'the linked items', 5000)
    expect(r.container.querySelector('[data-connected]')!.getAttribute('data-connected')).toBe('no')
    await r.unmount()
  })

  it('the dialog is not in the first load: no static import from the entry reaches it', () => {
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
      // Static imports and re-exports only; `import type` is erased.
      for (const m of text.matchAll(/^(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?['"](\.{1,2}\/[^'"]+)['"]/gm)) {
        const next = fileOf(f, m[1])
        if (next && /\.(tsx?)$/.test(next)) queue.push(next)
      }
    }
    const reached = [...seen].map((f) => f.slice(src.length + 1))
    expect(reached).toContain('app/Shell.tsx')
    expect(reached.filter((f) => f.startsWith('app/connections/') || f === 'lib/graphLayout.ts' || f === 'lib/noteLinks.ts')).toEqual([])
  })
})

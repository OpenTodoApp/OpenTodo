// @vitest-environment happy-dom
// Linked references (OpenSpec change note-links, D5): the folded line with its
// count in a project's note area and its per-device open state, sources arriving
// while the section is open, and an unlocked encrypted account offline (computed
// on the device, no request).
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { publishEncryption } from '../lib/e2ee'
import { resetLinkIndex } from '../lib/noteLinks'
import { createNote } from '../lib/noteOps'
import { createProject, createTask, mutate, resetDeviceId } from '../lib/ops'
import { click, render, waitFor } from '../ui/test-utils'
import { readString } from '../lib/deviceStorage'
import LinkedReferences, { REFERENCES_OPEN_KEY } from './LinkedReferences'
import { TaskListView } from './TaskListView'

const fetchMock = vi.fn(async () => new Response('{}', { status: 404 }))
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetLinkIndex()
  publishEncryption({ enabled: false, unlocked: false })
})

const rows = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-linked-ref]')].map((r) => r.dataset.linkedRef)

describe('Linked references', () => {
  it('a project shows one folded line with the count, open on request and remembered on this device', async () => {
    const p = await createProject({ name: 'Renovation' })
    const a = await createNote({ title: 'Kitchen', description: `For [Renovation](?project=${p})` })
    const b = await createNote({ title: 'Budget', description: `- total for [Renovation](?project=${p})` })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => !!r.container.querySelector('[data-linked-references][data-folded]'), 'the folded line', 5000)
    const toggle = r.container.querySelector<HTMLButtonElement>('.linked-refs__toggle')!
    expect(toggle.textContent).toBe('Linked references2')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(rows(r.container)).toEqual([])
    await click(toggle)
    expect(rows(r.container).sort()).toEqual([`note:${a}`, `note:${b}`].sort())
    expect(readString(REFERENCES_OPEN_KEY)).toBe('1')
    await r.unmount()
  })

  it('a source linked on another device appears without a reload', async () => {
    const trip = await createNote({ title: 'Trip' })
    const r = await render(<LinkedReferences kind="note" id={trip} />)
    const ferry = await createTask({ title: 'Book ferry' })
    // As a pulled change lands: a row written to the device.
    await mutate('task', ferry, { description: `See [Trip](?note=${trip}) for dates` })
    await waitFor(() => rows(r.container).includes(`task:${ferry}`), 'the new source', 5000)
    expect(r.container.querySelector('.linked-ref')!.textContent).toContain('See Trip for dates')
    await r.unmount()
  })

  it('works on an unlocked encrypted account offline and sends nothing', async () => {
    publishEncryption({ enabled: true, unlocked: true, keyVersion: 1 })
    vi.stubGlobal('navigator', { ...navigator, onLine: false })
    const trip = await createNote({ title: 'Trip' })
    const ids = [
      await createNote({ title: 'One', description: `[Trip](?note=${trip})` }),
      await createTask({ title: 'Two', description: `[Trip](?note=${trip})` }),
      await createNote({ title: 'Three', description: `x [Trip](?note=${trip})` }),
    ]
    fetchMock.mockClear()
    const r = await render(<LinkedReferences kind="note" id={trip} />)
    await waitFor(() => rows(r.container).length === 3, 'three sources', 5000)
    expect(rows(r.container).sort()).toEqual([`note:${ids[0]}`, `task:${ids[1]}`, `note:${ids[2]}`].sort())
    expect(fetchMock).not.toHaveBeenCalled()
    await r.unmount()
  })
})

// @vitest-environment happy-dom
// The project note (OpenSpec change project-notes, tasks 4.1-4.4): rendered at
// the top of the project, "Add a note" for editors and nothing for viewers on an
// empty note, Shift+P opens the editor and Esc returns, folding per device, and a
// note above the board too.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, getMeta } from '../lib/db'
import { createProject, resetDeviceId, updateProject } from '../lib/ops'
import { saveViewMode } from '../lib/sections'
import { click, flush, key, render } from '../ui/test-utils'
import { TaskListView } from './TaskListView'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const note = (root: ParentNode) => root.querySelector('[data-project-note]')

describe('project note', () => {
  it('renders the note above the list and the board', async () => {
    const p = await createProject({ name: 'Trip' })
    await updateProject(p, { description: '## Packing\n\n- [ ] Passport' })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => note(r.container)?.textContent?.includes('Packing') ?? false)
    await r.unmount()
    await saveViewMode(p, 'board')
    const b = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => note(b.container)?.textContent?.includes('Packing') ?? false)
    await b.unmount()
  })

  it('offers "Add a note" to an editor and nothing to a viewer on an empty note', async () => {
    const p = await createProject({ name: 'Empty' })
    let r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => note(r.container)?.getAttribute('data-project-note') === 'empty')
    expect(note(r.container)!.textContent).toContain('Add a note')
    await r.unmount()
    await db.memberships.put({ projectId: p, role: 'viewer', ownerId: 'someone', members: [] })
    r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => r.container.querySelector('[data-list-page]') !== null)
    await waitFor(() => note(r.container) === null)
    await r.unmount()
  })

  it('Shift+P opens the editor in place; Esc closes it with the note kept', async () => {
    const p = await createProject({ name: 'Keys' })
    await updateProject(p, { description: 'Remember the keys' })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => note(r.container)?.getAttribute('data-project-note') === 'open')
    await key(document.body, 'P', { shiftKey: true })
    await waitFor(() => note(r.container)?.getAttribute('data-project-note') === 'editing')
    await waitFor(() => !!r.container.querySelector('[data-project-note] [role="textbox"]'))
    const box = r.container.querySelector<HTMLElement>('[data-project-note] [role="textbox"]')!
    await key(box, 'Escape')
    await waitFor(() => note(r.container)?.getAttribute('data-project-note') === 'open')
    expect(note(r.container)!.textContent).toContain('Remember the keys')
    await r.unmount()
  })

  it('folds a long note per device', async () => {
    const p = await createProject({ name: 'Long' })
    await updateProject(p, { description: Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`).join('\n\n') })
    // happy-dom lays nothing out: report a tall body so the fold applies.
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return 600 } })
    const r = await render(<TaskListView route={{ view: 'project', id: p }} />)
    await waitFor(() => note(r.container)?.getAttribute('data-project-note') === 'folded')
    await click([...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Show more')!)
    await waitFor(() => note(r.container)?.getAttribute('data-project-note') === 'open')
    expect(await getMeta(`project-note-folded:${p}`, true)).toBe(false)
    if (desc) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', desc)
    await r.unmount()
  })
})

// @vitest-environment happy-dom
// OpenSpec change moments-and-onboarding, task 1.3 (design-system "Illustration set"):
// the empty Today, Upcoming, a project with no open task and the Trash each show their
// drawing, hidden from assistive technology, with the sentence as the heading.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import { flush, render } from '../ui/test-utils'
import { resetPanel } from './panel'
import { TaskListView } from './TaskListView'
import { TrashView } from './TrashView'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 9, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  await setCurrentUserId('u1')
  history.pushState(null, '', '/')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

function expectDrawing(root: Element, name: string, heading: string) {
  const svg = root.querySelector(`[data-illustration="${name}"]`)!
  expect(svg).not.toBeNull()
  expect(svg.closest('[aria-hidden="true"]')).not.toBeNull()
  expect(root.querySelector('h2')!.textContent).toBe(heading)
}

describe('the illustration set in empty views', () => {
  it.each([
    ['today', 'today-clear', 'Nothing due today.'],
    ['upcoming', 'week-clear', 'Nothing scheduled yet.'],
  ] as const)('%s shows %s above its sentence', async (view, name, heading) => {
    const r = await render(<TaskListView route={{ view }} />)
    await waitFor(() => !!r.container.querySelector(`[data-empty-state="${view}"] [data-illustration]`))
    expectDrawing(r.container.querySelector(`[data-empty-state="${view}"]`)!, name, heading)
    await r.unmount()
  })

  it('a project with no open task shows project-new', async () => {
    const id = await createProject({ name: 'Home' })
    const r = await render(<TaskListView route={{ view: 'project', id }} />)
    await waitFor(() => !!r.container.querySelector('[data-empty-state="project"] [data-illustration]'))
    expectDrawing(r.container.querySelector('[data-empty-state="project"]')!, 'project-new', 'This project has no open tasks.')
    await r.unmount()
  })

  it('the empty Trash shows trash-empty', async () => {
    const r = await render(<TrashView />)
    await waitFor(() => !!r.container.querySelector('[data-illustration]'))
    expectDrawing(r.container, 'trash-empty', 'The Trash is empty.')
    await r.unmount()
  })

  it('a view without a drawing of its own shows none', async () => {
    const r = await render(<TaskListView route={{ view: 'someday' }} />)
    await waitFor(() => !!r.container.querySelector('[data-empty-state="someday"]'))
    expect(r.container.querySelector('[data-empty-state="someday"] [data-illustration]')).toBeNull()
    await r.unmount()
  })
})

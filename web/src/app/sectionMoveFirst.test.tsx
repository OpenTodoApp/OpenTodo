// @vitest-environment happy-dom
// Moving a section up from second place (GitHub issue 359): in a project where every
// task has a section (as after an import) there is no "No section" group, and the
// second section's Move up was disabled as if it were first.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId } from '../lib/ops'
import { createSection, projectSections } from '../lib/sections'
import { click, flush, render, mockFetch, noPublicLinks } from '../ui/test-utils'
import { TaskListView } from './TaskListView'

beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

async function waitFor(ok: () => boolean | Promise<boolean>, ms = 3000) {
  for (let t = 0; t < ms && !(await ok()); t += 20) await flush(20)
  expect(await ok()).toBe(true)
}

const item = (label: string) => [...document.querySelectorAll<HTMLElement>('[data-menu-label]')].findLast((e) => e.getAttribute('data-menu-label') === label)

async function openMenu(c: HTMLElement, name: string) {
  await click(c.querySelector(`button[aria-label="Section menu for ${name}"]`)!)
  await flush(20)
}

describe('section order without "No section"', () => {
  it('the second section moves up to first; the first cannot move up; the last cannot move down', async () => {
    const pid = await createProject({ name: 'Imported' })
    const later = await createSection(pid, 'Later')
    const now = await createSection(pid, 'Now')
    await createTask({ title: 'Plan', project_id: pid, section_id: later })
    await createTask({ title: 'Do', project_id: pid, section_id: now })
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => r.container.querySelector('button[aria-label="Section menu for Now"]') !== null)

    await openMenu(r.container, 'Later')
    expect((item('Move up') as HTMLButtonElement).disabled).toBe(true)
    await click(document.body)
    await flush(20)

    await openMenu(r.container, 'Now')
    const up = item('Move up')!
    expect((up as HTMLButtonElement).disabled).toBe(false)
    expect((item('Move down') as HTMLButtonElement).disabled).toBe(true)
    await click(up)
    await waitFor(async () => (await projectSections(pid)).map((s) => s.name).join() === 'Now,Later')
    await r.unmount()
  })
})

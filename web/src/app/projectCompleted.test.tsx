// @vitest-environment happy-dom
// Completed tasks kept in a project's list (OpenSpec project-completed-section,
// issue #145): off by default, a closed Completed group at the end when on,
// completing moves a task into it and reopening brings it back.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createProject, createTask, resetDeviceId, setTaskCompleted } from '../lib/ops'
import { createSection, loadShowCompleted, saveShowCompleted, saveViewMode } from '../lib/sections'
import { click, flush, render, mockFetch, noPublicLinks } from '../ui/test-utils'
import { TaskListView } from './TaskListView'

// The project header asks the server for its public links.
beforeEach(() => mockFetch(noPublicLinks))
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = '' })
beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}

const group = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-completed-group]')
const titlesIn = (el: Element | null) => [...(el?.querySelectorAll('[data-task-id]') ?? [])].map((e) => e.textContent?.match(/Milk|Eggs|Bread|Apples/)?.[0])
const toggleOf = (c: HTMLElement) => group(c)!.querySelector<HTMLButtonElement>('button[aria-expanded]')!

async function groceries() {
  const pid = await createProject({ name: 'Groceries' })
  const milk = await createTask({ title: 'Milk', project_id: pid })
  const eggs = await createTask({ title: 'Eggs', project_id: pid })
  const bread = await createTask({ title: 'Bread', project_id: pid })
  await createTask({ title: 'Apples', project_id: pid })
  await setTaskCompleted(milk, true)
  await flush(5)
  await setTaskCompleted(eggs, true)
  return { pid, milk, eggs, bread }
}

describe('Completed group in a project', () => {
  it('is off by default: completed tasks stay out of the list', async () => {
    const { pid } = await groceries()
    expect(await loadShowCompleted(pid)).toBe(false)
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => r.container.textContent!.includes('Apples'))
    expect(group(r.container)).toBeNull()
    expect(r.container.textContent).not.toContain('Milk')
    await r.unmount()
  })

  it('shows a closed Completed group with the count; opening it lists the newest completion first', async () => {
    const { pid } = await groceries()
    await saveShowCompleted(pid, true)
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => group(r.container) !== null)
    expect(group(r.container)!.textContent).toContain('Completed')
    expect(group(r.container)!.textContent).toContain('2')
    expect(toggleOf(r.container).getAttribute('aria-expanded')).toBe('false')
    expect(titlesIn(group(r.container))).toEqual([])
    await click(toggleOf(r.container))
    await waitFor(() => titlesIn(group(r.container)).length === 2)
    expect(titlesIn(group(r.container))).toEqual(['Eggs', 'Milk'])
    await r.unmount()
  })

  it('completing moves a task into the group, reopening it there brings it back', async () => {
    const { pid, bread, milk } = await groceries()
    await saveShowCompleted(pid, true)
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => group(r.container) !== null)
    await click(toggleOf(r.container))
    await setTaskCompleted(bread, true)
    await waitFor(() => titlesIn(group(r.container))[0] === 'Bread')
    const reopen = group(r.container)!.querySelector<HTMLElement>(`[data-task-id="${milk}"] [role="checkbox"], [data-task-id="${milk}"] button[aria-label^="Reopen"]`)!
    expect(reopen).toBeTruthy()
    await click(reopen)
    await waitFor(() => !titlesIn(group(r.container)).includes('Milk'))
    expect((await db.tasks.get(milk))!.completed_at).toBeNull()
    expect(titlesIn(r.container.querySelector('[data-list-page]')).filter((x) => x === 'Milk')).toHaveLength(1)
    await r.unmount()
  })

  it('replaces the per-section "n completed" of a section whose tasks are all done', async () => {
    const pid = await createProject({ name: 'Groceries' })
    const done = await createSection(pid, 'Done')
    const id = await createTask({ title: 'Milk', project_id: pid, section_id: done })
    await setTaskCompleted(id, true)
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => r.container.querySelector('[data-reveal-completed]') !== null)
    await saveShowCompleted(pid, true)
    await waitFor(() => group(r.container) !== null)
    expect(r.container.querySelector('[data-reveal-completed]')).toBeNull()
    await r.unmount()
  })

  it('is switched from the project menu in the List layout, and only there', async () => {
    const { pid } = await groceries()
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => r.container.querySelector('button[aria-label="Project menu"]') !== null)
    const item = () => document.querySelector<HTMLElement>('[data-menu-label="Show completed tasks"]')
    await click(r.container.querySelector('button[aria-label="Project menu"]')!)
    await waitFor(() => item() !== null)
    expect(item()!.getAttribute('aria-checked')).toBe('false')
    await click(item()!)
    await waitFor(() => group(r.container) !== null)
    expect(await loadShowCompleted(pid)).toBe(true)
    await saveViewMode(pid, 'board')
    await waitFor(() => group(r.container) === null)
    await click(r.container.querySelector('button[aria-label="Project menu"]')!)
    await flush(30)
    expect(item()).toBeNull()
    await r.unmount()
  })
})

// @vitest-environment happy-dom
// The first run (OpenSpec change ux-overhaul, first-run): a three-step card in the
// Inbox instead of the empty state, stored with the account's preferences so a
// second device never shows it; a sample project made of ordinary ops; and empty
// states that name the action first, with the key hint only on fine pointers.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { applyOps, createTask, deleteProject, resetDeviceId } from '../lib/ops'
import { trashItems } from '../lib/trash'
import { USER_PREFS_ID } from '../lib/userPrefs'
import { click, flush, render } from '../ui/test-utils'
import { createSampleProject, SAMPLE_PROJECT_NAME } from './FirstRun'
import { TaskListView } from './TaskListView'
import { closeHelp, useHelpRequest } from '../lib/helpRequest'
import { getStartView } from '../lib/views'

const originalMatchMedia = window.matchMedia
function pointer(kind: 'fine' | 'coarse') {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('pointer') ? q.includes(kind) : q.includes('min-width'), media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  pointer('coarse')
})
afterEach(() => {
  vi.useRealTimers()
  window.matchMedia = originalMatchMedia
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
let lastHelp: string | null = null
const helpScreen = () => lastHelp
function HelpSpy() { lastHelp = useHelpRequest()?.screen ?? null; return null }

describe('three-step first run', () => {
  it('Complete the first run: a task, Companion without the starter labels, dark, skip installing; a second device shows no card', async () => {
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => q('[data-first-run]') !== null)
    expect(q('[data-first-run]')!.getAttribute('data-first-run-step')).toBe('task')
    expect(q('[data-empty-state]')).toBeNull()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Add a task')

    // Step one: the first task moves the card on, and the card stays although the Inbox is no longer empty.
    await createTask({ title: 'Call the dentist' })
    await waitFor(() => q('[data-first-run]')?.getAttribute('data-first-run-step') === 'work')
    expect(r.container.textContent).toContain('Call the dentist')

    // Step two: Companion is preselected, with the starter labels offered; decline them, pick dark, continue.
    expect(q('[data-method-mode="companion"]')!.getAttribute('aria-checked')).toBe('true')
    expect(q('[data-offer="contexts"]')).not.toBeNull()
    await click([...document.querySelectorAll<HTMLButtonElement>('[data-offer="contexts"] button')].find((b) => b.textContent === 'No thanks')!)
    expect(q('[data-offer="contexts"]')).toBeNull()
    await click(q('[data-first-run-mode="dark"]')!)
    await waitFor(() => q('[data-first-run-mode="dark"]')?.getAttribute('aria-checked') === 'true')
    expect((await db.userPrefs.get(USER_PREFS_ID))?.theme_mode).toBe('dark')
    await click(q('[data-first-run-continue]')!)
    await waitFor(() => q('[data-first-run]')?.getAttribute('data-first-run-step') === 'install')
    expect((await db.userPrefs.get(USER_PREFS_ID))?.method).toBe('companion')
    expect(await db.labels.count()).toBe(0)

    // Step three: skip installing closes the card for good.
    expect(q('[data-first-run-install]')!.textContent).toBe('How to install')
    await click(q('[data-first-run-next]')!)
    await waitFor(() => q('[data-first-run]') === null)
    expect((await db.userPrefs.get(USER_PREFS_ID))?.first_run).toBe('done')
    await r.unmount()

    // A second device: the same ops applied to a fresh store, nothing else.
    const ops = await db.outbox.toArray()
    await db.delete()
    await db.open()
    resetDeviceId()
    await applyOps(ops.map(({ local: _local, ...op }) => op))
    const r2 = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => r2.container.textContent!.includes('Call the dentist'))
    await flush(100)
    expect(q('[data-first-run]')).toBeNull()
    await r2.unmount()
  })

  it('Open Loops first from the start: the starter labels and the Loop home as this device\'s start view', async () => {
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => q('[data-first-run]') !== null)
    await createTask({ title: 'Plan the move' })
    await waitFor(() => q('[data-first-run]')?.getAttribute('data-first-run-step') === 'work')
    await click(q('[data-method-mode="first"]')!)
    await waitFor(() => q('[data-offer="start"]') !== null)
    await click([...document.querySelectorAll<HTMLButtonElement>('[data-offer="contexts"] button')].find((b) => b.textContent === 'Create them')!)
    await waitFor(() => q('[data-offer="contexts"]') === null)
    await click([...document.querySelectorAll<HTMLButtonElement>('[data-offer="start"] button')].find((b) => b.textContent === 'Open on the Loop home')!)
    await waitFor(() => q('[data-offer="start"]') === null)
    await click(q('[data-first-run-continue]')!)
    await waitFor(() => q('[data-first-run]')?.getAttribute('data-first-run-step') === 'install')
    expect((await db.userPrefs.get(USER_PREFS_ID))?.method).toBe('first')
    expect((await db.labels.toArray()).map((l) => l.name).sort()).toEqual(['@calls', '@computer', '@errands', '@home'])
    expect(await getStartView()).toBe('loop')
    await r.unmount()
  })

  it('Learn before choosing opens the method overview and keeps the step and the task', async () => {
    const r = await render(<><TaskListView route={{ view: 'inbox' }} /><HelpSpy /></>)
    await waitFor(() => q('[data-first-run]') !== null)
    await createTask({ title: 'Water the plants' })
    await waitFor(() => q('[data-first-run]')?.getAttribute('data-first-run-step') === 'work')
    await click(q('[data-learn-method]')!)
    expect(helpScreen()).toBe('method/overview')
    expect(q('[data-first-run]')!.getAttribute('data-first-run-step')).toBe('work')
    expect(r.container.textContent).toContain('Water the plants')
    closeHelp()
    await r.unmount()
  })

  it('Skip all on the first step closes the card and shows the normal empty state', async () => {
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => q('[data-first-run]') !== null)
    await click(q('[data-first-run-skip-all]')!)
    await waitFor(() => q('[data-first-run]') === null && q('[data-empty-state="inbox"]') !== null)
    expect((await db.userPrefs.get(USER_PREFS_ID))?.first_run).toBe('done')
    // How you work was never written, so it reads as Lists only.
    expect((await db.userPrefs.get(USER_PREFS_ID))?.method).toBe('')
    expect(q('[data-empty-state]')!.textContent).toContain('Your Inbox is empty')
    expect(q('[data-empty-action]')!.textContent).toBe('Add a task')
    await r.unmount()
    // It never returns on this account.
    const r2 = await render(<TaskListView route={{ view: 'inbox' }} />)
    await flush(100)
    expect(q('[data-first-run]')).toBeNull()
    await r2.unmount()
  })
})

describe('sample project', () => {
  it('Show me around is offered once and creates six tasks through ops that delete like any project', async () => {
    const r = await render(<TaskListView route={{ view: 'inbox' }} />)
    await waitFor(() => q('[data-first-run-sample]') !== null)
    const before = await db.outbox.count()
    await click(q('[data-first-run-sample]')!)
    await waitFor(() => q('[data-first-run-sample]') === null)
    await waitFor(() => location.pathname.startsWith('/project/'))
    const project = (await db.projects.toArray()).find((p) => p.name === SAMPLE_PROJECT_NAME)!
    expect(project).toBeTruthy()
    const tasks = (await db.tasks.toArray()).filter((t) => t.project_id === project.id)
    const top = tasks.filter((t) => !t.parent_id)
    expect(top).toHaveLength(6)
    expect(top.some((t) => t.due?.date === '2026-10-14')).toBe(true)
    expect(top.some((t) => t.deadline)).toBe(true)
    expect(top.some((t) => t.labels.length > 0)).toBe(true)
    expect(tasks.some((t) => t.parent_id)).toBe(true)
    expect(top.some((t) => t.recurrence)).toBe(true)
    expect(top.some((t) => t.description)).toBe(true)
    // Every row came from the op log.
    expect(await db.outbox.count()).toBeGreaterThan(before)
    await r.unmount()

    // Deleting it is the ordinary project deletion: the project is one Trash item and its tasks go with it.
    await deleteProject(project.id)
    expect((await db.projects.get(project.id))?.deleted_at).toBeTruthy()
    const trashed = trashItems(await db.tasks.toArray(), await db.projects.toArray())
    expect(trashed.map((i) => `${i.entity}:${i.id}`)).toEqual([`project:${project.id}`])
    for (const t of await db.tasks.toArray()) expect(t.project_id).toBe(project.id)
  })

  it('createSampleProject is idempotent about the label and sets the deadline after the due date', async () => {
    const id = await createSampleProject('2026-10-14')
    await createSampleProject('2026-10-14')
    expect((await db.labels.toArray()).filter((l) => l.name === 'errand')).toHaveLength(1)
    const dl = (await db.tasks.toArray()).find((t) => t.project_id === id && t.deadline)!
    expect(dl.due?.date).toBe('2026-10-15')
    expect(dl.deadline).toBe('2026-10-21')
  })
})

describe('empty states name the action first', () => {
  it('Today on a phone: "Nothing due today", an Add a task button and no key hint', async () => {
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => q('[data-empty-state="today"]') !== null)
    const empty = q('[data-empty-state="today"]')!
    expect(empty.querySelector('svg')).toBeTruthy()
    expect(empty.textContent).toContain('Nothing due today')
    expect(empty.querySelector('[data-empty-action]')!.textContent).toBe('Add a task')
    expect(empty.querySelector('[data-empty-hint]')).toBeNull()
    await click(empty.querySelector('[data-empty-action]')!)
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Add a task')
    await r.unmount()
  })

  it('Today on a desktop: the same text and button with "Press q to add a task" beneath', async () => {
    pointer('fine')
    const r = await render(<TaskListView route={{ view: 'today' }} />)
    await waitFor(() => q('[data-empty-state="today"]') !== null)
    const empty = q('[data-empty-state="today"]')!
    expect(empty.textContent).toContain('Nothing due today')
    expect(empty.querySelector('[data-empty-action]')!.textContent).toBe('Add a task')
    expect(empty.querySelector('[data-empty-hint]')!.textContent).toBe('Press q to add a task')
    await r.unmount()
  })

  it('Completed, which has no quick add, offers to open Today instead', async () => {
    pointer('fine')
    const r = await render(<TaskListView route={{ view: 'completed' }} />)
    await waitFor(() => q('[data-empty-state="completed"]') !== null)
    const empty = q('[data-empty-state="completed"]')!
    expect(empty.querySelector('[data-empty-action]')!.textContent).toBe('Open Today')
    expect(empty.querySelector('[data-empty-hint]')!.textContent).toBe('Press g then t to open Today')
    await r.unmount()
  })
})

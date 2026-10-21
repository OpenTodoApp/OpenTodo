// @vitest-environment happy-dom
// The first run (OpenSpec changes ux-overhaul, first-run, lean-chrome D3-D5): a
// start guide over the real Inbox, one step at a time, as a dialog (a bottom sheet
// on phones), stored with the account's preferences so a second device never shows
// it; it waits for the first sync, never opens on the demo, and follows the owner's
// welcome note. A sample project made of ordinary ops. The empty views of the lists
// are in task-list/listChrome.test.tsx.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The guide waits for the device's first sync; here every device has synced unless a test says otherwise.
const syncState = vi.hoisted(() => ({ lastSyncedAt: 1 as number | null }))
vi.mock('../lib/sync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/sync')>()),
  useSyncStatus: () => ({ state: 'idle', pending: 0, lastSyncedAt: syncState.lastSyncedAt, error: null, live: false, rejected: null }),
}))
import { db } from '../lib/db'
import { setDemo } from '../lib/demo'
import { applyOps, createTask, deleteProject, resetDeviceId } from '../lib/ops'
import { trashItems } from '../lib/trash'
import type { User } from '../lib/types'
import { USER_PREFS_ID } from '../lib/userPrefs'
import { click, flush, key, render, type } from '../ui/test-utils'
import { createSampleProject, FirstRunGuide, SAMPLE_PROJECT_NAME } from './FirstRun'
import { navigate } from './router'
import { TaskListView } from './TaskListView'
import { WelcomeDialog } from './WelcomeDialog'
import { closeHelp, useHelpRequest } from '../lib/helpRequest'
import { getStartView } from '../lib/views'

/** A member: the owner's welcome note never applies, so the guide opens on its own. */
const member: User = { id: 'u1', email: 'ada@example.com', name: 'Ada', role: 'member', createdAt: 1 }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12, 0))
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  syncState.lastSyncedAt = 1
  setDemo(null)
  navigate({ view: 'inbox' })
})
afterEach(() => {
  vi.useRealTimers()
  setDemo(null)
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
/** The guide, inside its dialog (never inside the list page). */
const guide = () => q('[data-overlay="dialog"] [data-first-run]')
const stepOf = () => guide()?.getAttribute('data-first-run-step')
let lastHelp: string | null = null
const helpScreen = () => lastHelp
function HelpSpy() { lastHelp = useHelpRequest()?.screen ?? null; return null }
/** The Inbox with the guide the Shell mounts beside it. */
const inbox = (user: User = member) => render(<><TaskListView route={{ view: 'inbox' }} /><FirstRunGuide user={user} /></>)

describe('three-step first run', () => {
  it('Complete the first run: a task from the guide\'s quick add, Companion without the starter labels, dark, skip installing; a second device shows no guide', async () => {
    const r = await inbox()
    await waitFor(() => guide() !== null)
    expect(stepOf()).toBe('task')
    // The list page is the ordinary Inbox: its empty view, no guide inside it.
    expect(r.container.querySelector('[data-list-page] [data-first-run]')).toBeNull()
    expect(r.container.querySelector('[data-empty-state="inbox"]')).not.toBeNull()
    // Step one: its own quick add, focused.
    const field = q<HTMLInputElement>('[data-overlay="dialog"] input')!
    expect(document.activeElement).toBe(field)
    await type(field, 'Call the dentist')
    await act(async () => { field.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    // The task lands in the Inbox behind the guide, which moves on.
    await waitFor(() => stepOf() === 'work')
    await waitFor(() => r.container.textContent!.includes('Call the dentist'))
    expect((await db.tasks.toArray()).map((t) => t.project_id)).toEqual([null])

    // Step two: Companion is preselected, with the starter labels offered; decline them, pick dark, continue.
    expect(q('[data-method-mode="companion"]')!.getAttribute('aria-checked')).toBe('true')
    expect(q('[data-offer="contexts"]')).not.toBeNull()
    await click([...document.querySelectorAll<HTMLButtonElement>('[data-offer="contexts"] button')].find((b) => b.textContent === 'No thanks')!)
    expect(q('[data-offer="contexts"]')).toBeNull()
    await click(q('[data-first-run-mode="dark"]')!)
    await waitFor(() => q('[data-first-run-mode="dark"]')?.getAttribute('aria-checked') === 'true')
    expect((await db.userPrefs.get(USER_PREFS_ID))?.theme_mode).toBe('dark')
    await click(q('[data-first-run-continue]')!)
    await waitFor(() => stepOf() === 'install')
    expect((await db.userPrefs.get(USER_PREFS_ID))?.method_mode).toBe('companion')
    expect(await db.labels.count()).toBe(0)

    // Step three: skip installing closes the guide for good.
    expect(q('[data-first-run-install]')!.textContent).toBe('How to install')
    await click(q('[data-first-run-next]')!)
    await waitFor(() => guide() === null)
    expect((await db.userPrefs.get(USER_PREFS_ID))?.first_run).toBe('done')
    expect(r.container.textContent).toContain('Call the dentist')
    await r.unmount()

    // A second device: the same ops applied to a fresh store, nothing else.
    const ops = await db.outbox.toArray()
    await db.delete()
    await db.open()
    resetDeviceId()
    await applyOps(ops.map(({ local: _local, ...op }) => op))
    const r2 = await inbox()
    await waitFor(() => r2.container.textContent!.includes('Call the dentist'))
    await flush(100)
    expect(guide()).toBeNull()
    await r2.unmount()
  })

  it('Open Loops first from the start: the starter labels and the Loop home as this device\'s start view', async () => {
    const r = await inbox()
    await waitFor(() => guide() !== null)
    await createTask({ title: 'Plan the move' })
    await waitFor(() => stepOf() === 'work')
    await click(q('[data-method-mode="first"]')!)
    await waitFor(() => q('[data-offer="start"]') !== null)
    await click([...document.querySelectorAll<HTMLButtonElement>('[data-offer="contexts"] button')].find((b) => b.textContent === 'Create them')!)
    await waitFor(() => q('[data-offer="contexts"]') === null)
    await click([...document.querySelectorAll<HTMLButtonElement>('[data-offer="start"] button')].find((b) => b.textContent === 'Open on the Loop home')!)
    await waitFor(() => q('[data-offer="start"]') === null)
    await click(q('[data-first-run-continue]')!)
    await waitFor(() => stepOf() === 'install')
    expect((await db.userPrefs.get(USER_PREFS_ID))?.method_mode).toBe('first')
    expect((await db.labels.toArray()).map((l) => l.name).sort()).toEqual(['@calls', '@computer', '@errands', '@home'])
    expect(await getStartView()).toBe('loop')
    await r.unmount()
  })

  it('Learn before choosing opens the method overview and keeps the step and the task', async () => {
    const r = await render(<><TaskListView route={{ view: 'inbox' }} /><FirstRunGuide user={member} /><HelpSpy /></>)
    await waitFor(() => guide() !== null)
    await createTask({ title: 'Water the plants' })
    await waitFor(() => stepOf() === 'work')
    await click(q('[data-learn-method]')!)
    expect(helpScreen()).toBe('method/overview')
    expect(stepOf()).toBe('work')
    expect(r.container.textContent).toContain('Water the plants')
    closeHelp()
    await r.unmount()
  })

  it('Skip all on the first step closes the guide and shows the Inbox\'s empty view', async () => {
    const r = await inbox()
    await waitFor(() => guide() !== null)
    await click(q('[data-first-run-skip-all]')!)
    await waitFor(() => guide() === null && q('[data-empty-state="inbox"]') !== null)
    expect((await db.userPrefs.get(USER_PREFS_ID))?.first_run).toBe('done')
    // How you work was never written, so it reads as Lists only.
    expect((await db.userPrefs.get(USER_PREFS_ID))?.method_mode).toBe('')
    expect(q('[data-empty-state]')!.textContent).toContain('Inbox zero: every task has a place.')
    expect(q('[data-empty-action]')!.textContent).toBe('Add a task')
    await r.unmount()
    // It never returns on this account.
    const r2 = await inbox()
    await flush(100)
    expect(guide()).toBeNull()
    await r2.unmount()
  })

  it('Closed with Escape on the second step: lists, and it never returns', async () => {
    const r = await inbox()
    await waitFor(() => guide() !== null)
    await createTask({ title: 'Buy stamps' })
    await waitFor(() => stepOf() === 'work')
    await key(q('[data-first-run-continue]')!, 'Escape')
    await waitFor(() => guide() === null)
    expect((await db.userPrefs.get(USER_PREFS_ID))?.first_run).toBe('done')
    expect((await db.userPrefs.get(USER_PREFS_ID))?.method_mode).toBe('')
    await r.unmount()
    const r2 = await inbox()
    await flush(100)
    expect(guide()).toBeNull()
    await r2.unmount()
  })

  it('A tap on the scrim closes it for good too', async () => {
    const r = await inbox()
    await waitFor(() => guide() !== null)
    await click(q('[data-overlay-root]')!)
    await waitFor(() => guide() === null)
    expect((await db.userPrefs.get(USER_PREFS_ID))?.first_run).toBe('done')
    await r.unmount()
  })

  it('opens as a bottom sheet on phones and only on the Inbox', async () => {
    const r = await inbox()
    await waitFor(() => guide() !== null)
    const card = q('[data-overlay="dialog"]')!
    expect(card.getAttribute('data-placement')).toBe('sheet')
    expect(card.className).toContain('max-h-[66dvh]')
    await r.unmount()
    navigate({ view: 'today' })
    const r2 = await render(<><TaskListView route={{ view: 'today' }} /><FirstRunGuide user={member} /></>)
    await flush(100)
    expect(guide()).toBeNull()
    await r2.unmount()
  })

  it('never opens on a demo instance', async () => {
    setDemo({ token: '', sandboxHours: { idle: 2, max: 24 }, resetsAt: 0 })
    const r = await inbox()
    await flush(150)
    expect(guide()).toBeNull()
    await r.unmount()
  })

  it('waits for this device\'s first sync', async () => {
    syncState.lastSyncedAt = null
    const r = await inbox()
    await flush(150)
    expect(guide()).toBeNull()
    await r.unmount()
  })

  it('After the welcome note: a fresh owner sees the note first and the guide once it is closed', async () => {
    const owner: User = { ...member, role: 'owner', createdAt: Date.now() - 60_000 }
    const r = await render(<><TaskListView route={{ view: 'inbox' }} /><WelcomeDialog user={owner} /><FirstRunGuide user={owner} /></>)
    await waitFor(() => q('[data-testid="welcome"]') !== null)
    await flush(50)
    expect(guide()).toBeNull()
    await click(q('[data-welcome-close]')!)
    await waitFor(() => q('[data-testid="welcome"]') === null && guide() !== null)
    expect(stepOf()).toBe('task')
    await r.unmount()
  })
})

describe('sample project', () => {
  it('Show me around is offered once and creates six tasks through ops that delete like any project', async () => {
    const r = await inbox()
    await waitFor(() => q('[data-first-run-sample]') !== null)
    const before = await db.outbox.count()
    await click(q('[data-first-run-sample]')!)
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

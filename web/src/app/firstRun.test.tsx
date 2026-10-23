// @vitest-environment happy-dom
// The first run (OpenSpec changes ux-overhaul, first-run, lean-chrome D3-D5): a
// start guide over the real Inbox, one step at a time, as a dialog (a bottom sheet
// on phones), stored with the account's preferences so a second device never shows
// it; it waits for the first sync, never opens on the demo, and follows the owner's
// welcome note. Sample tasks and the first-day checklist (moments-and-onboarding). The empty views of the lists
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
import { applyOps, createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { USER_PREFS_ID } from '../lib/userPrefs'
import { click, flush, key, render, type } from '../ui/test-utils'
import { FirstRunGuide } from './FirstRun'
import { navigate, parseRoute, useRoute } from './router'
import { HowYouWorkSection } from './method/HowYouWorkSection'
import { closeStartGuide } from '../lib/startGuide'
import { setFirstRunDone } from '../lib/userPrefs'
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
  closeStartGuide()
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

    // Step three: skip installing ends on "Your first day"; Done closes the guide for good.
    expect(q('[data-first-run-install]')!.textContent).toBe('How to install')
    await click(q('[data-first-run-next]')!)
    await waitFor(() => stepOf() === 'first-day')
    await click(q('[data-first-day-done]')!)
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
    // No "Add a task" button: the Inbox's own quick add is the way to add (row-and-cursor D3).
    expect(q('[data-empty-action]')).toBeNull()
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

/** Settings or the Inbox, whichever the route names, with the guide the Shell mounts. */
function Routed({ user }: { user: User }) {
  const route = useRoute()
  return <>{route.view === 'inbox' ? <TaskListView route={route} /> : <HowYouWorkSection />}<FirstRunGuide user={user} /></>
}
const guideState = () => q('[data-start-guide-state]')?.textContent

describe('the Start guide row in Settings (settings-refresh D3)', () => {
  it('Shown again from Settings: it reads Finished, goes to the Inbox at step one, the task lands there, and closing writes nothing', async () => {
    await setFirstRunDone()
    await createTask({ title: 'Older task' })
    navigate({ view: 'settings', section: 'account' })
    const r = await render(<Routed user={member} />)
    await waitFor(() => guideState() === 'Finished')
    expect(guide()).toBeNull()
    await db.outbox.clear()
    await click(q('[data-start-guide-again]')!)
    await waitFor(() => guide() !== null)
    expect(parseRoute(location.pathname).view).toBe('inbox')
    expect(stepOf()).toBe('task')
    expect(await db.outbox.count()).toBe(0)
    // A task added from the guide goes to the Inbox behind it.
    const field = q<HTMLInputElement>('[data-overlay="dialog"] input')!
    await type(field, 'Water the plants')
    await act(async () => { field.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => r.container.querySelector('[data-list-page]')?.textContent?.includes('Water the plants') ?? false)
    const written = (await db.outbox.toArray()).map((o) => o.entity)
    await click(q('[data-overlay="dialog"] [data-overlay-close]')!)
    await waitFor(() => guide() === null)
    // Closing it wrote nothing beyond the task.
    expect((await db.outbox.toArray()).map((o) => o.entity)).toEqual(written)
    expect(written).not.toContain('user_prefs')
    expect(parseRoute(location.pathname).view).toBe('inbox')
    await r.unmount()
  })

  it('Not finished yet: the row says so and its button opens the guide over the Inbox', async () => {
    await createTask({ title: 'Older task' })
    navigate({ view: 'settings', section: 'account' })
    const r = await render(<Routed user={member} />)
    await waitFor(() => guideState() === 'Not finished')
    await click(q('[data-start-guide-again]')!)
    await waitFor(() => guide() !== null && parseRoute(location.pathname).view === 'inbox')
    expect(stepOf()).toBe('task')
    await r.unmount()
  })
})

describe('sample tasks (moments-and-onboarding D2)', () => {
  it('Take the offer: three Inbox tasks marked sample, one due today at 10:00 with 15 m, one with a subtask; no label or project; the guide moves on', async () => {
    const r = await inbox()
    await waitFor(() => q('[data-first-run-sample]') !== null)
    const before = await db.outbox.count()
    await click(q('[data-first-run-sample]')!)
    await waitFor(() => stepOf() === 'work')
    // The dated one leaves the Inbox for Today (inbox-means-unplaced): the folded planned group counts it (inbox-planned-group).
    await waitFor(() => r.container.querySelector('[data-group="planned"] [data-group-count]')?.textContent?.includes('1') === true)
    await waitFor(() => r.container.querySelectorAll('[data-task-id] [data-sample]').length >= 2)
    const tasks = await db.tasks.toArray()
    const top = tasks.filter((t) => !t.parent_id)
    expect(top).toHaveLength(3)
    expect(tasks.every((t) => t.sample === true && t.project_id === null)).toBe(true)
    expect(top.find((t) => t.due)).toMatchObject({ due: { date: '2026-10-14', time: '10:00' }, estimate_minutes: 15 })
    expect(top.filter((t) => t.description)).toHaveLength(1)
    expect(tasks.filter((t) => t.parent_id)).toHaveLength(1)
    expect(await db.labels.count()).toBe(0)
    expect(await db.projects.count()).toBe(0)
    // Every row came from the op log, the marker included.
    expect((await db.outbox.toArray()).slice(before).some((o) => o.field === 'sample' && o.value === true)).toBe(true)
    await r.unmount()
  })

  it('Offered once: after the offer was taken, and in a guide reopened from Settings, the first step shows no offer', async () => {
    const { createSampleTasks } = await import('../lib/sampleTasks')
    const { openStartGuide, closeStartGuide } = await import('../lib/startGuide')
    await createSampleTasks('2026-10-14')
    // The tasks are trashed later: the offer still counts as taken.
    for (const t of await db.tasks.toArray()) await db.tasks.update(t.id, { deleted_at: 1 })
    openStartGuide()
    const r = await inbox()
    await waitFor(() => guide() !== null)
    await flush(100)
    expect(stepOf()).toBe('task')
    expect(q('[data-first-run-sample]')).toBeNull()
    closeStartGuide()
    await r.unmount()
  })
})

describe('first-day checklist (moments-and-onboarding D5)', () => {
  const checklist = async () => {
    const { openFirstDay, closeStartGuide } = await import('../lib/startGuide')
    openFirstDay()
    const r = await render(<FirstRunGuide user={member} />)
    await waitFor(() => stepOf() === 'first-day' && q('[data-first-day-count]')!.textContent !== '\u00a0')
    return { r, done: () => [...document.querySelectorAll('[data-first-day-step][data-done]')].map((e) => e.getAttribute('data-first-day-step')), closeStartGuide }
  }

  it('Steps tick from data: a real task with a date counts for two steps; the third offers to install', async () => {
    await createTask({ title: 'Call the dentist', due: { date: '2026-10-15' } })
    const { r, done, closeStartGuide } = await checklist()
    expect(done()).toEqual(['add', 'plan'])
    expect(q('[data-first-day-count]')!.textContent).toBe('2 of 3 done')
    expect(q('[data-first-day-action="device"]')!.textContent).toBe('Install the app')
    // Nothing is written for the ticks.
    expect(await db.outbox.toArray().then((o) => o.filter((x) => x.entity === 'user_prefs'))).toEqual([])
    closeStartGuide()
    await r.unmount()
  })

  it('Samples do not count as "Add a task"; Today opened after the first real task counts for "Plan today"', async () => {
    const { createSampleTasks } = await import('../lib/sampleTasks')
    const { noteTodayOpened } = await import('../lib/firstDay')
    await createSampleTasks('2026-10-14')
    const { r, done, closeStartGuide } = await checklist()
    expect(done()).toEqual([])
    expect(q('[data-remove-samples]')).not.toBeNull()
    await createTask({ title: 'Real one' })
    await waitFor(() => done().includes('add'))
    expect(done()).toEqual(['add'])
    await noteTodayOpened()
    await waitFor(() => done().includes('plan'))
    closeStartGuide()
    await r.unmount()
  })

  it('Second device counts: a personal row written by another browser device ticks the third step', async () => {
    await createTask({ title: 'Mine', due: { date: '2026-10-15' } })
    const { r, done, closeStartGuide } = await checklist()
    expect(done()).not.toContain('device')
    await applyOps([{ id: 'p1', entity: 'user_prefs', entityId: USER_PREFS_ID, field: 'theme_mode', value: 'dark', ts: Date.now() + 1, device: '6f1c2b9e-3a4d-4e5f-8a7b-9c0d1e2f3a4b' }])
    await waitFor(() => done().includes('device'))
    expect(done()).toEqual(['add', 'plan', 'device'])
    closeStartGuide()
    await r.unmount()
  })

  it('Done: an installed app ticks the third step', async () => {
    await createTask({ title: 'Mine', due: { date: '2026-10-15' } })
    const mm = vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({ matches: query.includes('standalone'), media: query, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList)
    const { r, done, closeStartGuide } = await checklist()
    expect(done()).toEqual(['add', 'plan', 'device'])
    expect(q('[data-first-day-count]')!.textContent).toBe('3 of 3 done')
    mm.mockRestore()
    closeStartGuide()
    await r.unmount()
  })
})

// @vitest-environment happy-dom
// Today's focus by touch (OpenSpec change phone-touch-focus, tasks 2.1–2.5): an
// empty Bento slot and the Three tasks Add to focus row open the picker, the task
// menus add and remove by the rules `f` follows, a full focus refuses, a viewer's
// task joins the user's own focus, and every change has Undo.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setFocusStyle } from '../../lib/bento'
import { db } from '../../lib/db'
import { createTask, resetDeviceId } from '../../lib/ops'
import { toggleFocus } from '../../lib/review'
import type { Task, User } from '../../lib/types'
import { click, render, waitFor } from '../../ui/test-utils'
import { bulkMenuGroups } from '../bulk/BulkActions'
import { bulkToast } from '../bulk/toastStore'
import { flatItems } from '../menus/ActionMenu'
import { undoToast } from '../bulk/UndoToast'
import { resetPanel, setPanelTaskId } from '../panel'
import { navigate } from '../router'
import { Shell } from '../Shell'
import { focusCandidates } from './FocusPicker'
import { focusMenuState } from './focusRequest'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User
const NOW = new Date(2026, 9, 14, 9, 0)
const TODAY = '2026-10-14'

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  resetPanel()
})

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const review = () => db.review.get('me')
const focusIds = async () => ((await review())?.focus_date === TODAY ? (await review())!.focus.split(',').filter(Boolean) : [])
const slotTitle = (slot: 'L' | 'M' | 'S') => q(`[data-bento-slot="${slot}"] [data-task-id]`)?.textContent ?? null
const options = () => [...document.querySelectorAll('[data-testid="focus-picker"] [role="option"]')].map((o) => o.textContent ?? '')
const option = (title: string) => [...document.querySelectorAll<HTMLElement>('[data-testid="focus-picker"] [role="option"]')].find((o) => o.textContent?.includes(title))
const task = (title: string, estimate: number | null, extra: Record<string, unknown> = {}) =>
  createTask({ title, due: { date: TODAY }, estimate_minutes: estimate, ...extra })

async function shell(route: Parameters<typeof navigate>[0]) {
  navigate(route)
  return render(<Shell user={user} onLogout={() => {}} />)
}

/** Opens the task panel of `id` and chooses `label` in its menu. */
async function panelMenu(id: string, label: string) {
  await act(async () => setPanelTaskId(id))
  await waitFor(() => !!q('button[aria-label="Task actions"]'), 'the task panel')
  await click(q('button[aria-label="Task actions"]')!)
  await waitFor(() => !!q(`[data-menu-label="${label}"]`), label)
  await click(q(`[data-menu-label="${label}"]`)!)
}

describe('Empty slot by touch', () => {
  it('Tapping the empty Large slot lists today’s long tasks first; choosing one fills Large, and Undo empties it', async () => {
    await setFocusStyle('bento')
    await task('Call the bank', 15)
    await task('Tidy the desk', null)
    const report = await task('Write the report', 120)
    await createTask({ title: 'Paint the fence', estimate_minutes: 180 })
    const r = await shell({ view: 'review', step: 'daily' })
    await waitFor(() => !!q('[data-bento-fill="L"]'), 'the empty Large slot')
    await click(q('[data-bento-fill="L"]')!)
    await waitFor(() => options().length === 4, 'the picker')
    expect(options().map((o) => o.split(/\d/)[0])).toEqual(['Write the report', 'Tidy the desk', 'Call the bank', 'Paint the fence'])
    await click(option('Write the report')!)
    await waitFor(() => slotTitle('L')?.includes('Write the report') ?? false, 'Large filled')
    expect((await review())?.focus_slots).toBe(`L:${report}`)
    expect(q('[data-testid="focus-picker"]')).toBeNull()
    await waitFor(() => !!bulkToast()?.undoId, 'Undo offered')
    await act(async () => { await undoToast(bulkToast()!.undoId!) })
    await waitFor(() => !!q('[data-bento-fill="L"]'), 'Large free again')
    expect(await focusIds()).toEqual([])
    await r.unmount()
  })
})

describe('Three tasks by touch', () => {
  it('With one focus task the Daily check shows Add to focus; its picker adds the second', async () => {
    const first = await task('First', null)
    const second = await task('Second', null)
    await toggleFocus(await review(), TODAY, await db.tasks.toArray(), first)
    const r = await shell({ view: 'review', step: 'daily' })
    await waitFor(() => !!q('[data-group="focus"] [data-focus-add]'), 'Add to focus')
    await click(q('[data-group="focus"] [data-focus-add]')!)
    await waitFor(() => !!option('Second'), 'the picker')
    expect(option('First')).toBeUndefined()
    await click(option('Second')!)
    await waitFor(async () => (await focusIds()).length === 2, 'two in focus')
    expect(await focusIds()).toEqual([first, second])
    await waitFor(() => bulkToast()?.label === 'Second is in today’s focus.', 'the toast')
    expect(bulkToast()?.undoId).toBeTruthy()
    await r.unmount()
  })

  it('The Loop home offers Add to focus while there is room', async () => {
    const id = await task('Water the plants', null)
    await db.userPrefs.put({ id: 'me', method_mode: 'first' } as never)
    const r = await shell({ view: 'loop' })
    await waitFor(() => !!q('[data-loop-focus] [data-focus-add]'), 'Add to focus on the Loop home')
    await click(q('[data-loop-focus] [data-focus-add]')!)
    await waitFor(() => !!option('Water the plants'), 'the picker')
    await click(option('Water the plants')!)
    await waitFor(async () => (await focusIds()).includes(id), 'in focus')
    await waitFor(() => !!q('[data-loop-focus] [data-task-id]'), 'listed on the Loop home')
    await r.unmount()
  })
})

describe('Task menu', () => {
  it('Add to focus, then Remove from focus, each with Undo', async () => {
    const id = await task('Book the dentist', null)
    const r = await shell({ view: 'today' })
    await panelMenu(id, 'Add to focus')
    await waitFor(async () => (await focusIds()).includes(id), 'added')
    await waitFor(() => !!bulkToast()?.undoId, 'Undo offered')
    await panelMenu(id, 'Remove from focus')
    await waitFor(async () => (await focusIds()).length === 0, 'removed')
    await waitFor(() => bulkToast()?.label === 'Book the dentist left today’s focus.', 'the toast')
    await act(async () => { await undoToast(bulkToast()!.undoId!) })
    await waitFor(async () => (await focusIds()).includes(id), 'back after Undo')
    await r.unmount()
  })

  it('Full: a fourth task is refused and nothing is written', async () => {
    const ids = [await task('One', null), await task('Two', null), await task('Three', null)]
    for (const id of ids) await toggleFocus(await review(), TODAY, await db.tasks.toArray(), id)
    const fourth = await task('Four', null)
    const r = await shell({ view: 'today' })
    const before = await db.outbox.count()
    await panelMenu(fourth, 'Add to focus')
    await waitFor(() => bulkToast()?.label === 'Today’s focus holds 3 tasks. Take one out first.', 'the refusal')
    expect(await db.outbox.count()).toBe(before)
    expect(await focusIds()).toEqual(ids)
    await r.unmount()
  })

  it('Bento without an estimate: Put in a slot opens the slot menu; Medium places it', async () => {
    await setFocusStyle('bento')
    const id = await task('Sort the photos', null)
    const r = await shell({ view: 'today' })
    await panelMenu(id, 'Put in a slot')
    await waitFor(() => !!q('[data-testid="bento-chooser"]'), 'the slot menu')
    expect([...document.querySelectorAll('[data-bento-pick]')].map((b) => b.getAttribute('data-bento-pick'))).toEqual(['L', 'M', 'S'])
    await click(q('[data-bento-pick="M"]')!)
    await waitFor(async () => (await review())?.focus_slots === `M:${id}`, 'in Medium')
    await waitFor(() => bulkToast()?.label === 'Sort the photos is in the Medium slot.', 'the toast')
    await r.unmount()
  })

  it('Viewer of a shared project: the task joins the user’s own focus', async () => {
    const shared = 'shared-project'
    await db.projects.put({ id: shared, name: 'Household', color: null, parent_id: null, position: 0, archived: false, deleted_at: null, created_at: 0, _clock: {} } as never)
    await db.memberships.put({ projectId: shared, role: 'viewer', ownerId: 'other', members: [] })
    await db.tasks.put({ ...(await db.tasks.get(await task('Mine', 20)))!, id: 'bins', title: 'Bins', project_id: shared })
    const r = await shell({ view: 'today' })
    await panelMenu('bins', 'Add to focus')
    await waitFor(async () => (await focusIds()).includes('bins'), 'in focus')
    await r.unmount()
  })
})

describe('Actions menu (the phone’s selection bar, right-click, More)', () => {
  const one = { id: 't1', title: 'Write the report', project_id: null, labels: [], completed_at: null, deleted_at: null } as unknown as Task
  const items = (focus: ReturnType<typeof focusMenuState>, tasks: Task[] = [one]) => flatItems(bulkMenuGroups(tasks.map((x) => x.id),
    { tasks, labels: [], projects: [], sections: [], memberships: new Map(), runningTask: null, focus }, { review: () => {}, pickDate: () => {}, schedule: () => {} }))
  it('One task offers the focus command by style and state; several tasks do not', () => {
    const today = { focus: 't1', focus_date: TODAY }
    expect(focusMenuState(one, null, null, TODAY)).toBe('add')
    expect(focusMenuState(one, null, { focus_style: 'bento' }, TODAY)).toBe('slot')
    expect(focusMenuState(one, today, { focus_style: 'bento' }, TODAY)).toBe('remove')
    expect(focusMenuState({ ...one, completed_at: 1 }, today, null, TODAY)).toBeNull()
    expect(items('add').find((i) => i.id === 'today-focus')?.label).toBe('Add to focus')
    expect(items('slot').find((i) => i.id === 'today-focus')?.label).toBe('Put in a slot')
    expect(items('remove').find((i) => i.id === 'today-focus')?.label).toBe('Remove from focus')
    expect(items('add', [one, { ...one, id: 't2' }]).some((i) => i.id === 'today-focus')).toBe(false)
  })
})

describe('Picker candidates', () => {
  const t = (id: string, over: Partial<Task> = {}) => ({ id, title: id, project_id: null, labels: [], completed_at: null, deleted_at: null, due: null, estimate_minutes: null, priority: 4, ...over }) as unknown as Task
  it('Today first, fitting estimates first, then none, then the rest; focused, completed and archived tasks are out', () => {
    const tasks = [
      t('later-fit', { estimate_minutes: 20 }),
      t('today-big', { due: { date: TODAY }, estimate_minutes: 120 }),
      t('today-none', { due: { date: TODAY } }),
      t('today-fit', { due: { date: TODAY }, estimate_minutes: 10 }),
      t('focused', { due: { date: TODAY }, estimate_minutes: 10 }),
      t('done', { due: { date: TODAY }, completed_at: 1 }),
      t('archived', { due: { date: TODAY }, project_id: 'old' }),
    ]
    const list = focusCandidates(tasks, new Set(['old']), ['focused'], TODAY, 'S')
    expect(list.map((x) => `${x.today ? 'T' : 'O'}:${x.task.id}`)).toEqual(['T:today-fit', 'T:today-none', 'T:today-big', 'O:later-fit'])
  })
})

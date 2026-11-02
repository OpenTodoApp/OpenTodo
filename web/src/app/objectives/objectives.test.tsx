// @vitest-environment happy-dom
// Objectives in the Plan and the weekly review (OpenSpec change plan-objectives,
// tasks 3.2 and 3.3): nothing with the switch off; the strip's groups above the
// columns, reached by Tab first; add, Space, Delete with confirm and Undo,
// Alt+Down; the phone's summary line; and Look ahead's section on a Sunday with
// Carry, the toggle and the new-quarter offer.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { setDateTime } from '../../lib/dates'
import { mutateMany, resetDeviceId } from '../../lib/ops'
import { setObjectivesOn } from '../../lib/objectivePrefs'
import { objectivesIn } from '../../lib/objectives'
import type { Objective, User } from '../../lib/types'
import { undoBatch } from '../../lib/undo'
import { click, key, render, type, waitFor } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { PlanView } from '../PlanView'
import { navigate } from '../router'
import { Shell } from '../Shell'

const originalMedia = window.matchMedia
function viewport(width: number) {
  window.matchMedia = ((media: string) => ({
    matches: [...media.matchAll(/(min|max)-width:\s*([\d.]+)(px|rem)/g)].every((m) => {
      const px = Number(m[2]) * (m[3] === 'rem' ? 16 : 1)
      return m[1] === 'min' ? width >= px : width <= px
    }),
    media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => true,
  })) as typeof window.matchMedia
}

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User

function at(date: Date) {
  vi.setSystemTime(date)
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at(new Date(2026, 9, 28, 12, 0)) // Wednesday of 2026-W44, Q4 2026
  await db.delete()
  await db.open()
  await db.meta.put({ key: 'userId', value: 'u1' })
  resetDeviceId()
  resetPanel()
  localStorage.clear()
  viewport(1280)
  setDateTime({ date_format: 'day-month', time_format: '24h', week_start: 'mon' }, { order: 'DM', hour12: false, weekStart: 1 })
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  history.replaceState(null, '', '/')
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.matchMedia = originalMedia
  resetPanel()
})

let pos = 0
async function seed(title: string, period: string, extra: Partial<Objective> = {}): Promise<string> {
  const id = `ob-${title.replace(/\W+/g, '-').toLowerCase()}`
  await mutateMany([{ entity: 'objective', entityId: id, patch: { title, period, position: ++pos, done_at: 0, created_at: 1, deleted_at: null, ...extra } }])
  return id
}
const strip = () => document.querySelector<HTMLElement>('[data-objectives-strip]')
const group = (period: string) => document.querySelector<HTMLElement>(`[data-objective-group="${period}"]`)
const title = (id: string) => document.querySelector<HTMLButtonElement>(`[data-objective="${id}"] [data-objective-title]`)!
const row = async (id: string) => (await db.objectives.get(id))!
/** The newest undo entry that touched an objective field (the clock is frozen, so by its inverse). */
const undoOf = async (id: string, field: string) => (await db.assistantUndo.toArray()).filter((u) => u.inverse.some((i) => i.entityId === id && field in i.patch)).at(-1)!

describe('the Plan strip', () => {
  it('shows nothing while the switch is off', async () => {
    await seed('Ship 1.0', '2026-Q4')
    const r = await render(<PlanView date="2026-10-28" />)
    await waitFor(() => !!document.querySelector('[data-plan-grid]'), 'the grid')
    expect(strip()).toBeNull()
    await r.unmount()
  })

  it('shows the quarter and this week above the columns, reached by Tab first', async () => {
    await setObjectivesOn(true)
    for (const t of ['Ship 1.0', 'Hire', 'Move']) await seed(t, '2026-Q4')
    for (const t of ['Draft the talk', 'Book the venue']) await seed(t, '2026-W44')
    await seed('Old week', '2026-W43')
    const r = await render(<PlanView date="2026-10-28" />)
    await waitFor(() => !!group('2026-W44')?.querySelector('[data-objective]'), 'the strip')
    expect(group('2026-Q4')!.textContent).toContain('Q4 2026')
    expect(group('2026-Q4')!.querySelectorAll('[data-objective]')).toHaveLength(3)
    expect(group('2026-W44')!.textContent).toContain('This week')
    expect(group('2026-W44')!.querySelectorAll('[data-objective]')).toHaveLength(2)
    expect(document.body.textContent).not.toContain('Old week')
    expect(group('2026-W45')).toBeNull()
    const grid = document.querySelector('[data-plan-grid]')!
    expect(strip()!.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await r.unmount()
  })

  it('adds, marks done with Space, moves with Alt+Down and drops after a confirmation, with Undo', async () => {
    await setObjectivesOn(true)
    const a = await seed('Draft the talk', '2026-W44')
    const b = await seed('Book the venue', '2026-W44')
    const r = await render(<PlanView date="2026-10-28" />)
    await waitFor(() => !!group('2026-W44')?.querySelector('[data-objective]'), 'the strip')

    await click(group('2026-W44')!.querySelector('[data-objective-add]')!)
    const input = group('2026-W44')!.querySelector<HTMLInputElement>('[data-objective-input]')!
    await type(input, 'Write the report')
    await key(input, 'Enter')
    await waitFor(async () => (await db.objectives.where('period').equals('2026-W44').count()) === 3, 'added')

    await key(title(a), ' ')
    await waitFor(async () => (await row(a)).done_at > 0, 'done')
    await waitFor(() => title(a).className.includes('line-through'), 'struck through')

    await key(title(a), 'ArrowDown', { altKey: true })
    await waitFor(async () => objectivesIn(await db.objectives.toArray(), '2026-W44')[0].id === b, 'moved down')

    await key(title(b), 'Delete')
    const drop = document.querySelector<HTMLButtonElement>(`[data-objective="${b}"] [data-objective-drop]`)!
    expect((await row(b)).deleted_at).toBeNull()
    await click(drop)
    await waitFor(async () => !!(await row(b)).deleted_at, 'dropped')
    await waitFor(async () => !!(await undoOf(b, 'deleted_at')), 'the undo entry')
    await undoBatch((await undoOf(b, 'deleted_at')).id)
    await waitFor(async () => !(await row(b)).deleted_at, 'undone')
    await r.unmount()
  })

  it('says why Add is gone at five', async () => {
    await setObjectivesOn(true)
    for (const t of ['a', 'b', 'c', 'd', 'e']) await seed(t, '2026-W44')
    const r = await render(<PlanView date="2026-10-28" />)
    await waitFor(() => !!group('2026-W44')?.querySelector('[data-objective-limit]'), 'the limit note')
    expect(group('2026-W44')!.querySelector('[data-objective-add]')).toBeNull()
    expect(group('2026-W44')!.textContent).toContain('Five is plenty. Finish or drop one first.')
    expect(group('2026-Q4')!.querySelector('[data-objective-add]')).not.toBeNull()
    await r.unmount()
  })

  it('is one summary line on a phone that opens the groups in place', async () => {
    viewport(390)
    await setObjectivesOn(true)
    for (const t of ['a', 'b', 'c']) await seed(t, '2026-Q4')
    for (const t of ['d', 'e']) await seed(t, '2026-W44')
    const r = await render(<PlanView date="2026-10-28" />)
    await waitFor(() => /Q4: 3 · This week: 2/.test(strip()?.textContent ?? ''), 'the summary line')
    expect(group('2026-Q4')).toBeNull()
    await click(strip()!.querySelector('[data-objectives-toggle]')!)
    await waitFor(() => !!group('2026-Q4'), 'the groups')
    expect(group('2026-W44')!.querySelectorAll('[data-objective]')).toHaveLength(2)
    await r.unmount()
  })
})

describe('Look ahead in the weekly review', () => {
  const section = () => document.querySelector<HTMLElement>('[data-review-objectives]')

  it('on a Sunday plans next week, and Carry moves last week’s open objective there, with Undo', async () => {
    at(new Date(2026, 10, 1, 12, 0)) // Sunday 2026-11-01, end of 2026-W44
    await setObjectivesOn(true)
    await mutateMany([{ entity: 'review', entityId: 'me', patch: { completed_at: new Date(2026, 9, 25).getTime() } }])
    await seed('Ship 1.0', '2026-Q4')
    const talk = await seed('Draft the talk', '2026-W44')
    await seed('Done already', '2026-W44', { done_at: 5 })
    navigate({ view: 'review', step: 'ahead' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!section()?.querySelector(`[data-objective-offer="${talk}"]`), 'the offer')
    expect(section()!.textContent).toContain('Objectives for next week')
    expect(section()!.textContent).toContain('Ship 1.0')
    expect(section()!.textContent).not.toContain('Done already')
    expect(group('2026-W45')!.querySelector('[data-objective-add]')).not.toBeNull()
    expect(section()!.querySelector('[data-objective-offers="quarter"]')).toBeNull()

    await click(section()!.querySelector(`[data-objective-offer="${talk}"] [data-objective-carry]`)!)
    await waitFor(async () => (await row(talk)).period === '2026-W45', 'carried')
    await waitFor(() => !!group('2026-W45')?.querySelector(`[data-objective="${talk}"]`), 'in next week')
    await waitFor(async () => !!(await undoOf(talk, 'period')), 'the undo entry')
    await undoBatch((await undoOf(talk, 'period')).id)
    await waitFor(async () => (await row(talk)).period === '2026-W44', 'back')

    await click(section()!.querySelector('[data-objective-flip]')!)
    await waitFor(() => section()!.textContent!.includes('Objectives for this week'), 'flipped')
    expect(group('2026-W44')!.querySelector(`[data-objective="${talk}"]`)).not.toBeNull()
    await r.unmount()
  })

  it('offers last quarter’s open objectives in the first review of a new quarter', async () => {
    at(new Date(2027, 0, 6, 12, 0)) // Wednesday 2027-01-06
    await setObjectivesOn(true)
    await mutateMany([{ entity: 'review', entityId: 'me', patch: { completed_at: new Date(2026, 11, 20).getTime() } }])
    const a = await seed('Ship 1.0', '2026-Q4')
    const b = await seed('Hire', '2026-Q4')
    navigate({ view: 'review', step: 'ahead' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!section()?.querySelector('[data-objective-offers="quarter"]'), 'the quarter offer')
    await click(section()!.querySelector(`[data-objective-offer="${a}"] [data-objective-carry]`)!)
    await waitFor(async () => (await row(a)).period === '2027-Q1', 'carried to Q1')
    await click(section()!.querySelector(`[data-objective-offer="${b}"] [data-objective-drop]`)!)
    await waitFor(async () => !!(await row(b)).deleted_at, 'dropped')
    await waitFor(() => !section()!.querySelector('[data-objective-offers="quarter"]'), 'nothing left to offer')
    await r.unmount()
  })

  it('shows no section with the switch off', async () => {
    await seed('Ship 1.0', '2026-Q4')
    navigate({ view: 'review', step: 'ahead' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('#review-step-title'), 'the step')
    expect(section()).toBeNull()
    await r.unmount()
  })
})

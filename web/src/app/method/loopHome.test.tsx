// @vitest-environment happy-dom
// The Loop home (OpenSpec change loop-home-refresh; open-loops "Loop home").
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { applyOps, createProject, createTask, resetDeviceId, REVIEW_DEFAULTS } from '../../lib/ops'
import type { Op, User } from '../../lib/types'
import { click, flush, key, render, spokenText, type } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { navigate } from '../router'
import { Shell } from '../Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User
const NOW = new Date(2026, 9, 14, 8, 0)
const DAY = 86_400_000

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
  document.body.innerHTML = ''
  resetPanel()
})

async function waitFor(ok: () => boolean, ms = 3000) {
  for (let t = 0; t < ms && !ok(); t += 20) await flush(20)
  expect(ok()).toBe(true)
}
const tile = (move: string) => document.querySelector<HTMLElement>(`[data-loop-tile="${move}"]`)!
/** The move's full sentence, as assistive technology reads it. */
const says = (move: string) => { const a = tile(move)?.querySelector('a'); return a ? spokenText(a) : '' }
const actions = () => [...document.querySelectorAll<HTMLButtonElement>('[data-loop-action]')]
const open = async () => { navigate({ view: 'loop' }); return render(<Shell user={user} onLogout={() => {}} />) }

describe('Loop home', () => {
  it('Morning on the Loop home: numerals per move, Clarify is the next move and opens triage', async () => {
    for (let i = 0; i < 7; i++) await createTask({ title: `Idea ${i}` })
    await createProject({ name: 'Garage' })
    await createProject({ name: 'Garden' })
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: NOW.getTime() - 9 * DAY, _clock: {} })
    const r = await open()
    await waitFor(() => says('catch').includes('7 in the Inbox'))
    expect(says('clarify')).toContain('7 to decide')
    expect(says('place')).toContain('2 projects without a next action')
    expect(says('review')).toContain('Weekly review due')
    expect(tile('clarify').textContent).toContain('7')
    expect([...document.querySelectorAll('[data-loop-tile] h2')].map((h) => h.textContent)).toEqual(['Catch', 'Clarify', 'Place', 'Do', 'Review'])
    expect(document.querySelectorAll('[data-loop-up]')).toHaveLength(1)
    expect(tile('clarify').hasAttribute('data-loop-up')).toBe(true)
    expect(actions().map((b) => b.textContent)).toEqual(['Process the Inbox'])
    expect(document.querySelector('[data-loop-closed]')).toBeNull()
    const axe = (await import('axe-core')).default
    const res = await axe.run(document.querySelector('[data-loop-tiles]')!, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    await click(actions()[0])
    await waitFor(() => location.pathname === '/triage')
    await r.unmount()
  })

  it('Capture from the Loop home: the task is in the Inbox, counts rise and focus stays in the field', async () => {
    const r = await open()
    await waitFor(() => says('catch').includes('The Inbox is empty'))
    const input = document.querySelector<HTMLInputElement>('[data-loop-capture] input')!
    input.focus()
    await type(input, 'Call the plumber')
    await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await waitFor(() => says('catch').includes('1 in the Inbox'))
    expect(says('clarify')).toContain('1 to decide')
    const added = (await db.tasks.toArray()).find((t) => t.title === 'Call the plumber')!
    expect(added.project_id).toBeNull()
    expect(document.activeElement).toBe(input)
    await r.unmount()
  })

  it('Next move moves on: with the Inbox empty, Place is lit and Clarify shows a done mark', async () => {
    await createProject({ name: 'Garage' })
    const r = await open()
    await waitFor(() => says('place').includes('1 project without a next action'))
    expect(tile('place').hasAttribute('data-loop-up')).toBe(true)
    expect(actions().map((b) => b.textContent)).toEqual(['Walk your projects'])
    expect(tile('clarify').querySelector('[data-loop-done]')).not.toBeNull()
    expect(tile('catch').querySelector('[data-loop-done]')).not.toBeNull()
    await r.unmount()
  })

  it('Loop closed: the closed line, done marks, Do is lit and nothing is disabled', async () => {
    const garage = await createProject({ name: 'Garage' })
    await createTask({ title: 'Measure wall', project_id: garage })
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: NOW.getTime() - DAY, daily_at: NOW.getTime() - 3_600_000, monthly_at: NOW.getTime() - 5 * DAY, _clock: {} })
    const r = await open()
    await waitFor(() => !!document.querySelector('[data-loop-closed]'))
    expect(says('do')).toContain('1 next action')
    expect(tile('do').hasAttribute('data-loop-up')).toBe(true)
    for (const m of ['catch', 'clarify', 'place']) expect(tile(m).querySelector('[data-loop-done]'), m).not.toBeNull()
    expect(document.querySelectorAll('[data-loop-tiles] button:disabled')).toHaveLength(0)
    expect(says('review')).toContain('Daily check done today')
    await r.unmount()
  })

  it('A capture from another device raises Catch and Clarify without a reload', async () => {
    const r = await open()
    await waitFor(() => says('catch').includes('The Inbox is empty'))
    await applyOps([
      { id: 'c1', entity: 'task', entityId: 'remote', field: 'title', value: 'From the phone', ts: NOW.getTime(), device: 'phone' },
      { id: 'c2', entity: 'task', entityId: 'remote', field: 'created_at', value: NOW.getTime(), ts: NOW.getTime(), device: 'phone' },
    ] as Op[])
    await waitFor(() => says('catch').includes('1 in the Inbox'))
    expect(says('clarify')).toContain('1 to decide')
    await r.unmount()
  })

  it('Keyboard path: g Shift+L opens it, and the Do move is a link that opens Next', async () => {
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(50)
    await key(document.body, 'g')
    await key(document.body, 'L', { shiftKey: true })
    await waitFor(() => location.pathname === '/loop' && !!tile('do'))
    const go = tile('do').querySelector<HTMLAnchorElement>('a')!
    expect(go.getAttribute('href')).toBe('/next')
    go.focus()
    expect(document.activeElement).toBe(go)
    await click(go)
    await waitFor(() => location.pathname === '/next')
    await r.unmount()
  })

  it('Phone width: the rail is one column by default and widens only from the sm breakpoint', async () => {
    const r = await open()
    await waitFor(() => !!tile('do'))
    const rail = document.querySelector('[data-loop-tiles]')!
    expect(rail.className).toContain('grid')
    expect(rail.className).not.toMatch(/(^|\s)grid-cols-/)
    expect(rail.className).toContain('sm:grid-cols-3')
    await r.unmount()
  })

  it('Close the day from the Review move: the link opens the first step; afterwards the line reads "Day: closed" and the next move is unchanged', async () => {
    const r = await open()
    await waitFor(() => !!tile('review')?.querySelector('[data-loop-day="open"]'))
    const up = document.querySelector('[data-loop-up]')!.getAttribute('data-loop-tile')
    expect(tile('catch').querySelector('[data-loop-done]')).not.toBeNull()
    const link = tile('review').querySelector<HTMLAnchorElement>('[data-loop-day="open"]')!
    expect(link.getAttribute('href')).toBe('/review/close')
    expect(link.closest('a[href="/review"], a[href="/review/daily"]')).toBeNull()
    await click(link)
    await waitFor(() => location.pathname === '/review/close' && document.querySelector('[data-review-step]')?.getAttribute('data-review-step') === 'summary')
    const { closeDay } = await import('../../lib/review')
    await act(async () => { await closeDay('', (await import('../../lib/dates')).logicalToday()) })
    navigate({ view: 'loop' })
    await waitFor(() => (tile('review')?.querySelector('[data-loop-day="closed"]')?.textContent ?? '').startsWith('Day: closed'))
    expect(document.querySelector('[data-loop-up]')!.getAttribute('data-loop-tile')).toBe(up)
    expect(tile('catch').querySelector('[data-loop-done]')).not.toBeNull()
    await r.unmount()
  })

  it('Day closed on another device: the Review move line changes without a reload', async () => {
    const r = await open()
    await waitFor(() => !!tile('review')?.querySelector('[data-loop-day="open"]'))
    await applyOps([{ id: 'dc', entity: 'review', entityId: 'me', field: 'closed_at', value: NOW.getTime(), ts: NOW.getTime(), device: 'phone' }] as Op[])
    await waitFor(() => !!tile('review')?.querySelector('[data-loop-day="closed"]'))
    await r.unmount()
  })
})

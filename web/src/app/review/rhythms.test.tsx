// @vitest-environment happy-dom
// The reviews on screen (OpenSpec change open-loops-method, tasks 5.3 and 5.5):
// Mind sweep, the Someday step, the Daily check and the Monthly look.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createTask, resetDeviceId, updateTask } from '../../lib/ops'
import type { User } from '../../lib/types'
import { flush, key, render, type } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { navigate } from '../router'
import { Shell } from '../Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User
const NOW = new Date(2026, 9, 14, 9, 0)

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
const rowOf = (title: string) => [...document.querySelectorAll<HTMLElement>('[data-task-id]')].find((r) => r.textContent?.includes(title))!

describe('weekly review steps', () => {
  it('Rapid capture: three tasks typed in Mind sweep land in the Inbox in order, focus stays in quick add', async () => {
    navigate({ view: 'review', step: 'sweep' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-testid="review-sweep"] input'))
    const input = document.querySelector<HTMLInputElement>('[data-testid="review-sweep"] input')!
    await act(async () => input.focus())
    for (const title of ['Call the dentist', 'Fix the bike light', 'Thank Mara']) {
      await type(input, title)
      await act(async () => { input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
      await flush(30)
    }
    await waitFor(() => r.container.textContent!.includes('3 caught into the Inbox.'))
    const inbox = (await db.tasks.toArray()).filter((x) => x.project_id === null).sort((a, b) => a.position - b.position).map((x) => x.title)
    expect(inbox).toEqual(['Call the dentist', 'Fix the bike light', 'Thank Mara'])
    expect(document.activeElement).toBe(input)
    await r.unmount()
  })

  it('Promote a someday task: n brings it back and it becomes the project next action', async () => {
    const kitchen = await createProject({ name: 'Kitchen' })
    const bread = await createTask({ title: 'Learn to bake bread', project_id: kitchen })
    await updateTask(bread, { start: 'someday' })
    navigate({ view: 'review', step: 'someday' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!rowOf('Learn to bake bread'))
    await key(document.body, 'j')
    await key(document.body, 'n')
    await waitFor(() => !rowOf('Learn to bake bread'))
    expect((await db.tasks.get(bread))!.start).toBeNull()
    await r.unmount()
  })
})

describe('Daily check', () => {
  it('Pick a focus with f, refuse a fourth, then Done for today records the check', async () => {
    const ids: string[] = []
    for (const title of ['One', 'Two', 'Three', 'Four']) ids.push(await createTask({ title, due: { date: '2026-10-14' } }))
    navigate({ view: 'review', step: 'daily' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector('[data-group="today"] [data-task-id]'))
    const review = () => db.review.get('me')
    await key(document.body, 'j')
    await key(document.body, 'f')
    await waitFor(() => (document.querySelector('[data-daily-message]')?.textContent ?? '').includes('is in today’s focus'))
    for (let i = 0; i < 2; i++) {
      await key(document.body, 'j')
      await key(document.body, 'f')
      await flush(30)
    }
    await waitFor(() => document.querySelectorAll('[data-group="focus"] [data-task-id]').length === 3)
    await key(document.body, 'j')
    await key(document.body, 'f')
    await waitFor(() => (document.querySelector('[data-daily-message]')?.textContent ?? '').includes('holds 3 tasks'))
    expect((await review())?.focus.split(',')).toHaveLength(3)
    expect((await review())?.focus_date).toBe('2026-10-14')
    await act(async () => [...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Done for today')!.click())
    await waitFor(() => (document.querySelector('[data-daily-message]')?.textContent ?? '').includes('Daily check done'))
    expect((await review())?.daily_at).toBe(NOW.getTime())
    await r.unmount()
  })
})

describe('Monthly look', () => {
  it('Areas with stalled children: lists the area with what needs attention', async () => {
    const home = await createProject({ name: 'Home' })
    await createProject({ name: 'Garage', parent_id: home })
    const garden = await createProject({ name: 'Garden', parent_id: home })
    await createTask({ title: 'Plant tulips', project_id: garden })
    navigate({ view: 'review', step: 'monthly' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!document.querySelector(`[data-area="${home}"]`)?.textContent?.includes('1 need attention'))
    const area = document.querySelector(`[data-area="${home}"]`)!
    expect(area.textContent).toContain('2 projects, 1 need attention')
    expect(area.textContent).toContain('Garage')
    expect(area.textContent).not.toContain('Garden')
    await act(async () => [...r.container.querySelectorAll('button')].find((b) => b.textContent === 'Finish monthly look')!.click())
    await waitFor(() => r.container.textContent!.includes('Monthly look finished'))
    expect((await db.review.get('me'))?.monthly_at).toBe(NOW.getTime())
    await r.unmount()
  })
})

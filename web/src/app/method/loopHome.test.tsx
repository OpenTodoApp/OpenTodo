// @vitest-environment happy-dom
// The Loop home (OpenSpec change open-loops-method, task 6.3).
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { applyOps, createProject, createTask, resetDeviceId, REVIEW_DEFAULTS } from '../../lib/ops'
import type { Op, User } from '../../lib/types'
import { flush, key, render } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { navigate } from '../router'
import { Shell } from '../Shell'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', createdAt: 0 } as User
const NOW = new Date(2026, 9, 14, 8, 0)

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

describe('Loop home', () => {
  it('Morning on the Loop home: the tiles count, and Clarify opens triage', async () => {
    for (let i = 0; i < 7; i++) await createTask({ title: `Idea ${i}` })
    await createProject({ name: 'Garage' })
    await createProject({ name: 'Garden' })
    await db.review.put({ ...REVIEW_DEFAULTS, id: 'me', completed_at: NOW.getTime() - 9 * 86_400_000, _clock: {} })
    navigate({ view: 'loop' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!tile('catch')?.textContent?.includes('7 in the Inbox'))
    expect(tile('clarify').textContent).toContain('7 to decide')
    expect(tile('place').textContent).toContain('2 projects without a next action')
    expect(tile('review').textContent).toContain('Weekly review due')
    expect([...document.querySelectorAll('[data-loop-tile] h2')].map((h) => h.textContent)).toEqual(['Catch', 'Clarify', 'Place', 'Do', 'Review'])
    const axe = (await import('axe-core')).default
    const res = await axe.run(document.querySelector('[data-loop-tiles]')!, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
    expect(res.violations.map((v) => v.id)).toEqual([])
    await act(async () => [...tile('clarify').querySelectorAll('button')].find((b) => b.textContent === 'Process the Inbox')!.click())
    await waitFor(() => location.pathname === '/triage')
    await r.unmount()
  })

  it('A capture from another device raises Catch and Clarify without a reload', async () => {
    navigate({ view: 'loop' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!tile('catch')?.textContent?.includes('The Inbox is empty'))
    await applyOps([
      { id: 'c1', entity: 'task', entityId: 'remote', field: 'title', value: 'From the phone', ts: NOW.getTime(), device: 'phone' },
      { id: 'c2', entity: 'task', entityId: 'remote', field: 'created_at', value: NOW.getTime(), ts: NOW.getTime(), device: 'phone' },
    ] as Op[])
    await waitFor(() => !!tile('catch').textContent?.includes('1 in the Inbox'))
    expect(tile('clarify').textContent).toContain('1 to decide')
    await r.unmount()
  })

  it('Keyboard path: g Shift+L opens it, and the Do tile opens Next', async () => {
    navigate({ view: 'inbox' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await flush(50)
    await key(document.body, 'g')
    await key(document.body, 'L', { shiftKey: true })
    await waitFor(() => location.pathname === '/loop' && !!tile('do'))
    const go = [...tile('do').querySelectorAll('button')].find((b) => b.textContent === 'Go to Next')!
    go.focus()
    expect(document.activeElement).toBe(go)
    await act(async () => go.click())
    await waitFor(() => location.pathname === '/next')
    await r.unmount()
  })
})

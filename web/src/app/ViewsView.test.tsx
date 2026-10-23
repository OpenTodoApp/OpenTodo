// @vitest-environment happy-dom
// New board on Filters → Boards (OpenSpec change rule-boards, task 3.5): the
// chooser between an empty board and the Eisenhower matrix template.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { favouritesOf } from '../lib/favourites'
import { resetDeviceId } from '../lib/ops'
import { USER_PREFS_ID } from '../lib/userPrefs'
import { click, flush, render, type } from '../ui/test-utils'
import { resetPanel } from './panel'
import { ViewsView } from './ViewsView'

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  history.replaceState(null, '', '/views')
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

async function waitFor(ok: () => boolean | Promise<boolean>, ms = 3000) {
  for (let t = 0; t < ms && !(await ok()); t += 20) await flush(20)
  expect(await ok()).toBe(true)
}
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text)!
const nameInput = () => document.querySelector<HTMLInputElement>('input[aria-label="Board name"]')

async function choose(id: string) {
  await click(button('New board'))
  await waitFor(() => !!document.querySelector('[data-testid="new-board"]'))
  const options = [...document.querySelectorAll('[data-board-choice]')].map((e) => e.getAttribute('data-board-choice'))
  expect(options).toEqual(['empty', 'eisenhower'])
  await click(document.querySelector(`[data-board-choice="${id}"] input`)!)
  await click(button('Next'))
  await waitFor(() => !!nameInput())
}

describe('New board chooser', () => {
  it('an empty board as before (spec "Empty board as before")', async () => {
    await render(<ViewsView />)
    await choose('empty')
    expect(nameInput()!.value).toBe('')
    await type(nameInput()!, 'Morning')
    await click(button('Create'))
    await waitFor(async () => (await db.views.count()) === 1)
    const [v] = await db.views.toArray()
    expect(v).toMatchObject({ name: 'Morning', kind: 'dashboard', panels: [] })
    await waitFor(() => location.pathname === `/views/${v.id}`)
  })

  it('the Eisenhower matrix: four unpinned filters, one pinned board (spec "Create the matrix")', async () => {
    await render(<ViewsView />)
    await choose('eisenhower')
    expect(nameInput()!.value).toBe('Eisenhower')
    await click(button('Create'))
    await waitFor(async () => (await db.views.count()) === 5)
    const views = await db.views.toArray()
    const board = views.find((v) => v.kind === 'dashboard')!
    expect(board).toMatchObject({ name: 'Eisenhower', pinned: true })
    expect(board.panels.map((id) => views.find((v) => v.id === id)!.name)).toEqual(['Urgent and important', 'Important, not urgent', 'Urgent, not important', 'Neither'])
    expect(views.filter((v) => v.kind === 'list').every((v) => !v.pinned)).toBe(true)
    expect(favouritesOf(await db.userPrefs.get(USER_PREFS_ID), { projects: [], labels: [], views }).map((f) => f.id)).toEqual([board.id])
    await waitFor(() => location.pathname === `/views/${board.id}`)
  })
})

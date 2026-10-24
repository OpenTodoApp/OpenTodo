// @vitest-environment happy-dom
// The Inbox as list | detail (OpenSpec change inbox-split): from 1024 px the task under
// the cursor shows beside the list, "No task selected" stands in while there is none,
// Enter opens the task's page, P processes the Inbox, and each row says where its task
// came from. Narrower, the Inbox is a plain list and a task opens as its page.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import { setCurrentUserId } from '../lib/sharing'
import { click, flush, key, mockFetch, noPublicLinks, render, waitFor, minWidthPx } from '../ui/test-utils'
import { resetPanel } from './panel'
import { PanelHost } from './PanelHost'
import { TaskListView } from './TaskListView'

const original = window.matchMedia
let width = 1280
function viewport(px: number) {
  width = px
  window.matchMedia = ((q: string) => ({
    matches: /pointer:\s*fine/.test(q) ? true : /pointer:\s*coarse/.test(q) ? false : minWidthPx(q) <= width,
    media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

beforeEach(async () => {
  mockFetch(noPublicLinks)
  await db.delete()
  await db.open()
  resetDeviceId()
  setCurrentUserId('me')
  resetPanel()
  localStorage.clear()
  history.replaceState(null, '', '/')
  viewport(1280)
})
afterEach(() => {
  window.matchMedia = original
  resetPanel()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

/** Enter as a browser presses it: the keydown, then, on a focused button nobody stopped, its click (detail 0). */
async function enter() {
  const el = (document.activeElement ?? document.body) as HTMLElement
  const down = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  await act(async () => { el.dispatchEvent(down) })
  if (!down.defaultPrevented && el.tagName === 'BUTTON') await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 })) })
}

const pane = () => document.querySelector<HTMLElement>('[data-split-empty]')
const docked = () => document.querySelector<HTMLElement>('[data-detail-variant="panel"]')?.getAttribute('data-detail-for') ?? null
const row = (title: string) => [...document.querySelectorAll<HTMLElement>('li[data-task-id]')].find((li) => li.querySelector('[data-row-title]')?.textContent === title)!

async function inbox() {
  const a = await createTask({ title: 'Look into a standing desk' })
  const b = await createTask({ title: 'Re: offer for the attic', origin: { kind: 'email', id: '<m1@example.org>' } })
  const r = await render(<><TaskListView route={{ view: 'inbox' }} /><PanelHost user={{ id: 'me' }} /></>)
  await waitFor(() => document.querySelectorAll('li[data-task-id]').length === 2, 'two rows')
  await flush(20)
  return { a, b, r }
}

describe('Inbox split', () => {
  it('shows "No task selected" beside the list, then the task under the cursor', async () => {
    const { a, b, r } = await inbox()
    await waitFor(() => !!pane(), 'the empty pane')
    expect(pane()!.textContent).toContain('No task selected')
    expect(pane()!.textContent).toContain('process all 2, one at a time')
    await key(document.body, 'j')
    await waitFor(() => docked() !== null, 'a docked task')
    const first = docked()
    expect([a, b]).toContain(first)
    expect(pane()).toBeNull()
    await key(document.activeElement ?? document.body, 'j')
    await waitFor(() => docked() !== first, 'the next task docked')
    // Esc empties the pane and clears the cursor.
    await key(document.activeElement ?? document.body, 'Escape')
    await waitFor(() => !!pane(), 'the empty pane again')
    expect(document.querySelector('li[aria-current="true"]')).toBeNull()
    await r.unmount()
  })

  it('ticking rows opens nothing: the pane stays empty until the ticks clear', async () => {
    const { r } = await inbox()
    await key(document.body, 'j')
    await waitFor(() => docked() !== null, 'a docked task')
    const cursor = docked()
    await key(document.activeElement ?? document.body, 'x')
    await waitFor(() => !!pane(), 'the empty pane while ticking')
    await key(document.activeElement ?? document.body, 'Escape')
    await waitFor(() => docked() === cursor, 'the cursor task back beside the list')
    await r.unmount()
  })

  it('a click shows the task beside the list, and Enter opens its page', async () => {
    const { b, r } = await inbox()
    await click(row('Re: offer for the attic').querySelector('[data-row-open]')!)
    await waitFor(() => docked() === b, 'the clicked task docked')
    await enter()
    await waitFor(() => location.pathname === `/task/${b}`, 'the task page')
    await r.unmount()
  })

  it('says how much is left to sort, and Process is the primary action with P', async () => {
    const { r } = await inbox()
    expect(document.querySelector('header')!.textContent).toContain('2 to sort')
    const process = document.querySelector<HTMLButtonElement>('[data-triage-start]')!
    expect(process.className).toContain('primary')
    expect(process.textContent).toContain('Process')
    await key(document.body, 'p')
    await waitFor(() => location.pathname === '/triage', 'the triage page')
    await r.unmount()
  })

  it('each row says where its task came from', async () => {
    const { r } = await inbox()
    expect(row('Re: offer for the attic').querySelector('[data-row-source="email"]')!.textContent).toMatch(/^From email · /)
    expect(row('Look into a standing desk').querySelector('[data-row-source="app"]')!.textContent).toMatch(/^Added · /)
    // The source line stands for the origin chip.
    expect(row('Re: offer for the attic').querySelector('[data-row-trailing] a')).toBeNull()
    await r.unmount()
  })

  it('below 1024 px the Inbox is a plain list and a task opens as its page', async () => {
    viewport(900)
    const { a, b, r } = await inbox()
    expect(pane()).toBeNull()
    await key(document.body, 'j')
    await flush(40)
    expect(docked()).toBeNull()
    const id = document.querySelector<HTMLElement>('li[aria-current="true"]')!.dataset.taskId!
    expect([a, b]).toContain(id)
    await enter()
    await waitFor(() => location.pathname === `/task/${id}`, 'the task page')
    await r.unmount()
  })
})

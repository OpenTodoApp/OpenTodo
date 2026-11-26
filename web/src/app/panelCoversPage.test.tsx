// @vitest-environment happy-dom
// The task panel over the whole page (below 48 rem, a sheet over the list; accessibility-aa
// "Focus not obscured"): the page behind it is inert while it is open, so Tab never lands on
// a row it covers. Wider, the panel covers part of the list and the list stays usable.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { createTask, resetDeviceId } from '../lib/ops'
import type { User } from '../lib/types'
import { minWidthPx, render, waitFor } from '../ui/test-utils'
import { closePanel, openPanel, openTaskPanel, resetPanel, setTaskSplit } from './panel'
import { navigate } from './router'
import { Shell } from './Shell'
import { setPhoneUiEnabled } from '../phone/prefs'

// These tests are about the earlier phone layout, the way back while the phone screens are the default (phone-ui-default D3).
beforeEach(() => setPhoneUiEnabled(false))

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User
const original = window.matchMedia
function viewport(width: number) {
  window.matchMedia = ((q: string) => ({
    matches: /pointer:\s*fine/.test(q) ? true : /pointer:\s*coarse/.test(q) ? false : minWidthPx(q) <= width,
    media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  resetPanel()
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
  navigate({ view: 'inbox' })
})
afterEach(() => { window.matchMedia = original; resetPanel(); vi.unstubAllGlobals() })

const main = () => document.querySelector<HTMLElement>('main[data-app-frame]')!
const panel = () => document.querySelector('[data-detail-variant="panel"]')

async function openOver(width: number) {
  viewport(width)
  const id = await createTask({ title: 'Undated inbox task' })
  const r = await render(<Shell user={user} onLogout={() => {}} />)
  await waitFor(() => !!main(), 'the shell')
  // A list page with its task split: from 600 px to 900 px the task is a sheet over it.
  const unsplit = setTaskSplit(true)
  await act(async () => { openTaskPanel(id) })
  await waitFor(() => !!panel(), 'the panel')
  return { r, unsplit }
}

describe('the task panel over the page', () => {
  it('makes the page behind it inert while it covers the whole width, and gives it back on close', async () => {
    const { r, unsplit } = await openOver(700)
    await waitFor(() => main().inert, 'the page inert')
    // Focus is in the panel, not dropped to the body under the inert page.
    expect(panel()!.contains(document.activeElement)).toBe(true)
    await act(async () => { closePanel() })
    await waitFor(() => !panel(), 'the panel closed')
    expect(main().inert).toBe(false)
    unsplit()
    await r.unmount()
  })

  it('leaves the page usable where the panel covers only part of it', async () => {
    const { r, unsplit } = await openOver(800)
    expect(main().inert).toBe(false)
    unsplit()
    await r.unmount()
  })

  it('puts focus back on the element that opened it once the page is usable again', async () => {
    viewport(700)
    const id = await createTask({ title: 'Undated inbox task' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!main(), 'the shell')
    const opener = document.createElement('button')
    opener.textContent = 'Opener'
    main().append(opener)
    opener.focus()
    const unsplit = setTaskSplit(true)
    await act(async () => { openTaskPanel(id) })
    await waitFor(() => main().inert && panel()!.contains(document.activeElement), 'focus in the panel')
    await act(async () => { closePanel() })
    await waitFor(() => document.activeElement === opener, 'focus back on the opener')
    expect(main().inert).toBe(false)
    unsplit()
    await r.unmount()
  })

  it('keeps the way back to the opener when the panel switches to another task', async () => {
    viewport(700)
    const a = await createTask({ title: 'Parent task' })
    const b = await createTask({ title: 'Other task' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!main(), 'the shell')
    const opener = document.createElement('button')
    opener.textContent = 'Opener'
    main().append(opener)
    opener.focus()
    const unsplit = setTaskSplit(true)
    await act(async () => { openTaskPanel(a) })
    await waitFor(() => main().inert && panel()!.contains(document.activeElement), 'focus in the first task')
    await act(async () => { openTaskPanel(b) })
    await waitFor(() => panel()?.getAttribute('data-detail-for') === b && panel()!.contains(document.activeElement), 'focus in the second task')
    await act(async () => { closePanel() })
    await waitFor(() => document.activeElement === opener, 'focus back on the opener')
    unsplit()
    await r.unmount()
  })

  it('leaves focus in the panel when the window widens past 48 rem while it is open', async () => {
    viewport(700)
    const id = await createTask({ title: 'Undated inbox task' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!main(), 'the shell')
    const opener = document.createElement('button')
    opener.textContent = 'Opener'
    main().append(opener)
    opener.focus()
    const unsplit = setTaskSplit(true)
    await act(async () => { openTaskPanel(id) })
    await waitFor(() => main().inert && panel()!.contains(document.activeElement), 'focus in the panel')
    viewport(800)
    await r.rerender(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !main().inert, 'the page usable')
    await new Promise((done) => requestAnimationFrame(() => done(null)))
    expect(panel()!.contains(document.activeElement)).toBe(true)
    unsplit()
    await r.unmount()
  })

  async function withOpener() {
    viewport(700)
    const id = await createTask({ title: 'Undated inbox task' })
    const r = await render(<Shell user={user} onLogout={() => {}} />)
    await waitFor(() => !!main(), 'the shell')
    const opener = document.createElement('button')
    opener.textContent = 'Opener'
    main().append(opener)
    opener.focus()
    return { id, r, opener, unsplit: setTaskSplit(true) }
  }

  it('returns to the trigger of a dialog the panel was opened from, once that dialog has closed', async () => {
    const { id, r, opener, unsplit } = await withOpener()
    // A sheet's "Open" button: the panel opens from it, the sheet closes and gives focus back to its trigger.
    const sheet = document.createElement('div')
    sheet.setAttribute('data-overlay', '')
    const open = document.createElement('button')
    sheet.append(open)
    document.body.append(sheet)
    open.focus()
    await act(async () => {
      openTaskPanel(id)
      sheet.remove()
      opener.focus()
    })
    await waitFor(() => main().inert && panel()!.contains(document.activeElement), 'focus in the panel')
    await act(async () => { closePanel() })
    await waitFor(() => document.activeElement === opener, 'focus back on the trigger')
    unsplit()
    await r.unmount()
  })

  it('returns to the opener of a panel that showed something else before the task', async () => {
    const { id, r, opener, unsplit } = await withOpener()
    await act(async () => { openPanel('activity', () => <p>Activity</p>) })
    await act(async () => { openTaskPanel(id) })
    await waitFor(() => main().inert && panel()!.contains(document.activeElement), 'focus in the panel')
    await act(async () => { closePanel() })
    await waitFor(() => document.activeElement === opener, 'focus back on the opener')
    unsplit()
    await r.unmount()
  })
})

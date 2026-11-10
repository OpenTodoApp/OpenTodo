// @vitest-environment happy-dom
// Pinned notes in the sidebar (OpenSpec change notes-home, task 1.3; notes-space:
// app-shell "Sidebar spaces" and "Favourites group", scenario "Pinned note"): in the
// Notes space's Pinned group, not in the Tasks space's Favourites; renamed after sync,
// reordered among the pinned notes and unpinned from the menu, gone while in the Trash.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import { isFavourite, pin } from '../lib/favourites'
import { createNote, trashNote } from '../lib/noteOps'
import { applyOps, createProject, resetDeviceId } from '../lib/ops'
import type { Op, User } from '../lib/types'
import { click, render, waitFor } from '../ui/test-utils'
import { resetPanel } from './panel'
import { Sidebar } from './Sidebar'
import { resetSidebarLayout } from './sidebarLayout'

const user = { id: 'u1', email: 'a@example.com', name: 'Ada', role: 'owner', created_at: 0 } as unknown as User

beforeEach(async () => {
  await db.delete()
  await db.open()
  resetDeviceId()
  localStorage.clear()
  resetSidebarLayout()
  resetPanel()
})
afterEach(() => { vi.unstubAllGlobals(); resetSidebarLayout() })

const pinnedRows = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-testid="sidebar-notes-pinned"] [data-space-note]')].map((b) => b.textContent ?? '')
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((el) => el.textContent?.includes(label))!

describe('pinned notes in the Notes space (notes-space D1, D4)', () => {
  it('Pinned note: the title, renamed after sync, opening the note; not in the Tasks space Favourites', async () => {
    const p = await createProject({ name: 'Home' })
    const wifi = await createNote({ title: 'Wi-Fi' })
    await pin('project', p)
    await pin('note', wifi)
    const tasks = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => !!tasks.container.querySelector('[data-favourite-row]'), 'the Favourites group')
    expect(tasks.container.querySelector(`[data-favourite-row="note:${wifi}"]`)).toBeNull()
    await tasks.unmount()
    const r = await render(<Sidebar route={{ view: 'notes' }} user={user} />)
    await waitFor(() => pinnedRows(r.container).join('|') === 'Wi-Fi', 'the pinned note')
    await applyOps([{ id: 'r1', entity: 'note', entityId: wifi, field: 'title', value: 'Home Wi-Fi', ts: Date.now() + 10_000, device: '~phone' } as unknown as Op])
    await waitFor(() => pinnedRows(r.container).includes('Home Wi-Fi'), 'the rename')
    await click(r.container.querySelector(`[data-space-note="${wifi}"]`)!)
    expect(location.pathname).toBe(`/notes/${wifi}`)
    await r.unmount()
  })

  it('reorders among the pinned notes and unpins from its menu; a note in the Trash is not shown', async () => {
    const p = await createProject({ name: 'Home' })
    const wifi = await createNote({ title: 'Wi-Fi' })
    const pack = await createNote({ title: 'Packing' })
    const old = await createNote({ title: 'Old' })
    await pin('note', pack)
    await pin('project', p)
    await pin('note', wifi)
    await pin('note', old)
    await trashNote(old)
    const r = await render(<Sidebar route={{ view: 'notes' }} user={user} />)
    await waitFor(() => pinnedRows(r.container).join('|') === 'Packing|Wi-Fi', 'the live pinned notes')
    await click(r.container.querySelector('button[aria-label="Menu for note Wi-Fi"]')!)
    await waitFor(() => !!menuItem('Move up'), 'the menu')
    await click(menuItem('Move up'))
    await waitFor(() => pinnedRows(r.container).join('|') === 'Wi-Fi|Packing', 'moved up past the project')
    await click(r.container.querySelector('button[aria-label="Menu for note Wi-Fi"]')!)
    await waitFor(() => !!menuItem('Pin to sidebar'), 'the menu')
    await click(menuItem('Pin to sidebar'))
    await waitFor(() => pinnedRows(r.container).join('|') === 'Packing', 'unpinned')
    expect(isFavourite(await db.userPrefs.get('me'), 'note', wifi)).toBe(false)
    // The trashed note's entry stays, so a restore brings it back.
    expect((await db.userPrefs.get('me'))!.favourites).toContain(`note:${old}`)
    await r.unmount()
  })
})

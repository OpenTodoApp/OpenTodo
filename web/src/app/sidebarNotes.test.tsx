// @vitest-environment happy-dom
// Pinned notes in the sidebar's Favourites (OpenSpec change notes-home, task 1.3;
// app-shell "Favourites group", scenario "Pinned note"): the note icon, its title
// and no count, opening the note, renamed after sync, reordered and unpinned from
// its menu, gone while in the Trash.
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

const favRows = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('[data-favourite-row]')].map((row) => {
  const name = row.querySelector('[data-sidebar-item] .truncate')?.textContent ?? ''
  const n = row.querySelector('[data-sidebar-item] [data-count]')?.textContent
  return n ? `${name} ${n}` : name
})
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((el) => el.textContent?.includes(label))!

describe('pinned notes in Favourites', () => {
  it('Pinned note: the title with no count, renamed after sync, opening the note', async () => {
    const p = await createProject({ name: 'Home' })
    const wifi = await createNote({ title: 'Wi-Fi' })
    await pin('project', p)
    await pin('note', wifi)
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => favRows(r.container).join('|') === 'Home|Wi-Fi', 'the two favourites')
    const row = r.container.querySelector(`[data-favourite-row="note:${wifi}"]`)!
    expect(row.querySelector('[data-count]')).toBeNull()
    await applyOps([{ id: 'r1', entity: 'note', entityId: wifi, field: 'title', value: 'Home Wi-Fi', ts: Date.now() + 10_000, device: '~phone' } as unknown as Op])
    await waitFor(() => favRows(r.container).includes('Home Wi-Fi'), 'the rename')
    await click(r.container.querySelector(`[data-favourite="note:${wifi}"]`)!)
    expect(location.pathname).toBe(`/notes/${wifi}`)
    await r.unmount()
  })

  it('reorders and unpins from its menu; a note in the Trash is not shown', async () => {
    const p = await createProject({ name: 'Home' })
    const wifi = await createNote({ title: 'Wi-Fi' })
    const old = await createNote({ title: 'Old' })
    await pin('project', p)
    await pin('note', wifi)
    await pin('note', old)
    await trashNote(old)
    const r = await render(<Sidebar route={{ view: 'inbox' }} user={user} />)
    await waitFor(() => favRows(r.container).join('|') === 'Home|Wi-Fi', 'the live favourites')
    await click(r.container.querySelector('button[aria-label="Menu for note Wi-Fi"]')!)
    await waitFor(() => !!menuItem('Move up'), 'the menu')
    await click(menuItem('Move up'))
    await waitFor(() => favRows(r.container).join('|') === 'Wi-Fi|Home', 'moved up')
    await click(r.container.querySelector('button[aria-label="Menu for note Wi-Fi"]')!)
    await waitFor(() => !!menuItem('Pin to sidebar'), 'the menu')
    await click(menuItem('Pin to sidebar'))
    await waitFor(() => favRows(r.container).join('|') === 'Home', 'unpinned')
    expect(isFavourite(await db.userPrefs.get('me'), 'note', wifi)).toBe(false)
    // The trashed note's entry stays, so a restore brings it back.
    expect((await db.userPrefs.get('me'))!.favourites).toContain(`note:${old}`)
    await r.unmount()
  })
})

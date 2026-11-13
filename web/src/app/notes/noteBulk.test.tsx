// @vitest-environment happy-dom
// Ticking notes on the Notes page (OpenSpec change notes-bulk-actions, tasks 1.2 and
// 2.2): a range with Shift+↓ over a task note, select all leaving read-only notes out,
// leaving the page, the scope-change review and labels from the Actions menu.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db, useDatabase } from '../../lib/db'
import { createNote } from '../../lib/noteOps'
import { resetLinkIndex } from '../../lib/noteLinks'
import { createProject, createTask, mutateMany, resetDeviceId } from '../../lib/ops'
import { createLabel } from '../../lib/labels'
import { planNote } from '../../lib/noteOps'
import { setCurrentUserId } from '../../lib/sharing'
import { click, flush, key, minWidthPx, render, waitFor } from '../../ui/test-utils'
import { resetPanel } from '../panel'
import { NotesPage } from './NotesPage'

const original = window.matchMedia
let run = 0
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: minWidthPx(q) <= 1280, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as typeof window.matchMedia
  useDatabase(`notes-bulk-${run++}`)
  resetDeviceId()
  setCurrentUserId('u-me')
  localStorage.clear()
  resetPanel()
  resetLinkIndex()
  history.replaceState(null, '', '/notes')
})
afterEach(() => {
  window.matchMedia = original
  document.body.innerHTML = ''
})

const row = (root: ParentNode, title: string) => [...root.querySelectorAll<HTMLElement>('[data-note-key]')].find((r) => r.querySelector('[data-note-title]')?.textContent === title)!
const button = (root: ParentNode, title: string) => row(root, title).querySelector<HTMLButtonElement>('[data-note-open]')!
const ticked = (root: ParentNode) => [...root.querySelectorAll('[data-note-key][data-ticked]')].map((r) => r.querySelector('[data-note-title]')!.textContent)
const bar = () => document.querySelector('[data-selection-bar]')
/** Writes notes one batch each, oldest first, so the list shows them newest first. */
async function inOrder(...titles: string[]) {
  for (const title of titles) await mutateMany([await planNote({ title, description: title })])
}

describe('ticking notes', () => {
  it('Tick a range: x then Shift+↓ three times passes over the task note; the bar reads 3 selected', async () => {
    await inOrder('Agenda 5 Nov')
    await createTask({ title: 'Call the plumber', description: 'the boiler' })
    await inOrder('Agenda 4 Nov', 'Agenda 3 Nov')
    const { container } = await render(<NotesPage />)
    await waitFor(() => container.querySelectorAll('[data-note-key]').length === 4, 'four rows')
    const start = button(container, 'Agenda 3 Nov')
    start.focus()
    await key(start, 'x')
    for (let i = 0; i < 3; i++) await key(document.activeElement!, 'ArrowDown', { shiftKey: true })
    expect(ticked(container)).toEqual(['Agenda 3 Nov', 'Agenda 4 Nov', 'Agenda 5 Nov'])
    expect(bar()!.textContent).toContain('3 selected')
    await key(document.activeElement!, 'Escape')
    expect(ticked(container)).toEqual([])
  })

  it('Select all skips read-only notes', async () => {
    const shared = await createProject({ name: 'Shared' })
    await db.memberships.put({ projectId: shared, role: 'viewer', ownerId: 'someone', members: [] })
    for (let i = 0; i < 8; i++) await createNote({ title: `Mine ${i}` })
    for (let i = 0; i < 2; i++) await createNote({ title: `Theirs ${i}`, project_id: shared })
    const { container } = await render(<NotesPage />)
    await waitFor(() => container.querySelectorAll('[data-note-key]').length === 10, 'ten rows')
    const b = button(container, 'Mine 0')
    b.focus()
    await key(b, 'x')
    await key(b, 'a', { ctrlKey: true })
    expect(ticked(container)).toHaveLength(8)
    expect(ticked(container).every((x) => x!.startsWith('Mine'))).toBe(true)
  })

  it('Leave the page: nothing stays ticked', async () => {
    await inOrder('One', 'Two')
    const first = await render(<NotesPage />)
    await waitFor(() => first.container.querySelectorAll('[data-note-key]').length === 2, 'two rows')
    // Ctrl+click ticks instead of opening.
    const { act } = await import('react')
    await act(async () => { button(first.container, 'One').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })) })
    expect(ticked(first.container)).toEqual(['One'])
    expect(document.location.pathname).toBe('/notes')
    await first.unmount()
    const again = await render(<NotesPage />)
    await waitFor(() => again.container.querySelectorAll('[data-note-key]').length === 2, 'two rows')
    expect(ticked(again.container)).toEqual([])
  })
})

describe('actions on ticked notes', () => {
  it('Move into a shared project is reviewed, then copied with the originals in the Trash', async () => {
    const reno = await createProject({ name: 'Renovation' })
    await db.memberships.put({ projectId: reno, role: 'owner', ownerId: 'u-me', members: [] })
    await inOrder('Tiles', 'Paint')
    const { container } = await render(<NotesPage />)
    await waitFor(() => container.querySelectorAll('[data-note-key]').length === 2, 'two rows')
    const b = button(container, 'Paint')
    b.focus()
    await key(b, 'x')
    await key(document.activeElement!, 'ArrowDown', { shiftKey: true })
    await key(document.activeElement!, 'm')
    const option = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes('Renovation'))
    await waitFor(() => !!option(), 'the project picker')
    await click(option()!)
    await waitFor(() => !!document.querySelector('[data-note-move-review]'), 'the review')
    expect(document.querySelector('[data-note-move-review]')!.textContent).toContain('copied into Renovation')
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button, [role="dialog"] button')].find((x) => x.textContent === 'Move')!
    await click(confirm)
    await waitFor(async () => (await db.notes.filter((n) => n.project_id === reno && !n.deleted_at).count()) === 2, 'the copies')
    expect(await db.notes.filter((n) => !n.project_id && !!n.deleted_at).count()).toBe(2)
  })

  it('Label several with Shift+L: added to the notes lacking it', async () => {
    const ref = await createLabel({ name: 'reference' })
    await inOrder('A', 'B')
    await mutateMany([{ ...(await planNote({ title: 'C', labels: [ref] })) }])
    const { container } = await render(<NotesPage />)
    await waitFor(() => container.querySelectorAll('[data-note-key]').length === 3, 'three rows')
    const b = button(container, 'C')
    b.focus()
    await key(b, 'x')
    await key(b, 'a', { ctrlKey: true })
    await key(document.activeElement!, 'L', { shiftKey: true })
    const option = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes('reference'))
    await waitFor(() => !!option(), 'the label picker')
    await click(option()!)
    await waitFor(async () => (await db.notes.filter((n) => (n.labels ?? []).includes(ref)).count()) === 3, 'all labelled')
    await flush()
    const { bulkToast } = await import('../bulk/toastStore')
    expect(bulkToast()?.label).toBe('reference added to 2 notes')
  })
})

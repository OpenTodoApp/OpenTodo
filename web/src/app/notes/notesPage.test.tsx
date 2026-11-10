// @vitest-environment happy-dom
// The Notes page (OpenSpec change notes-overview, tasks 4.3 and 4.8): the list of
// the three sources, 50 at a time with Show more, the filters, the search with its
// highlighted snippet, the keyboard, the empty state, opening a note, the phone's
// Filters sheet, and the note editor without mentions, images or Make subtask.
// The home (notes-home, tasks 1.2, 2.2, 3.1, 3.2 and 4.1): Pinned and Recent,
// writing from the search field, pinning from the menus and with `p`, Unlinked.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EditorView } from 'prosemirror-view'
import { db, useDatabase } from '../../lib/db'
import { createNote, planNote, trashNote } from '../../lib/noteOps'
import { isFavourite, pin } from '../../lib/favourites'
import { undoBatch } from '../../lib/undo'
import { resetLinkIndex } from '../../lib/noteLinks'
import { createProject, createTask, mutate, mutateMany, resetDeviceId, updateTask } from '../../lib/ops'
import { activeBody, encodeDoc, newDoc, updateBody, type RNode } from '../../lib/richtext'
import { setCurrentUserId } from '../../lib/sharing'
import { act } from 'react'
import { click, flush, key, minWidthPx, render, type, waitFor } from '../../ui/test-utils'
import { noteViewOf } from '../NotesEditor'
import { panelOccupant, resetPanel } from '../panel'
import { ProjectNote } from '../ProjectNote'
import { NOTE_FILTERS_KEY, NOTE_TOKENS_KEY, NotesPage } from './NotesPage'
import { NotePanel } from './NoteEditor'

const ME = 'u-me'
const original = window.matchMedia
let width = 1280
let run = 0

beforeEach(() => {
  width = 1280
  window.matchMedia = ((q: string) => ({
    matches: minWidthPx(q) <= width, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as typeof window.matchMedia
  useDatabase(`notes-page-${run++}`)
  resetDeviceId()
  setCurrentUserId(ME)
  localStorage.clear()
  resetPanel()
  resetLinkIndex()
  history.replaceState(null, '', '/notes')
})
afterEach(() => {
  window.matchMedia = original
  document.body.innerHTML = ''
})

const titles = (root: ParentNode) => [...root.querySelectorAll('[data-note-title]')].map((e) => e.textContent)
const rows = (root: ParentNode) => root.querySelectorAll('[data-note-key]')
const para = (text: string): RNode => ({ type: 'paragraph', attrs: {}, runs: [{ text, marks: {} }] })

async function page(id?: string) {
  const r = await render(<NotesPage id={id} />)
  await flush()
  return r
}

describe('the list', () => {
  it('Default list: the 50 newest of 60, "50 of 60" and Show more', async () => {
    const changes = []
    for (let i = 0; i < 60; i++) changes.push(await planNote({ title: `Note ${String(i).padStart(2, '0')}`, description: `text ${i}` }))
    // One batch shares one clock: write them one by one so the order is by change.
    for (const c of changes) await mutateMany([c])
    const { container } = await page()
    await waitFor(() => rows(container).length === 50, '50 rows')
    expect(titles(container)[0]).toBe('Note 59')
    expect(container.querySelector('[data-notes-count]')!.textContent).toBe('50 of 60')
    expect(container.textContent).toContain('60 notes')
    await click(container.querySelector('[data-notes-more]')!)
    await waitFor(() => rows(container).length === 60, '60 rows')
    expect(container.querySelector('[data-notes-more]')).toBeNull()
  })

  it('A task\'s other change does not move its note', async () => {
    const old = await createTask({ title: 'Old', description: 'written first' })
    await createNote({ title: 'Newer', description: 'written later' })
    const { container } = await page()
    await waitFor(() => rows(container).length === 2, 'two rows')
    expect(titles(container)).toEqual(['Newer', 'Old'])
    await updateTask(old, { due: { date: '2026-11-01' } })
    // The live list has the change (the task row's due) before the order is read.
    await waitFor(async () => !!(await db.tasks.get(old))?.due, 'the due date stored')
    await flush()
    expect(titles(container)).toEqual(['Newer', 'Old'])
  })

  it('Empty: one sentence and New note, which creates a note and opens it', async () => {
    const { container } = await page()
    await waitFor(() => !!container.querySelector('[data-empty-state="notes"]'), 'the empty state')
    expect(container.querySelector('[data-empty-state="notes"] h2')!.textContent).toMatch(/listed here\.$/)
    await click(container.querySelector('[data-empty-action]')!)
    await waitFor(async () => (await db.notes.count()) === 1, 'a note')
    const note = (await db.notes.toArray())[0]
    expect(location.pathname).toBe(`/notes/${note.id}`)
  })

  it('/notes?new=1 creates a note, opens it and drops the parameter', async () => {
    history.replaceState(null, '', '/notes?new=1')
    await page()
    await waitFor(async () => (await db.notes.count()) === 1, 'a note')
    const note = (await db.notes.toArray())[0]
    await waitFor(() => location.pathname === `/notes/${note.id}`, 'the new note opened')
    expect(location.search).toBe('')
  })
})

describe('filters', () => {
  it('Tokens (notes-space): kind:note and in:<project> from the suggestions; the chips are remembered on the device', async () => {
    const reno = await createProject({ name: 'Renovation' })
    await createNote({ title: 'In Renovation', project_id: reno })
    await createNote({ title: 'Elsewhere' })
    await createTask({ title: 'Task in Renovation', project_id: reno, description: 'a task note' })
    const { container, unmount } = await page()
    await waitFor(() => rows(container).length === 3, 'three rows')
    const field = container.querySelector<HTMLInputElement>('[data-note-search]')!
    await act(async () => field.focus())
    await type(field, 'kind:note ')
    await waitFor(() => rows(container).length === 2, 'standalone only')
    expect(field.value).toBe('')
    expect(container.querySelector('[data-note-chip="kind"]')!.textContent).toBe('kind: note')
    await type(field, 'in:ren')
    const option = () => [...container.querySelectorAll<HTMLElement>('[data-note-suggestions] [role="option"]')].find((o) => o.textContent?.includes('Renovation'))
    await waitFor(() => !!option(), 'the project suggestion')
    await click(option()!)
    await waitFor(() => rows(container).length === 1, 'one row')
    expect(titles(container)).toEqual(['In Renovation'])
    expect(field.value).toBe('')
    expect(JSON.parse(localStorage.getItem(NOTE_TOKENS_KEY)!)).toEqual([{ key: 'kind', value: 'note' }, { key: 'in', id: reno, name: 'Renovation' }])
    await unmount()
    const again = await page()
    await waitFor(() => rows(again.container).length === 1, 'remembered')
  })

  it('Remove a chip: Backspace in the empty field, or its remove button; Enter still opens after a key prefix', async () => {
    await createNote({ title: 'pin numbers', description: 'the pin is 1234' })
    await createNote({ title: 'Other' })
    localStorage.setItem(NOTE_TOKENS_KEY, JSON.stringify([{ key: 'kind', value: 'note' }, { key: 'pinned' }]))
    const { container } = await page()
    await waitFor(() => !!container.querySelector('[data-note-chip="pinned"]'), 'the chips')
    expect(rows(container)).toHaveLength(0)
    const field = container.querySelector<HTMLInputElement>('[data-note-search]')!
    await key(field, 'Backspace')
    await waitFor(() => rows(container).length === 2, 'every standalone note')
    expect(container.querySelector('[data-note-chip="pinned"]')).toBeNull()
    await click(container.querySelector('[data-note-chip="kind"] button')!)
    expect(container.querySelector('[data-note-chip]')).toBeNull()
    await act(async () => field.focus())
    await type(field, 'pin')
    await waitFor(() => !!container.querySelector('[data-note-suggestions]'), 'the key suggestion')
    await key(field, 'Enter')
    await waitFor(() => location.pathname.startsWith('/notes/'), 'the first result opens')
    expect(container.querySelector('[data-note-chip]')).toBeNull()
  })

  it('Label filter: task notes and standalone notes with the label, no project notes', async () => {
    await db.labels.put({ id: 'l-ref', name: 'reference', color: '#0aa', position: 0, created_at: 0, deleted_at: null, _clock: {} })
    const p = await createProject({ name: 'House' })
    await mutate('project', p, { description: 'project note' })
    await createNote({ title: 'Labelled note', labels: ['l-ref'] })
    await createTask({ title: 'Labelled task', labels: ['l-ref'], description: 'task note' })
    await createNote({ title: 'Plain' })
    localStorage.setItem(NOTE_FILTERS_KEY, JSON.stringify({ source: 'all', projectId: null, labelId: 'l-ref' }))
    const { container } = await page()
    await waitFor(() => rows(container).length === 2, 'two rows')
    expect(titles(container).sort()).toEqual(['Labelled note', 'Labelled task'])
  })
})

describe('search', () => {
  it('Find a word in a long note: the snippet with the word highlighted, as text', async () => {
    await createNote({ title: 'Trip', description: 'Packing list and times: the ferry leaves at 7 <b>sharp</b>' })
    await createNote({ title: 'Groceries', description: 'oat milk' })
    const { container } = await page()
    await waitFor(() => rows(container).length === 2, 'two rows')
    await type(container.querySelector<HTMLInputElement>('[data-note-search]')!, 'ferry')
    await waitFor(() => rows(container).length === 1, 'one result')
    expect(titles(container)).toEqual(['Trip'])
    const mark = container.querySelector('[data-note-snippet] mark')!
    expect(mark.textContent).toBe('ferry')
    expect(container.querySelector('[data-note-snippet]')!.textContent).toContain('the ferry leaves at 7')
    // The note's text is never HTML.
    expect(container.querySelector('[data-note-snippet] b')).toBeNull()
  })
})

describe('keyboard', () => {
  it('/ focuses the search, Escape returns to the list, j moves and Enter opens', async () => {
    await createNote({ title: 'Alpha', description: 'ferry one' })
    await createNote({ title: 'Beta', description: 'ferry two' })
    await createNote({ title: 'Gamma', description: 'no match' })
    const { container } = await page()
    await waitFor(() => rows(container).length === 3, 'three rows')
    const search = container.querySelector<HTMLInputElement>('[data-note-search]')!
    await key(document.body, '/')
    expect(document.activeElement).toBe(search)
    await type(search, 'ferry')
    await waitFor(() => rows(container).length === 2, 'two results')
    await key(search, 'Escape')
    // The notes, without New note "ferry" above them (notes-home).
    const open = () => [...container.querySelectorAll<HTMLElement>('[data-note-open]:not([data-note-create])')]
    expect(document.activeElement).toBe(open()[0])
    await key(document.activeElement!, 'j')
    expect(document.activeElement).toBe(open()[1])
    await key(document.activeElement!, 'k')
    expect(document.activeElement).toBe(open()[0])
    const first = titles(container)[0]
    await key(document.activeElement!, 'Enter')
    const note = (await db.notes.toArray()).find((n) => n.title === first)!
    expect(location.pathname).toBe(`/notes/${note.id}`)
  })

  it('q starts a new note', async () => {
    await createNote({ title: 'Existing' })
    const { container } = await page()
    await waitFor(() => rows(container).length === 1, 'one row')
    await key(document.body, 'q')
    await waitFor(async () => (await db.notes.count()) === 2, 'a new note')
  })
})

describe('opening notes', () => {
  it('A standalone note opens docked in the panel on a computer', async () => {
    const id = await createNote({ title: 'Wi-Fi' })
    const { container } = await page(id)
    await waitFor(() => panelOccupant()?.kind === 'custom', 'the panel')
    expect((panelOccupant() as { key: string }).key).toBe(`note:${id}`)
    expect(container.querySelector('[aria-current="true"]')).toBeTruthy()
  })

  it('A standalone note is a page on a phone, with its title field', async () => {
    width = 390
    const id = await createNote({ title: 'Wi-Fi' })
    const { container } = await page(id)
    await waitFor(() => !!container.querySelector(`[data-note-page="${id}"]`), 'the note page')
    expect(container.querySelector<HTMLInputElement>('[data-note-title-field]')!.value).toBe('Wi-Fi')
    expect(panelOccupant()).toBeNull()
  })

  it('Open a project note: the project opens with its note in edit mode', async () => {
    const p = await createProject({ name: 'House' })
    await mutate('project', p, { description: 'Paint colours' })
    const { container } = await page()
    await waitFor(() => rows(container).length === 1, 'the project note')
    await click(container.querySelector('[data-note-open]')!)
    expect(location.pathname).toBe(`/project/${p}`)
    const project = (await db.projects.get(p))!
    const shown = await render(<ProjectNote project={project} />)
    await waitFor(() => !!shown.container.querySelector('[data-project-note="editing"]'), 'the note in edit mode')
  })
})

describe('phones', () => {
  it('Phone filters: no pickers or Filters sheet, the chips in the field; rows are one line at least 48 px; no New note in the header', async () => {
    width = 390
    await createNote({ title: 'One' })
    const { container } = await page()
    await waitFor(() => rows(container).length === 1, 'one row')
    expect(container.querySelector('[data-note-filter], [data-note-filters-button]')).toBeNull()
    expect(rows(container)[0].className).toContain('min-h-12')
    expect(container.querySelector('[data-note-search-field]')).not.toBeNull()
    // One add on a phone: the floating + (notes-home); the header has no New note.
    expect(container.querySelector('[data-note-new]')).toBeNull()
  })
})

describe('the note editor for a standalone note', () => {
  it('Unsupported commands: the slash menu offers no mention, image or make-subtask entry', async () => {
    // A shared project with a member, where a task's note would offer all three.
    const p = await createProject({ name: 'Family' })
    await db.memberships.put({ projectId: p, role: 'owner', ownerId: ME, members: [{ userId: ME, name: 'Me', email: 'me@x', role: 'owner' }, { userId: 'u-bob', name: 'Bob', email: 'bob@x', role: 'editor' }] } as never)
    const id = await createNote({ title: 'Shopping', project_id: p })
    const doc = newDoc()
    doc.transact(() => updateBody(activeBody(doc), [{ type: 'bullet_list', attrs: {}, content: [{ type: 'list_item', attrs: { checked: false }, content: [para('milk ')] }] }]))
    await mutate('note', id, { notes_doc: encodeDoc(doc) })
    width = 390
    const { container } = await page(id)
    const el = () => container.querySelector<HTMLElement>('.notes-editor[contenteditable]')
    await waitFor(() => !!el() && !el()!.classList.contains('is-empty'), 'the editor', 10_000)
    const v = noteViewOf(el()!) as EditorView
    v.focus()
    // The caret at the end of the check-list line, then `/`.
    v.dispatch(v.state.tr.setSelection((v.state.selection.constructor as typeof import('prosemirror-state').TextSelection).create(v.state.doc, v.state.doc.content.size - 3)))
    const { from, to } = v.state.selection
    if (!v.someProp('handleTextInput', (f) => f(v, from, to, '/', () => v.state.tr.insertText('/', from, to)))) v.dispatch(v.state.tr.insertText('/', from, to))
    const listbox = () => document.querySelector<HTMLElement>('[role="listbox"][data-suggest]')
    await waitFor(() => !!listbox(), 'the command menu')
    const options = [...listbox()!.querySelectorAll('[role="option"]')].map((o) => o.textContent ?? '')
    expect(options.some((o) => o.includes('Checklist'))).toBe(true)
    for (const missing of ['Mention', 'Image', 'Make subtask']) expect(options.some((o) => o.includes(missing)), missing).toBe(false)
  })
})

const search = (root: ParentNode) => root.querySelector<HTMLInputElement>('[data-note-search]')!
const newRow = (root: ParentNode) => root.querySelector<HTMLElement>('[data-note-new-row]')
const prefs = () => db.userPrefs.get('me')
const groupTitles = (root: ParentNode) => [...root.querySelectorAll('[data-notes-group] [data-group-label]')].map((e) => e.textContent)
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((b) => b.textContent?.startsWith(label))

describe('writing from the search field', () => {
  it('Write right away: `/`, a title nothing matches, Enter: the note is created and open, the field empty, one Undo', async () => {
    await createNote({ title: 'Trip', description: 'the ferry' })
    const { container } = await page()
    await waitFor(() => rows(container).length === 1, 'one row')
    await key(document.body, '/')
    await type(search(container), 'Packing for Lisbon')
    await waitFor(() => !!newRow(container), 'the New note row')
    expect(newRow(container)!.textContent).toBe('New note "Packing for Lisbon"')
    expect(newRow(container)!.hasAttribute('data-cursor')).toBe(true)
    await key(search(container), 'Enter')
    await waitFor(async () => (await db.notes.count()) === 2, 'a new note')
    const created = (await db.notes.toArray()).find((n) => n.title === 'Packing for Lisbon')!
    expect(created.project_id).toBeNull()
    await waitFor(() => location.pathname === `/notes/${created.id}`, 'the note open')
    await waitFor(() => search(container).value === '', 'the field cleared')
    expect(newRow(container)).toBeNull()
    const undo = (await db.assistantUndo.toArray()).find((u) => u.label === 'Note created')!
    await undoBatch(undo.id)
    expect((await db.notes.get(created.id))!.deleted_at).toBeTruthy()
  })

  it('the new note opens with the caret in its body', async () => {
    width = 390
    await createNote({ title: 'Existing' })
    const { container, unmount } = await page()
    await waitFor(() => rows(container).length === 1, 'one row')
    await type(search(container), 'Shopping')
    await key(search(container), 'Enter')
    await waitFor(async () => (await db.notes.count()) === 2, 'a new note')
    const created = (await db.notes.toArray()).find((n) => n.title === 'Shopping')!
    await unmount()
    const shown = await page(created.id)
    await waitFor(() => !!document.activeElement?.closest(`[data-note-page="${created.id}"] .notes-editor`), 'the caret in the body', 10_000)
    expect(shown.container.querySelector<HTMLInputElement>('[data-note-title-field]')!.value).toBe('Shopping')
  })

  it('Search still comes first: Enter opens the best match and creates nothing', async () => {
    const trip = await createNote({ title: 'Trip', description: 'the ferry leaves at 7' })
    const { container } = await page()
    await waitFor(() => rows(container).length === 1, 'one row')
    await type(search(container), 'ferry')
    await waitFor(() => !!newRow(container), 'the New note row')
    expect(newRow(container)!.hasAttribute('data-cursor')).toBe(false)
    expect(container.querySelector(`[data-note-key="note:${trip}"]`)!.hasAttribute('data-cursor')).toBe(true)
    await key(search(container), 'Enter')
    expect(location.pathname).toBe(`/notes/${trip}`)
    expect(await db.notes.count()).toBe(1)
  })

  it("Create although notes match: Up reaches New note, Enter creates it in the Project filter's project", async () => {
    const reno = await createProject({ name: 'Renovation' })
    await createNote({ title: 'Trip', description: 'ferry', project_id: reno })
    localStorage.setItem(NOTE_FILTERS_KEY, JSON.stringify({ source: 'all', projectId: reno, labelId: null }))
    const { container } = await page()
    await waitFor(() => rows(container).length === 1, 'one row')
    await type(search(container), 'ferry')
    await waitFor(() => !!newRow(container), 'the New note row')
    await key(search(container), 'ArrowUp')
    expect(newRow(container)!.hasAttribute('data-cursor')).toBe(true)
    await key(search(container), 'Enter')
    await waitFor(async () => (await db.notes.count()) === 2, 'a new note')
    const created = (await db.notes.toArray()).find((n) => n.title === 'ferry')!
    expect(created.project_id).toBe(reno)
  })

  it('Offline: the note is a local write in the outbox, kept in the database', async () => {
    const { container } = await page()
    await waitFor(() => !!container.querySelector('[data-empty-state="notes"]'), 'the empty state')
    await type(search(container), 'Offline idea')
    await waitFor(() => !!newRow(container), 'the New note row')
    await click(newRow(container)!.querySelector('button')!)
    await waitFor(async () => (await db.notes.count()) === 1, 'a new note')
    const id = (await db.notes.toArray())[0].id
    expect((await db.outbox.toArray()).some((o) => o.entity === 'note' && o.entityId === id && o.field === 'title' && o.value === 'Offline idea')).toBe(true)
  })

  it('on a phone the New note row is at least 48 px tall', async () => {
    width = 390
    const { container } = await page()
    await type(search(container), 'Idea')
    await waitFor(() => !!newRow(container), 'the New note row')
    expect(newRow(container)!.className).toContain('min-h-12')
  })
})

describe('pinned notes', () => {
  it('Pin from the row menu: Pinned first, then Recent; a search shows one list; `p` on the row unpins', async () => {
    const wifi = await createNote({ title: 'Wi-Fi', description: 'home-5G' })
    await createNote({ title: 'Trip', description: 'ferry' })
    const { container } = await page()
    await waitFor(() => rows(container).length === 2, 'two rows')
    expect(groupTitles(container)).toEqual([])
    expect(titles(container)).toEqual(['Trip', 'Wi-Fi'])
    await click(container.querySelector(`[data-note-key="note:${wifi}"] [data-note-menu]`)!)
    await waitFor(() => !!menuItem('Pin'), 'the menu')
    await click(menuItem('Pin')!)
    await waitFor(() => groupTitles(container).length === 2, 'the groups')
    expect(groupTitles(container)).toEqual(['Pinned', 'Recent'])
    expect(titles(container)).toEqual(['Wi-Fi', 'Trip'])
    expect(isFavourite(await prefs(), 'note', wifi)).toBe(true)
    await type(search(container), 'ferry')
    await waitFor(() => groupTitles(container).length === 0, 'one list while searching')
    await type(search(container), '')
    await waitFor(() => groupTitles(container).length === 2, 'the groups again')
    const button = container.querySelector<HTMLElement>(`[data-note-key="note:${wifi}"] [data-note-open]`)!
    button.focus()
    await key(button, 'p')
    await waitFor(() => groupTitles(container).length === 0, 'unpinned')
    expect(isFavourite(await prefs(), 'note', wifi)).toBe(false)
  })

  it('Trash and restore: a pinned note leaves Pinned in the Trash and is back after the restore', async () => {
    const wifi = await createNote({ title: 'Wi-Fi' })
    await createNote({ title: 'Other' })
    await pin('note', wifi)
    const { container } = await page()
    await waitFor(() => groupTitles(container).length === 2, 'the groups')
    const trashed = await trashNote(wifi)
    await waitFor(() => groupTitles(container).length === 0, 'no groups while in the Trash')
    await undoBatch(trashed.entry!.id)
    await waitFor(() => groupTitles(container).length === 2, 'pinned again')
    expect(titles(container)[0]).toBe('Wi-Fi')
  })

  it('task notes are not pinnable: their rows have no menu', async () => {
    await createTask({ title: 'Task', description: 'a task note' })
    const { container } = await page()
    await waitFor(() => rows(container).length === 1, 'one row')
    expect(container.querySelector('[data-note-menu]')).toBeNull()
  })

  it("the open note's own menu pins it", async () => {
    const id = await createNote({ title: 'Wi-Fi' })
    const { container } = await render(<NotePanel id={id} />)
    await waitFor(() => !!container.querySelector('[data-note-menu]'), 'the note menu')
    await click(container.querySelector('[data-note-menu]')!)
    await waitFor(() => !!menuItem('Pin'), 'the menu')
    await click(menuItem('Pin')!)
    await waitFor(async () => isFavourite(await prefs(), 'note', id), 'pinned')
  })
})

describe('Unlinked', () => {
  it('orphan lists the standalone notes nothing links to, outgoing links ignored; linked: lists what links either way', async () => {
    const trip = await createNote({ title: 'Trip' })
    await createNote({ title: 'Ideas', description: `go on [Trip](?note=${trip})` })
    await createTask({ title: 'Book', description: `see [Trip](?note=${trip})` })
    const { container } = await page()
    await waitFor(() => rows(container).length === 3, 'three rows')
    const field = container.querySelector<HTMLInputElement>('[data-note-search]')!
    await type(field, 'orphan ')
    await waitFor(() => titles(container).length === 1, 'the unlinked note')
    expect(titles(container)).toEqual(['Ideas'])
    await click(container.querySelector('[data-note-chip="orphan"] button')!)
    await type(field, 'linked:Trip ')
    await waitFor(() => titles(container).length === 2, 'what links to Trip')
    expect(titles(container).sort()).toEqual(['Book', 'Ideas'])
  })

  it('a stored Unlinked filter of an earlier version becomes the orphan chip', async () => {
    const trip = await createNote({ title: 'Trip' })
    await createNote({ title: 'Ideas', description: `go on [Trip](?note=${trip})` })
    localStorage.setItem(NOTE_FILTERS_KEY, JSON.stringify({ source: 'unlinked', projectId: null, labelId: null }))
    const { container } = await page()
    await waitFor(() => titles(container).length === 1, 'the unlinked note')
    expect(titles(container)).toEqual(['Ideas'])
    expect(container.querySelector('[data-note-chip="orphan"]')).not.toBeNull()
  })
})

describe('the row (notes-space D5)', () => {
  it('is one line: kind, title, where it lives, labels, time', async () => {
    await db.labels.put({ id: 'l-err', name: 'errand', color: '#0aa', position: 0, created_at: 0, deleted_at: null, _clock: {} })
    const p = await createProject({ name: 'Home' })
    await createTask({ title: 'Call the plumber', project_id: p, labels: ['l-err'], description: 'ask about the boiler' })
    await createTask({ title: 'Loose', description: 'no project' })
    const { container } = await page()
    await waitFor(() => rows(container).length === 2, 'two rows')
    const row = container.querySelector('[data-note-key^="task:"][data-note-key]')!
    const plumber = [...rows(container)].find((r) => r.textContent?.includes('plumber'))!
    expect(plumber.querySelector('[data-note-place]')!.textContent).toBe('Home')
    expect(plumber.querySelector('[data-note-labels]')!.textContent).toContain('errand')
    expect(plumber.querySelector('time')).not.toBeNull()
    expect(plumber.textContent).not.toContain('boiler')
    expect(row.className).toContain('@container/note')
    const loose = [...rows(container)].find((r) => r.textContent?.includes('Loose'))!
    expect(loose.querySelector('[data-note-place]')!.textContent).toBe('Inbox')
  })

  it('while searching, the snippet follows the title on the same line', async () => {
    await createNote({ title: 'Trip', description: 'the ferry leaves at 7' })
    const { container } = await page()
    await waitFor(() => rows(container).length === 1, 'one row')
    await type(container.querySelector<HTMLInputElement>('[data-note-search]')!, 'ferry')
    await waitFor(() => !!container.querySelector('[data-note-snippet] mark'), 'the snippet')
    expect(container.querySelector('[data-note-snippet]')!.parentElement!.querySelector('[data-note-title]')!.textContent).toBe('Trip')
  })
})

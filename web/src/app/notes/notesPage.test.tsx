// @vitest-environment happy-dom
// The Notes page (OpenSpec change notes-overview, tasks 4.3 and 4.8): the list of
// the three sources, 50 at a time with Show more, the filters, the search with its
// highlighted snippet, the keyboard, the empty state, opening a note, the phone's
// Filters sheet, and the note editor without mentions, images or Make subtask.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { EditorView } from 'prosemirror-view'
import { db, useDatabase } from '../../lib/db'
import { createNote, planNote } from '../../lib/noteOps'
import { createProject, createTask, mutate, mutateMany, resetDeviceId, updateTask } from '../../lib/ops'
import { activeBody, encodeDoc, newDoc, updateBody, type RNode } from '../../lib/richtext'
import { setCurrentUserId } from '../../lib/sharing'
import { click, flush, key, minWidthPx, render, type, waitFor } from '../../ui/test-utils'
import { noteViewOf } from '../NotesEditor'
import { panelOccupant, resetPanel } from '../panel'
import { ProjectNote } from '../ProjectNote'
import { NOTE_FILTERS_KEY, NotesPage } from './NotesPage'

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
  it('Only standalone in one project; the choice is remembered on the device', async () => {
    const reno = await createProject({ name: 'Renovation' })
    await createNote({ title: 'In Renovation', project_id: reno })
    await createNote({ title: 'Elsewhere' })
    await createTask({ title: 'Task in Renovation', project_id: reno, description: 'a task note' })
    const { container, unmount } = await page()
    await waitFor(() => rows(container).length === 3, 'three rows')
    await click(container.querySelector('[data-note-filter="source"]')!)
    await click([...document.querySelectorAll('[role="menuitemcheckbox"]')].find((b) => b.textContent === 'Standalone only')!)
    await waitFor(() => rows(container).length === 2, 'standalone only')
    await click(container.querySelector('[data-note-filter="project"]')!)
    const option = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes('Renovation'))
    await waitFor(() => !!option(), 'the project option')
    await click(option()!)
    await waitFor(() => rows(container).length === 1, 'one row')
    expect(titles(container)).toEqual(['In Renovation'])
    expect(JSON.parse(localStorage.getItem(NOTE_FILTERS_KEY)!)).toEqual({ source: 'note', projectId: reno, labelId: null })
    await unmount()
    const again = await page()
    await waitFor(() => rows(again.container).length === 1, 'remembered')
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
    const mark = container.querySelector('[data-note-preview] mark')!
    expect(mark.textContent).toBe('ferry')
    expect(container.querySelector('[data-note-preview]')!.textContent).toContain('the ferry leaves at 7')
    // The note's text is never HTML.
    expect(container.querySelector('[data-note-preview] b')).toBeNull()
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
    const open = () => [...container.querySelectorAll<HTMLElement>('[data-note-open]')]
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
  it('Phone filters: the Filters button opens a sheet with Source, Project and Label; rows are at least 48 px', async () => {
    width = 390
    await createNote({ title: 'One' })
    const { container } = await page()
    await waitFor(() => rows(container).length === 1, 'one row')
    expect(container.querySelector('[data-note-filter]')).toBeNull()
    expect(rows(container)[0].className).toContain('min-h-12')
    await click(container.querySelector('[data-note-filters-button]')!)
    await waitFor(() => !!document.querySelector('[data-note-filters-sheet]'), 'the sheet')
    const sheet = document.querySelector('[data-note-filters-sheet]')!
    expect([...sheet.querySelectorAll('[data-note-filter]')].map((e) => e.getAttribute('data-note-filter'))).toEqual(['source', 'project', 'label'])
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

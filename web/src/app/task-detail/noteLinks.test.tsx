// @vitest-environment happy-dom
// Links between notes, tasks and projects in the task panel (OpenSpec change
// note-links): the `[[` picker (ranking, New note in one batch with one Undo,
// Escape, a shared project's scope, no picker for a viewer), links that read as
// their target's current title (renamed, in the Trash, restored) without writing,
// and Linked references below the task's notes. The editor is driven through its
// own handlers, as key presses and typed text reach it.
import 'fake-indexeddb/auto'
import type { EditorView } from 'prosemirror-view'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { resetLinkIndex } from '../../lib/noteLinks'
import { createNote } from '../../lib/noteOps'
import { createProject, createTask, mutate } from '../../lib/ops'
import { renderMarkdown } from '../../lib/richtext'
import { pmToModel } from '../../lib/richtextEditor'
import { click, flush } from '../../ui/test-utils'
import { noteViewOf } from '../NotesEditor'
import { membership, ME, open, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()
afterEach(() => resetLinkIndex())

const editorEl = (root: ParentNode) => root.querySelector<HTMLElement>('.notes-editor[contenteditable]')

async function editorOf(container: HTMLElement, filled = false): Promise<EditorView> {
  await waitFor(() => !!editorEl(container) && (!filled || !editorEl(container)!.classList.contains('is-empty')), 'the notes editor')
  const v = noteViewOf(editorEl(container)!)!
  v.focus()
  await flush()
  return v
}

async function typeText(v: EditorView, text: string) {
  for (const ch of text) {
    const { from, to } = v.state.selection
    const handled = v.someProp('handleTextInput', (f) => f(v, from, to, ch, () => v.state.tr.insertText(ch, from, to)))
    if (!handled) v.dispatch(v.state.tr.insertText(ch, from, to))
    await flush(0)
  }
  await flush()
}

async function press(v: EditorView, key: string, mods: KeyboardEventInit = {}) {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })
  const handled = v.someProp('handleKeyDown', (f) => f(v, ev))
  await flush()
  return !!handled
}

const md = (v: EditorView) => renderMarkdown(pmToModel(v.state.doc))
const picker = () => document.querySelector<HTMLElement>('[role="listbox"][data-suggest="link"]')
const options = () => [...(picker()?.querySelectorAll('[role="option"]') ?? [])].map((o) => o.textContent ?? '')
const chips = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>('.notes-editor .note-ref')]

describe('the [[ picker', () => {
  it('links a task: the link reads as its title, and the task lists the note under Linked references', async () => {
    const target = await createTask({ title: 'Call the plumber' })
    await createTask({ title: 'Plumbing budget' })
    await createNote({ title: 'Kitchen plumbing ideas' })
    const id = await createTask({ title: 'Kitchen meeting' })
    const { container, unmount } = await open(id)
    const v = await editorOf(container)
    await typeText(v, 'Next: [[call plum')
    await waitFor(() => options().length > 0, 'the picker')
    expect(picker()!.getAttribute('aria-label')).toBe('Link to')
    expect(options()[0]).toContain('Call the plumber')
    expect(options().at(-1)).toBe('New note "call plum"')
    expect(await press(v, 'Enter')).toBe(true)
    expect(picker()).toBeNull()
    expect(md(v)).toBe(`Next: [Call the plumber](?task=${target})`)
    await waitFor(() => chips(container)[0]?.textContent === 'Call the plumber', 'the link chip')
    v.dom.blur()
    await waitFor(async () => ((await db.tasks.get(id))?.description ?? '').includes(`(?task=${target})`), 'the saved note', 5000)
    await unmount()
    // The target's panel lists the note that links to it.
    const t = await open(target)
    await waitFor(() => !!t.container.querySelector('[data-linked-references]'), 'Linked references', 5000)
    const section = t.container.querySelector('[data-linked-references]')!
    expect(section.textContent).toContain('Linked references1')
    expect(section.querySelector(`[data-linked-ref="task:${id}"]`)!.textContent).toContain('Kitchen meeting')
    expect(section.querySelector('.linked-ref__link')!.textContent).toBe('Call the plumber')
    await t.unmount()
  })

  it('groups notes, tasks and projects, and Escape keeps the typed text', async () => {
    await createProject({ name: 'Garden' })
    await createTask({ title: 'Garden hose' })
    await createNote({ title: 'Garden plan' })
    const id = await createTask({ title: 'Saturday' })
    const { container, unmount } = await open(id)
    const v = await editorOf(container)
    await typeText(v, '[[gard')
    await waitFor(() => options().length === 4, 'the picker')
    expect([...picker()!.querySelectorAll('.link-menu__group')].map((g) => g.textContent)).toEqual(['Notes', 'Tasks', 'Projects'])
    expect(options().slice(0, 3)).toEqual(['Garden plan', 'Garden hose', 'Garden'])
    await typeText(v, 'zz')
    expect(options()).toEqual(['New note "gardzz"'])
    expect(await press(v, 'Escape')).toBe(true)
    expect(picker()).toBeNull()
    expect(md(v)).toBe('\\[\\[gardzz')
    await unmount()
  })

  it('New note creates the note in the project and links it in one batch; one Undo removes both', async () => {
    const pid = await createProject({ name: 'Renovation' })
    const id = await createTask({ title: 'Choose paint', project_id: pid })
    const { container, unmount } = await open(id)
    const v = await editorOf(container)
    await typeText(v, '[[Paint colours')
    await waitFor(() => options().at(-1) === 'New note "Paint colours"', 'the New note row')
    // Up from the first row wraps to the last.
    await press(v, 'ArrowUp')
    await press(v, 'Enter')
    const byTitle = async () => (await db.notes.toArray()).find((n) => n.title === 'Paint colours')
    await waitFor(async () => !!(await byTitle()), 'the new note', 5000)
    const created = (await byTitle())!
    expect(created.project_id).toBe(pid)
    expect(md(v)).toBe(`[Paint colours](?note=${created.id})`)
    await waitFor(async () => ((await db.tasks.get(id))?.description ?? '').includes(`(?note=${created.id})`), 'the note saved with the new note', 5000)
    await press(v, 'z', { ctrlKey: true })
    expect(md(v)).toBe('\\[\\[Paint colours')
    await waitFor(async () => !!(await db.notes.get(created.id))?.deleted_at, 'the new note removed', 5000)
    await unmount()
  })

  it('in a note of a shared project offers only that project', async () => {
    const shared = await createProject({ name: 'Renovation' })
    await membership(shared, ME, 'u-ana')
    await createTask({ title: 'Tile the bathroom', project_id: shared })
    await createTask({ title: 'Tax return' })
    await createNote({ title: 'Tiles I like' })
    const id = await createTask({ title: 'Order', project_id: shared })
    const { container, unmount } = await open(id)
    const v = await editorOf(container)
    await typeText(v, '[[t')
    await waitFor(() => options().length > 0, 'the picker')
    // The project's own task and the project itself; not the personal task or note.
    expect(options().filter((o) => !o.startsWith('New note'))).toEqual(['Tile the bathroomRenovation', 'Renovation'])
    await unmount()
  })

  it('a viewer’s read-only note opens no picker', async () => {
    const id = await createTask({ title: 'Read me' })
    await createTask({ title: 'Anything' })
    const { container, unmount } = await open(id, { readOnly: true })
    await waitFor(() => !!container.querySelector('.notes-editor'), 'the notes')
    const v = noteViewOf(container.querySelector('.notes-editor')!)!
    expect(v.editable).toBe(false)
    v.dispatch(v.state.tr.insertText('[[an'))
    await flush()
    expect(picker()).toBeNull()
    await unmount()
  })

  it('Link to… in the / menu opens the picker', async () => {
    await createNote({ title: 'Trip' })
    const id = await createTask({ title: 'Plan' })
    const { container, unmount } = await open(id)
    const v = await editorOf(container)
    await typeText(v, '/link to')
    await waitFor(() => !!document.querySelector('[data-suggest="slash"] [role="option"]'), 'the menu')
    expect(document.querySelector('[data-suggest="slash"] [role="option"]')!.textContent).toBe('Link to…')
    await press(v, 'Enter')
    await waitFor(() => options().includes('Trip'), 'the picker')
    expect(md(v)).toBe('\\[\\[')
    await unmount()
  })
})

describe('links read as their target now', () => {
  it('a rename shows at once and writes nothing; the Trash mutes the link; a restore brings it back', async () => {
    const note = await createNote({ title: 'Trip' })
    const id = await createTask({ title: 'Book ferry', description: `For [Trip](?note=${note})` })
    const { container, unmount } = await open(id)
    await editorOf(container, true)
    await waitFor(() => chips(container)[0]?.textContent === 'Trip', 'the link')
    const before = await db.outbox.count()
    await mutate('note', note, { title: 'Holiday' })
    const afterRename = await db.outbox.count()
    await waitFor(() => chips(container)[0]?.textContent === 'Holiday', 'the renamed link')
    expect(chips(container)[0].dataset.refState).toBe('live')
    await flush(500)
    // Only the rename was written: showing the new title is not a write.
    expect(await db.outbox.count()).toBe(afterRename)
    expect(afterRename).toBeGreaterThan(before)
    expect((await db.tasks.get(id))!.description).toBe(`For [Trip](?note=${note})`)
    await mutate('note', note, { deleted_at: Date.now() })
    await waitFor(() => chips(container)[0]?.dataset.refState === 'muted', 'the muted link')
    expect(chips(container)[0].textContent).toBe('Trip')
    expect(chips(container)[0].tagName).toBe('SPAN')
    await mutate('note', note, { deleted_at: null })
    await waitFor(() => chips(container)[0]?.dataset.refState === 'live', 'the restored link')
    await unmount()
  })

  it('a link to something this device does not have reads muted, like one in the Trash', async () => {
    const id = await createTask({ title: 'Shared', description: '[Private plan](?note=not-here)' })
    const { container, unmount } = await open(id)
    await editorOf(container, true)
    await waitFor(() => chips(container)[0]?.dataset.refState === 'muted', 'the muted link')
    expect(chips(container)[0].textContent).toBe('Private plan')
    await unmount()
  })

  it('removing the only link hides Linked references', async () => {
    const target = await createTask({ title: 'Trip' })
    const source = await createTask({ title: 'Book ferry', description: `[Trip](?task=${target})` })
    const t = await open(target)
    await waitFor(() => !!t.container.querySelector(`[data-linked-ref="task:${source}"]`), 'Linked references', 5000)
    await mutate('task', source, { description: 'no link' })
    await waitFor(() => !t.container.querySelector('[data-linked-references]'), 'the section gone', 5000)
    await t.unmount()
  })
})

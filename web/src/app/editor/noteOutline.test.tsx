// @vitest-environment happy-dom
// A note's outline (OpenSpec change note-outline, tasks 1.2 and 1.3): the column beside
// a wide note and the Outline menu elsewhere, jumping with the caret or focus, short
// notes, remote headings, Ctrl+Shift+O, the arrows and Esc.
import 'fake-indexeddb/auto'
import { act } from 'react'
import type { EditorView } from 'prosemirror-view'
import { afterEach, describe, expect, it } from 'vitest'
import { db } from '../../lib/db'
import { mutate } from '../../lib/ops'
import { createNote } from '../../lib/noteOps'
import { activeBody, decodeDoc, encodeDoc, newDoc, toModel, updateBody, type RNode } from '../../lib/richtext'
import { click, flush, key, render } from '../../ui/test-utils'
import { noteViewOf } from '../NotesEditor'
import NotesEditor from '../NotesEditor'
import { NotePanel } from '../notes/NoteEditor'
import { open, setupTaskDetailTests, waitFor } from '../task-detail/taskDetail.testkit'

setupTaskDetailTests()

const run = (t: string) => ({ text: t, marks: {} })
const h = (level: number, t: string): RNode => ({ type: 'heading', attrs: { level }, runs: [run(t)] })
const p = (t: string): RNode => ({ type: 'paragraph', attrs: {}, runs: [run(t)] })
const docOf = (nodes: RNode[]) => {
  const d = newDoc()
  d.transact(() => updateBody(activeBody(d), nodes))
  return encodeDoc(d)
}
const editorEl = (root: ParentNode) => root.querySelector<HTMLElement>('.notes-editor')
async function viewOf(root: ParentNode): Promise<EditorView> {
  await waitFor(() => !!editorEl(root) && !editorEl(root)!.classList.contains('is-empty'), 'the notes editor')
  return noteViewOf(editorEl(root)!)!
}
const items = () => [...document.querySelectorAll<HTMLButtonElement>('[data-outline-item]')]
const headingAtCaret = (v: EditorView) => v.state.selection.$from.parent
const trip = [h(1, 'Flights'), p('Tuesday at 9'), h(2, 'Hotels'), p('Two nights'), h(2, 'Days'), p('Walks')]

// The room around a docked note is 64 rem wide; layout is not computed in the test DOM.
const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')!
function wideRoom() {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get(this: HTMLElement) { return this.hasAttribute('data-outline-room') ? 1024 : 0 } })
}
afterEach(() => Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth))

describe('the outline', () => {
  it('Jump to a section: the column beside a wide note, the caret at "Days", marked current', async () => {
    wideRoom()
    const id = await createNote({ title: 'Trip' })
    await mutate('note', id, { notes_doc: docOf(trip) })
    const { container, unmount } = await render(<NotePanel id={id} />)
    const v = await viewOf(document)
    await waitFor(() => !!document.querySelector('[data-note-outline="column"]'), 'the outline column')
    expect(document.querySelector('[data-outline-open]')).toBeNull()
    expect(document.querySelector('.notes-frame')!.getAttribute('data-outline')).toBe('column')
    expect(items().map((b) => b.textContent)).toEqual(['Flights', 'Hotels', 'Days'])
    await click(items()[2])
    expect(headingAtCaret(v).textContent).toBe('Days')
    expect(v.state.selection.$from.parentOffset).toBe(0)
    expect(document.activeElement).toBe(v.dom)
    expect(items()[2].getAttribute('aria-current')).toBe('location')
    expect(container).toBeTruthy()
    await unmount()
  })

  it('Docked panel: a task note with four headings shows the Outline button and its menu', async () => {
    const { createTask } = await import('../../lib/ops')
    const id = await createTask({ title: 'Plan' })
    await mutate('task', id, { notes_doc: docOf([...trip, h(3, 'Budget')]) })
    const { container, unmount } = await open(id)
    await viewOf(container)
    await waitFor(() => !!container.querySelector('[data-outline-open]'), 'the Outline button')
    expect(container.querySelector('[data-note-outline="column"]')).toBeNull()
    await click(container.querySelector('[data-outline-open]')!)
    await waitFor(() => items().length === 4, 'the outline menu')
    expect(items().map((b) => b.textContent)).toEqual(['Flights', 'Hotels', 'Days', 'Budget'])
    expect(items()[3].getAttribute('role')).toBe('menuitem')
    await unmount()
  })

  it('Short note: two headings show neither the column nor the button', async () => {
    wideRoom()
    const id = await createNote({ title: 'Short' })
    await mutate('note', id, { notes_doc: docOf([h(1, 'One'), p('a'), h(2, 'Two')]) })
    const { unmount } = await render(<NotePanel id={id} />)
    await viewOf(document)
    await flush()
    expect(document.querySelector('[data-note-outline]')).toBeNull()
    expect(document.querySelector('.notes-frame')!.hasAttribute('data-outline')).toBe(false)
    await unmount()
  })

  it('Remote heading: a heading written on another device appears in place', async () => {
    const { createTask } = await import('../../lib/ops')
    const id = await createTask({ title: 'Plan' })
    await mutate('task', id, { notes_doc: docOf(trip) })
    const { container, unmount } = await open(id)
    await viewOf(container)
    await click(await waitFor(() => !!container.querySelector('[data-outline-open]'), 'the button').then(() => container.querySelector('[data-outline-open]')!))
    await waitFor(() => items().length === 3, 'three headings')
    await key(document.activeElement!, 'Escape')
    // Another device adds "Budget" after Hotels.
    const stored = decodeDoc((await db.tasks.get(id))!.notes_doc!)!
    const model = toModel(activeBody(stored))
    stored.transact(() => updateBody(activeBody(stored), [...model.slice(0, 4), h(2, 'Budget'), ...model.slice(4)]))
    await mutate('task', id, { notes_doc: encodeDoc(stored) })
    await click(container.querySelector('[data-outline-open]')!)
    await waitFor(() => items().length === 4, 'the new heading')
    expect(items().map((b) => b.textContent)).toEqual(['Flights', 'Hotels', 'Budget', 'Days'])
    await unmount()
  })

  it('Read-only: choosing a heading scrolls to it and focuses it; the note stays read-only', async () => {
    const id = await createNote({ title: 'Brief' })
    const notes_doc = docOf(trip)
    const { container, unmount } = await render(<NotesEditor note={{ entity: 'note', id, notes_doc }} readOnly />)
    const v = await viewOf(container)
    await click(container.querySelector('[data-outline-open]')!)
    await waitFor(() => items().length === 3, 'the outline menu')
    await click(items()[1])
    await waitFor(() => document.activeElement?.textContent === 'Hotels', 'the heading focused')
    expect(document.activeElement!.tagName).toBe('H2')
    expect(v.dom.getAttribute('contenteditable')).toBe('false')
    expect(v.editable).toBe(false)
    await unmount()
  })
})

describe('the outline from the keyboard', () => {
  const ctrlShiftO = { key: 'O', code: 'KeyO', keyCode: 79, ctrlKey: true, shiftKey: true } as KeyboardEventInit

  it('Keyboard only: Ctrl+Shift+O, ↓ twice and Enter put the caret at the third heading', async () => {
    const { createTask } = await import('../../lib/ops')
    const id = await createTask({ title: 'Plan' })
    await mutate('task', id, { notes_doc: docOf([...trip, h(2, 'Budget'), h(2, 'Packing')]) })
    const { container, unmount } = await open(id)
    const v = await viewOf(container)
    await act(async () => v.focus())
    await key(v.dom, 'O', ctrlShiftO)
    await waitFor(() => items().length === 5 && document.activeElement === items()[0], 'the menu on its first heading')
    await key(document.activeElement!, 'ArrowDown')
    await key(document.activeElement!, 'ArrowDown')
    expect(document.activeElement).toBe(items()[2])
    await click(document.activeElement!) // Enter on a native button activates it
    await waitFor(() => items().length === 0, 'the menu closed')
    expect(headingAtCaret(v).textContent).toBe('Days')
    expect(document.activeElement).toBe(v.dom)
    await unmount()
  })

  it('Esc returns: focus is back in the note at the same caret, from the column too', async () => {
    wideRoom()
    const id = await createNote({ title: 'Trip' })
    await mutate('note', id, { notes_doc: docOf(trip) })
    const { unmount } = await render(<NotePanel id={id} />)
    const v = await viewOf(document)
    await waitFor(() => items().length === 3, 'the column')
    await act(async () => v.focus())
    const { TextSelection } = await import('prosemirror-state')
    act(() => v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 12))))
    const caret = v.state.selection.from
    await key(v.dom, 'O', ctrlShiftO)
    // On the current heading (here the last: the test DOM has no layout, every heading is at the top).
    expect(items()).toContain(document.activeElement)
    await key(document.activeElement!, 'Home')
    expect(document.activeElement).toBe(items()[0])
    await key(document.activeElement!, 'End')
    expect(document.activeElement).toBe(items()[2])
    await key(document.activeElement!, 'Escape')
    expect(document.activeElement).toBe(v.dom)
    expect(v.state.selection.from).toBe(caret)
    await unmount()
  })
})

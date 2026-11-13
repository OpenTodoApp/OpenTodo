// @vitest-environment happy-dom
// The Markdown source mode (OpenSpec change note-markdown-source, tasks 1.2, 2.1 and
// 2.2): Ctrl+Shift+M, the Markdown button and the slash entry, fixing a list, a remote
// edit while typing, a viewer's source, and the mode not remembered.
import 'fake-indexeddb/auto'
import { act } from 'react'
import type { EditorView } from 'prosemirror-view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { createProject, createTask, mutate, updateProject } from '../../lib/ops'
import { activeBody, decodeDoc, encodeDoc, newDoc, renderMarkdown, toModel, updateBody, type RNode } from '../../lib/richtext'
import { pmToModel } from '../../lib/richtextEditor'
import { click, flush, key, render, type } from '../../ui/test-utils'
import { noteViewOf } from '../NotesEditor'
import { TaskListView } from '../TaskListView'
import { open, setupTaskDetailTests, waitFor } from '../task-detail/taskDetail.testkit'

setupTaskDetailTests()
afterEach(() => vi.unstubAllGlobals())

const run = (t: string) => ({ text: t, marks: {} })
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
const sourceEl = () => document.querySelector<HTMLTextAreaElement>('textarea[data-notes-source]')
const md = (v: EditorView) => renderMarkdown(pmToModel(v.state.doc))
const ctrlShiftM = { key: 'M', code: 'KeyM', keyCode: 77, ctrlKey: true, shiftKey: true } as KeyboardEventInit
const plan: RNode[] = [{ type: 'heading', attrs: { level: 1 }, runs: [run('Plan')] },
  { type: 'bullet_list', attrs: {}, content: [{ type: 'list_item', attrs: { checked: false }, content: [p('book the ferry')] }] }]

describe('the Markdown source', () => {
  it('Open the source: Ctrl+Shift+M shows the Markdown, again shows the rich text', async () => {
    const id = await createTask({ title: 'Trip' })
    await mutate('task', id, { notes_doc: docOf(plan) })
    const { container, unmount } = await open(id)
    const v = await viewOf(container)
    await act(async () => v.focus())
    await key(v.dom, 'M', ctrlShiftM)
    await waitFor(() => !!sourceEl(), 'the source')
    expect(sourceEl()!.value).toBe('# Plan\n\n- [ ] book the ferry')
    expect(document.activeElement).toBe(sourceEl())
    expect(container.querySelector('.notes-host')!.hasAttribute('hidden')).toBe(true)
    expect(container.querySelector('[data-notes-source-toggle]')!.getAttribute('aria-pressed')).toBe('true')
    await key(sourceEl()!, 'M', ctrlShiftM)
    await waitFor(() => !sourceEl(), 'the rich text')
    expect(v.dom.querySelector('h1')!.textContent).toBe('Plan')
    expect(v.dom.querySelector('li')).not.toBeNull()
    await unmount()
  })

  it('Fix a list: `1. milk` becomes `- milk`, stored, with the caret back in its block', async () => {
    const id = await createTask({ title: 'Shop' })
    await mutate('task', id, { notes_doc: docOf([p('Groceries'), { type: 'ordered_list', attrs: { order: 1 }, content: [{ type: 'list_item', attrs: { checked: null }, content: [p('milk')] }] }]) })
    const { container, unmount } = await open(id)
    const v = await viewOf(container)
    await click(container.querySelector('[data-notes-source-toggle]')!)
    await waitFor(() => !!sourceEl(), 'the source')
    expect(sourceEl()!.value).toBe('Groceries\n\n1. milk')
    await type(sourceEl()!, 'Groceries\n\n- milk')
    sourceEl()!.setSelectionRange(14, 14)
    await click(container.querySelector('[data-notes-source-toggle]')!)
    await waitFor(() => !sourceEl(), 'the rich text')
    expect(md(v)).toBe('Groceries\n\n- milk')
    expect(v.state.selection.$from.node(1).type.name).toBe('bullet_list')
    await waitFor(async () => (await db.tasks.get(id))?.description === 'Groceries\n\n- milk', 'the note saved')
    const stored = decodeDoc((await db.tasks.get(id))!.notes_doc!)!
    expect(toModel(activeBody(stored))[1].type).toBe('bullet_list')
    await unmount()
  })

  it('the slash menu\'s Markdown opens the source', async () => {
    const id = await createTask({ title: 'Trip' })
    await mutate('task', id, { notes_doc: docOf([p('x')]) })
    const { container, unmount } = await open(id)
    const v = await viewOf(container)
    await act(async () => { v.focus() })
    for (const ch of ' /markdown') {
      const { from, to } = v.state.selection
      await act(async () => { if (!v.someProp('handleTextInput', (f) => f(v, from, to, ch, () => v.state.tr.insertText(ch, from, to)))) v.dispatch(v.state.tr.insertText(ch, from, to)) })
    }
    await waitFor(() => !!document.querySelector('[data-suggest="slash"] [role="option"]'), 'the menu')
    expect(document.querySelector('[data-suggest="slash"] [role="option"]')!.textContent).toBe('Markdown')
    await act(async () => { v.someProp('handleKeyDown', (f) => f(v, new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))) })
    await waitFor(() => !!sourceEl(), 'the source')
    expect(sourceEl()!.value.trim()).toBe('x')
    await unmount()
  })

  it('Remote edit while typing: the new last paragraph shows, the caret stays where the user types', async () => {
    const id = await createTask({ title: 'Notes' })
    await mutate('task', id, { notes_doc: docOf([p('first'), p('middle'), p('last')]) })
    const { container, unmount } = await open(id)
    const v = await viewOf(container)
    await click(container.querySelector('[data-notes-source-toggle]')!)
    await waitFor(() => !!sourceEl(), 'the source')
    await type(sourceEl()!, 'first typed\n\nmiddle\n\nlast')
    sourceEl()!.setSelectionRange(11, 11)
    // Another device changes the last paragraph (from the stored document, which has not seen the typing yet).
    const other = decodeDoc((await db.tasks.get(id))!.notes_doc!)!
    other.transact(() => updateBody(activeBody(other), [p('first'), p('middle'), p('last, changed elsewhere')]))
    await mutate('task', id, { notes_doc: encodeDoc(other) })
    await waitFor(() => sourceEl()!.value === 'first typed\n\nmiddle\n\nlast, changed elsewhere', 'the remote paragraph')
    expect(sourceEl()!.selectionStart).toBe(11)
    expect(md(v)).toBe('first typed\n\nmiddle\n\nlast, changed elsewhere')
    await unmount()
  })

  it('Not remembered: a note closed in source mode opens as rich text', async () => {
    const id = await createTask({ title: 'Trip' })
    await mutate('task', id, { notes_doc: docOf(plan) })
    const first = await open(id)
    await viewOf(first.container)
    await click(first.container.querySelector('[data-notes-source-toggle]')!)
    await waitFor(() => !!sourceEl(), 'the source')
    await first.unmount()
    const again = await open(id)
    await viewOf(again.container)
    await flush()
    expect(sourceEl()).toBeNull()
    expect(again.container.querySelector('.notes-host')!.hasAttribute('hidden')).toBe(false)
    await again.unmount()
  })

  it('Viewer: a project note\'s source is shown and cannot be edited', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    const pid = await createProject({ name: 'Brief' })
    await updateProject(pid, { description: '## Goals\n\n- ship it' })
    await db.memberships.put({ projectId: pid, role: 'viewer', ownerId: 'someone', members: [] })
    const r = await render(<TaskListView route={{ view: 'project', id: pid }} />)
    await waitFor(() => !!r.container.querySelector('[data-project-note] [data-notes-source-toggle]'), 'the Markdown button')
    await click(r.container.querySelector('[data-project-note] [data-notes-source-toggle]')!)
    await waitFor(() => !!sourceEl(), 'the source')
    expect(sourceEl()!.value).toBe('## Goals\n\n- ship it')
    expect(sourceEl()!.readOnly).toBe(true)
    await r.unmount()
  })
})

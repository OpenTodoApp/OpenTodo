// @vitest-environment happy-dom
// Tasks from a note's check-list lines (OpenSpec change note-checklist-tasks, tasks 1.1
// to 1.3): Make tasks in a standalone note with quick-add syntax, several subtasks at
// once with one Undo, a viewer offered neither, the 50-line cap, and a concurrent edit.
import 'fake-indexeddb/auto'
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { db } from '../../lib/db'
import { checkLinesIn, linesToLinks } from '../../lib/editorNotes'
import { createNote } from '../../lib/noteOps'
import { createProject, createTask, mutate } from '../../lib/ops'
import { activeBody, encodeDoc, newDoc, parseMarkdown, renderMarkdown, toModel, updateBody } from '../../lib/richtext'
import { createState, pmToModel, writeBody, type EditorHooks } from '../../lib/richtextEditor'
import { click, flush, render } from '../../ui/test-utils'
import { formattingRowKey } from '../../lib/formattingRow'
import { setHabitsOn } from '../../lib/habitPrefs'
import { editorCommands, filterCommands, type CommandEnv } from '../editorCommands'
import NotesEditor, { noteViewOf } from '../NotesEditor'
import { open, setupTaskDetailTests, waitFor } from '../task-detail/taskDetail.testkit'

setupTaskDetailTests()

const md = (v: EditorView) => renderMarkdown(pmToModel(v.state.doc))
const editorEl = (root: ParentNode) => root.querySelector<HTMLElement>('.notes-editor')
async function viewOf(root: ParentNode): Promise<EditorView> {
  await waitFor(() => !!editorEl(root) && !editorEl(root)!.classList.contains('is-empty'), 'the notes editor')
  const v = noteViewOf(editorEl(root)!)!
  v.focus()
  await flush()
  return v
}
async function press(v: EditorView, key: string, mods: KeyboardEventInit = {}) {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })
  const handled = v.someProp('handleKeyDown', (f) => f(v, ev))
  await flush()
  return !!handled
}
const selectAll = (v: EditorView) => v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 1, v.state.doc.content.size - 1)))
const hooks: EditorHooks = { askLink: () => null, onEscape: () => {}, size: () => 0 }
/** A standalone note with its document, as the device holds it after an edit. */
async function noteWith(fields: { title: string; project_id?: string; description: string }) {
  const id = await createNote(fields)
  const d = newDoc()
  d.transact(() => updateBody(activeBody(d), parseMarkdown(fields.description)))
  await mutate('note', id, { notes_doc: encodeDoc(d) })
  return (await db.notes.get(id))!
}

describe('Make tasks and Make subtask on a selection', () => {
  it('Meeting note to tasks: two tasks in Work read like quick add, the plain line left', async () => {
    const work = await createProject({ name: 'Work' })
    const note = await noteWith({ title: 'Planning meeting', project_id: work, description: '- [ ] book room friday\n\nnotes from Anna\n\n- [ ] send agenda p1' })
    const id = note.id
    const { container, unmount } = await render(<NotesEditor note={{ ...note, entity: 'note' }} readOnly={false} />)
    const v = await viewOf(container)
    selectAll(v)
    expect(await press(v, 'Enter', { ctrlKey: true, shiftKey: true })).toBe(true)
    await waitFor(async () => (await db.tasks.where('project_id').equals(work).count()) === 2, 'two tasks', 5000)
    const tasks = await db.tasks.where('project_id').equals(work).toArray()
    const room = tasks.find((x) => x.title === 'book room')!
    const agenda = tasks.find((x) => x.title === 'send agenda')!
    expect(room.due?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Date(`${room.due!.date}T12:00`).getDay()).toBe(5)
    expect(agenda.priority).toBe(1)
    expect(md(v)).toBe(`- [book room](?task=${room.id})\n\nnotes from Anna\n\n- [send agenda](?task=${agenda.id})`)
    await waitFor(async () => ((await db.notes.get(id))?.description ?? '').includes(`?task=${agenda.id}`), 'the note saved with the links', 5000)
    await unmount()
  })

  it('a standalone note without a project makes tasks in the Inbox of its workspace', async () => {
    const note = await noteWith({ title: 'Loose', description: '- [ ] water plants' })
    const { container, unmount } = await render(<NotesEditor note={{ ...note, entity: 'note', workspace_id: 'ws-home' }} readOnly={false} />)
    const v = await viewOf(container)
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 4)))
    await press(v, 'Enter', { ctrlKey: true, shiftKey: true })
    await waitFor(async () => (await db.tasks.filter((x) => x.title === 'water plants').count()) === 1, 'the task', 5000)
    const task = (await db.tasks.filter((x) => x.title === 'water plants').first())!
    expect(task.project_id).toBeNull()
    expect(task.workspace_id).toBe('ws-home')
    await unmount()
  })

  it('Several subtasks at once: four subtasks of "Move house", one Undo removes all four', async () => {
    const id = await createTask({ title: 'Move house', description: '- [ ] Book van\n- [ ] Pack books\n- [x] Cancel internet\n- [ ] Clean flat friday' })
    const { container, unmount } = await open(id)
    const v = await viewOf(container)
    selectAll(v)
    await press(v, 'Enter', { ctrlKey: true, shiftKey: true })
    await waitFor(async () => (await db.tasks.where('parent_id').equals(id).count()) === 4, 'four subtasks', 5000)
    const subs = await db.tasks.where('parent_id').equals(id).toArray()
    // Subtasks keep the line verbatim (D2).
    expect(subs.map((x) => x.title).sort()).toEqual(['Book van', 'Cancel internet', 'Clean flat friday', 'Pack books'])
    expect(subs.find((x) => x.title === 'Cancel internet')!.completed_at).toBeTruthy()
    // The note with the links saved and back in the editor before Undo (its own save returns as a merge).
    await waitFor(async () => ((await db.tasks.get(id))?.description ?? '').split('?task=').length === 5, 'the note saved', 5000)
    await flush()
    await press(v, 'z', { ctrlKey: true })
    expect(md(v)).toBe('- [ ] Book van\n- [ ] Pack books\n- [x] Cancel internet\n- [ ] Clean flat friday')
    await waitFor(async () => (await db.tasks.where('parent_id').equals(id).filter((x) => !x.deleted_at).count()) === 0, 'all four removed', 5000)
    await unmount()
  })

  it('Viewer: neither command is offered', async () => {
    const note = await noteWith({ title: 'Shared', description: '- [ ] one\n- [ ] two' })
    const { container, unmount } = await render(<NotesEditor note={{ ...note, entity: 'note' }} readOnly />)
    const v = await viewOf(container)
    selectAll(v)
    expect(await press(v, 'Enter', { ctrlKey: true, shiftKey: true })).toBe(false)
    await flush()
    expect(await db.tasks.count()).toBe(0)
    await unmount()
  })

  it('Too many lines: the first 50 become tasks and the editor says 20 were left', async () => {
    const pid = await createProject({ name: 'Big' })
    const lines = Array.from({ length: 70 }, (_, i) => `- [ ] item ${i + 1}`).join('\n')
    const note = await noteWith({ title: 'Long', project_id: pid, description: lines })
    const { container, unmount } = await render(<NotesEditor note={{ ...note, entity: 'note' }} readOnly={false} />)
    const v = await viewOf(container)
    selectAll(v)
    await press(v, 'Enter', { ctrlKey: true, shiftKey: true })
    await waitFor(async () => (await db.tasks.where('project_id').equals(pid).count()) === 50, 'fifty tasks', 10000)
    await waitFor(() => (document.body.textContent ?? '').includes('20 lines were left: at most 50 at once.'), 'the notice')
    expect(md(v).split('\n').filter((l) => l.startsWith('- [ ] ')).length).toBe(20)
    await unmount()
  })
})

describe('selection helpers', () => {
  it('a selection picks the check-list lines with text, and lines already linked stay as they are', () => {
    const s = createState(parseMarkdown('- [ ] a\n- [x] b\n- [done](?task=t1)\n- plain\n- [ ] '), hooks)
    const all = s.apply(s.tr.setSelection(TextSelection.create(s.doc, 1, s.doc.content.size - 1)))
    const { lines, more } = checkLinesIn(all)
    expect(lines.map((l) => [l.title, l.checked])).toEqual([['a', false], ['b', true]])
    expect(more).toBe(0)
    const next = all.apply(linesToLinks(all, lines, ['t-a', 't-b']))
    expect(renderMarkdown(pmToModel(next.doc))).toBe('- [a](?task=t-a)\n- [b](?task=t-b)\n- [done](?task=t1)\n- plain\n- [ ]')
  })

  it('Concurrent edit: two lines turned into links and a paragraph added elsewhere both survive', () => {
    const a = newDoc()
    a.transact(() => updateBody(activeBody(a), parseMarkdown('Agenda\n\n- [ ] book room\n- [ ] send agenda')))
    const b = new Y.Doc()
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    const sa = createState(toModel(activeBody(a)), hooks)
    const sel = sa.apply(sa.tr.setSelection(TextSelection.create(sa.doc, 1, sa.doc.content.size - 1)))
    const after = sel.apply(linesToLinks(sel, checkLinesIn(sel).lines, ['t1', 't2']))
    a.transact(() => writeBody(activeBody(a), after.doc))
    b.transact(() => updateBody(activeBody(b), [...toModel(activeBody(b)), ...parseMarkdown('Added by another member')]))
    Y.applyUpdate(a, Y.encodeStateAsUpdate(b))
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a))
    const want = 'Agenda\n\n- [book room](?task=t1)\n- [send agenda](?task=t2)\n\nAdded by another member'
    expect(renderMarkdown(toModel(activeBody(a)))).toBe(want)
    expect(renderMarkdown(toModel(activeBody(b)))).toBe(want)
  })
})

// Make habits (OpenSpec change habit-notes, task 5.1): the Make tasks pipeline with the
// habit preset, from the More menu of the formatting row, with one Undo.
describe('Make habits', () => {
  async function makeHabits(container: HTMLElement) {
    await waitFor(() => !!container.querySelector('[data-toolbar-more]'), 'the formatting row')
    await click(container.querySelector<HTMLElement>('[data-toolbar-more]')!)
    await waitFor(() => [...document.querySelectorAll('[role="menuitem"]')].some((m) => m.textContent === 'Make habits'), 'Make habits')
    await click([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((m) => m.textContent === 'Make habits')!)
  }

  it('A morning routine note: three habits, each line a link, one Undo takes back habits and lines', async () => {
    await setHabitsOn(true)
    localStorage.setItem(formattingRowKey('notes'), 'on')
    const home = await createProject({ name: 'Home' })
    const text = '- [ ] Drink water\n- [ ] Stretch every weekday\n- [ ] Journal'
    const note = await noteWith({ title: 'Morning routine', project_id: home, description: text })
    const { container, unmount } = await render(<NotesEditor note={{ ...note, entity: 'note' }} readOnly={false} />)
    const v = await viewOf(container)
    selectAll(v)
    await makeHabits(container)
    await waitFor(async () => (await db.tasks.where('project_id').equals(home).count()) === 3, 'three habits', 5000)
    const made = await db.tasks.where('project_id').equals(home).toArray()
    const by = (title: string) => made.find((x) => x.title === title)!
    expect(made.every((x) => x.habit)).toBe(true)
    expect([by('Drink water').recurrence, by('Stretch').recurrence, by('Journal').recurrence]).toEqual(['every day', 'every weekday', 'every day'])
    expect(md(v)).toBe(`- [Drink water](?task=${by('Drink water').id})\n- [Stretch](?task=${by('Stretch').id})\n- [Journal](?task=${by('Journal').id})`)
    // Offline: written on the device alone (the test kit fails any request), synced later with the outbox.
    expect((await db.outbox.toArray()).some((o) => o.entityId === by('Journal').id && o.field === 'habit')).toBe(true)
    await waitFor(async () => ((await db.notes.get(note.id))?.description ?? '').split('?task=').length === 4, 'the note saved', 5000)
    await flush()
    await press(v, 'z', { ctrlKey: true })
    expect(md(v)).toBe(text)
    await waitFor(async () => (await db.tasks.where('project_id').equals(home).filter((x) => !x.deleted_at).count()) === 0, 'the habits removed', 5000)
    await unmount()
  })

  it('A completion-relative line becomes a plain repeating task, and the result says so', async () => {
    await setHabitsOn(true)
    localStorage.setItem(formattingRowKey('notes'), 'on')
    const note = await noteWith({ title: 'Plants', description: '- [ ] Water the plants every 3 days after completion' })
    const { container, unmount } = await render(<NotesEditor note={{ ...note, entity: 'note' }} readOnly={false} />)
    const v = await viewOf(container)
    selectAll(v)
    await makeHabits(container)
    await waitFor(async () => (await db.tasks.filter((x) => x.title === 'Water the plants').count()) === 1, 'the task', 5000)
    const task = (await db.tasks.filter((x) => x.title === 'Water the plants').first())!
    expect(task.habit).toBeFalsy()
    expect(task.recurrence).toBe('every 3 days after completion')
    await waitFor(() => (document.body.textContent ?? '').includes('Repeats after completion, so made a task, not a habit: Water the plants'), 'the result')
    await unmount()
  })

  it('is not offered while Habits is off, nor in a task\'s notes', async () => {
    await setHabitsOn(false)
    const state = createState(parseMarkdown('- [ ] Drink water'), hooks)
    const view = { state } as unknown as EditorView
    const env = (o: Partial<CommandEnv>): CommandEnv => ({ notes: false, members: false, askLink: () => null, notify: () => {}, ...o })
    const ids = (e: CommandEnv) => filterCommands(editorCommands(), 'make', view, e).map((c) => c.id)
    const cmd = () => true
    expect(ids(env({ makeSubtask: cmd }))).toEqual(['tasks'])
    expect(ids(env({ makeSubtask: cmd, makeHabits: cmd }))).toEqual(['tasks', 'habits'])
    expect(ids(env({ notes: true, makeSubtask: cmd, makeHabits: cmd }))).toEqual(['subtask'])
    // The editor passes makeHabits only while Habits is on (NotesEditor): off, the More menu has none.
    localStorage.setItem(formattingRowKey('notes'), 'on')
    const note = await noteWith({ title: 'Routine', description: '- [ ] Drink water' })
    const { container, unmount } = await render(<NotesEditor note={{ ...note, entity: 'note' }} readOnly={false} />)
    const v = await viewOf(container)
    selectAll(v)
    await waitFor(() => !!container.querySelector('[data-toolbar-more]'), 'the formatting row')
    await click(container.querySelector<HTMLElement>('[data-toolbar-more]')!)
    await waitFor(() => document.querySelectorAll('[role="menuitem"]').length > 0, 'the menu')
    expect([...document.querySelectorAll('[role="menuitem"]')].map((m) => m.textContent)).not.toContain('Make habits')
    await unmount()
  })
})

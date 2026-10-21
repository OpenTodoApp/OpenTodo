// @vitest-environment happy-dom
// Editing features of the notes (OpenSpec change editor-everywhere, tasks 3.1–3.6,
// 4.1): the slash menu, tables and their limits, quotes and code blocks, mentions,
// Make subtask with Undo, pasted screenshots and the touch toolbar. The editor is
// driven through its own handlers, as key presses and typed text reach it.
import 'fake-indexeddb/auto'
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { Slice } from 'prosemirror-model'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db, setMeta } from '../../lib/db'
import { formatDate, logicalToday } from '../../lib/dates'
import { createProject, createTask } from '../../lib/ops'
import { renderMarkdown } from '../../lib/richtext'
import { pmToModel } from '../../lib/richtextEditor'
import { click, flush } from '../../ui/test-utils'
import { noteViewOf } from '../NotesEditor'
import { membership, ME, open, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()
afterEach(() => vi.unstubAllGlobals())

const editorEl = (root: ParentNode) => root.querySelector<HTMLElement>('.notes-editor[contenteditable]')

async function editorOf(container: HTMLElement, filled = false): Promise<EditorView> {
  await waitFor(() => !!editorEl(container) && (!filled || !editorEl(container)!.classList.contains('is-empty')), 'the notes editor')
  const v = noteViewOf(editorEl(container)!)!
  v.focus()
  await flush(10)
  return v
}

/** Text typed at the caret, one character at a time (input rules and menus see each). */
async function typeText(v: EditorView, text: string) {
  for (const ch of text) {
    const { from, to } = v.state.selection
    const handled = v.someProp('handleTextInput', (f) => f(v, from, to, ch, () => v.state.tr.insertText(ch, from, to)))
    if (!handled) v.dispatch(v.state.tr.insertText(ch, from, to))
    await flush(0)
  }
  await flush(10)
}

async function press(v: EditorView, key: string, mods: KeyboardEventInit = {}) {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })
  const handled = v.someProp('handleKeyDown', (f) => f(v, ev))
  await flush(10)
  return !!handled
}

const md = (v: EditorView) => renderMarkdown(pmToModel(v.state.doc))
const listbox = () => document.querySelector<HTMLElement>('[role="listbox"][data-suggest]')
const options = () => [...(listbox()?.querySelectorAll('[role="option"]') ?? [])].map((o) => o.textContent)

describe('slash command menu', () => {
  it('Insert a table by keyboard', async () => {
    const id = await createTask({ title: 'Paint the hall' })
    const { container, unmount } = await open(id)
    const v = await editorOf(container)
    await typeText(v, '/tab')
    expect(listbox()?.getAttribute('aria-label')).toBe('Commands')
    expect(options()[0]).toBe('Table')
    expect(v.dom.getAttribute('aria-activedescendant')).toBe(listbox()!.querySelector('[role="option"]')!.id)
    expect(await press(v, 'Enter')).toBe(true)
    expect(md(v)).toBe('|  |  |\n| --- | --- |\n|  |  |')
    expect(v.state.selection.$from.parent.type.name).toBe('table_header')
    expect(listbox()).toBeNull()
    // The table scrolls inside its own box (Narrow screen).
    expect(v.dom.querySelector('.tableWrapper > table')).toBeTruthy()
    await unmount()
  })

  it('No match: the menu closes and the text stays; Escape keeps the text too', async () => {
    const id = await createTask({ title: 'Plan' })
    const { container, unmount } = await open(id)
    const v = await editorOf(container)
    await typeText(v, '/zzz')
    expect(listbox()).toBeNull()
    expect(md(v)).toBe('/zzz')
    await typeText(v, ' /h')
    expect(options()).toContain('Heading 1')
    expect(await press(v, 'Escape')).toBe(true)
    expect(listbox()).toBeNull()
    expect(md(v)).toBe('/zzz /h')
    await unmount()
  })

  it('Date: today in the user\'s date format, as text', async () => {
    const id = await createTask({ title: 'Plan' })
    const { container, unmount } = await open(id)
    const v = await editorOf(container)
    await typeText(v, 'Due /date')
    expect(options()).toEqual(['Date'])
    await press(v, 'Enter')
    expect(md(v)).toBe(`Due ${formatDate(logicalToday(), 'long')}`)
    await unmount()
  })
})

describe('tables', () => {
  it('Column limit: the eleventh column is refused with a message', async () => {
    const id = await createTask({ title: 'Budget' })
    const { container, unmount } = await open(id)
    const v = await editorOf(container)
    await typeText(v, '/table')
    await press(v, 'Enter')
    const addColumn = async () => {
      await typeText(v, '/add column after')
      return press(v, 'Enter')
    }
    for (let i = 0; i < 8; i++) await addColumn()
    expect(md(v).split('\n')[0].split('|').length - 2).toBe(10)
    await addColumn()
    expect(md(v).split('\n')[0].split('|').length - 2).toBe(10)
    expect(container.textContent).toContain('A table can have at most 10 columns.')
    await unmount()
  })

  it('Tab moves to the next cell and adds a row after the last one', async () => {
    const id = await createTask({ title: 'Budget' })
    const { container, unmount } = await open(id)
    const v = await editorOf(container)
    await typeText(v, '/table')
    await press(v, 'Enter')
    await typeText(v, 'Item')
    await press(v, 'Tab')
    await typeText(v, 'Cost')
    await press(v, 'Tab')
    await typeText(v, 'Paint')
    await press(v, 'Tab')
    await typeText(v, '40')
    await press(v, 'Tab')
    expect(md(v)).toBe('| Item | Cost |\n| --- | --- |\n| Paint | 40 |\n|  |  |')
    await unmount()
  })
})

describe('quotes and code blocks', () => {
  it('Quote and code block: "> " quotes, ``` and Enter starts a code block without input rules', async () => {
    const id = await createTask({ title: 'Snippet' })
    const { container, unmount } = await open(id)
    const v = await editorOf(container)
    await typeText(v, '> wise words')
    expect(v.state.doc.firstChild!.type.name).toBe('blockquote')
    // Leave the quote: a new paragraph after it.
    v.dispatch(v.state.tr.insert(v.state.doc.content.size, v.state.schema.nodes.paragraph.create()))
    v.dispatch(v.state.tr.setSelection(TextSelection.atEnd(v.state.doc)))
    await typeText(v, '```go')
    await press(v, 'Enter')
    await typeText(v, '**not bold** - no list')
    expect(md(v)).toBe('> wise words\n\n```go\n**not bold** - no list\n```')
    await unmount()
  })
})

describe('mentions in notes', () => {
  it('Mention in a note: completion from the members, the mark, and note_mentions with the note', async () => {
    const project = await createProject({ name: 'Trip' })
    await membership(project, ME, 'u-bob')
    const id = await createTask({ title: 'Book flights', project_id: project })
    const { container, unmount } = await open(id)
    const v = await editorOf(container)
    await typeText(v, 'Ask @u-b')
    expect(listbox()?.getAttribute('aria-label')).toBe('Mention a member')
    expect(options()[0]).toContain('u-bob')
    await press(v, 'Enter')
    expect(md(v)).toBe('Ask @u-bob')
    v.dom.blur()
    await waitFor(async () => !!(await db.tasks.get(id))?.note_mentions?.length, 'note_mentions saved', 5000)
    const row = (await db.tasks.get(id))!
    expect(row.note_mentions).toEqual(['u-bob'])
    expect(row.description).toBe('Ask @u-bob')
    // Both fields left in the same mutation (same clock).
    const ops = await db.outbox.toArray()
    const doc = ops.filter((o) => o.entityId === id && o.field === 'notes_doc').at(-1)!
    const mentions = ops.filter((o) => o.entityId === id && o.field === 'note_mentions').at(-1)!
    expect(Math.abs(mentions.ts - doc.ts)).toBeLessThan(5)
    await unmount()
  })
})

describe('Make subtask', () => {
  it('Make subtask offline, then Undo in one step', async () => {
    const id = await createTask({ title: 'Trip', description: '- [ ] Book hotel\n- [ ] Pack' })
    const { container, unmount } = await open(id)
    const v = await editorOf(container, true)
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 4)))
    expect(await press(v, 'Enter', { ctrlKey: true, shiftKey: true })).toBe(true)
    await waitFor(async () => (await db.tasks.where('parent_id').equals(id).count()) === 1, 'the subtask', 5000)
    const sub = (await db.tasks.where('parent_id').equals(id).first())!
    expect(sub.title).toBe('Book hotel')
    expect(sub.completed_at).toBeFalsy()
    expect(md(v)).toBe(`- [Book hotel](?task=${sub.id})\n- [ ] Pack`)
    await waitFor(async () => ((await db.tasks.get(id))?.description ?? '').includes(`(?task=${sub.id})`), 'the note with the link', 5000)
    // Undo: the line is back and the subtask is gone.
    await press(v, 'z', { ctrlKey: true })
    expect(md(v)).toBe('- [ ] Book hotel\n- [ ] Pack')
    await waitFor(async () => !!(await db.tasks.get(sub.id))?.deleted_at, 'the subtask removed', 5000)
    await unmount()
  })

  it('From a checked line the subtask is completed; not offered in a plain line', async () => {
    const id = await createTask({ title: 'Trip', description: '- [x] Renew passport\n\nplain' })
    const { container, unmount } = await open(id)
    const v = await editorOf(container, true)
    v.dispatch(v.state.tr.setSelection(TextSelection.atEnd(v.state.doc)))
    expect(await press(v, 'Enter', { ctrlKey: true, shiftKey: true })).toBe(false)
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 4)))
    await press(v, 'Enter', { ctrlKey: true, shiftKey: true })
    await waitFor(async () => (await db.tasks.where('parent_id').equals(id).count()) === 1, 'the subtask', 5000)
    expect((await db.tasks.where('parent_id').equals(id).first())!.completed_at).toBeTruthy()
    await unmount()
  })
})

describe('images', () => {
  it('Paste a screenshot into a note: attachment queued, image at the caret, reference in the projection', async () => {
    await setMeta('attachmentLimits', { enabled: true, max_file_bytes: 1 << 20, quota_bytes: 0, used_bytes: 0 })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:shot')
    const id = await createTask({ title: 'Bug report' })
    const { container, unmount } = await open(id)
    const v = await editorOf(container)
    const shot = new File([new Uint8Array([137, 80, 78, 71])], 'image.png', { type: 'image/png' })
    const handled = v.someProp('handlePaste', (f) => f(v, { clipboardData: { files: [shot] } } as unknown as ClipboardEvent, Slice.empty))
    expect(handled).toBe(true)
    await waitFor(() => !!v.state.doc.firstChild && v.state.doc.textContent === '' && /attachment:/.test(md(v)), 'the image node', 5000)
    const att = (await db.attachments.where('task_id').equals(id).first())!
    expect(att.name).toMatch(/^Pasted image \d{4}-\d{2}-\d{2} .*\.png$/)
    expect(md(v)).toBe(`![${att.name.replace(/\.png$/, '')}](attachment:${att.id})`)
    await unmount()
    vi.restoreAllMocks()
  })

  it('Web image stays a link: a pasted image address becomes a link', async () => {
    const id = await createTask({ title: 'Inspiration' })
    const { container, unmount } = await open(id)
    const v = await editorOf(container)
    const slice = v.someProp('clipboardTextParser', (f) => f('https://example.org/photo.jpg', v.state.selection.$from, true, v))!
    v.dispatch(v.state.tr.replaceSelection(slice))
    expect(md(v)).toBe('[https://example.org/photo.jpg](https://example.org/photo.jpg)')
    expect(v.dom.querySelector('img')).toBeNull()
    await unmount()
  })
})

describe('touch toolbar', () => {
  it('Phone editing: the row appears while editing on a coarse pointer, Bold applies, leaving hides it', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener: () => {}, removeEventListener: () => {} }))
    const id = await createTask({ title: 'Plan', description: 'make this bold' })
    const { container, unmount } = await open(id)
    const toolbar = () => container.querySelector('[role="toolbar"][data-editor-toolbar]')
    await waitFor(() => !!editorEl(container) && !editorEl(container)!.classList.contains('is-empty'))
    expect(toolbar()).toBeNull()
    const v = await editorOf(container, true)
    await waitFor(() => !!toolbar(), 'the toolbar')
    for (const b of toolbar()!.querySelectorAll('button')) expect(b.getAttribute('aria-label')).toBeTruthy()
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 11, 15)))
    await click(toolbar()!.querySelector<HTMLElement>('button[aria-label="Bold"]')!)
    expect(md(v)).toBe('make this **bold**')
    v.dom.blur()
    await waitFor(() => !toolbar(), 'the toolbar gone')
    await unmount()
  })

  it('no toolbar on a fine pointer', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {} }))
    const id = await createTask({ title: 'Plan' })
    const { container, unmount } = await open(id)
    await editorOf(container)
    await flush(20)
    expect(container.querySelector('[role="toolbar"][data-editor-toolbar]')).toBeNull()
    await unmount()
  })
})

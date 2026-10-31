// @vitest-environment happy-dom
// The Formatting toggle beside notes on a computer (OpenSpec change
// notes-toolbar-desktop): the row shown on request and remembered on the device,
// the row as a keyboard toolbar, viewers and touch screens unchanged, and the
// Formatting button setting that hides the toggle.
import 'fake-indexeddb/auto'
import { act } from 'react'
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../lib/db'
import { formattingButtonOn, setFormattingButton } from '../../lib/userPrefs'
import { formattingRowKey } from '../../lib/formattingRow'
import { createTask } from '../../lib/ops'
import { renderMarkdown } from '../../lib/richtext'
import { pmToModel } from '../../lib/richtextEditor'
import { click, flush, key } from '../../ui/test-utils'
import { noteViewOf } from '../NotesEditor'
import { open, setupTaskDetailTests, waitFor } from './taskDetail.testkit'

setupTaskDetailTests()
afterEach(() => vi.unstubAllGlobals())

const pointer = (coarse: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: coarse && q.includes('coarse'), media: q, addEventListener: () => {}, removeEventListener: () => {} }))
const editorEl = (root: ParentNode) => root.querySelector<HTMLElement>('.notes-editor[contenteditable]')
const toggle = (root: ParentNode) => root.querySelector<HTMLButtonElement>('[data-notes-formatting]')
const row = (root: ParentNode) => root.querySelector<HTMLElement>('[role="toolbar"][data-editor-toolbar]')
const md = (v: EditorView) => renderMarkdown(pmToModel(v.state.doc))
const focus = (el: HTMLElement) => act(async () => el.focus())

async function viewOf(container: HTMLElement, filled = true): Promise<EditorView> {
  await waitFor(() => !!editorEl(container) && (!filled || !editorEl(container)!.classList.contains('is-empty')), 'the notes editor')
  return noteViewOf(editorEl(container)!)!
}

describe('Formatting toggle on computers', () => {
  it('Bold with the mouse: the row shows at rest, Bold applies, the row stays', async () => {
    pointer(false)
    const id = await createTask({ title: 'Plan', description: 'make this bold' })
    const { container, unmount } = await open(id)
    const v = await viewOf(container)
    const t = toggle(container)!
    expect(t.getAttribute('aria-label')).toBe('Formatting')
    expect(t.getAttribute('aria-pressed')).toBe('false')
    expect(row(container)).toBeNull()
    await click(t)
    await waitFor(() => !!row(container), 'the row')
    expect(t.getAttribute('aria-pressed')).toBe('true')
    expect(t.getAttribute('aria-controls')).toBe(row(container)!.id)
    expect(localStorage.getItem(formattingRowKey('notes'))).toBe('on')
    v.focus()
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 11, 15)))
    await click(row(container)!.querySelector<HTMLElement>('button[aria-label="Bold"]')!)
    expect(md(v)).toBe('make this **bold**')
    v.dom.blur()
    await flush()
    expect(row(container)).not.toBeNull()
    await click(t)
    await waitFor(() => !row(container), 'the row hidden')
    expect(localStorage.getItem(formattingRowKey('notes'))).toBeNull()
    await unmount()
  })

  it('Remembered on the device: another note opens with the row, the composer is unaffected', async () => {
    pointer(false)
    const a = await createTask({ title: 'One', description: 'first' })
    const b = await createTask({ title: 'Two', description: 'second' })
    const first = await open(a)
    await viewOf(first.container)
    await click(toggle(first.container)!)
    await waitFor(() => !!row(first.container), 'the row')
    await first.unmount()
    const second = await open(b)
    await viewOf(second.container)
    await waitFor(() => !!row(second.container), 'the remembered row')
    expect(toggle(second.container)!.getAttribute('aria-pressed')).toBe('true')
    expect(localStorage.getItem(formattingRowKey('comments'))).toBeNull()
    await second.unmount()
  })

  it('Keyboard only: the toggle precedes the text, the row is one Tab stop with arrows, Escape returns', async () => {
    pointer(false)
    const id = await createTask({ title: 'Plan', description: 'make this bold' })
    const { container, unmount } = await open(id)
    const v = await viewOf(container)
    const t = toggle(container)!
    // Shift+Tab from the note reaches the toggle: it is before the text in DOM order.
    expect(t.compareDocumentPosition(v.dom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    v.focus()
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, 6, 10)))
    await focus(t)
    await click(t)
    await waitFor(() => !!row(container), 'the row')
    expect(document.activeElement).toBe(t)
    const items = [...row(container)!.querySelectorAll<HTMLElement>('[data-toolbar-item]')]
    expect(items.map((i) => i.getAttribute('aria-label'))).toEqual(['Bold', 'Italic', 'Link', 'Bullet list', 'Checklist', 'More formatting'])
    // One Tab stop: only the first control is tabbable, and it follows the toggle.
    expect(items.filter((i) => i.tabIndex === 0)).toEqual([items[0]])
    expect(t.compareDocumentPosition(items[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await focus(items[0])
    await key(items[0], 'ArrowRight')
    expect(document.activeElement).toBe(items[1])
    await key(items[1], 'ArrowRight')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Link')
    expect(items.filter((i) => i.tabIndex === 0).map((i) => i.getAttribute('aria-label'))).toEqual(['Link'])
    await key(document.activeElement!, 'End')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('More formatting')
    await key(document.activeElement!, 'ArrowRight')
    expect(document.activeElement).toBe(items[0])
    await key(items[0], 'ArrowLeft')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('More formatting')
    await key(document.activeElement!, 'Home')
    expect(document.activeElement).toBe(items[0])
    await key(items[0], 'Escape')
    expect(document.activeElement).toBe(v.dom)
    expect([v.state.selection.from, v.state.selection.to]).toEqual([6, 10])
    // A command from the keyboard puts focus back in the note.
    await focus(items[1])
    await click(items[1])
    expect(md(v)).toBe('make _this_ bold')
    expect(document.activeElement).toBe(v.dom)
    await unmount()
  })

  it('Down on More opens its menu', async () => {
    pointer(false)
    const id = await createTask({ title: 'Plan', description: 'text' })
    const { container, unmount } = await open(id)
    await viewOf(container)
    await click(toggle(container)!)
    await waitFor(() => !!row(container), 'the row')
    const more = row(container)!.querySelector<HTMLElement>('[data-toolbar-more]')!
    await focus(more)
    await key(more, 'ArrowDown')
    await waitFor(() => document.querySelectorAll('[role="menu"] [role="menuitem"]').length > 0, 'the More menu')
    await key(document.querySelector('[role="menu"] [role="menuitem"]')!, 'Escape')
    await unmount()
  })

  it('Viewer: no toggle and no row on a read-only note', async () => {
    pointer(false)
    localStorage.setItem(formattingRowKey('notes'), 'on')
    const id = await createTask({ title: 'Plan', description: 'read me' })
    const { container, unmount } = await open(id, { readOnly: true })
    await viewOf(container)
    await flush()
    expect(toggle(container)).toBeNull()
    expect(row(container)).toBeNull()
    await unmount()
  })

  it('Phone unchanged: no toggle; the row shows only while the note has focus', async () => {
    pointer(true)
    localStorage.setItem(formattingRowKey('notes'), 'on')
    const id = await createTask({ title: 'Plan', description: 'phone' })
    const { container, unmount } = await open(id)
    const v = await viewOf(container)
    await flush()
    expect(toggle(container)).toBeNull()
    expect(row(container)).toBeNull()
    v.focus()
    await waitFor(() => !!row(container), 'the touch row')
    await unmount()
  })

  it('Storage that throws reads as off, still renders, and the toggle works for the page', async () => {
    pointer(false)
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
    vi.stubGlobal('localStorage', broken)
    const id = await createTask({ title: 'Plan', description: 'text' })
    const { container, unmount } = await open(id)
    await viewOf(container)
    expect(toggle(container)!.getAttribute('aria-pressed')).toBe('false')
    await click(toggle(container)!)
    await waitFor(() => !!row(container), 'the row')
    vi.unstubAllGlobals()
    await unmount()
  })
})

describe('Formatting button setting', () => {
  it('reads empty and unknown values as on, only off hides', () => {
    expect(formattingButtonOn(undefined)).toBe(true)
    expect(formattingButtonOn({ formatting_toggle: '' })).toBe(true)
    expect(formattingButtonOn({ formatting_toggle: 'sometimes' })).toBe(true)
    expect(formattingButtonOn({ formatting_toggle: 'off' })).toBe(false)
  })

  it('off hides the toggle and the remembered row; on again brings both back', async () => {
    pointer(false)
    localStorage.setItem(formattingRowKey('notes'), 'on')
    const id = await createTask({ title: 'Plan', description: 'text' })
    const { container, unmount } = await open(id)
    await viewOf(container)
    await waitFor(() => !!row(container), 'the remembered row')
    await setFormattingButton(false)
    expect((await db.userPrefs.get('me'))?.formatting_toggle).toBe('off')
    await waitFor(() => !toggle(container) && !row(container), 'the toggle and row hidden')
    // The remembered state is kept for when the switch comes back.
    expect(localStorage.getItem(formattingRowKey('notes'))).toBe('on')
    await setFormattingButton(true)
    await waitFor(() => !!toggle(container) && !!row(container), 'the toggle and row back')
    expect(toggle(container)!.getAttribute('aria-pressed')).toBe('true')
    await unmount()
  })
})

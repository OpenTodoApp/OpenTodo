// @vitest-environment happy-dom
// A viewer's Copy note (OpenSpec change copy-code-block D4): a note the reader may
// only read offers a hidden action, in the Tab order, that copies its Markdown; a
// real click reaches the note (onCopied), which then announces it.
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NotesEditor from './NotesEditor'
import { click, render, waitFor } from '../ui/test-utils'

const realClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
function stubClipboard(writeText: (t: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
}
afterEach(() => {
  if (realClipboard) Object.defineProperty(navigator, 'clipboard', realClipboard)
})

// With a code block, as most notes with something worth copying have: the block's own
// Copy button is the renderer's (markdownCopy.test.tsx), the note's corner is this one's.
const NOTE = { entity: 'note' as const, id: 'note-1', description: '## Plan\n\n```\npack the tent\n```' }

/** The note the way notes/NoteEditor.tsx's NoteForm owns `copied`. */
function ViewerNote() {
  const [copied, setCopied] = useState(false)
  return <NotesEditor note={NOTE} readOnly copied={copied} onCopied={() => setCopied(true)} />
}

/** The text a screen reader hears from the note's corner. */
const announced = (root: ParentNode) => root.querySelector('[data-notes-copy]')!.closest('.notes-frame')!.querySelector('.sr-only')!.textContent

describe("a viewer's Copy note", () => {
  it('offers it only on a read-only note, before the text in the Tab order', async () => {
    stubClipboard(vi.fn(async () => {}))
    let r = await render(<ViewerNote />)
    await waitFor(() => !!r.container.querySelector('[data-notes-copy]'), 'the Copy note action')
    const text = r.container.querySelector('.notes-editor')!
    // The corner comes before the text, so Shift+Tab from the note reaches it.
    expect(text.compareDocumentPosition(r.container.querySelector('[data-notes-copy]')!) & Node.DOCUMENT_POSITION_PRECEDING).not.toBe(0)
    await r.unmount()
    r = await render(<NotesEditor note={{ ...NOTE, entity: 'task', project_id: null }} readOnly={false} />)
    await waitFor(() => !!r.container.querySelector('.notes-editor'), 'the editor')
    expect(r.container.querySelector('[data-notes-copy]')).toBeNull()
    await r.unmount()
  })

  it('copies the note’s Markdown, and the click is what makes the note announce it', async () => {
    const writeText = vi.fn(async () => {})
    stubClipboard(writeText)
    const r = await render(<ViewerNote />)
    await waitFor(() => !!r.container.querySelector('[data-notes-copy]'), 'the Copy note action')
    expect(announced(r.container)).toBe('')
    await click(r.container.querySelector('[data-notes-copy]')!)
    await waitFor(() => writeText.mock.calls.length === 1, 'the copy')
    expect(writeText).toHaveBeenCalledWith(NOTE.description)
    // onCopied → NoteForm's setCopied(true) → the action's name and the announcement.
    await waitFor(() => announced(r.container) === 'Copied', 'the note says it copied')
    expect(r.container.querySelector('[data-notes-copy]')).not.toBeNull()
    await r.unmount()
  })

  it('says so when the clipboard is refused', async () => {
    stubClipboard(async () => { throw new Error('denied') })
    const r = await render(<ViewerNote />)
    await waitFor(() => !!r.container.querySelector('[data-notes-copy]'), 'the Copy note action')
    await click(r.container.querySelector('[data-notes-copy]')!)
    await waitFor(() => r.container.querySelector('[data-notes-copy]')!.getAttribute('aria-label') === 'Could not copy', 'the refusal')
    expect(announced(r.container)).toBe('Could not copy')
    await r.unmount()
  })
})

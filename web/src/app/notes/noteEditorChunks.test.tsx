// @vitest-environment happy-dom
// Issue 1580 (nightly metric note-references): once the Notes page has loaded the note
// form's chunks, opening a note shows no fallback at all, so React has no reveal to hold
// back and Linked references paint as soon as the link index is built.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useDatabase } from '../../lib/db'
import { createNote } from '../../lib/noteOps'
import { resetDeviceId } from '../../lib/ops'
import { setCurrentUserId } from '../../lib/sharing'
import { render, waitFor } from '../../ui/test-utils'
import { NotePanel } from './NoteEditor'
import { loadNoteFormChunks } from './noteEditorChunks'

let run = 0
beforeEach(() => {
  useDatabase(`note-editor-chunks-${run++}`)
  resetDeviceId()
  setCurrentUserId('u-me')
})
afterEach(() => { document.body.innerHTML = '' })

describe('the note form chunks', () => {
  it('a note opened after the chunks are in renders the editor without its fallback', async () => {
    await loadNoteFormChunks()
    const id = await createNote({ title: 'Packing list', description: 'Passport' })
    let fallback = false
    const seen = new MutationObserver(() => { if (document.querySelector('.notes-host[aria-busy="true"]')) fallback = true })
    seen.observe(document.body, { childList: true, subtree: true })
    const r = await render(<NotePanel id={id} />)
    await waitFor(() => !!document.querySelector(`[data-note-form="${id}"] .notes-host:not([aria-busy])`), 'the editor')
    seen.disconnect()
    expect(fallback).toBe(false)
    await r.unmount()
  })
})

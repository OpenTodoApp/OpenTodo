// The note form's own chunks, the editor and the files row, loaded once and then kept
// (issue 1580, nightly metric note-references): a lazy component still suspends on its
// first render even when its chunk is in, and a fallback shown then makes React hold
// back the reveals that follow, Linked references included, by up to 300 ms. Once a
// chunk is here the form renders it directly. The Notes page loads both when it opens,
// as it does the Linked references chunk (linkedRefsChunk.ts).
import type { ComponentType } from 'react'
import { resettable } from '../../lib/moduleState'

type Kept<P> = { load: () => Promise<ComponentType<P>>; loaded: () => ComponentType<P> | null }

function kept<P>(name: string, importer: () => Promise<ComponentType<P>>): Kept<P> {
  let loaded: ComponentType<P> | null = null
  let loading: Promise<ComponentType<P>> | null = null
  resettable(name, () => { loaded = null; loading = null })
  return {
    load: () => (loading ??= importer().then((c) => (loaded = c))),
    loaded: () => loaded,
  }
}

type NotesEditorProps = Parameters<typeof import('../NotesEditor').default>[0]
type AttachmentsRowProps = Parameters<typeof import('../task-detail/AttachmentsRow').AttachmentsRow>[0]

export const notesEditorChunk = kept<NotesEditorProps>('notesEditorChunk', () => import('../NotesEditor').then((m) => m.default))
export const attachmentsRowChunk = kept<AttachmentsRowProps>('attachmentsRowChunk', () => import('../task-detail/AttachmentsRow').then((m) => m.AttachmentsRow))

/** Loads both chunks (once); the Notes page calls it when it opens. */
export function loadNoteFormChunks(): Promise<unknown> {
  return Promise.all([notesEditorChunk.load(), attachmentsRowChunk.load()])
}

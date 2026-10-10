// Mergeable document fields (OpenSpec change `collaborative-rich-text`) and the
// lazy loader for the code that understands them. This module stays tiny and
// dependency-free so the initial bundle does not carry Yjs: lib/richtext.ts (and
// the editor) are fetched the first time a document is applied, written or opened.

/** Document field -> the plain-text field that holds its Markdown projection. */
export const DOC_FIELDS: Record<string, string> = { 'task.notes_doc': 'description' }

/** Envelope length cap; identical to MaxDocBytes in internal/sync/ops.go. */
export const MAX_DOC_CHARS = 256 * 1024

export function isDocField(entity: string, field: string): boolean {
  return `${entity}.${field}` in DOC_FIELDS
}

/** Thrown by mutate() when a document would exceed MAX_DOC_CHARS; nothing is written. */
export class DocTooLargeError extends Error {
  constructor(public size: number) {
    super(`This note is too large to save (${Math.ceil(size / 1024)} KB of ${MAX_DOC_CHARS / 1024} KB). Remove some text.`)
    this.name = 'DocTooLargeError'
  }
}

export type RichText = typeof import('./richtext')

let loaded: RichText | null = null
let loading: Promise<RichText> | null = null

/** Load lib/richtext.ts (and Yjs) once; later calls resolve immediately. */
export function loadRichText(): Promise<RichText> {
  if (loaded) return Promise.resolve(loaded)
  if (!loading) {
    loading = import('./richtext').then((m) => (loaded = m))
    loading.catch(() => (loading = null))
  }
  return loading
}

/** The module when it is already loaded (synchronous use inside transactions). */
export function richTextIfLoaded(): RichText | null {
  return loaded
}

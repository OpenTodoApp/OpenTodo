import { t } from './i18n'
// Mergeable document fields (OpenSpec change `collaborative-rich-text`) and the
// lazy loader for the code that understands them. This module stays tiny and
// dependency-free so the initial bundle does not carry Yjs: lib/richtext.ts (and
// the editor) are fetched the first time a document is applied, written or opened.

/** Document field -> the plain-text field that holds its Markdown projection. */
export const DOC_FIELDS: Record<string, string> = { 'task.notes_doc': 'description', 'project.notes_doc': 'description' }

/** Entities that carry a mergeable note (notes_doc with its description projection). */
export const NOTE_ENTITIES: ReadonlySet<string> = new Set(Object.keys(DOC_FIELDS).map((k) => k.split('.')[0]))

/** Envelope length cap; identical to MaxDocBytes in internal/sync/ops.go. */
export const MAX_DOC_CHARS = 256 * 1024

/**
 * The cap for an account with end-to-end encryption (OpenSpec e2ee): the
 * ciphertext "enc:v1:" + base64url(nonce || ciphertext || tag) of the envelope
 * must still fit MAX_DOC_CHARS.
 */
export const MAX_DOC_CHARS_ENCRYPTED = Math.floor(((MAX_DOC_CHARS - 'enc:v1:'.length) * 3) / 4) - 28 - 64

/** The value cap of an ordinary string field such as the `description` projection (MaxValueBytes, JSON-encoded). */
export const MAX_TEXT_VALUE = 64 * 1024

export function isDocField(entity: string, field: string): boolean {
  return `${entity}.${field}` in DOC_FIELDS
}

/** Thrown by mutate() when a document would exceed MAX_DOC_CHARS; nothing is written. */
export class DocTooLargeError extends Error {
  constructor(public size: number, public limit = MAX_DOC_CHARS) {
    super(t('This note is too large to save ({size} KB of {limit} KB). Remove some text.', { size: Math.ceil(size / 1024), limit: Math.floor(limit / 1024) }))
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

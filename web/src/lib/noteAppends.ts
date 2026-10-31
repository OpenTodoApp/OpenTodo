// Pending appends (OpenSpec change notes-overview, design D13; docs/sync.md
// "Mergeable documents" rule 5). A plain-text writer (the CLI, MCP, the
// append routes) adds text to a note without replacing it by writing one key
// `appends.<id>`. Every device that holds the note inserts the text at the end
// of the document, every inserted block carrying the append's id, and writes
// the key back as "" in the same batch as the document and its projection.
import type { RichText } from './docfields'
import { MAX_DOC_CHARS } from './docfields'
import type { Clock, RowEncryption } from './types'

/** The row fields the fold reads. */
export interface AppendRow {
  notes_doc?: string
  description?: string
  appends?: Record<string, string>
  _clock?: Clock
  _e2ee?: RowEncryption
}

/** The non-empty appends of a row this device can read, oldest first (clock order, then id). */
export function pendingAppends(row: AppendRow): { id: string; text: string }[] {
  const out: { id: string; text: string; ts: number; device: string }[] = []
  for (const [id, text] of Object.entries(row.appends ?? {})) {
    if (typeof text !== 'string' || !text) continue
    // A value this device could not decrypt is never folded.
    if (row._e2ee?.raw?.[`appends.${id}`]) continue
    const c = row._clock?.[`appends.${id}`]
    out.push({ id, text, ts: c?.ts ?? 0, device: c?.device ?? '' })
  }
  out.sort((a, b) => a.ts - b.ts || (a.device < b.device ? -1 : a.device > b.device ? 1 : 0) || (a.id < b.id ? -1 : 1))
  return out.map(({ id, text }) => ({ id, text }))
}

/**
 * The patch that folds a row's pending appends into its document (and keeps
 * one copy of each folded append), starting from `doc` (the merged or newly
 * written document; the stored one when undefined). An append whose block is
 * already in the document is only cleared; one that would make the document
 * exceed the size limit stays pending. Null when nothing changes or the
 * document is unreadable on this device.
 */
export function foldAppends(rt: RichText, row: AppendRow, doc?: string, limit = MAX_DOC_CHARS): Record<string, string> | null {
  let value = doc ?? row.notes_doc ?? ''
  if (!rt.isReadable(value)) return null
  const pending = pendingAppends(row)
  const patch: Record<string, string> = {}
  let changed = false
  if (pending.length && !value && row.description) {
    // A legacy note (text without a document) becomes a document first, as
    // when it is opened (foldNote).
    const c = row._clock?.description ?? { ts: 0, device: '' }
    value = rt.foldText('', row.description, c.ts, c.device)
    changed = true
  }
  for (const a of pending) {
    const next = rt.foldAppend(value, a.id, a.text, limit)
    if (next === null) continue
    if (next !== value) changed = true
    value = next
    patch[`appends.${a.id}`] = ''
  }
  const deduped = rt.dedupeAppends(value)
  if (deduped !== null) {
    value = deduped
    changed = true
  }
  if (!changed && Object.keys(patch).length === 0) return null
  return { ...patch, notes_doc: value, description: rt.projectDoc(value) }
}

/** Whether a row holds a pending append this device cannot fold because the note is full. */
export function noteIsFull(rt: RichText, row: AppendRow, limit = MAX_DOC_CHARS): boolean {
  const value = row.notes_doc ?? ''
  if (!rt.isReadable(value)) return false
  return pendingAppends(row).some((a) => rt.foldAppend(value, a.id, a.text, limit) === null)
}

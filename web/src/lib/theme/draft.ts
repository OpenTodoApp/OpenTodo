// The editor's working copy (OpenSpec change theme-editor, design D7): a session
// history of every change with undo and redo, the per-token undo, and the draft
// kept on the device (`ot.themeDraft.<id>`, written on every change) so a reload
// or a crash loses nothing. Nothing reaches the op log until Save. Drafts are per
// device and never synced. Pure apart from device storage.
import { readJSON, removeItem, writeJSON } from '../deviceStorage'
import type { ThemeDocument } from './format'

export const DRAFT_PREFIX = 'ot.themeDraft.'

/** A draft as kept on the device. */
export interface StoredDraft {
  v: 1
  doc: ThemeDocument
  /** The saved document (as JSON) the draft started from; null for a theme not saved yet. */
  base: string | null
}

const isDoc = (d: unknown): d is ThemeDocument => !!d && typeof d === 'object' && !Array.isArray(d) && typeof (d as ThemeDocument).seeds === 'object' && typeof (d as ThemeDocument).kind === 'string'

/** The draft of a theme on this device, or null. */
export function readDraft(id: string): StoredDraft | null {
  return readJSON<StoredDraft | null>(DRAFT_PREFIX + id, null, (v) => {
    const d = v as StoredDraft | null
    return d && d.v === 1 && isDoc(d.doc) && (d.base === null || typeof d.base === 'string') ? d : null
  })
}

/** Keeps the draft on this device (never an op). */
export function writeDraft(id: string, d: StoredDraft): void {
  writeJSON(DRAFT_PREFIX + id, d)
}

/** Drops the draft (after Save or Discard). */
export function clearDraft(id: string): void {
  removeItem(DRAFT_PREFIX + id)
}

/** The stable text of a document, for comparing documents. */
export const docText = (d: ThemeDocument | null | undefined) => (d ? JSON.stringify(d) : '')

/** The draft differs from the saved theme (or the theme was never saved). */
export function isDirty(doc: ThemeDocument, saved: ThemeDocument | null | undefined): boolean {
  return !saved || docText(doc) !== docText(saved)
}

/** The saved theme changed on another device since the draft began (design D7). */
export function changedElsewhere(d: StoredDraft, saved: ThemeDocument | null | undefined): boolean {
  return d.base !== null && !!saved && docText(saved) !== d.base
}

/** The document with a token set to a value (an explicit value; never the document passed in). */
export function withToken(doc: ThemeDocument, token: string, value: string | undefined): ThemeDocument {
  const tokens = { ...(doc.tokens ?? {}) }
  if (value === undefined) delete tokens[token]
  else tokens[token] = value
  const { tokens: _old, ...rest } = doc
  void _old
  return Object.keys(tokens).length ? { ...rest, tokens } : rest
}

// ---- history ----

export interface History {
  past: ThemeDocument[]
  present: ThemeDocument
  future: ThemeDocument[]
  /** The kind of the last change, so a slider's drag is one entry. */
  last?: string
}

/** The most entries kept; the oldest go first. */
const LIMIT = 200

export function startHistory(doc: ThemeDocument): History {
  return { past: [], present: doc, future: [] }
}

/**
 * Records a change. A change with the same `group` as the one before (one
 * slider's drag, typing in one field) replaces it instead of adding an entry.
 */
export function record(h: History, doc: ThemeDocument, group?: string): History {
  if (docText(doc) === docText(h.present)) return h
  if (group && group === h.last) return { ...h, present: doc, future: [] }
  return { past: [...h.past, h.present].slice(-LIMIT), present: doc, future: [], last: group }
}

export const canUndo = (h: History) => h.past.length > 0
export const canRedo = (h: History) => h.future.length > 0

export function undo(h: History): History {
  if (!canUndo(h)) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
}

export function redo(h: History): History {
  if (!canRedo(h)) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
}

/** A token's explicit value in a document, undefined when derived. */
export const tokenValue = (d: ThemeDocument, token: string) => d.tokens?.[token]

/** The token's value before its last change in this session, or null when it has not changed (design D6). */
export function previousTokenValue(h: History, token: string): { value: string | undefined } | null {
  const now = tokenValue(h.present, token)
  for (let i = h.past.length - 1; i >= 0; i--) {
    const v = tokenValue(h.past[i], token)
    if (v !== now) return { value: v }
  }
  return null
}

/** Reverts one token's last change as a new history entry (design D6, D7); unchanged when it has none. */
export function undoToken(h: History, token: string): History {
  const prev = previousTokenValue(h, token)
  return prev ? record(h, withToken(h.present, token, prev.value)) : h
}

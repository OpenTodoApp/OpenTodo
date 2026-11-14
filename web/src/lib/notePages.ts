// Note pages on the publisher's devices (OpenSpec change note-public-links). A
// note the server can read is published with one request. A note of an encrypted
// personal scope (design D4) is published here like an encrypted task page: a fresh
// share key, the page's snapshot (title, text, change time) encrypted with it, the
// key wrapped with the account key and appended to the link after `#`. Images and
// files are left out of an encrypted page. maintainNotePages, part of the task page
// pass after each sync, uploads a new snapshot within a minute of a change.
import { request } from './api'
import { db } from './db'
import { currentKey } from './e2ee'
import { sha256 } from './ids'
import { readJSON, writeJSON } from './deviceStorage'
import { encryptSnapshot, generateShareKey, shareKeyFragment, unwrapShareKey, wrapShareKey } from './taskPageCrypto'
import { setKnownNotePage, taskPageEncrypted } from './taskPages'
import type { Note, NotePageContent, NotePageCreated, NotePageStatus, OwnTaskPage } from './types'

const base = (noteId: string) => `/api/v1/notes/${encodeURIComponent(noteId)}/page`

export const notePageApi = {
  publish: (noteId: string, input: { label?: string; expiresInDays?: number; snapshot?: string; wrappedKey?: string }) =>
    request<NotePageCreated>('POST', base(noteId), input),
  status: (noteId: string) => request<NotePageStatus>('GET', base(noteId)),
  revoke: (noteId: string) => request<void>('DELETE', base(noteId)),
  putSnapshot: (noteId: string, input: { ciphertext: string; version: number; wrappedKey?: string }) =>
    request<{ ok: true }>('PUT', `${base(noteId)}/snapshot`, input),
}

/** Is the note served from a snapshot: an encrypted account's note outside every shared project? */
export const notePageEncrypted = (note: Pick<Note, 'project_id'>): Promise<boolean> => taskPageEncrypted(note)

const REF = /\[((?:\\.|[^\]\\[])*)\]\(\?(?:note|task|project)=[A-Za-z0-9_-]+\)/g
const FENCE = /^ {0,3}(```+|~~~+)/

/**
 * The text with each link to a note, task or project reduced to its text (design D2),
 * outside fenced blocks and code spans: the twin of internal/notelinks Strip, so an
 * encrypted page carries no id either.
 */
export function stripRefs(markdown: string): string {
  if (!markdown.includes('](?')) return markdown
  let open = ''
  return markdown.replace(/\r\n?/g, '\n').split('\n').map((line) => {
    if (open) {
      if (line.trimStart().startsWith(open)) open = ''
      return line
    }
    const fence = FENCE.exec(line)
    if (fence) {
      open = fence[1]
      return line
    }
    if (!line.includes('](?')) return line
    // Code spans stay as they are: split on backtick runs, odd parts are code.
    return line.split(/(`+[^`]*`+)/).map((part, i) => (i % 2 ? part : part.replace(REF, (m, text: string, at: number) => (at > 0 && part[at - 1] === '\\' ? m : text)))).join('')
  }).join('\n')
}

/** When the note's text last changed, from this device's field clocks. */
function textChangedAt(note: Note): number {
  const c = note._clock ?? {}
  return Math.max(c.title?.ts ?? 0, c.description?.ts ?? 0, c.notes_doc?.ts ?? 0) || note.created_at
}

/** Exactly what an encrypted note page shows, from this device's copy (design D4). */
export async function buildNoteSnapshot(noteId: string): Promise<NotePageContent | null> {
  const note = await db.notes.get(noteId)
  if (!note || note.deleted_at) return null
  const files = await db.attachments.filter((a) => a.note_id === noteId && !a.deleted_at).count()
  return { title: note.title, text: stripRefs(note.description ?? ''), changedAt: textChangedAt(note), links: [], files: [], omitted: files > 0 }
}

/** Publishes the note (or republishes it, replacing the old page) and returns the link to share. */
export async function publishNotePage(note: Note, opts: { label?: string; expiresInDays?: number }): Promise<NotePageCreated> {
  const input: { label?: string; expiresInDays?: number; snapshot?: string; wrappedKey?: string } = {}
  if (opts.label) input.label = opts.label
  if (opts.expiresInDays) input.expiresInDays = opts.expiresInDays
  if (!(await notePageEncrypted(note))) return remember(note.id, await notePageApi.publish(note.id, input))
  const account = await currentKey()
  if (!account) throw new Error('locked')
  const share = await generateShareKey()
  const snapshot = await buildNoteSnapshot(note.id)
  if (!snapshot) throw new Error('missing note')
  input.snapshot = await encryptSnapshot(share, snapshot)
  input.wrappedKey = await wrapShareKey(account, note.id, share)
  const created = await remember(note.id, await notePageApi.publish(note.id, input))
  rememberUploaded(created.id, hashOf(snapshot))
  // The share key travels only in the fragment, which browsers never send.
  return { ...created, link: `${created.link}#${await shareKeyFragment(share)}` }
}

/** Revokes the note's page. */
export async function revokeNotePage(noteId: string): Promise<void> {
  await notePageApi.revoke(noteId)
  setKnownNotePage(noteId, null)
}

async function remember(noteId: string, created: NotePageCreated): Promise<NotePageCreated> {
  setKnownNotePage(noteId, await notePageApi.status(noteId).catch(() => null))
  return created
}

// ---- keeping encrypted pages current ----

const UPLOADED_KEY = 'opentodo.notePageSnapshots'

function hashOf(content: unknown): string {
  const bytes = sha256(new TextEncoder().encode(JSON.stringify(content)))
  return Array.from(bytes.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
}

function uploaded(): Record<string, string> {
  return readJSON<Record<string, string>>(UPLOADED_KEY, {})
}

function rememberUploaded(pageId: string, hash: string): void {
  writeJSON(UPLOADED_KEY, { ...uploaded(), [pageId]: hash }) // storage refused: upload again next time
}

/** Uploads a new snapshot of each encrypted note page whose content changed on this device. */
export async function maintainNotePages(pages: readonly OwnTaskPage[], account: CryptoKey): Promise<void> {
  for (const p of pages) {
    if (p.kind !== 'note' || !p.noteId || !p.encrypted || !p.wrappedKey) continue
    let share: CryptoKey
    try { share = await unwrapShareKey(account, p.noteId, p.wrappedKey) } catch { continue }
    const snapshot = await buildNoteSnapshot(p.noteId)
    if (!snapshot) continue
    const hash = hashOf(snapshot)
    if (uploaded()[p.id] === hash) continue
    await notePageApi.putSnapshot(p.noteId, { ciphertext: await encryptSnapshot(share, snapshot), version: Date.now() })
    rememberUploaded(p.id, hash)
  }
}

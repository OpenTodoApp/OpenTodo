// Attachments on the client (OpenSpec `attachments`, design D3, D7). The metadata
// is an ordinary synced entity written with mutate(), so a file added offline is
// listed at once; its bytes wait in `attachmentBlobs` until the uploader sends
// them after a sync round, and the server says the file is stored by writing
// `uploaded_at`, which reaches every device through sync.
import { useLiveQuery } from 'dexie-react-hooks'
import { useSyncExternalStore } from 'react'
import { api, isNetworkError } from './api'
import { db, getMeta, setMeta, type AttachmentBlob } from './db'
import { mutateMany, type Change } from './ops'
import { currentUserId } from './sharing'
import { applyBatch } from './undo'
import type { Attachment, AttachmentLimits } from './types'

/** The longest attachment name the server accepts. */
export const MAX_NAME = 255
const LIMITS_KEY = 'attachmentLimits'

/** Why a file could not be added; `message` is ready to show. */
export class AttachmentError extends Error {
  constructor(public code: 'disabled' | 'too_large' | 'quota' | 'signed_out' | 'invalid', message: string) {
    super(message)
  }
}

// ---- limits ----

/** The last known limits and usage, or null before the first `/me` with attachments. */
export function limits(): Promise<AttachmentLimits | null> {
  return getMeta<AttachmentLimits | null>(LIMITS_KEY, null)
}

/** Fetch `/me` and remember its attachment limits; offline keeps the last known ones. */
export async function refreshLimits(): Promise<AttachmentLimits | null> {
  try {
    const me = await api.me()
    if (me.attachments) {
      const old = await limits()
      // New limits may let a refused file through: try the waiting ones again.
      if (old && (old.enabled !== me.attachments.enabled || old.max_file_bytes !== me.attachments.max_file_bytes || old.quota_bytes !== me.attachments.quota_bytes)) retryWaiting = true
      await setMeta(LIMITS_KEY, me.attachments)
      return me.attachments
    }
  } catch {
    // Offline: the cached value stays.
  }
  return limits()
}

/** The cached limits for React (live, from this device's store); null until known. */
export function useAttachmentLimits(): AttachmentLimits | null {
  return useLiveQuery(() => limits(), [], null) ?? null
}

/** "1.5 MB", "820 KB", "12 bytes". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} ${n === 1 ? 'byte' : 'bytes'}`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 10 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}

// ---- adding ----

/** A file name the server accepts: no path separators, at most 255 characters, never empty. */
export function cleanName(name: string): string {
  const n = name.replace(/[/\\]/g, '_').replace(/[\u0000-\u001f]/g, '').trim()
  return (n || 'file').slice(0, MAX_NAME)
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** One planned file: its ops and the bytes to keep for upload. */
export interface PlannedFile {
  change: Change
  blob: AttachmentBlob
}

/**
 * Plan the attachment rows for files (limit checks, digest) without writing
 * anything, so a caller can put them in one batch with its own changes (a
 * comment and its files, a shared task and its files).
 */
export async function planFiles(taskId: string, files: File[], opts: { commentId?: string | null } = {}): Promise<PlannedFile[]> {
  const author = await currentUserId()
  if (!author) throw new AttachmentError('signed_out', 'Sign in to add files.')
  const l = await limits()
  if (l && !l.enabled) throw new AttachmentError('disabled', 'Attachments are turned off on this server.')
  let room = l && l.quota_bytes > 0 ? l.quota_bytes - l.used_bytes - (await pendingBytes()) : Infinity
  const out: PlannedFile[] = []
  // One millisecond apart, so the uploader keeps the order the files were picked in.
  const now = Date.now()
  for (const [i, file] of files.entries()) {
    if (l && file.size > l.max_file_bytes) {
      throw new AttachmentError('too_large', `“${file.name}” is ${formatBytes(file.size)}; files may be at most ${formatBytes(l.max_file_bytes)} on this server.`)
    }
    if (file.size > room) throw new AttachmentError('quota', `“${file.name}” would go over your ${formatBytes(l?.quota_bytes ?? 0)} of attachments.`)
    room -= file.size
    const id = crypto.randomUUID()
    const name = cleanName(file.name)
    const sha256 = await sha256Hex(file)
    out.push({
      // task_id and author_id first: they place and authorize the row.
      change: { entity: 'attachment', entityId: id, patch: {
        task_id: taskId, author_id: author, comment_id: opts.commentId ?? null, name, mime: file.type || 'application/octet-stream',
        size: file.size, sha256, url: null, encrypted: false, created_at: now + i, uploaded_at: null, deleted_at: null,
      } },
      blob: { id, blob: file, name, size: file.size },
    })
  }
  return out
}

/**
 * Write planned files together with other changes in one batch. The bytes are
 * stored first, so a row never exists on this device without its file.
 */
export async function commitFiles(planned: PlannedFile[], before: Change[] = []): Promise<string[]> {
  await db.attachmentBlobs.bulkPut(planned.map((p) => p.blob))
  try {
    await mutateMany([...before, ...planned.map((p) => p.change)])
  } catch (err) {
    await db.attachmentBlobs.bulkDelete(planned.map((p) => p.blob.id))
    throw err
  }
  requestUpload()
  return planned.map((p) => p.blob.id)
}

/** Attach files to a task (or one of the user's comments on it). Returns the new ids. */
export async function queueFiles(taskId: string, files: File[], opts: { commentId?: string | null } = {}): Promise<string[]> {
  return commitFiles(await planFiles(taskId, files, opts))
}

/** Attach one file. Returns its id. */
export async function queueFile(taskId: string, file: File, commentId?: string | null): Promise<string> {
  return (await queueFiles(taskId, [file], { commentId }))[0]
}

/** An http(s) address, or null. */
export function parseLink(text: string): URL | null {
  try {
    const u = new URL(text.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

/** Attach a link. Returns its id. */
export async function queueLink(taskId: string, url: string, name?: string, commentId?: string | null): Promise<string> {
  const u = parseLink(url)
  if (!u) throw new AttachmentError('invalid', 'Links start with http:// or https://.')
  const author = await currentUserId()
  if (!author) throw new AttachmentError('signed_out', 'Sign in to add links.')
  const id = crypto.randomUUID()
  await mutateMany([{ entity: 'attachment', entityId: id, patch: {
    task_id: taskId, author_id: author, comment_id: commentId ?? null, name: cleanName(name?.trim() || u.hostname),
    mime: 'text/uri-list', size: 0, sha256: '', url: u.href, encrypted: false, created_at: Date.now(), uploaded_at: null, deleted_at: null,
  } }])
  return id
}

async function pendingBytes(): Promise<number> {
  let n = 0
  await db.attachmentBlobs.each((b) => { n += b.size })
  return n
}

// ---- changing ----

/** Rename (author only; the server refuses anyone else). */
export async function renameAttachment(id: string, name: string): Promise<void> {
  const clean = cleanName(name)
  await mutateMany([{ entity: 'attachment', entityId: id, patch: { name: clean } }])
}

/**
 * Remove: a tombstone, undone by `restoreAttachment`. A file not uploaded yet is
 * never uploaded: its bytes stay only until the removal has synced (so an undo
 * right away still has them), then the uploader drops them. Returns the undo
 * entry's id for the undo toast.
 */
export async function removeAttachment(id: string, name?: string): Promise<string | null> {
  const entry = await applyBatch([{ entity: 'attachment', entityId: id, patch: { deleted_at: Date.now() } }], { source: 'bulk', label: name ? `Removed “${name}”` : 'Attachment removed' })
  return entry?.id ?? null
}

export async function restoreAttachment(id: string): Promise<void> {
  await mutateMany([{ entity: 'attachment', entityId: id, patch: { deleted_at: null } }])
  requestUpload()
}

// ---- reading ----

/** The content route of an attachment; `download` forces a download. */
export function contentUrl(id: string, download = false): string {
  return `/api/v1/attachments/${encodeURIComponent(id)}/content${download ? '?download=1' : ''}`
}

/** Where an attachment stands, for the list (design D7). */
export type AttachmentState = 'link' | 'available' | 'uploading' | 'waiting' | 'pending'

export function stateOf(a: Attachment, blob: AttachmentBlob | undefined): AttachmentState {
  if (a.url) return 'link'
  if (a.uploaded_at) return 'available'
  if (blob) return blob.reason ? 'waiting' : 'uploading'
  return 'pending'
}

/** Image types the app shows as thumbnails. */
export function isImage(mime: string): boolean {
  return /^image\/(png|jpeg|gif|webp|avif|svg\+xml)$/.test(mime)
}

/**
 * Open an attachment in a new tab: a link opens its address; a file this
 * device still holds opens from here (also offline); an uploaded file opens
 * from the server, which serves risky types as downloads.
 */
export async function openAttachment(a: Attachment, opts: { download?: boolean } = {}): Promise<void> {
  if (a.url) {
    window.open(a.url, '_blank', 'noopener,noreferrer')
    return
  }
  const local = await db.attachmentBlobs.get(a.id)
  if (local) {
    const href = URL.createObjectURL(new Blob([local.blob], { type: a.mime }))
    const link = document.createElement('a')
    link.href = href
    link.target = '_blank'
    link.rel = 'noopener'
    if (opts.download || !isInlineType(a.mime)) link.download = a.name
    link.click()
    setTimeout(() => URL.revokeObjectURL(href), 60_000)
    return
  }
  window.open(contentUrl(a.id, opts.download), '_blank', 'noopener')
}

/** The types the server shows in the browser (design D6); the rest download. */
export function isInlineType(mime: string): boolean {
  return /^(image\/(png|jpeg|gif|webp|avif)|application\/pdf|text\/plain|audio\/.+|video\/.+)$/.test(mime)
}

// ---- uploading ----

const progress = new Map<string, number>()
const progressListeners = new Set<() => void>()
let progressVersion = 0
function setProgress(id: string, fraction: number | null) {
  if (fraction === null) progress.delete(id)
  else progress.set(id, fraction)
  progressVersion++
  progressListeners.forEach((fn) => fn())
}

/** Upload progress of an attachment on this device (0–1), or null when it is not uploading. */
export function useUploadProgress(id: string): number | null {
  useSyncExternalStore(
    (fn) => {
      progressListeners.add(fn)
      return () => progressListeners.delete(fn)
    },
    () => progressVersion,
  )
  return progress.get(id) ?? null
}

let running: Promise<void> | null = null
let again = false
/** Files the server refused are retried once per app start, after new limits, or on request. */
let retryWaiting = true

/** Try a refused file again (the "Try again" action). */
export async function retryUpload(id: string): Promise<void> {
  await db.attachmentBlobs.update(id, { reason: undefined })
  requestUpload()
}

/** Ask the uploader to run soon (after a local add or a restore). */
export function requestUpload(): void {
  uploadHook?.()
}
let uploadHook: (() => void) | null = null
/** The sync loop registers how to get an upload going (after its next round). */
export function onUploadRequest(fn: (() => void) | null): void {
  uploadHook = fn
}

/**
 * Send waiting files, oldest first, one at a time (design D3). Runs after a
 * successful sync round with an empty outbox, so the server already has the rows.
 * A 404 means the row has not reached the server yet: wait for the next round.
 */
export function runUploader(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      do {
        again = false
        await uploadPass()
      } while (again)
    } finally {
      running = null
    }
  })()
  return running
}

async function uploadPass(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  if ((await db.outbox.count()) > 0) return
  const blobs = await db.attachmentBlobs.toArray()
  if (blobs.length === 0) return
  const rows = new Map((await db.attachments.bulkGet(blobs.map((b) => b.id))).filter((r): r is Attachment => !!r).map((r) => [r.id, r]))
  const queue = blobs.filter((b) => rows.has(b.id)).sort((a, b) => rows.get(a.id)!.created_at - rows.get(b.id)!.created_at)
  // A blob without a row: the creation was refused or purged; nothing will want it.
  const orphans = blobs.filter((b) => !rows.has(b.id)).map((b) => b.id)
  if (orphans.length) await db.attachmentBlobs.bulkDelete(orphans)
  let uploaded = false
  const retry = retryWaiting
  retryWaiting = false
  for (const b of queue) {
    const row = rows.get(b.id)!
    if (b.reason && !retry && !row.deleted_at) continue
    if (row.deleted_at || row.uploaded_at) {
      await db.attachmentBlobs.delete(b.id)
      continue
    }
    let res
    try {
      setProgress(b.id, 0)
      res = await api.uploadAttachment(b.id, b.blob, (f) => setProgress(b.id, f))
    } catch (err) {
      if (isNetworkError(err)) return
      throw err
    } finally {
      setProgress(b.id, null)
    }
    if (res.status === 204 || res.status === 409) {
      // Stored (or stored already by an earlier try): the server's uploaded_at follows by sync.
      await db.attachmentBlobs.delete(b.id)
      uploaded = true
      continue
    }
    if (res.status === 404) return
    const reason = res.message ?? `The server refused the file (${res.status}).`
    if (res.status === 413 || res.status === 403 || res.status === 429 || res.status === 400 || res.status === 507) {
      await db.attachmentBlobs.update(b.id, { reason })
      if (res.status === 429 || res.status === 507) return
      continue
    }
    return
  }
  if (uploaded) void refreshLimits()
}

/** Live attachments per task (comment attachments included, a deleted comment's not), for the row paperclip. */
export async function attachmentCounts(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const rows = await db.attachments.filter((a) => !a.deleted_at).toArray()
  const commentIds = [...new Set(rows.map((a) => a.comment_id).filter((c): c is string => !!c))]
  const deadComments = new Set((await db.comments.bulkGet(commentIds)).filter((c) => !c || c.deleted_at).map((c, i) => c?.id ?? commentIds[i]))
  for (const a of rows) if (!a.comment_id || !deadComments.has(a.comment_id)) out.set(a.task_id, (out.get(a.task_id) ?? 0) + 1)
  return out
}

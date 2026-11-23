// A link attachment's fields (attachments "Link attachments"), shared by Attach →
// Add a link… (attachments.ts) and the links typed in quick add or a title
// (quick-add-links D2, D3), so both write the same attachment. No imports beyond
// types: ops.ts plans these in a new task's batch.
import type { Change } from './ops'

/** An http(s) address, or null. */
export function parseLink(text: string): URL | null {
  try {
    const u = new URL(text.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null
  } catch {
    return null
  }
}

/** Longest attachment name (attachments.ts MAX_NAME). */
const MAX_NAME = 255

/** The change that creates a link attachment `id` on `parent`, named `name` or after the link's host. */
export function linkChange(id: string, parent: { task_id?: string; note_id?: string }, u: URL, author: string, opts: { name?: string; commentId?: string | null; now?: number } = {}): Change {
  const name = (opts.name?.trim() || u.hostname).replace(/[/\\]/g, '_').replace(/[\u0000-\u001f]/g, '').trim() || 'file'
  return { entity: 'attachment', entityId: id, patch: {
    ...parent, author_id: author, comment_id: opts.commentId ?? null, name: name.slice(0, MAX_NAME),
    mime: 'text/uri-list', size: 0, sha256: '', url: u.href, encrypted: false, created_at: opts.now ?? Date.now(), uploaded_at: null, deleted_at: null,
  } }
}

/**
 * The link attachments of a new task, for the URLs a line named (quick-add-links D2):
 * each http(s) URL once, in order, except the task's origin and links it already has.
 */
export function linkChanges(taskId: string, urls: readonly string[] | undefined, author: string | null, opts: { origin?: string | null; existing?: readonly string[]; now?: number; id: () => string }): Change[] {
  if (!urls?.length || !author) return []
  const seen = new Set<string>(opts.existing ?? [])
  const now = opts.now ?? Date.now()
  const origin = opts.origin ? parseLink(opts.origin)?.href : undefined
  if (origin) seen.add(origin)
  const out: Change[] = []
  for (const raw of urls) {
    const u = parseLink(raw)
    if (!u || seen.has(u.href)) continue
    seen.add(u.href)
    // One millisecond apart, so the list shows them in the order typed (it sorts by created_at).
    out.push(linkChange(opts.id(), { task_id: taskId }, u, author, { now: now + out.length }))
  }
  return out
}

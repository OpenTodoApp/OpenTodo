// Attachments that move with a note (OpenSpec change note-attachments, D3, D4):
// a note copied into another sharing scope, turned into a task, or a task's note
// moved out into a note takes its files along as new rows that share the stored
// file (`file_id`), so nothing is uploaded again; the old rows are removed in the
// same batch and the text's embeds are rewritten to the new ids.
import type { ProposedChange } from './assistantTypes'
import { fileKeyOf, noteParent, parentFields, parentOf, type AttachParent } from './attachments'

export { noteParent }
import { db } from './db'
import { uuid } from './ids'
import { currentUserId } from './sharing'
import type { Attachment } from './types'

export interface AttachmentMove {
  /** Creations of the new rows and removals of the old ones. */
  changes: ProposedChange[]
  /** Old id → new id, for the embeds. */
  renamed: Map<string, string>
}

export interface MoveOptions {
  /** Only these attachments (a task's note moved out takes the files it embeds). */
  only?: Set<string>
  /** Leave encrypted files behind: a shared project's members could not read them. */
  plainOnly?: boolean
  now?: number
}

/** The live attachments of a parent (not of its comments). */
async function liveOf(parent: AttachParent): Promise<Attachment[]> {
  return (await db.attachments.toArray()).filter((a) => !a.deleted_at && !a.comment_id && parentOf(a) === parent)
}

/**
 * Plans moving the attachments of `from` to `to`. The new rows are written by
 * the current user, keep each file's name, type, digest and creation time and
 * name the original's stored file; a file still waiting to upload from this
 * device keeps a local copy of its bytes under the new id, so it shows offline.
 */
export async function planAttachmentMove(from: AttachParent, to: AttachParent, opts: MoveOptions = {}): Promise<AttachmentMove> {
  const now = opts.now ?? Date.now()
  const me = await currentUserId()
  const changes: ProposedChange[] = []
  const renamed = new Map<string, string>()
  if (!me) return { changes, renamed }
  for (const a of await liveOf(from)) {
    if (opts.only && !opts.only.has(a.id)) continue
    if (opts.plainOnly && a.encrypted) continue
    const id = uuid()
    renamed.set(a.id, id)
    changes.push({
      entity: 'attachment', entityId: id, create: true, patch: {
        ...parentFields(to), author_id: me, comment_id: null, name: a.name, mime: a.mime, size: a.size, sha256: a.sha256, url: a.url ?? null,
        encrypted: !!a.encrypted, file_id: a.url ? null : fileKeyOf(a), created_at: a.created_at, uploaded_at: a.url ? null : a.uploaded_at ?? null, deleted_at: null,
      },
    })
    changes.push({ entity: 'attachment', entityId: a.id, patch: { deleted_at: now }, base: { deleted_at: null } })
    const local = a.uploaded_at ? undefined : await db.attachmentBlobs.get(a.id)
    if (local) await db.attachmentBlobs.put({ ...local, id })
  }
  return { changes, renamed }
}

const EMBED = /(!\[(?:\\.|[^\]\\])*\]\(attachment:)([A-Za-z0-9_-]+)\)/g

/** The attachment ids a note's Markdown embeds (as lib/markdown embeddedIds, without loading it). */
export function embeddedAttachmentIds(markdown: string): Set<string> {
  return new Set([...markdown.matchAll(EMBED)].map((m) => m[2]))
}

/** The Markdown with each `attachment:<old>` embed pointing at its new id. */
export function renameEmbeds(markdown: string, renamed: Map<string, string>): string {
  if (renamed.size === 0) return markdown
  return markdown.replace(EMBED, (m, head: string, id: string) => {
    const next = renamed.get(id)
    return next ? `${head}${next})` : m
  })
}

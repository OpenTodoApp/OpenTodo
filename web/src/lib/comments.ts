// Comments on the client (OpenSpec `comments-and-activity`). A comment is an
// ordinary synced entity: writing one is a mutate() (applied locally, queued,
// works offline). The server enforces authorship and roles per op; the helpers
// below mirror those rules so the UI only offers what will be accepted.
import { db } from './db'
import { mutate } from './ops'
import { commitFiles, planFiles } from './attachments'
import { currentUserId } from './sharing'
import type { Comment, Membership, ProjectMember, ProjectRole } from './types'
import { t } from './i18n'
import { uuid } from './ids'

/**
 * Create a comment on a task (optionally replying to another). Returns its id.
 * Files become attachments of the comment, written in the same batch
 * (OpenSpec attachments); a comment with files may have no text.
 */
export async function createComment(input: { taskId: string; body: string; parentId?: string | null; mentions?: string[]; files?: File[] }): Promise<string> {
  const body = input.body.trim()
  const files = input.files ?? []
  if (!body && files.length === 0) throw new Error(t('a comment needs some text'))
  const author = await currentUserId()
  if (!author) throw new Error(t('sign in to comment'))
  const id = uuid()
  // task_id and author_id first: they place and authorize the comment.
  const patch = {
    task_id: input.taskId, author_id: author, body, parent_id: input.parentId ?? null,
    mentions: [...new Set(input.mentions ?? [])], created_at: Date.now(), edited_at: null, deleted_at: null,
  }
  if (files.length === 0) {
    await mutate('comment', id, patch)
    return id
  }
  // Limits are checked before anything is written.
  const planned = await planFiles(input.taskId, files, { commentId: id })
  await commitFiles(planned, [{ entity: 'comment', entityId: id, patch }])
  return id
}

/** Replace a comment's body (author only) and mark it edited. */
export async function editComment(id: string, body: string, mentions?: string[]): Promise<void> {
  const text = body.trim()
  if (!text) throw new Error(t('a comment needs some text'))
  const patch: Record<string, unknown> = { body: text, edited_at: Date.now() }
  if (mentions) patch.mentions = [...new Set(mentions)]
  await mutate('comment', id, patch)
}

/** Delete a comment: it keeps its place in the thread as a placeholder. */
export async function deleteComment(id: string): Promise<void> {
  await mutate('comment', id, { deleted_at: Date.now() })
}

/** Only the author edits a comment (the server refuses anyone else with `forbidden`). */
export function canEditComment(c: Pick<Comment, 'author_id' | 'deleted_at'>, me: string | null): boolean {
  return !!me && c.author_id === me && !c.deleted_at
}

/** The author, project admins and the owner may delete (personal tasks: the user is the owner). */
export function canDeleteComment(c: Pick<Comment, 'author_id' | 'deleted_at'>, me: string | null, role: ProjectRole): boolean {
  if (c.deleted_at || !me) return false
  return c.author_id === me || role === 'owner' || role === 'admin'
}

export interface Thread {
  root: Comment
  replies: Comment[]
}

const byCreation = (a: Comment, b: Comment) => a.created_at - b.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Thread order (mirrors sync.ThreadOrder on the server): top-level comments by
 * creation time, each with every reply in its thread (a reply to a reply
 * attaches to the same thread) in creation time. A comment whose parent is
 * unknown, on another task or part of a cycle starts its own thread. Deleted
 * comments stay in place so the UI can show a placeholder.
 */
export function threadOrder(comments: Comment[]): Thread[] {
  const byId = new Map(comments.map((c) => [c.id, c]))
  const rootOf = (c: Comment): string => {
    const seen = new Set([c.id])
    let cur = c
    for (;;) {
      const p = cur.parent_id ? byId.get(cur.parent_id) : undefined
      if (p && seen.has(p.id)) return c.id // a cycle: the comment starts its own thread
      if (!p || p.task_id !== c.task_id) return cur.id
      seen.add(p.id)
      cur = p
    }
  }
  const threads = new Map<string, Thread>()
  const replies: Comment[] = []
  for (const c of comments) {
    if (rootOf(c) === c.id) threads.set(c.id, { root: c, replies: [] })
    else replies.push(c)
  }
  for (const r of replies) threads.get(rootOf(r))?.replies.push(r)
  const out = [...threads.values()].sort((a, b) => byCreation(a.root, b.root))
  for (const item of out) item.replies.sort(byCreation)
  return out
}

/** A thread is shown unless every comment in it is deleted. */
export const threadVisible = (item: Thread) => !item.root.deleted_at || item.replies.some((r) => !r.deleted_at)

/** Number of live comments per task id (the indicator on task rows). */
export async function commentCounts(): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  await db.comments.each((c) => {
    if (!c.deleted_at) out.set(c.task_id, (out.get(c.task_id) ?? 0) + 1)
  })
  return out
}

// ---- mentions ----

/** The @word being typed at the caret, or null: `{ query, start }` with start at the `@`. */
export function mentionAt(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret)
  const m = /(^|\s)@([\p{L}\p{N}._-]*)$/u.exec(before)
  if (!m) return null
  return { query: m[2], start: caret - m[2].length - 1 }
}

/** Members whose name or email starts with (or contains) the query, best matches first. */
export function mentionCandidates(members: Pick<ProjectMember, 'userId' | 'name' | 'email'>[], query: string, me?: string | null): Pick<ProjectMember, 'userId' | 'name' | 'email'>[] {
  const q = query.toLowerCase()
  const scored = members
    .filter((m) => m.userId !== me)
    .map((m) => {
      const name = (m.name || m.email).toLowerCase()
      const score = name.startsWith(q) ? 0 : m.email.toLowerCase().startsWith(q) ? 1 : name.includes(q) ? 2 : -1
      return { m, score }
    })
    .filter((x) => x.score >= 0)
  return scored.sort((a, b) => a.score - b.score || (a.m.name || a.m.email).localeCompare(b.m.name || b.m.email)).slice(0, 6).map((x) => x.m)
}

/** The token inserted for a member: their name without spaces, else the email's local part. */
export function mentionToken(m: Pick<ProjectMember, 'name' | 'email'>): string {
  const base = (m.name || m.email.split('@')[0]).replace(/\s+/g, '')
  return base || m.email
}

/** The picked members still mentioned in the final body (a removed `@token` drops its mention). */
export function mentionsInBody(body: string, picked: Map<string, string>): string[] {
  const out: string[] = []
  for (const [userId, token] of picked) {
    const re = new RegExp(`(^|\\s)@${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_-])`, 'u')
    if (re.test(body)) out.push(userId)
  }
  return out
}

/** The members a comment on a task may mention: those of its shared project, none for a personal task. */
export function mentionableMembers(projectId: string | null | undefined, memberships: Map<string, Membership>): ProjectMember[] {
  const m = projectId ? memberships.get(projectId) : undefined
  return m ? m.members : []
}

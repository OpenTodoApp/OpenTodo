// Task pages on the publisher's devices (OpenSpec change task-pages). Publishing a
// task the server can read is one request; publishing a task of an encrypted
// personal scope (design D3) is done here: a fresh share key, the page's snapshot
// encrypted with it, the key wrapped with the account key, and the key appended to
// the link after `#`. maintainTaskPages runs after each sync and keeps encrypted
// pages current (a new snapshot within a minute of a change) and imports the
// guests' encrypted replies as comments (D4), with ids derived from the reply ids so
// two devices importing at once write the same comment.
import { api } from './api'
import { db } from './db'
import { currentKey, isEnabled } from './e2ee'
import { sharedProjectIds } from './feed'
import { nameId, sha256 } from './ids'
import { locationOf } from './locations'
import { mutate } from './ops'
import { currentUserId } from './sharing'
import { decryptReply, encryptSnapshot, generateShareKey, shareKeyFragment, unwrapShareKey, wrapShareKey } from './taskPageCrypto'
import { setKnownTaskPages } from './taskPageStore'
import type { PublishTaskPageInput, Task, TaskPageContent, TaskPageCreated, TaskPageRights } from './types'

/** Is the task served from a snapshot: an encrypted account's task outside every shared project? */
export async function taskPageEncrypted(task: Pick<Task, 'project_id'>): Promise<boolean> {
  if (!(await isEnabled())) return false
  if (!task.project_id) return true
  return !(await sharedProjectIds()).includes(task.project_id)
}

/** Subtasks under taskId, depth first by position, at most three levels deep. */
async function subtasksOf(taskId: string): Promise<TaskPageContent['subtasks']> {
  const all = (await db.tasks.toArray()).filter((t) => !t.deleted_at)
  const kids = new Map<string, Task[]>()
  for (const t of all) {
    if (!t.parent_id) continue
    kids.set(t.parent_id, [...(kids.get(t.parent_id) ?? []), t])
  }
  const out: TaskPageContent['subtasks'] = []
  const walk = (parent: string, depth: number) => {
    for (const k of (kids.get(parent) ?? []).sort((a, b) => a.position - b.position)) {
      out.push({ id: k.id, title: k.title, completed_at: k.completed_at, depth })
      if (depth < 3) walk(k.id, depth + 1)
    }
  }
  walk(taskId, 1)
  return out
}

/**
 * Exactly what the live route shows (design D3: the snapshot has the live field
 * set), from this device's copy. Encrypted pages carry link attachments only.
 */
export async function buildSnapshot(taskId: string, opts: { includeMap: boolean; publishedAt: number; myName: string }): Promise<TaskPageContent | null> {
  const task = await db.tasks.get(taskId)
  if (!task || task.deleted_at) return null
  const attachments = (await db.attachments.where('task_id').equals(taskId).toArray())
    .filter((a) => !a.deleted_at && !a.comment_id && a.url)
    .sort((a, b) => a.created_at - b.created_at)
  const comments = (await db.comments.where('task_id').equals(taskId).toArray())
    .filter((c) => !c.deleted_at && c.created_at >= opts.publishedAt)
    .sort((a, b) => a.created_at - b.created_at)
  const location = opts.includeMap ? locationOf(task) : null
  return {
    id: task.id,
    title: task.title,
    description: task.description ?? '',
    due: task.due ? { date: task.due.date, ...(task.due.time ? { time: task.due.time } : {}) } : null,
    deadline: task.deadline ?? null,
    completed_at: task.completed_at,
    subtasks: await subtasksOf(taskId),
    links: attachments.map((a) => ({ id: a.id, name: a.name, url: a.url! })),
    files: [],
    location: location && location !== 'encrypted' ? location : null,
    comments: comments.map((c) => ({ id: c.id, name: c.guest_name || opts.myName, guest: !!c.guest_name, body: c.body, createdAt: c.created_at })),
  }
}

export interface PublishOptions {
  rights: TaskPageRights
  label?: string
  expiresInDays?: number
  includeMap?: boolean
}

/** Publishes the task (or republishes it, replacing the old page) and returns the link to share. */
export async function publishTaskPage(task: Task, opts: PublishOptions, myName: string): Promise<TaskPageCreated> {
  const input: PublishTaskPageInput = { rights: opts.rights, includeMap: opts.includeMap ?? true }
  if (opts.label) input.label = opts.label
  if (opts.expiresInDays) input.expiresInDays = opts.expiresInDays
  if (!(await taskPageEncrypted(task))) return api.publishTaskPage(task.id, input)
  const account = await currentKey()
  if (!account) throw new Error('locked')
  const share = await generateShareKey()
  const snapshot = await buildSnapshot(task.id, { includeMap: input.includeMap!, publishedAt: Date.now(), myName })
  if (!snapshot) throw new Error('missing task')
  input.snapshot = await encryptSnapshot(share, snapshot)
  input.wrappedKey = await wrapShareKey(account, task.id, share)
  const created = await api.publishTaskPage(task.id, input)
  // The share key travels only in the fragment, which browsers never send.
  rememberUploaded(created.id, hashOf(snapshot))
  return { ...created, link: `${created.link}#${await shareKeyFragment(share)}` }
}

// ---- keeping encrypted pages current ----

const UPLOADED_KEY = 'opentodo.taskPageSnapshots'

function hashOf(content: unknown): string {
  const bytes = sha256(new TextEncoder().encode(JSON.stringify(content)))
  return Array.from(bytes.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('')
}

function uploaded(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(UPLOADED_KEY) ?? '{}') as Record<string, string> } catch { return {} }
}

function rememberUploaded(pageId: string, hash: string): void {
  try { localStorage.setItem(UPLOADED_KEY, JSON.stringify({ ...uploaded(), [pageId]: hash })) } catch { /* storage refused: upload again next time */ }
}

let running: Promise<void> | null = null
let lastRun = 0
let again = false
let deferred: ReturnType<typeof setTimeout> | null = null
/** At most one pass per this many ms (the spec allows a minute). */
export const MAINTAIN_INTERVAL_MS = 30_000

/**
 * One pass over the user's encrypted pages: upload a new snapshot when what the page
 * shows changed, import pending replies as comments and confirm them. Called after
 * every sync; skipped while locked or offline, never throws. A call that comes too
 * soon, or while a pass runs, is not dropped: one more pass follows once the interval
 * is over, because with the live stream the next sync can be minutes away.
 */
export function maintainTaskPages(opts: { force?: boolean } = {}): Promise<void> {
  if (running) {
    again = true
    return running
  }
  const wait = MAINTAIN_INTERVAL_MS - (Date.now() - lastRun)
  if (!opts.force && wait > 0) {
    deferred ??= setTimeout(() => {
      deferred = null
      void maintainTaskPages()
    }, wait)
    return Promise.resolve()
  }
  if (deferred) {
    clearTimeout(deferred)
    deferred = null
  }
  lastRun = Date.now()
  running = maintain().catch(() => undefined).finally(() => {
    running = null
    if (again) {
      again = false
      void maintainTaskPages()
    }
  })
  return running
}

async function maintain(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  const { pages } = await api.myTaskPages()
  if (!Array.isArray(pages)) return
  // The panel's "Published" marker reads these (lib/taskPageStore).
  setKnownTaskPages(pages)
  if (!(await isEnabled())) return
  const account = await currentKey()
  if (!account) return
  const encrypted = pages.filter((p) => p.encrypted && p.wrappedKey)
  if (encrypted.length === 0) return
  const me = await currentUserId()
  const myName = (await api.me().catch(() => null))?.user.name ?? ''
  for (const p of encrypted) {
    let share: CryptoKey
    try { share = await unwrapShareKey(account, p.taskId, p.wrappedKey!) } catch { continue }
    const snapshot = await buildSnapshot(p.taskId, { includeMap: p.includeMap, publishedAt: p.publishedAt, myName })
    if (snapshot) {
      const hash = hashOf(snapshot)
      if (uploaded()[p.id] !== hash) {
        await api.putTaskPageSnapshot(p.taskId, { ciphertext: await encryptSnapshot(share, snapshot), version: Date.now() })
        rememberUploaded(p.id, hash)
      }
    }
    if (p.pendingReplies > 0 && me) await importReplies(p.taskId, p.id, share, me)
  }
}

/** Imports one page's pending replies as comments by "<name> (guest)" and confirms each. */
export async function importReplies(taskId: string, pageId: string, share: CryptoKey, me: string): Promise<number> {
  const { replies } = await api.taskPageReplies(taskId)
  let imported = 0
  for (const r of replies) {
    let reply
    try { reply = await decryptReply(share, r.ciphertext) } catch { continue } // not openable: leave it for the publisher to revoke
    const id = replyCommentId(r.id)
    if (!(await db.comments.get(id))) {
      await mutate('comment', id, {
        task_id: taskId, author_id: me, body: reply.body, parent_id: null, mentions: [], created_at: r.createdAt,
        edited_at: null, deleted_at: null, guest_name: reply.name, page_id: pageId,
      })
    }
    await api.confirmTaskPageReply(taskId, r.id)
    imported++
  }
  return imported
}

/** The comment id of an imported reply: the same on every device (design D4). */
export function replyCommentId(replyId: string): string {
  return nameId('task_page_reply', replyId)
}

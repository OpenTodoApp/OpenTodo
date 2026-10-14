// Comments tab of the task panel (OpenSpec task-detail-redesign D5; comments
// "Comment thread in the client", "Readable comment presentation", "Composer
// behaviour"): threads oldest first, chat style, with the composer after the
// newest one. Built from local storage, so it reads and writes offline. Viewers
// may comment, so it ignores the panel's read-only mode.
import { useLiveQuery } from 'dexie-react-hooks'
import { forwardRef, useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  canDeleteComment, canEditComment, createComment, deleteComment, editComment, mentionableMembers, type Thread, threadOrder, threadVisible,
} from '../../lib/comments'
import { db } from '../../lib/db'
import { currentUserId, membershipMap, memberName, roleOf } from '../../lib/sharing'
import type { Comment, Membership, ProjectMember, ProjectRole, Task } from '../../lib/types'
import { Avatar } from '../../ui/Avatar'
import { Button, IconButton } from '../../ui/Button'
import { ConfirmDialog } from '../../ui/patterns/ConfirmDialog'
import { EmptyState } from '../../ui/patterns/EmptyState'
import { Markdown } from '../Markdown'
import { Composer } from './Composer'
import { RelativeTime } from './RelativeTime'

/** True on touch screens: comment actions are always shown there instead of on hover. */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof matchMedia === 'undefined') return () => {}
      const mq = matchMedia('(pointer: coarse)')
      mq.addEventListener?.('change', cb)
      return () => mq.removeEventListener?.('change', cb)
    },
    () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches,
    () => false,
  )
}

export interface CommentsViewProps {
  taskId: string
  threads: Thread[]
  me: string | null
  role: ProjectRole
  members: ProjectMember[]
  name: (id: string) => string
  /** Resolve true when stored. */
  onCreate: (body: string, mentions: string[], parentId: string | null) => Promise<boolean>
  onEdit: (id: string, body: string, mentions: string[]) => Promise<boolean>
  onDelete: (id: string) => Promise<unknown>
  error?: string | null
  /** Comment to scroll to and highlight (from the Activity tab). */
  focusComment?: string | null
  /** Fixed "now" for stories and tests. */
  now?: number
}

export const CommentsView = forwardRef<HTMLTextAreaElement | null, CommentsViewProps>(function CommentsView(
  { taskId, threads, me, role, members, name, onCreate, onEdit, onDelete, error, focusComment, now }, composerRef,
) {
  const coarse = useCoarsePointer()
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    setReplyTo(null)
    setEditing(null)
    setDeleting(null)
  }, [taskId])

  useEffect(() => {
    if (!focusComment) return
    const el = document.getElementById(`comment-${focusComment}`)
    el?.scrollIntoView?.({ block: 'center' })
    el?.focus({ preventScroll: true })
  }, [focusComment])

  const replyTarget = replyTo ? threads.find((t) => t.root.id === replyTo)?.root : undefined

  const startReply = (id: string) => {
    setReplyTo(id)
    requestAnimationFrame(() => {
      const el = typeof composerRef === 'object' ? composerRef?.current : null
      el?.focus()
    })
  }

  const renderComment = (c: Comment, isReply: boolean) => {
    if (c.deleted_at) return <p className="py-1 text-meta italic text-faint" data-comment-deleted>Comment deleted</p>
    const author = name(c.author_id)
    return (
      <article className="group flex gap-3" aria-label={`Comment by ${author}`}>
        <Avatar id={c.author_id || 'unknown'} name={author} size={isReply ? 'sm' : 'md'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold text-default">{author}</span>
            <RelativeTime ts={c.created_at} now={now} className="text-meta" />
            {c.edited_at && <span className="text-meta text-faint" title="Edited">edited</span>}
          </div>
          {editing === c.id ? (
            <div className="mt-1">
              <Composer id={`edit-${c.id}`} initial={c.body} members={members} me={me} autoFocus submitLabel="Save" label="Edit comment"
                onCancel={() => setEditing(null)}
                onSubmit={(body, mentions) => onEdit(c.id, body, mentions).then((ok) => { if (ok) setEditing(null); return ok })} />
            </div>
          ) : (
            <>
              <Markdown source={c.body} className="user-text mt-0.5 max-w-prose text-sm leading-relaxed text-default" />
              <div className={`mt-1 flex flex-wrap gap-1 ${coarse ? '' : 'hover-reveal'}`} data-comment-actions>
                {!isReply && <Button variant="ghost" size="sm" onClick={() => startReply(c.id)}>Reply</Button>}
                {canEditComment(c, me) && <Button variant="ghost" size="sm" onClick={() => setEditing(c.id)}>Edit</Button>}
                {canDeleteComment(c, me, role) && <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDeleting(c.id)}>Delete</Button>}
              </div>
            </>
          )}
        </div>
      </article>
    )
  }

  return (
    <div className="space-y-4">
      {threads.length === 0 ? (
        <EmptyState icon="message-circle" title="No comments yet" body="Ask a question or leave a note; comments work offline and sync later." />
      ) : (
        <ol className="space-y-5" aria-label="Comments">
          {threads.map((t) => (
            <li key={t.root.id} id={`comment-${t.root.id}`} tabIndex={-1} data-thread={t.root.id}
              className={`rounded-control focus-visible:outline-2 focus-visible:outline-focus ${focusComment === t.root.id ? 'bg-accent-soft' : ''}`}>
              {renderComment(t.root, false)}
              {t.replies.length > 0 && (
                <ol className="ml-4 mt-3 space-y-3 border-l-2 border-default pl-4 sm:ml-[1.125rem]" aria-label="Replies">
                  {t.replies.map((r) => (
                    <li key={r.id} id={`comment-${r.id}`} tabIndex={-1} data-reply={r.id}>{renderComment(r, true)}</li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
      {error && <p role="alert" className="text-meta text-danger">{error}</p>}
      {me ? (
        <div className="space-y-1.5 border-t border-default pt-3">
          {replyTarget && (
            <div className="flex items-center gap-1 text-meta text-muted" data-reply-target>
              <span className="min-w-0 truncate">Replying to <strong className="font-medium text-default">{name(replyTarget.author_id)}</strong></span>
              <IconButton icon="x" size="sm" label="Cancel reply" onClick={() => setReplyTo(null)} />
            </div>
          )}
          <Composer ref={composerRef} id="comment-composer" draftTaskId={taskId} members={members} me={me}
            submitLabel={replyTarget ? 'Reply' : 'Comment'} label={replyTarget ? 'Write a reply' : 'Write a comment'}
            onSubmit={(body, mentions) => onCreate(body, mentions, replyTarget?.id ?? null).then((ok) => { if (ok) setReplyTo(null); return ok })} />
        </div>
      ) : (
        <p className="text-meta text-faint">Sign in to comment.</p>
      )}
      {deleting && (
        <ConfirmDialog title="Delete this comment?" confirmLabel="Delete comment"
          consequence="Everyone on the task sees “Comment deleted” in its place. Replies stay."
          onConfirm={() => onDelete(deleting)} onCancel={() => setDeleting(null)} />
      )}
    </div>
  )
})

export interface CommentsTabProps {
  task: Task
  userId?: string
  focusComment?: string | null
}

/** Container: reads comments, members and the signed-in user from local storage. */
export const CommentsTab = forwardRef<HTMLTextAreaElement | null, CommentsTabProps>(function CommentsTab({ task, userId, focusComment }, composerRef) {
  const storedMe = useLiveQuery(() => currentUserId(), [], null)
  const me = userId ?? storedMe
  const memberships = useLiveQuery(() => membershipMap(), [], new Map<string, Membership>())
  const comments = useLiveQuery(() => db.comments.where('task_id').equals(task.id).toArray(), [task.id], [] as Comment[])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setError(null), [task.id])

  const name = useCallback((id: string) => (id && id === me ? 'You' : memberName(id, memberships) ?? 'Someone'), [me, memberships])
  const run = async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    }
  }

  return (
    <CommentsView ref={composerRef} taskId={task.id} threads={threadOrder(comments).filter(threadVisible)} me={me}
      role={roleOf(task.project_id, memberships)} members={mentionableMembers(task.project_id, memberships)} name={name} error={error}
      focusComment={focusComment}
      onCreate={(body, mentions, parentId) => run(() => createComment({ taskId: task.id, body, mentions, parentId }))}
      onEdit={(id, body, mentions) => run(() => editComment(id, body, mentions))}
      onDelete={(id) => deleteComment(id)} />
  )
})

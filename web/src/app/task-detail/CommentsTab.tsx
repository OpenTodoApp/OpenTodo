// Comments tab of the task panel (OpenSpec task-detail-redesign D5; comments
// "Comment thread in the client", "Readable comment presentation", "Composer
// behaviour"): threads oldest first, chat style, with the composer after the
// newest one. Built from local storage, so it reads and writes offline. Viewers
// may comment, so it ignores the panel's read-only mode.
import { useLiveQuery } from 'dexie-react-hooks'
import { forwardRef, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useAttachmentLimits } from '../../lib/attachments'
import {
  canDeleteComment, canEditComment, createComment, deleteComment, editComment, mentionableMembers, type Thread, threadOrder, threadVisible,
} from '../../lib/comments'
import { useCommentAttachments, useCommentRows } from '../../lib/localData'
import { useDemo } from '../../lib/demo'
import { currentUserId, membershipMap, memberName, roleOf } from '../../lib/sharing'
import type { Attachment, Comment, Membership, ProjectMember, ProjectRole, Task } from '../../lib/types'
import { Avatar } from '../../ui'
import { Button, Icon, IconButton, Menu, MenuItem } from '../../ui'
import { ConfirmDialog } from '../../ui'
import { useTaskPublished } from './taskPageStatus'
import { Markdown } from '../Markdown'
import { CommentAttachments } from './AttachmentsRow'
import { Composer, readDraft } from './Composer'
import { RelativeTime } from './RelativeTime'
import { t } from '../../lib/i18n'

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
  onCreate: (body: string, mentions: string[], parentId: string | null, files: File[]) => Promise<boolean>
  /** Attachments by comment id (OpenSpec attachments), shown under each comment. */
  attachments?: Map<string, Attachment[]>
  /** Offer the composer's attach button. */
  canAttach?: boolean
  onEdit: (id: string, body: string, mentions: string[]) => Promise<boolean>
  onDelete: (id: string) => Promise<unknown>
  error?: string | null
  /** Comment to scroll to and highlight (from the Activity tab). */
  focusComment?: string | null
  /** Fixed "now" for stories and tests. */
  now?: number
  /** Where the composer renders when pinned to the panel's bottom (ux-overhaul); inline when absent. */
  composerHost?: HTMLElement | null
  /** Changes when Shift+C asks for the composer: it expands and takes focus. */
  expand?: number
}

export const CommentsView = forwardRef<HTMLTextAreaElement | null, CommentsViewProps>(function CommentsView(
  { taskId, threads, me, role, members, name, onCreate, onEdit, onDelete, error, focusComment, now, attachments, canAttach = false, composerHost, expand = 0 }, composerRef,
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

  const replyTarget = replyTo ? threads.find((item) => item.root.id === replyTo)?.root : undefined

  // A comment just posted comes into view above the composer (comments "Readable comment presentation").
  const posted = useRef(false)
  useEffect(() => {
    if (!posted.current || !me) return
    let newest: Comment | undefined
    for (const th of threads) for (const c of [th.root, ...th.replies]) if (c.author_id === me && (!newest || c.created_at > newest.created_at)) newest = c
    if (!newest) return
    posted.current = false
    document.getElementById(`comment-${newest.id}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [threads, me])
  // The pinned composer rests as one line (web-app "Task panel comment composer"): it
  // expands on click or focus, with a draft, with a reply target or on Shift+C, and
  // collapses again when left empty.
  const [open, setOpen] = useState(() => !!readDraft(taskId))
  useEffect(() => { setOpen(!!readDraft(taskId)) }, [taskId])
  // A published task's comments appear on its page (task-pages, "Composer notice").
  const published = useTaskPublished(taskId)
  const focusComposer = () => requestAnimationFrame(() => (typeof composerRef === 'object' ? composerRef?.current : null)?.focus())
  useEffect(() => { if (expand) { setOpen(true); focusComposer() } }, [expand]) // eslint-disable-line react-hooks/exhaustive-deps -- reacts to the request only
  const resting = !!composerHost && !open && !replyTarget

  const startReply = (id: string) => {
    setOpen(true)
    setReplyTo(id)
    requestAnimationFrame(() => {
      const el = typeof composerRef === 'object' ? composerRef?.current : null
      el?.focus()
    })
  }

  // Reply, Edit and Delete take no space at rest (task-panel-polish D6): at the end of the
  // header line, shown on hover and focus with a fine pointer; one "More actions" menu on touch.
  const actions = (c: Comment, isReply: boolean) => {
    const reply = !isReply
    const edit = canEditComment(c, me)
    const del = canDeleteComment(c, me, role)
    if (!reply && !edit && !del) return null
    if (coarse) {
      return (
        <span className="absolute -top-1 right-0" data-comment-actions>
          <Menu kind="menu" label={t('More actions for this comment')} trigger={<Icon name="ellipsis" size="sm" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2">
            {reply && <MenuItem label={t('Reply')} icon="corner-down-right" onSelect={() => startReply(c.id)} />}
            {edit && <MenuItem label={t('Edit')} icon="pencil" onSelect={() => setEditing(c.id)} />}
            {del && <MenuItem label={t('Delete')} icon="trash-2" danger onSelect={() => setDeleting(c.id)} />}
          </Menu>
        </span>
      )
    }
    return (
      <span className="hover-reveal absolute -top-1 right-0 flex gap-0.5 rounded-control bg-surface" data-comment-actions>
        {reply && <Button variant="ghost" size="sm" onClick={() => startReply(c.id)}>{t('Reply')}</Button>}
        {edit && <Button variant="ghost" size="sm" onClick={() => setEditing(c.id)}>{t('Edit')}</Button>}
        {del && <Button variant="ghost" size="sm" className="text-danger" onClick={() => setDeleting(c.id)}>{t('Delete')}</Button>}
      </span>
    )
  }

  const renderComment = (c: Comment, isReply: boolean) => {
    if (c.deleted_at) return <p className="py-1 text-meta italic text-faint" data-comment-deleted>{t('Comment deleted')}</p>
    // A guest's reply through a task page (task-pages): the name they typed, marked as a guest.
    const author = c.guest_name ? t('{name} (guest)', { name: c.guest_name }) : name(c.author_id)
    return (
      <article className="group relative flex gap-3" aria-label={t('Comment by {author}', { author })} data-guest-comment={c.guest_name ? '' : undefined}>
        <Avatar id={c.guest_name ? `guest:${c.guest_name}` : c.author_id || 'unknown'} name={c.guest_name || author} size={isReply ? 'sm' : 'md'} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2">
            <span className="text-body font-semibold text-default">{author}</span>
            {c.guest_name && (
              <span className="inline-flex items-center gap-1 text-meta text-faint"><Icon name="globe" size="xs" />{t('through the task page')}</span>
            )}
            <RelativeTime ts={c.created_at} now={now} className="text-meta" />
            {c.edited_at && <span className="text-meta text-faint">{t('edited')}</span>}
            {editing !== c.id && actions(c, isReply)}
          </div>
          {editing === c.id ? (
            <div className="mt-1">
              <Composer id={`edit-${c.id}`} initial={c.body} members={members} me={me} autoFocus submitLabel={t('Save')} label={t('Edit comment')}
                onCancel={() => setEditing(null)}
                onSubmit={(body, mentions) => onEdit(c.id, body, mentions).then((ok) => { if (ok) setEditing(null); return ok })} />
            </div>
          ) : (
            <>
              {c.body && <Markdown source={c.body} className="user-text mt-0.5 max-w-prose text-body leading-relaxed text-default" />}
              <CommentAttachments list={attachments?.get(c.id) ?? []} />
            </>
          )}
        </div>
      </article>
    )
  }

  // The composer: pinned to the panel's bottom when a host is given, so it is in
  // view without scrolling past the thread.
  const composer = me && resting ? (
    <button type="button" className="ui-input flex w-full items-center text-left text-muted" data-composer-resting
      onClick={() => { setOpen(true); focusComposer() }} onFocus={() => { setOpen(true); focusComposer() }}>
      {t('Write a comment…')}
    </button>
  ) : me ? (
    <div className={composerHost ? 'space-y-1.5' : 'space-y-1.5 border-t border-default pt-3'} data-composer-block
      onBlur={(e) => {
        // Leaving an empty composer (no draft, no reply) puts it back to rest.
        const next = e.relatedTarget as Node | null
        if (!composerHost || (next && e.currentTarget.contains(next)) || replyTarget) return
        if (!readDraft(taskId).trim()) setOpen(false)
      }}>
      {published && <p className="text-meta text-muted" data-page-composer-notice><Icon name="globe" size="xs" /> {t('This task is published: comments you write from now on are visible on its page.')}</p>}
      {replyTarget && (
        <div className="flex items-center gap-1 text-meta text-muted" data-reply-target>
          <span className="min-w-0 truncate">{t.rich('Replying to <strong>{name}</strong>', { name: name(replyTarget.author_id), strong: (chunks) => <strong className="font-medium text-default">{chunks}</strong> })}</span>
          <IconButton icon="x" size="sm" label={t('Cancel reply')} onClick={() => setReplyTo(null)} />
        </div>
      )}
      <Composer ref={composerRef} id="comment-composer" draftTaskId={taskId} members={members} me={me}
        submitLabel={replyTarget ? t('Reply') : t('Comment')} label={replyTarget ? t('Write a reply') : t('Write a comment')} attach={canAttach}
        onSubmit={(body, mentions, files) => onCreate(body, mentions, replyTarget?.id ?? null, files).then((ok) => { if (ok) { setReplyTo(null); posted.current = true } return ok })} />
    </div>
  ) : (
    <p className="text-meta text-faint">{t('Sign in to comment.')}</p>
  )

  return (
    <div className="space-y-4">
      {threads.length === 0 ? (
        <p className="text-meta text-faint" data-comments-empty>{t('No comments yet. Ask a question or leave a note; comments work offline.')}</p>
      ) : (
        <ol className="space-y-4" aria-label={t('Comments')}>
          {threads.map((entry) => (
            <li key={entry.root.id} id={`comment-${entry.root.id}`} tabIndex={-1} data-thread={entry.root.id}
              className={`rounded-control focus-visible:outline-2 focus-visible:outline-focus ${focusComment === entry.root.id ? 'bg-accent-soft' : ''}`}>
              {renderComment(entry.root, false)}
              {entry.replies.length > 0 && (
                <ol className="ml-4 mt-3 space-y-3 border-l-2 border-default pl-4 sm:ml-[1.125rem]" aria-label={t('Replies')}>
                  {entry.replies.map((r) => (
                    <li key={r.id} id={`comment-${r.id}`} tabIndex={-1} data-reply={r.id}>{renderComment(r, true)}</li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
      {error && <p role="alert" className="text-meta text-danger">{error}</p>}
      {composerHost ? createPortal(composer, composerHost) : composer}
      {deleting && (
        <ConfirmDialog title={t('Delete this comment?')} confirmLabel={t('Delete comment')}
          consequence={t('Everyone on the task sees “Comment deleted” in its place. Replies stay.')}
          onConfirm={() => onDelete(deleting)} onCancel={() => setDeleting(null)} />
      )}
    </div>
  )
})

export interface CommentsTabProps {
  task: Task
  userId?: string
  focusComment?: string | null
  composerHost?: HTMLElement | null
  expand?: number
}

/** Container: reads comments, members and the signed-in user from local storage. */
export const CommentsTab = forwardRef<HTMLTextAreaElement | null, CommentsTabProps>(function CommentsTab({ task, userId, focusComment, composerHost, expand }, composerRef) {
  const storedMe = useLiveQuery(() => currentUserId(), [], null)
  const me = userId ?? storedMe
  const memberships = useLiveQuery(() => membershipMap(), [], new Map<string, Membership>())
  const comments = useCommentRows(task.id)
  // Comment attachments (OpenSpec attachments): a deleted comment's are hidden with it.
  const attachments = useCommentAttachments(task.id)
  const demo = useDemo()
  const limits = useAttachmentLimits()
  const [error, setError] = useState<string | null>(null)
  useEffect(() => setError(null), [task.id])

  const name = useCallback((id: string) => (id && id === me ? t('You') : memberName(id, memberships) ?? t('Someone')), [me, memberships])
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
      focusComment={focusComment} attachments={attachments} canAttach={!demo && limits?.enabled !== false} composerHost={composerHost} expand={expand}
      onCreate={(body, mentions, parentId, files) => run(() => createComment({ taskId: task.id, body, mentions, parentId, files }))}
      onEdit={(id, body, mentions) => run(() => editComment(id, body, mentions))}
      onDelete={(id) => deleteComment(id)} />
  )
})

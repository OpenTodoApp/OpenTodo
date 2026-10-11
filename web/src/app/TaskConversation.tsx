import { useLiveQuery } from 'dexie-react-hooks'
import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { describeEvent, fetchActivity, isPending, mergeOlder, pendingOpIds, taskActivity } from '../lib/activity'
import { isNetworkError } from '../lib/api'
import {
  canDeleteComment, canEditComment, createComment, deleteComment, editComment, mentionableMembers, mentionAt, mentionCandidates, mentionsInBody,
  mentionToken, type Thread, threadOrder, threadVisible,
} from '../lib/comments'
import { db } from '../lib/db'
import { useOnline } from '../lib/online'
import { currentUserId, membershipMap, memberName, roleOf } from '../lib/sharing'
import type { ActivityEvent, Comment, Membership, ProjectMember, Task } from '../lib/types'
import { Markdown } from './Markdown'
import { Popover } from './overlay'

/** Comment kinds are shown by the thread itself, not repeated as events in a task's timeline. */
const COMMENT_KINDS = new Set(['commented', 'comment_edited', 'comment_deleted'])

type Item = { kind: 'thread'; ts: number; thread: Thread } | { kind: 'event'; ts: number; event: ActivityEvent }

/**
 * Comments and activity of one task (OpenSpec `comments-and-activity`): a
 * composer, then threads and activity events interleaved, newest first. Built
 * from local storage, so it reads and writes offline; "Load older" fetches
 * history the device does not keep. Viewers may comment, so this lives outside
 * the read-only fieldset of the task panel.
 */
export function TaskConversation({ task, userId }: { task: Task; userId?: string }) {
  const online = useOnline()
  const storedMe = useLiveQuery(() => currentUserId(), [], null)
  const me = userId ?? storedMe
  const memberships = useLiveQuery(() => membershipMap(), [], new Map<string, Membership>())
  const comments = useLiveQuery(() => db.comments.where('task_id').equals(task.id).toArray(), [task.id], [] as Comment[])
  const local = useLiveQuery(() => taskActivity(task.id), [task.id], [] as ActivityEvent[])
  const pending = useLiveQuery(() => pendingOpIds(), [], new Set<string>())
  const projects = useLiveQuery(() => db.projects.toArray(), [], [])
  const [older, setOlder] = useState<ActivityEvent[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [more, setMore] = useState(true)
  const [loadState, setLoadState] = useState<'idle' | 'loading' | 'error'>('idle')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setOlder([])
    setCursor(undefined)
    setMore(true)
    setReplyTo(null)
    setEditing(null)
    setError(null)
  }, [task.id])

  // Shift+C focuses the composer while the task panel is open (`c` completes the selected task).
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== 'C' || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      e.preventDefault()
      composerRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const role = roleOf(task.project_id, memberships)
  const members = mentionableMembers(task.project_id, memberships)
  const name = useCallback((id: string) => {
    if (id && id === me) return 'You'
    return memberName(id, memberships) ?? older.find((e) => e.actor === id && e.actorName)?.actorName ?? 'Someone'
  }, [me, memberships, older])
  const projectName = useCallback((id: string | null) => (id ? projects.find((p) => p.id === id)?.name ?? 'another project' : 'Inbox'), [projects])

  const items = useMemo(() => {
    const events = mergeOlder(local, older).filter((e) => !COMMENT_KINDS.has(e.kind))
    const out: Item[] = threadOrder(comments).filter(threadVisible).map((thread) => ({ kind: 'thread' as const, ts: thread.root.created_at, thread }))
    for (const event of events) out.push({ kind: 'event', ts: event.ts, event })
    return out.sort((a, b) => b.ts - a.ts)
  }, [comments, local, older])

  async function loadOlder() {
    setLoadState('loading')
    try {
      const page = await fetchActivity('task', task.id, cursor)
      setOlder((prev) => [...prev, ...page.events])
      setCursor(page.cursor)
      setMore(page.more)
      setLoadState('idle')
    } catch (err) {
      setLoadState(isNetworkError(err) ? 'idle' : 'error')
      if ((err as { status?: number }).status === 404) setMore(false)
    }
  }

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
    }
  }

  const renderComment = (c: Comment, isReply: boolean) => {
    if (c.deleted_at) {
      return <p className="text-xs italic text-faint" data-comment-deleted>Comment deleted</p>
    }
    if (editing === c.id) {
      return (
        <Composer id={`edit-${c.id}`} initial={c.body} members={members} me={me} autoFocus submitLabel="Save"
          onCancel={() => setEditing(null)}
          onSubmit={(body, mentions) => run(() => editComment(c.id, body, mentions)).then((ok) => ok && setEditing(null))} />
      )
    }
    return (
      <div>
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-faint">
          <span className="font-semibold text-slate-600 dark:text-slate-300">{name(c.author_id)}</span>
          <time dateTime={new Date(c.created_at).toISOString()}>{new Date(c.created_at).toLocaleString()}</time>
          {c.edited_at && <span title={`Edited ${new Date(c.edited_at).toLocaleString()}`}>(edited)</span>}
        </div>
        <Markdown source={c.body} className="text-sm" />
        <div className="mt-0.5 flex gap-2 text-xs">
          {!isReply && <button type="button" className="text-muted hover:underline" onClick={() => setReplyTo(c.id)}>Reply</button>}
          {canEditComment(c, me) && <button type="button" className="text-muted hover:underline" onClick={() => setEditing(c.id)}>Edit</button>}
          {canDeleteComment(c, me, role) && (
            <button type="button" className="text-red-600 dark:text-red-400 hover:underline" onClick={() => { if (confirm('Delete this comment?')) void run(() => deleteComment(c.id)) }}>Delete</button>
          )}
        </div>
      </div>
    )
  }

  return (
    <section className="space-y-3 pt-4" aria-label="Comments and activity">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Comments <span className="kbd ml-1 normal-case">Shift+C</span></h3>
      {me ? (
        <Composer id="comment-composer" ref={composerRef} members={members} me={me} submitLabel="Comment"
          onSubmit={(body, mentions) => run(() => createComment({ taskId: task.id, body, mentions }))} />
      ) : (
        <p className="text-xs text-faint">Sign in to comment.</p>
      )}
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <ol className="space-y-3" aria-label="Timeline">
        {items.map((it) => it.kind === 'thread' ? (
          <li key={`c:${it.thread.root.id}`} className="rounded-md border border-slate-200 p-2 dark:border-slate-800" data-thread={it.thread.root.id}>
            {renderComment(it.thread.root, false)}
            {(it.thread.replies.length > 0 || replyTo === it.thread.root.id) && (
              <ol className="mt-2 space-y-2 border-l-2 border-slate-200 pl-3 dark:border-slate-700" aria-label="Replies">
                {it.thread.replies.map((r) => <li key={r.id} data-reply={r.id}>{renderComment(r, true)}</li>)}
                {replyTo === it.thread.root.id && (
                  <li>
                    <Composer id={`reply-${it.thread.root.id}`} members={members} me={me} autoFocus submitLabel="Reply" onCancel={() => setReplyTo(null)}
                      onSubmit={(body, mentions) => run(() => createComment({ taskId: task.id, body, mentions, parentId: it.thread.root.id })).then((ok) => ok && setReplyTo(null))} />
                  </li>
                )}
              </ol>
            )}
          </li>
        ) : (
          <li key={`e:${it.event.id}`} className="flex items-baseline gap-2 text-xs text-muted" data-event={it.event.kind}>
            <span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full bg-slate-300 dark:bg-slate-600" />
            <span className="min-w-0 flex-1">
              <strong className="font-medium text-slate-600 dark:text-slate-300">{it.event.actorName && it.event.actor !== me ? it.event.actorName : name(it.event.actor)}</strong>{' '}
              {describeEvent(it.event, name, projectName)}
              {isPending(it.event, pending) && <span className="ml-1 italic text-amber-700 dark:text-amber-400" title="Not yet synced">(pending)</span>}
            </span>
            <time className="shrink-0 text-faint" dateTime={new Date(it.event.ts).toISOString()}>{new Date(it.event.ts).toLocaleString()}</time>
          </li>
        ))}
      </ol>
      {more && online && (
        <button type="button" className="btn-ghost text-xs" disabled={loadState === 'loading'} onClick={() => void loadOlder()}>
          {loadState === 'loading' ? 'Loading…' : 'Load older activity'}
        </button>
      )}
      {loadState === 'error' && <p className="text-xs text-red-600 dark:text-red-400">Older activity could not be loaded.</p>}
    </section>
  )
}

/**
 * Comment composer: markdown text, `@` completion from the cached project
 * members, Ctrl/Cmd+Enter submits, Esc cancels (or leaves the field).
 */
function Composer({ id, initial = '', members, me, onSubmit, onCancel, autoFocus, submitLabel, ref }: {
  id: string
  initial?: string
  members: ProjectMember[]
  me: string | null
  onSubmit: (body: string, mentions: string[]) => Promise<unknown>
  onCancel?: () => void
  autoFocus?: boolean
  submitLabel: string
  ref?: React.Ref<HTMLTextAreaElement>
}) {
  const [body, setBody] = useState(initial)
  const [picked, setPicked] = useState(() => new Map<string, string>(members.filter((m) => initial.includes(`@${mentionToken(m)}`)).map((m) => [m.userId, mentionToken(m)])))
  const [caret, setCaret] = useState(initial.length)
  const [active, setActive] = useState(0)
  const [closed, setClosed] = useState(false)
  const [busy, setBusy] = useState(false)
  const area = useRef<HTMLTextAreaElement | null>(null)
  const at = members.length ? mentionAt(body, caret) : null
  const options = at && !closed ? mentionCandidates(members, at.query, me) : []
  const listId = `${id}-mentions`

  function pick(m: Pick<ProjectMember, 'userId' | 'name' | 'email'>) {
    if (!at) return
    const token = mentionToken(m)
    const next = `${body.slice(0, at.start)}@${token} ${body.slice(caret)}`
    const pos = at.start + token.length + 2
    setBody(next)
    setPicked((p) => new Map(p).set(m.userId, token))
    setCaret(pos)
    setActive(0)
    requestAnimationFrame(() => area.current?.setSelectionRange(pos, pos))
  }

  async function submit() {
    if (!body.trim() || busy) return
    setBusy(true)
    const ok = await onSubmit(body, mentionsInBody(body, picked))
    setBusy(false)
    if (ok !== false && !onCancel) {
      setBody('')
      setPicked(new Map())
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (options.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        pick(options[Math.min(active, options.length - 1)])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setClosed(true)
        return
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void submit()
      return
    }
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (onCancel) onCancel()
      else (e.target as HTMLTextAreaElement).blur()
    }
  }

  return (
    <div className="relative">
      <textarea
        id={id}
        ref={(el) => {
          area.current = el
          if (typeof ref === 'function') ref(el)
          else if (ref) (ref as React.RefObject<HTMLTextAreaElement | null>).current = el
        }}
        className="input min-h-16 resize-y text-sm"
        placeholder={members.length ? 'Write a comment… (markdown, @ to mention)' : 'Write a comment… (markdown)'}
        aria-label={submitLabel === 'Comment' ? 'Write a comment' : submitLabel === 'Reply' ? 'Write a reply' : 'Edit comment'}
        value={body}
        autoFocus={autoFocus}
        role={options.length ? 'combobox' : undefined}
        aria-expanded={options.length ? true : undefined}
        aria-controls={options.length ? listId : undefined}
        aria-activedescendant={options.length ? `${listId}-${Math.min(active, options.length - 1)}` : undefined}
        onChange={(e) => {
          setBody(e.target.value)
          setCaret(e.target.selectionStart)
          setClosed(false)
          setActive(0)
        }}
        onSelect={(e) => setCaret((e.target as HTMLTextAreaElement).selectionStart)}
        onKeyDown={onKeyDown}
      />
      {/* Non-modal: focus stays in the textarea (combobox pattern); a sheet on phones. */}
      <Popover open={options.length > 0} onClose={() => setClosed(true)} anchor={area} label="Mention a member" modal={false} align="start" role={undefined} className="py-1">
        <ul id={listId} role="listbox" aria-label="Mention a member">
          {options.map((m, i) => (
            <li key={m.userId} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              className={`flex min-h-11 cursor-pointer flex-wrap items-center gap-x-1 px-3 py-1 ${i === active ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
              onMouseDown={(e) => { e.preventDefault(); pick(m) }}>
              {m.name || m.email} <span className="user-text text-xs text-faint">{m.email}</span>
            </li>
          ))}
        </ul>
      </Popover>
      <div className="mt-1 flex items-center gap-2">
        <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={!body.trim() || busy} onClick={() => void submit()}>{submitLabel}</button>
        {onCancel && <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onCancel}>Cancel</button>}
        <span className="text-[11px] text-faint"><span className="kbd">Ctrl</span>+<span className="kbd">Enter</span></span>
      </div>
    </div>
  )
}

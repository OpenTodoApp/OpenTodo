import { Icon, Popover } from '../ui'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { getProject, useNotifications, useTask } from '../lib/localData'
import { markNotificationRead, markTaskNotificationsRead } from '../lib/notifications'
import type { AppNotification, MemberInvitationPayload, MentionedPayload, PagePayload, RoutinePayload } from '../lib/types'
import { navigate, routePath, type Route } from './router'
import { notificationsOpen } from './signals'
import { openTaskPage } from './taskTrail'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t } from '../lib/i18n'
import { currentKey, UNDECRYPTABLE } from '../lib/e2ee'
import { decryptValue } from '../lib/crypto'
import { InvitationAnswer, InvitationText } from './MemberInvitations'

/**
 * A routine's Notify me. A routine that ran on a device of an encrypted account
 * sent its text sealed to the run and step (routines-ai-step D7); this device
 * opens it, or says the text is encrypted.
 */
function RoutineNotice({ payload }: { payload: RoutinePayload }) {
  const sealed = payload.text.startsWith('enc:')
  const [text, setText] = useState(sealed ? '' : payload.text)
  useEffect(() => {
    if (!sealed) return
    let live = true
    void (async () => {
      const key = await currentKey()
      const out = key ? await decryptValue(key, 'routine_notice', payload.runId, payload.stepId, payload.text).catch(() => null) : null
      if (live) setText(out ?? t(UNDECRYPTABLE))
    })().catch(() => undefined)
    return () => { live = false }
  }, [sealed, payload.runId, payload.stepId, payload.text])
  return <span className="block" data-kind="routine">{t.rich('<b>{routine}</b>: {text}', { routine: payload.ruleName || t('A routine'), text, b: (chunks) => <strong>{chunks}</strong> })}</span>
}

/** The phone drawer's slide-in, after which the list anchors to the bell. */
const DRAWER_MS = 220

/**
 * A guest's reply or completion on a task page (task-pages D9). For an encrypted
 * task the server sent no title or name; the device shows its own copy's title.
 */
function PageNotification({ kind, payload }: { kind: string; payload: PagePayload }) {
  const local = useTask(payload.taskId)
  const task = payload.taskTitle || local?.title || t('your task')
  const b = (chunks: ReactNode) => <strong>{chunks}</strong>
  if (kind === 'page_replied') {
    return payload.guestName
      ? <span className="block" data-kind="page_replied">{t.rich('<b>{name}</b> replied on <b2>{task}</b2>', { name: payload.guestName, task, b, b2: b })}</span>
      : <span className="block" data-kind="page_replied">{t.rich('New reply on the page of <b>{task}</b>', { task, b })}</span>
  }
  return payload.completed === false
    ? <span className="block" data-kind="page_completed">{t.rich('<b>{task}</b> was reopened through its task page', { task, b })}</span>
    : <span className="block" data-kind="page_completed">{t.rich('<b>{task}</b> was marked done through its task page', { task, b })}</span>
}

/**
 * Notification bell and list (OpenSpec `task-assignment`; mentions from
 * `comments-and-activity`), read from the local
 * cache so it shows offline. Choosing a notification opens its task, which marks
 * every notification about that task read.
 */
export function NotificationBell({ compact = false }: { compact?: boolean } = {}) {
  const dt = useDateTimeFormat()
  const list = useNotifications(50)
  const unread = list.filter((n) => n.readAt === null).length
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  // The briefing's replies ask for the list (briefing-links D2); on a phone the drawer
  // slides in first, so the list opens once it is in place.
  useEffect(() => notificationsOpen.subscribe(() => {
    notificationsOpen.take()
    const phone = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 47.99rem)').matches
    if (phone) setTimeout(() => setOpen(true), DRAWER_MS)
    else setOpen(true)
  }), [])

  async function choose(n: AppNotification) {
    // A routine's notice or failed run opens the run (routines-editor D11).
    if ((n.kind === 'routine' || n.kind === 'routine_failed' || n.kind === 'routine_proposal') && 'runId' in n.payload && !n.payload.taskId) {
      setOpen(false)
      await markNotificationRead(n.id)
      return navigate({ view: 'rules', id: n.payload.ruleId, run: n.payload.runId })
    }
    if (!n.payload.taskId) return
    setOpen(false)
    await markTaskNotificationsRead(n.payload.taskId)
    // A task page's reply or completion opens the task itself (task-pages).
    if ('pageId' in n.payload) return navigate({ view: 'task', id: n.payload.taskId })
    // The task opens as its page; Esc goes to its project, or to Assigned to me (task-full-page).
    const project = n.payload.projectId ? await getProject(n.payload.projectId) : undefined
    const target: Route = project && !project.deleted_at ? { view: 'project', id: project.id } : { view: 'assigned' }
    openTaskPage(n.payload.taskId, { from: routePath(target) })
  }

  return (
    <>
      <button ref={ref} className={`ui-btn ui-btn--ghost ui-btn--md touch-target relative text-body ${compact ? 'w-full justify-center px-0' : ''}`} aria-label={unread ? t('Notifications, {unread} unread', { unread }) : t('Notifications')} aria-expanded={open}
        aria-haspopup="dialog" onClick={() => setOpen((v) => !v)} data-notifications>
        <Icon name="bell" />
        {/* Quiet markers (quiet-sidebar D4, app-shell "Notification bell marker"): a dot for one, a small accent count above one, never red. */}
        {unread === 1 && <span aria-hidden="true" className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" data-unread={1} data-dot />}
        {unread > 1 && (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-hint font-semibold leading-4 text-on-accent" data-unread={unread}>{unread}</span>
        )}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} label={t('Notifications')} width="sm:w-80" className="py-1">
          {list.length === 0 && <p className="px-3 py-2 text-meta text-faint">{t('No notifications.')}</p>}
          <ul>
            {list.map((n) => n.kind === 'member_invitation' && 'invitationId' in n.payload ? (
              <li key={n.id}>
                <InvitationNotification n={n} payload={n.payload} when={dt.formatInstant(n.createdAt, 'datetime')} autofocus={n === list[0]} />
              </li>
            ) : (
              <li key={n.id}>
                <button type="button" data-autofocus={n === list[0] ? '' : undefined} onClick={() => void choose(n)}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-canvas dark:hover:bg-raised ${n.readAt === null ? '' : 'text-faint'}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt === null ? 'bg-accent' : 'bg-transparent'}`} />
                  <span className="user-text min-w-0 flex-1">
                    {(n.kind === 'page_replied' || n.kind === 'page_completed') && 'pageId' in n.payload ? (
                      <PageNotification kind={n.kind} payload={n.payload} />
                    ) : n.kind === 'routine_failed' && 'count' in n.payload ? (
                      <span className="block" data-kind="routine_failed">{n.payload.count > 1
                        ? t.rich('<b>{routine}</b> failed ({n} times today)', { routine: n.payload.ruleName || t('A routine'), n: n.payload.count, b: (chunks) => <strong>{chunks}</strong> })
                        : n.payload.step > 0
                          ? t.rich('<b>{routine}</b> failed at step {n}', { routine: n.payload.ruleName || t('A routine'), n: n.payload.step, b: (chunks) => <strong>{chunks}</strong> })
                          : t.rich('<b>{routine}</b> failed', { routine: n.payload.ruleName || t('A routine'), b: (chunks) => <strong>{chunks}</strong> })}</span>
                    ) : n.kind === 'routine_proposal' && 'count' in n.payload ? (
                      <span className="block" data-kind="routine_proposal">{t.rich('<b>{routine}</b> has a proposal waiting ({n, plural, one {# change} other {# changes}})', { routine: n.payload.ruleName || t('A routine'), n: n.payload.count, b: (chunks) => <strong>{chunks}</strong> })}</span>
                    ) : n.kind === 'routine' && 'text' in n.payload ? (
                      <RoutineNotice payload={n.payload as RoutinePayload} />
                    ) : n.kind === 'mentioned' ? (
                      <span className="block" data-mention-source={'source' in n.payload ? n.payload.source : undefined}>
                        <MentionText payload={n.payload as MentionedPayload} />
                        {'excerpt' in n.payload && n.payload.excerpt && <span className="block truncate text-meta text-muted">“{n.payload.excerpt}”</span>}
                      </span>
                    ) : n.kind === 'unblocked' && 'blockerTitle' in n.payload ? (
                      <span className="block" data-kind="unblocked">{t.rich('<b>{actor}</b> completed <b2>{blocker}</b2>: <b3>{task}</b3> is ready to start', { actor: n.payload.actorName || t('Someone'), blocker: n.payload.blockerTitle || t('a task'), task: n.payload.taskTitle || t('your task'), b: (chunks) => <strong>{chunks}</strong>, b2: (chunks) => <strong>{chunks}</strong>, b3: (chunks) => <strong>{chunks}</strong> })}</span>
                    ) : (
                      <span className="block">{t.rich('<b>{actor}</b> assigned you <b2>{task}</b2>', { actor: n.payload.actorName || t('Someone'), task: ('taskTitle' in n.payload && n.payload.taskTitle) || t('a task'), b: (chunks) => <strong>{chunks}</strong>, b2: (chunks) => <strong>{chunks}</strong> })}</span>
                    )}
                    <span className="block text-meta text-faint">
                      {n.payload.projectName ? `${n.payload.projectName} · ` : ''}{dt.formatInstant(n.createdAt, 'datetime')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
      </Popover>
    </>
  )
}

/**
 * An invitation to join a project or workspace (member-add-consent): not a link
 * to a task but Accept and Decline, shown while the notification is unread.
 * Answering marks it read here and on the server.
 */
function InvitationNotification({ n, payload: p, when, autofocus }: { n: AppNotification; payload: MemberInvitationPayload; when: string; autofocus: boolean }) {
  const unread = n.readAt === null
  return (
    <div className={`flex w-full items-start gap-2 px-3 py-2 text-left outline-none ${unread ? '' : 'text-faint'}`} data-kind="member_invitation"
      data-autofocus={autofocus ? '' : undefined} tabIndex={autofocus ? -1 : undefined}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? 'bg-accent' : 'bg-transparent'}`} />
      <span className="user-text min-w-0 flex-1">
        <span className="block"><InvitationText inviter={p.inviterName} target={p.target} name={p.targetName} role={p.role} /></span>
        <span className="block text-meta text-faint">{when}</span>
        {unread && <InvitationAnswer invitationId={p.invitationId} notificationId={n.id} />}
      </span>
    </div>
  )
}

/** What a mention notification says: who, where, and the group it came through (group-mentions D3). */
function MentionText({ payload: p }: { payload: MentionedPayload }) {
  const strong = (chunks: ReactNode) => <strong>{chunks}</strong>
  const v = { actor: p.actorName || t('Someone'), task: p.taskTitle || t('a task'), b: strong, b2: strong, b3: strong }
  if (p.groupName) {
    return p.source === 'note'
      ? t.rich('<b>{actor}</b> mentioned <b3>{group}</b3> in the notes of <b2>{task}</b2>', { ...v, group: p.groupName })
      : t.rich('<b>{actor}</b> mentioned <b3>{group}</b3> on <b2>{task}</b2>', { ...v, group: p.groupName })
  }
  return p.source === 'note'
    ? t.rich('<b>{actor}</b> mentioned you in the notes of <b2>{task}</b2>', v)
    : t.rich('<b>{actor}</b> mentioned you on <b2>{task}</b2>', v)
}

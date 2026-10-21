import { Icon, Popover } from '../ui'
import { type ReactNode, useRef, useState } from 'react'
import { getProject, useNotifications, useTask } from '../lib/localData'
import { markTaskNotificationsRead } from '../lib/notifications'
import type { AppNotification, PagePayload } from '../lib/types'
import { navigate, routePath, type Route } from './router'
import { openTask } from './signals'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t } from '../lib/i18n'

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

  async function choose(n: AppNotification) {
    setOpen(false)
    await markTaskNotificationsRead(n.payload.taskId)
    // A task page's reply or completion opens the task itself (task-pages).
    if ('pageId' in n.payload) return navigate({ view: 'task', id: n.payload.taskId })
    const project = n.payload.projectId ? await getProject(n.payload.projectId) : undefined
    const target: Route = project && !project.deleted_at ? { view: 'project', id: project.id } : { view: 'assigned' }
    if (routePath(target) === location.pathname) openTask.request(n.payload.taskId)
    else {
      openTask.set(n.payload.taskId)
      navigate(target)
    }
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
            {list.map((n) => (
              <li key={n.id}>
                <button type="button" data-autofocus={n === list[0] ? '' : undefined} onClick={() => void choose(n)}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-canvas dark:hover:bg-raised ${n.readAt === null ? '' : 'text-faint'}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt === null ? 'bg-accent' : 'bg-transparent'}`} />
                  <span className="user-text min-w-0 flex-1">
                    {(n.kind === 'page_replied' || n.kind === 'page_completed') && 'pageId' in n.payload ? (
                      <PageNotification kind={n.kind} payload={n.payload} />
                    ) : n.kind === 'mentioned' ? (
                      <span className="block">{t.rich('<b>{actor}</b> mentioned you on <b2>{task}</b2>', { actor: n.payload.actorName || t('Someone'), task: n.payload.taskTitle || t('a task'), b: (chunks) => <strong>{chunks}</strong>, b2: (chunks) => <strong>{chunks}</strong> })}
                        {'excerpt' in n.payload && n.payload.excerpt && <span className="block truncate text-meta text-muted">“{n.payload.excerpt}”</span>}
                      </span>
                    ) : n.kind === 'unblocked' && 'blockerTitle' in n.payload ? (
                      <span className="block" data-kind="unblocked">{t.rich('<b>{actor}</b> completed <b2>{blocker}</b2>: <b3>{task}</b3> is ready to start', { actor: n.payload.actorName || t('Someone'), blocker: n.payload.blockerTitle || t('a task'), task: n.payload.taskTitle || t('your task'), b: (chunks) => <strong>{chunks}</strong>, b2: (chunks) => <strong>{chunks}</strong>, b3: (chunks) => <strong>{chunks}</strong> })}</span>
                    ) : (
                      <span className="block">{t.rich('<b>{actor}</b> assigned you <b2>{task}</b2>', { actor: n.payload.actorName || t('Someone'), task: n.payload.taskTitle || t('a task'), b: (chunks) => <strong>{chunks}</strong>, b2: (chunks) => <strong>{chunks}</strong> })}</span>
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

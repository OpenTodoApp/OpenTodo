import { Icon } from '../ui'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { db } from '../lib/db'
import { markTaskNotificationsRead } from '../lib/notifications'
import type { AppNotification } from '../lib/types'
import { navigate, routePath, type Route } from './router'
import { openTask } from './signals'
import { Popover } from './overlay'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { t } from '../lib/i18n'

/**
 * Notification badge and list (OpenSpec `task-assignment`; mentions from
 * `comments-and-activity`), read from the local
 * cache so it shows offline. Choosing a notification opens its task, which marks
 * every notification about that task read.
 */
export function NotificationBell({ compact = false }: { compact?: boolean } = {}) {
  const dt = useDateTimeFormat()
  const list = useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().limit(50).toArray(), [], [] as AppNotification[])
  const unread = list.filter((n) => n.readAt === null).length
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  async function choose(n: AppNotification) {
    setOpen(false)
    await markTaskNotificationsRead(n.payload.taskId)
    const project = n.payload.projectId ? await db.projects.get(n.payload.projectId) : undefined
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
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-hint font-semibold leading-4 text-on-accent" data-unread>{unread}</span>
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
                    {n.kind === 'mentioned' ? (
                      <span className="block"><strong>{n.payload.actorName || t('Someone')}</strong>{' '}{t('mentioned you on')}{' '}<strong>{n.payload.taskTitle || t('a task')}</strong>
                        {'excerpt' in n.payload && n.payload.excerpt && <span className="block truncate text-meta text-muted">“{n.payload.excerpt}”</span>}
                      </span>
                    ) : n.kind === 'unblocked' && 'blockerTitle' in n.payload ? (
                      <span className="block" data-kind="unblocked"><strong>{n.payload.actorName || t('Someone')}</strong>{' '}{t('completed')}{' '}<strong>{n.payload.blockerTitle || t('a task')}</strong>: <strong>{n.payload.taskTitle || t('your task')}</strong>{' '}{t('is ready to start')}</span>
                    ) : (
                      <span className="block"><strong>{n.payload.actorName || t('Someone')}</strong>{' '}{t('assigned you')}{' '}<strong>{n.payload.taskTitle || t('a task')}</strong></span>
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

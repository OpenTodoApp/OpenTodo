import { Icon } from '../ui/Icon'
import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { db } from '../lib/db'
import { markTaskNotificationsRead } from '../lib/notifications'
import type { AppNotification } from '../lib/types'
import { navigate, routePath, type Route } from './router'
import { openTask } from './signals'
import { Popover } from './overlay'
import { useDateTimeFormat } from './DateTimePrefsProvider'

/**
 * Notification badge and list (OpenSpec `task-assignment`; mentions from
 * `comments-and-activity`), read from the local
 * cache so it shows offline. Choosing a notification opens its task, which marks
 * every notification about that task read.
 */
export function NotificationBell() {
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
      <button ref={ref} className="btn-ghost touch-target relative text-sm" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open}
        aria-haspopup="dialog" onClick={() => setOpen((v) => !v)} data-notifications>
        <Icon name="bell" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white" data-unread>{unread}</span>
        )}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} label="Notifications" width="sm:w-80" className="py-1">
          {list.length === 0 && <p className="px-3 py-2 text-xs text-faint">No notifications.</p>}
          <ul>
            {list.map((n) => (
              <li key={n.id}>
                <button type="button" data-autofocus={n === list[0] ? '' : undefined} onClick={() => void choose(n)}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${n.readAt === null ? '' : 'text-faint'}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt === null ? 'bg-emerald-500' : 'bg-transparent'}`} />
                  <span className="user-text min-w-0 flex-1">
                    {n.kind === 'mentioned' ? (
                      <span className="block"><strong>{n.payload.actorName || 'Someone'}</strong> mentioned you on <strong>{n.payload.taskTitle || 'a task'}</strong>
                        {'excerpt' in n.payload && n.payload.excerpt && <span className="block truncate text-xs text-muted">“{n.payload.excerpt}”</span>}
                      </span>
                    ) : (
                      <span className="block"><strong>{n.payload.actorName || 'Someone'}</strong> assigned you <strong>{n.payload.taskTitle || 'a task'}</strong></span>
                    )}
                    <span className="block text-xs text-faint">
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

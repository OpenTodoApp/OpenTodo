import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { db } from '../lib/db'
import { markTaskNotificationsRead } from '../lib/notifications'
import type { AppNotification } from '../lib/types'
import { navigate, routePath, type Route } from './router'
import { openTask } from './signals'

/**
 * Notification badge and list (OpenSpec `task-assignment`), read from the local
 * cache so it shows offline. Choosing a notification opens its task, which marks
 * every notification about that task read.
 */
export function NotificationBell() {
  const list = useLiveQuery(() => db.notifications.orderBy('createdAt').reverse().limit(50).toArray(), [], [] as AppNotification[])
  const unread = list.filter((n) => n.readAt === null).length
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function choose(n: AppNotification) {
    setOpen(false)
    await markTaskNotificationsRead(n.payload.taskId)
    const project = n.payload.projectId ? await db.projects.get(n.payload.projectId) : undefined
    const target: Route = project && !project.deleted_at ? { view: 'project', id: project.id } : { view: 'assigned' }
    if (routePath(target) === location.pathname) openTask.now(n.payload.taskId)
    else {
      openTask.later(n.payload.taskId)
      navigate(target)
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost relative text-sm" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open}
        onClick={() => setOpen((v) => !v)} data-notifications>
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white" data-unread>{unread}</span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="absolute right-0 z-40 mt-1 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {list.length === 0 && <p className="px-3 py-2 text-xs text-slate-400">No notifications.</p>}
          <ul>
            {list.map((n) => (
              <li key={n.id}>
                <button type="button" autoFocus={n === list[0]} onClick={() => void choose(n)}
                  className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${n.readAt === null ? '' : 'text-slate-400'}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt === null ? 'bg-emerald-500' : 'bg-transparent'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block"><strong>{n.payload.actorName || 'Someone'}</strong> assigned you <strong>{n.payload.taskTitle || 'a task'}</strong></span>
                    <span className="block text-xs text-slate-400">
                      {n.payload.projectName ? `${n.payload.projectName} · ` : ''}{new Date(n.createdAt).toLocaleString()}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

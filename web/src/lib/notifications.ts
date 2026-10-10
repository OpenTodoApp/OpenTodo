// In-app notifications on the client (OpenSpec `task-assignment`). They are
// server-side account data, not ops: the sync loop refreshes the local cache after
// an exchange that brought changes, the UI reads the cache (so it shows offline),
// and "read" is applied locally first and confirmed with the server when online.
import { api } from './api'
import { db } from './db'
import type { AppNotification } from './types'

/**
 * Send pending reads, then replace the cache with the server's list. A local read
 * the server has not confirmed yet stays read. Errors are swallowed: notifications
 * never affect the sync state (an older server answers 404 here).
 */
export async function refreshNotifications(): Promise<void> {
  try {
    await flushReads()
    const res = await api.listNotifications()
    const pending = new Map((await db.notifications.filter((n) => !!n.readPending).toArray()).map((n) => [n.id, n]))
    const rows = res.notifications.map((n) => {
      const local = pending.get(n.id)
      return local && n.readAt === null ? { ...n, readAt: local.readAt, readPending: true } : n
    })
    await db.transaction('rw', db.notifications, async () => {
      await db.notifications.clear()
      if (rows.length) await db.notifications.bulkPut(rows)
    })
  } catch {
    // Offline, signed out or an older server: keep the cache as it is.
  }
}

/** Confirm locally read notifications with the server; failures stay pending. */
async function flushReads(): Promise<void> {
  const pending = await db.notifications.filter((n) => !!n.readPending).toArray()
  for (const n of pending) {
    try {
      await api.readNotification(n.id)
      await db.notifications.update(n.id, { readPending: false })
    } catch (err) {
      // 404: the notification is gone (swept or not ours); forget the pending flag.
      if ((err as { status?: number }).status === 404) await db.notifications.update(n.id, { readPending: false })
    }
  }
}

/** Mark every unread notification about `taskId` read (opening the task). Works offline. */
export async function markTaskNotificationsRead(taskId: string, now = Date.now()): Promise<number> {
  const unread = await db.notifications.filter((n) => n.readAt === null && n.payload?.taskId === taskId).toArray()
  if (unread.length === 0) return 0
  await db.notifications.bulkPut(unread.map((n) => ({ ...n, readAt: now, readPending: true })))
  void flushReads().catch(() => undefined)
  return unread.length
}

/** Unread notifications, newest first. */
export async function unreadNotifications(): Promise<AppNotification[]> {
  const list = await db.notifications.orderBy('createdAt').reverse().toArray()
  return list.filter((n) => n.readAt === null)
}

/** Number of unread notifications in the cache. */
export async function unreadCount(): Promise<number> {
  return db.notifications.filter((n) => n.readAt === null).count()
}

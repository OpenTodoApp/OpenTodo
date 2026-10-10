// Reminder push handling for the service worker (OpenSpec change `reminders`,
// design D7). Imported by the generated Workbox service worker (vite.config.ts,
// workbox.importScripts). Plain JavaScript on purpose: it runs outside the
// bundle and talks to the app's IndexedDB ("opentodo", the Dexie database in
// src/lib/db.ts) with the raw API.
//
// - push: if a window of the app is focused, hand the reminder to it (in-app
//   toast only, no system notification); otherwise show a notification titled
//   from the local copy of the task (the payload carries ids only unless the
//   device opted in to titles) and record it in the shared "shown" set.
// - notificationclick: "Snooze 10 min" / "Dismiss" write ordinary reminder ops
//   into the local store and the outbox (exactly what the app's mutate() does),
//   then ask an open window to sync, or post them to /api/v1/sync directly.
//   Offline they simply wait in the outbox. A click on the body opens the task.
/* eslint-disable no-restricted-globals */
;(() => {
  const DB_NAME = 'opentodo'
  const SHOWN_KEY = 'reminders:shown'
  const SNOOZE_MS = 10 * 60 * 1000

  function req(r) {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME)
      // The app creates the database; never create an empty one from here.
      r.onupgradeneeded = () => r.transaction.abort()
      r.onsuccess = () => {
        const db = r.result
        const need = ['tasks', 'reminders', 'outbox', 'meta']
        if (need.every((s) => db.objectStoreNames.contains(s))) resolve(db)
        else {
          db.close()
          reject(new Error('app database not ready'))
        }
      }
      r.onerror = () => reject(r.error)
    })
  }

  function done(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  }

  async function readLocal(reminderId, taskId) {
    try {
      const db = await openDB()
      try {
        const tx = db.transaction(['tasks', 'reminders'], 'readonly')
        const [task, reminder] = await Promise.all([
          req(tx.objectStore('tasks').get(taskId)),
          req(tx.objectStore('reminders').get(reminderId)),
        ])
        return { task, reminder }
      } finally {
        db.close()
      }
    } catch {
      return {}
    }
  }

  async function markShown(reminderId, fireAt) {
    try {
      const db = await openDB()
      try {
        const tx = db.transaction(['meta'], 'readwrite')
        const meta = tx.objectStore('meta')
        const row = await req(meta.get(SHOWN_KEY))
        const shown = (row && row.value) || {}
        shown[reminderId] = { fireAt, by: 'sw' }
        meta.put({ key: SHOWN_KEY, value: shown })
        await done(tx)
      } finally {
        db.close()
      }
    } catch {
      // Best effort: a duplicate in-app toast is the worst case.
    }
  }

  function wins(ts, device, existing) {
    if (!existing) return true
    return ts > existing.ts || (ts === existing.ts && device > existing.device)
  }

  /** Apply field changes to one reminder as ops: local store + outbox, one transaction. */
  async function writeReminderOps(reminderId, patch) {
    const db = await openDB()
    try {
      const tx = db.transaction(['reminders', 'outbox', 'meta'], 'readwrite')
      const meta = tx.objectStore('meta')
      const deviceRow = await req(meta.get('device'))
      const hlcRow = await req(meta.get('hlc'))
      if (!deviceRow || !deviceRow.value) throw new Error('no device id')
      const device = deviceRow.value
      const ts = Math.max(Date.now(), ((hlcRow && hlcRow.value) || 0) + 1)
      const store = tx.objectStore('reminders')
      const row = await req(store.get(reminderId))
      const ops = []
      if (row) {
        const clock = Object.assign({}, row._clock || {})
        for (const [field, value] of Object.entries(patch)) {
          const op = { id: self.crypto.randomUUID(), entity: 'reminder', entityId: reminderId, field, value, ts, device }
          ops.push(op)
          if (wins(ts, device, clock[field])) {
            row[field] = value
            clock[field] = { ts, device }
          }
        }
        row._clock = clock
        store.put(row)
        const outbox = tx.objectStore('outbox')
        for (const op of ops) outbox.add(op)
        meta.put({ key: 'hlc', value: ts })
      }
      await done(tx)
      return { ops, device, ts }
    } finally {
      db.close()
    }
  }

  /** Upload the given ops now when no window can do it; leave them queued on failure. */
  async function flush(ops, device) {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (windows.length > 0) {
      const reminderIds = [...new Set(ops.map((o) => o.entityId))]
      for (const c of windows) c.postMessage({ type: 'reminders:changed', reminderIds, ts: ops[0].ts })
      return
    }
    try {
      const res = await fetch('/api/v1/sync', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        // A cursor past the end: upload only, pull nothing (the app pulls on its next run).
        body: JSON.stringify({ device, cursor: Number.MAX_SAFE_INTEGER, ops }),
      })
      if (!res.ok) return
      const db = await openDB()
      try {
        const tx = db.transaction(['outbox'], 'readwrite')
        const outbox = tx.objectStore('outbox')
        const ids = new Set(ops.map((o) => o.id))
        const all = await req(outbox.getAll())
        for (const o of all) if (ids.has(o.id)) outbox.delete(o.local)
        await done(tx)
      } finally {
        db.close()
      }
    } catch {
      // Offline: the ops stay in the outbox and go out with the app's next sync.
    }
  }

  function due(task, fallbackTitle) {
    const title = (task && task.title) || fallbackTitle || 'Reminder'
    let body = 'Reminder'
    if (task && task.due) body = task.due.time ? `Due ${task.due.date} ${task.due.time}` : `Due ${task.due.date}`
    return { title, body }
  }

  self.addEventListener('push', (event) => {
    event.waitUntil((async () => {
      let data = {}
      try {
        data = event.data ? event.data.json() : {}
      } catch {
        data = {}
      }
      if (data.type !== 'reminder' || !data.reminderId) {
        await self.registration.showNotification('OpenTodo', { body: 'You have a reminder', icon: '/pwa-192.png' })
        return
      }
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const focused = windows.find((c) => c.focused || c.visibilityState === 'visible')
      if (focused) {
        // The app is in front: it shows the reminder in-app; no system notification.
        focused.postMessage({ type: 'reminders:push', reminderId: data.reminderId, taskId: data.taskId, fireAt: data.fireAt })
        return
      }
      const { task, reminder } = await readLocal(data.reminderId, data.taskId)
      // Local state may be fresher than the server's (completed or dismissed offline).
      if (task && (task.completed_at || task.deleted_at)) return
      if (reminder && (reminder.deleted_at || (reminder.dismissed_at != null && reminder.dismissed_at >= data.fireAt))) return
      const text = due(task, data.title)
      await self.registration.showNotification(text.title, {
        body: text.body,
        tag: `reminder:${data.reminderId}`,
        renotify: true,
        icon: '/pwa-192.png',
        badge: '/pwa-192.png',
        timestamp: data.fireAt,
        data: { reminderId: data.reminderId, taskId: data.taskId, fireAt: data.fireAt },
        actions: [
          { action: 'snooze10', title: 'Snooze 10 min' },
          { action: 'dismiss', title: 'Dismiss' },
        ],
      })
      await markShown(data.reminderId, data.fireAt)
    })())
  })

  self.addEventListener('notificationclick', (event) => {
    const n = event.notification
    const d = n.data || {}
    n.close()
    event.waitUntil((async () => {
      if (!d.reminderId) return
      if (event.action === 'snooze10' || event.action === 'dismiss') {
        const now = Date.now()
        const patch = event.action === 'snooze10'
          ? { fire_at: now + SNOOZE_MS, delivered_at: null, dismissed_at: null }
          : { dismissed_at: now }
        try {
          const { ops, device } = await writeReminderOps(d.reminderId, patch)
          if (ops.length) await flush(ops, device)
        } catch {
          // The app database is unavailable (signed out): nothing to change.
        }
        return
      }
      const url = `/?task=${encodeURIComponent(d.taskId || '')}`
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      if (windows.length > 0) {
        const w = windows[0]
        w.postMessage({ type: 'reminders:open', taskId: d.taskId })
        if ('focus' in w) await w.focus()
        return
      }
      await self.clients.openWindow(url)
    })())
  })

  self.addEventListener('notificationclose', (event) => {
    // Swiping a notification away is not a dismissal (the reminder stays visible
    // in the app); only remember that it was shown so the app does not repeat it.
    const d = event.notification.data || {}
    if (d.reminderId) event.waitUntil(markShown(d.reminderId, d.fireAt))
  })
})()

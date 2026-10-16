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

  // Notification texts in the interface language stored on this device (OpenSpec
  // change app-localization, design D7). The worker runs outside the bundle and
  // cannot load the catalogs, so it keeps its few texts here; each entry is pinned
  // to the app catalog's translation of the English text by src/lib/pushWorker.test.ts.
  // A missing preferences row or "system" means English: the worker cannot know
  // which language the browser resolves to when no window is open.
  const TEXT = {
    en: { reminder: 'Reminder', due: 'Due {date}', generic: 'You have a reminder', snooze: 'Snooze 10 min', dismiss: 'Dismiss', test: 'Test notification: push works on this device.' },
    de: { reminder: 'Erinnerung', due: 'Fällig {date}', generic: 'Du hast eine Erinnerung', snooze: '10 Min. später', dismiss: 'Verwerfen', test: 'Testbenachrichtigung: Push funktioniert auf diesem Gerät.' },
    fr: { reminder: 'Rappel', due: 'Échéance {date}', generic: 'Vous avez un rappel', snooze: 'Reporter de 10 min', dismiss: 'Ignorer', test: 'Notification de test : les notifications push fonctionnent sur cet appareil.' },
    es: { reminder: 'Recordatorio', due: 'Vence {date}', generic: 'Tienes un recordatorio', snooze: 'Posponer 10 min', dismiss: 'Descartar', test: 'Notificación de prueba: las notificaciones push funcionan en este dispositivo.' },
    it: { reminder: 'Promemoria', due: 'Scadenza {date}', generic: 'Hai un promemoria', snooze: 'Posticipa di 10 min', dismiss: 'Ignora', test: 'Notifica di prova: le notifiche push funzionano su questo dispositivo.' },
    pt: { reminder: 'Lembrete', due: 'Vence {date}', generic: 'Você tem um lembrete', snooze: 'Adiar 10 min', dismiss: 'Dispensar', test: 'Notificação de teste: as notificações push funcionam neste dispositivo.' },
  }
  self.__opentodoText = TEXT

  /** The stored language when it is one the worker has texts for, else English. */
  function languageOf(prefs) {
    const l = prefs && prefs.language
    return typeof l === 'string' && Object.prototype.hasOwnProperty.call(TEXT, l) ? l : 'en'
  }

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
        // userPrefs (date-time-preferences) is missing on a database older than v15.
        const hasPrefs = db.objectStoreNames.contains('userPrefs')
        const tx = db.transaction(hasPrefs ? ['tasks', 'reminders', 'userPrefs'] : ['tasks', 'reminders'], 'readonly')
        const [task, reminder, prefs] = await Promise.all([
          req(tx.objectStore('tasks').get(taskId)),
          req(tx.objectStore('reminders').get(reminderId)),
          hasPrefs ? req(tx.objectStore('userPrefs').get('me')) : Promise.resolve(undefined),
        ])
        return { task, reminder, prefs }
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

  // The due line in the user's date and time format (OpenSpec date-time-preferences,
  // design D7): an inline copy of formatDate(…, 'compact') and formatTime from
  // src/lib/dates.ts, checked against it by src/lib/pushWorker.test.ts. A missing
  // row or an unknown value means "system": the locale's date and the stored HH:MM.
  function formatDue(dueValue, prefs, today) {
    const p = prefs || {}
    // Month names and the day period in the stored language (app-localization D4);
    // without one, the browser's locale as before.
    const lang = languageOf(p)
    const locale = lang === 'en' ? undefined : lang
    const pad = (n) => String(n).padStart(2, '0')
    const [y, m, d] = String(dueValue.date).split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    let date = dueValue.date
    if (!Number.isNaN(dt.getTime()) && p.date_format !== 'iso') {
      const otherYear = String(dueValue.date).slice(0, 4) !== String(today).slice(0, 4)
      const parts = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(2026, 10, 3))
      const at = (type) => parts.findIndex((x) => x.type === type)
      const natural = at('year') < at('month') ? 'YMD' : at('day') < at('month') ? 'DM' : 'MD'
      const forced = p.date_format === 'day-month' ? 'DM' : p.date_format === 'month-day' ? 'MD' : null
      if (forced && forced !== natural) {
        const month = new Intl.DateTimeFormat(locale, { month: 'short' }).format(dt)
        date = forced === 'DM'
          ? `${d} ${month}${otherYear ? ` ${y}` : ''}`
          : `${month} ${d}${otherYear ? `, ${y}` : ''}`
      } else {
        date = new Intl.DateTimeFormat(locale, otherYear ? { year: 'numeric', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' }).format(dt)
      }
    }
    if (!dueValue.time) return date
    let time = dueValue.time
    const t = /^(\d{1,2}):(\d{2})$/.exec(dueValue.time)
    if (t && p.time_format === '24h') time = `${pad(Number(t[1]))}:${t[2]}`
    if (t && p.time_format === '12h') {
      const h = Number(t[1])
      const period = new Intl.DateTimeFormat(locale, { hour: 'numeric', hourCycle: 'h12' }).formatToParts(new Date(2026, 0, 1, h)).find((x) => x.type === 'dayPeriod')
      time = `${h % 12 === 0 ? 12 : h % 12}:${t[2]} ${period ? period.value : h < 12 ? 'AM' : 'PM'}`
    }
    return `${date}, ${time}`
  }
  self.__opentodoFormatDue = formatDue

  function localToday() {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  }

  function due(task, fallbackTitle, prefs) {
    const text = TEXT[languageOf(prefs)]
    const title = (task && task.title) || fallbackTitle || text.reminder
    let body = text.reminder
    if (task && task.due) body = text.due.replace('{date}', formatDue(task.due, prefs, localToday()))
    return { title, body }
  }

  /** The texts for the language in this device's preferences row. */
  async function storedText() {
    try {
      const db = await openDB()
      try {
        if (!db.objectStoreNames.contains('userPrefs')) return TEXT.en
        const tx = db.transaction(['userPrefs'], 'readonly')
        return TEXT[languageOf(await req(tx.objectStore('userPrefs').get('me')))]
      } finally {
        db.close()
      }
    } catch {
      return TEXT.en
    }
  }

  self.addEventListener('push', (event) => {
    event.waitUntil((async () => {
      let data = {}
      try {
        data = event.data ? event.data.json() : {}
      } catch {
        data = {}
      }
      if (data.type === 'test' && data.testId) {
        // A test push (push-test-delivery D4) always becomes a system notification,
        // even with the app in front, with its own tag so a second test does not
        // replace the first. It writes nothing locally; it only reports receipt.
        await self.registration.showNotification('OpenTodo', {
          body: (await storedText()).test,
          tag: `opentodo-test:${data.testId}`,
          icon: '/pwa-192.png',
          badge: '/pwa-192.png',
          data: { test: true, testId: data.testId },
        })
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (const w of windows) w.postMessage({ type: 'push:test-received', testId: data.testId, receivedAt: Date.now() })
        return
      }
      if (data.type !== 'reminder' || !data.reminderId) {
        await self.registration.showNotification('OpenTodo', { body: (await storedText()).generic, icon: '/pwa-192.png' })
        return
      }
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const focused = windows.find((c) => c.focused || c.visibilityState === 'visible')
      if (focused) {
        // The app is in front: it shows the reminder in-app; no system notification.
        focused.postMessage({ type: 'reminders:push', reminderId: data.reminderId, taskId: data.taskId, fireAt: data.fireAt })
        return
      }
      const { task, reminder, prefs } = await readLocal(data.reminderId, data.taskId)
      // Local state may be fresher than the server's (completed or dismissed offline).
      if (task && (task.completed_at || task.deleted_at)) return
      if (reminder && (reminder.deleted_at || (reminder.dismissed_at != null && reminder.dismissed_at >= data.fireAt))) return
      const text = due(task, data.title, prefs)
      await self.registration.showNotification(text.title, {
        body: text.body,
        tag: `reminder:${data.reminderId}`,
        renotify: true,
        icon: '/pwa-192.png',
        badge: '/pwa-192.png',
        timestamp: data.fireAt,
        data: { reminderId: data.reminderId, taskId: data.taskId, fireAt: data.fireAt },
        actions: [
          { action: 'snooze10', title: TEXT[languageOf(prefs)].snooze },
          { action: 'dismiss', title: TEXT[languageOf(prefs)].dismiss },
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
      if (d.test) {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        if (windows.length > 0 && 'navigate' in windows[0]) {
          await windows[0].navigate('/settings/notifications')
          if ('focus' in windows[0]) await windows[0].focus()
          return
        }
        await self.clients.openWindow('/settings/notifications')
        return
      }
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

// Reminder push handling for the service worker (OpenSpec change `reminders`,
// design D7). Bundled into the service worker (sw.ts imports it), so the signed
// file list's hash of sw.js covers it too (signed-web-app D1). Plain JavaScript
// on purpose: it shares no code with the app's bundle and talks to the app's
// IndexedDB ("opentodo", the Dexie database in src/lib/db.ts) with the raw API.
//
// - push: if a window of the app is focused, hand the reminder to it (in-app
//   toast only, no system notification); otherwise show a notification titled
//   from the local copy of the task (the payload carries ids only unless the
//   device opted in to titles) and record it in the shared "shown" set.
// - notificationclick: "Done" has the app complete the task (an open window, else
//   the app opened at /?reminder=<id>&action=done; OpenSpec reminder-done-action).
//   "Snooze 10 min" / "Dismiss" write ordinary reminder ops
//   into the local store and the outbox (exactly what the app's mutate() does),
//   then ask an open window to sync, or post them to /api/v1/sync directly.
//   Offline they simply wait in the outbox. A click on the body opens the task;
//   a notification with `data.url` (the end of a focus session) opens that address.
// - badge (OpenSpec change app-icon-badge): a push that arrives with the app closed
//   sets the app icon badge to the count of the logical today from the counts the
//   app stored in meta "badge:today" (src/lib/appBadge.ts). The push carries no count.
;(() => {
  const DB_NAME = 'opentodo'
  const SHOWN_KEY = 'reminders:shown'
  const SNOOZE_MS = 10 * 60 * 1000
  const BADGE_KEY = 'badge:today'

  // Notification texts in the interface language stored on this device (OpenSpec
  // change app-localization, design D7). The worker runs outside the app's bundle and
  // cannot load the catalogs, so it keeps its few texts here; each entry is pinned
  // to the app catalog's translation of the English text by src/lib/pushWorker.test.ts.
  // A missing preferences row or "system" means English: the worker cannot know
  // which language the browser resolves to when no window is open. A text missing
  // from a language's entry is English (more-languages D4: a community or
  // work-in-progress language may have an empty entry, `scripts/i18n/new-language.mjs`
  // adds one).
  const OWN_TEXT = {
    en: { reminder: 'Reminder', today: 'Today', tomorrow: 'Tomorrow', tiny: '{tiny} is enough', generic: 'You have a reminder', done: 'Done|task', snooze: 'Snooze 10 min', dismiss: 'Dismiss', test: 'Test notification: push works on this device.', assigned: '{name} assigned you a task', completed: '{name} completed a task', reopened: '{name} reopened a task', someone: 'Someone' },
    de: { reminder: 'Erinnerung', today: 'Heute', tomorrow: 'Morgen', tiny: '{tiny} reicht', generic: 'Du hast eine Erinnerung', done: 'Erledigt', snooze: '10 Min. später', dismiss: 'Verwerfen', test: 'Testbenachrichtigung: Push funktioniert auf diesem Gerät.', assigned: '{name} hat dir eine Aufgabe zugewiesen', completed: '{name} hat eine Aufgabe erledigt', reopened: '{name} hat eine Aufgabe wieder geöffnet', someone: 'Jemand' },
    fr: { reminder: 'Rappel', today: 'Aujourd’hui', tomorrow: 'Demain', tiny: '{tiny} suffit', generic: 'Tu as un rappel', done: 'Terminé', snooze: 'Reporter de 10 min', dismiss: 'Ignorer', test: 'Notification de test : les notifications push fonctionnent sur cet appareil.', assigned: '{name} t’a attribué une tâche', completed: '{name} a terminé une tâche', reopened: '{name} a rouvert une tâche', someone: 'Quelqu’un' },
    es: { reminder: 'Recordatorio', today: 'Hoy', tomorrow: 'Mañana', tiny: 'Con {tiny} basta', generic: 'Tienes un recordatorio', done: 'Hecho', snooze: 'Posponer 10 min', dismiss: 'Descartar', test: 'Notificación de prueba: las notificaciones push funcionan en este dispositivo.', assigned: '{name} te asignó una tarea', completed: '{name} completó una tarea', reopened: '{name} reabrió una tarea', someone: 'Alguien' },
    it: { reminder: 'Promemoria', today: 'Oggi', tomorrow: 'Domani', tiny: 'Basta {tiny}', generic: 'Hai un promemoria', done: 'Fatto', snooze: 'Posticipa di 10 min', dismiss: 'Ignora', test: 'Notifica di prova: le notifiche push funzionano su questo dispositivo.', assigned: '{name} ti ha assegnato un’attività', completed: '{name} ha completato un’attività', reopened: '{name} ha riaperto un’attività', someone: 'Qualcuno' },
    pt: { reminder: 'Lembrete', today: 'Hoje', tomorrow: 'Amanhã', tiny: '{tiny} já basta', generic: 'Você tem um lembrete', done: 'Concluído', snooze: 'Adiar 10 min', dismiss: 'Dispensar', test: 'Notificação de teste: as notificações push funcionam neste dispositivo.', assigned: '{name} atribuiu uma tarefa a você', completed: '{name} concluiu uma tarefa', reopened: '{name} reabriu uma tarefa', someone: 'Alguém' },
    zh: { reminder: '提醒', today: '今天', tomorrow: '明天', tiny: '{tiny}就够了', generic: '你有一条提醒', done: '完成', snooze: '延后 10 分钟', dismiss: '忽略', test: '测试通知：推送在此设备上正常工作。', assigned: '{name} 给你分配了一项任务', completed: '{name} 完成了一项任务', reopened: '{name} 重新打开了一项任务', someone: '某人' },
    nl: { reminder: 'Herinnering', today: 'Vandaag', tomorrow: 'Morgen', tiny: '{tiny} is genoeg', generic: 'Je hebt een herinnering', done: 'Voltooid', snooze: '10 min. later', dismiss: 'Sluiten', test: 'Testmelding: push werkt op dit apparaat.', assigned: '{name} heeft je een taak toegewezen', completed: '{name} heeft een taak voltooid', reopened: '{name} heeft een taak opnieuw geopend', someone: 'Iemand' },
    tr: { reminder: 'Hatırlatıcı', today: 'Bugün', tomorrow: 'Yarın', tiny: '{tiny} yeterli', generic: 'Bir hatırlatıcınız var', done: 'Tamamlandı', snooze: '10 dk ertele', dismiss: 'Kapat', test: 'Test bildirimi: bu cihazda anlık bildirimler çalışıyor.', assigned: '{name} sana bir görev atadı', completed: '{name} bir görevi tamamladı', reopened: '{name} bir görevi yeniden açtı', someone: 'Biri' },
    pl: { reminder: 'Przypomnienie', today: 'Dziś', tomorrow: 'Jutro', tiny: '{tiny} wystarczy', generic: 'Masz przypomnienie', done: 'Zrobione', snooze: 'Odłóż o 10 min', dismiss: 'Zamknij', test: 'Powiadomienie testowe: powiadomienia push działają na tym urządzeniu.', assigned: '{name} przypisał(a) ci zadanie', completed: '{name} ukończył(a) zadanie', reopened: '{name} ponownie otworzył(a) zadanie', someone: 'Ktoś' },
    ja: { reminder: 'リマインダー', today: '今日', tomorrow: '明日', tiny: '{tiny}で十分', generic: 'リマインダーがあります', done: '完了', snooze: '10分後に再通知', dismiss: '閉じる', test: 'テスト通知：この端末でプッシュが動作しています。', assigned: '{name} があなたにタスクを割り当てました', completed: '{name} がタスクを完了しました', reopened: '{name} がタスクを再開しました', someone: '誰か' },
    ar: { reminder: 'تذكير', today: 'اليوم', tomorrow: 'غدًا', tiny: '{tiny} يكفي', generic: 'لديك تذكير', done: 'منجزة', snooze: 'تأجيل 10 د', dismiss: 'إخفاء', test: 'إشعار اختبار: الإشعارات الفورية تعمل على هذا الجهاز.', assigned: 'كلّفك {name} بمهمة', completed: 'أكمل {name} مهمة', reopened: 'أعاد {name} فتح مهمة', someone: 'شخص ما' },
  }
  self.__opentodoText = OWN_TEXT
  const TEXT = {}
  for (const l of Object.keys(OWN_TEXT)) TEXT[l] = Object.assign({}, OWN_TEXT.en, OWN_TEXT[l])
  self.__opentodoTextOf = (prefs) => TEXT[languageOf(prefs)]

  /** A text without its catalog context ("Done|task" is shown as "Done"). */
  function plain(s) {
    return String(s).replace(/\|[^|]*$/, '')
  }

  /** The stored language when it is one the worker has texts for, else English. */
  function languageOf(prefs) {
    const l = prefs && prefs.language
    return typeof l === 'string' && Object.prototype.hasOwnProperty.call(TEXT, l) ? l : 'en'
  }

  /**
   * The date locale for a stored language, like intlLocale in src/lib/i18n/locale.ts:
   * the browser's tag of that language (en-GB for English on a British browser),
   * else the code itself. A missing, "system" or unknown language is the browser's
   * locale (undefined); English is never left to a browser in another language.
   */
  function localeOf(prefs) {
    const l = prefs && prefs.language
    if (typeof l !== 'string' || !Object.prototype.hasOwnProperty.call(TEXT, l)) return undefined
    const nav = (self.navigator && self.navigator.languages) || []
    for (const tag of nav) {
      try {
        const c = Intl.getCanonicalLocales(tag)[0]
        if (!c) continue
        const parts = c.toLowerCase().split('-')
        // Chinese only from a Simplified tag, like isSimplifiedChineseTag.
        const simplified = !parts.includes('hant') && (parts.includes('hans') || parts.length === 1 || parts[1] === 'cn' || parts[1] === 'sg')
        if (parts[0] === l && (l !== 'zh' || simplified)) return c
      } catch {
        // An invalid tag is skipped.
      }
    }
    return l
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

  /** The local copy of one task, or undefined. */
  async function readTask(taskId) {
    try {
      const db = await openDB()
      try {
        return await req(db.transaction(['tasks'], 'readonly').objectStore('tasks').get(taskId))
      } finally {
        db.close()
      }
    } catch {
      return undefined
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
      // The app's correction towards server time (src/lib/hlc.ts CLOCK_OFFSET_META):
      // stamps follow the same clock as the app's, so a device clock that is off
      // neither loses these changes nor gets them refused as too far ahead.
      const offsetRow = await req(meta.get('hlc_offset'))
      if (!deviceRow || !deviceRow.value) throw new Error('no device id')
      const device = deviceRow.value
      const offset = offsetRow && Number.isFinite(offsetRow.value) ? offsetRow.value : 0
      const ts = Math.max(Date.now() + offset, ((hlcRow && hlcRow.value) || 0) + 1)
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
      // Refused ops (a clock refusal among them) stay queued: the app's next sync
      // sends them again and handles the refusal (stamps them again, or reverts).
      // An answer that is not the server's (a captive portal's 200 page) keeps them all.
      const answer = await res.json().catch(() => null)
      if (!answer || !Array.isArray(answer.ops) || (answer.rejected !== undefined && !Array.isArray(answer.rejected))) return
      const refused = new Set((answer.rejected || []).map((r) => r && r.id))
      const db = await openDB()
      try {
        const tx = db.transaction(['outbox'], 'readwrite')
        const outbox = tx.objectStore('outbox')
        const ids = new Set(ops.filter((o) => !refused.has(o.id)).map((o) => o.id))
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

  // The due in the user's date and time format (OpenSpec date-time-preferences,
  // design D7), in a task row's words (push-due-date D2): an inline copy of
  // describeDue, formatDate(…, 'compact') and formatTime from src/lib/dates.ts,
  // checked against them by src/lib/pushWorker.test.ts. A missing row or an unknown
  // value means "system": the locale's date and the stored HH:MM.
  function formatDue(dueValue, prefs, today) {
    const p = prefs || {}
    const text = TEXT[languageOf(p)]
    // Month names and the day period in the stored language (app-localization D4),
    // as lib/i18n intlLocale picks it; only without a stored language, the browser's.
    const locale = localeOf(p)
    const pad = (n) => String(n).padStart(2, '0')
    const due = localDue(dueValue)
    const [y, m, d] = String(due.date).split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    let date = due.date
    if (Number.isNaN(dt.getTime())) {
      // An unreadable date stays as stored.
    } else if (due.date === today) {
      date = text.today
    } else if (due.date === addDays(today, 1)) {
      date = text.tomorrow
    } else if (due.date > today && due.date < addDays(today, 7)) {
      date = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(dt)
    } else if (p.date_format !== 'iso') {
      const otherYear = String(due.date).slice(0, 4) !== String(today).slice(0, 4)
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
    if (!due.time) return date
    let time = due.time
    const t = /^(\d{1,2}):(\d{2})$/.exec(due.time)
    if (t && p.time_format === '24h') time = `${pad(Number(t[1]))}:${t[2]}`
    if (t && p.time_format === '12h') {
      const h = Number(t[1])
      const period = new Intl.DateTimeFormat(locale, { hour: 'numeric', hourCycle: 'h12' }).formatToParts(new Date(2026, 0, 1, h)).find((x) => x.type === 'dayPeriod')
      time = `${h % 12 === 0 ? 12 : h % 12}:${t[2]} ${period ? period.value : h < 12 ? 'AM' : 'PM'}`
    }
    return `${date} ${time}`
  }
  self.__opentodoFormatDue = formatDue

  /** The calendar date `days` after `iso` (YYYY-MM-DD). */
  function addDays(iso, days) {
    const [y, m, d] = String(iso).split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d + days))
    return dt.toISOString().slice(0, 10)
  }

  /**
   * A zoned due (`tz` with a time) as this device's wall date and time, like
   * localDueOf in src/lib/dates.ts; a floating due, or a zone this browser does
   * not know, as stored.
   */
  function localDue(due) {
    if (!due || !due.tz || !due.time) return due
    try {
      const [y, m, d] = String(due.date).split('-').map(Number)
      const [hh, mm] = String(due.time).split(':').map(Number)
      const wall = Date.UTC(y, m - 1, d, hh, mm)
      const fmt = new Intl.DateTimeFormat('en-US', { timeZone: due.tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      const offset = (ms) => {
        const v = {}
        for (const x of fmt.formatToParts(ms)) v[x.type] = Number(x.value)
        return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute) - Math.floor(ms / 60000) * 60000
      }
      const at = wall - offset(wall - offset(wall))
      const local = new Date(at)
      const pad = (n) => String(n).padStart(2, '0')
      if (Number.isNaN(local.getTime())) return due
      return { date: `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`, time: `${pad(local.getHours())}:${pad(local.getMinutes())}` }
    } catch {
      return { date: due.date, time: due.time }
    }
  }

  function localToday() {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  }

  /**
   * The notification's title and body: the task's title and its due in a row's words
   * (push-due-date), from the task on this device, else from the opt-in payload.
   */
  function due(task, fallbackTitle, prefs, fallbackDue) {
    const text = TEXT[languageOf(prefs)]
    const title = (task && task.title) || fallbackTitle || text.reminder
    let body = text.reminder
    const when = task ? task.due : fallbackDue
    if (when && typeof when.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(when.date)) body = formatDue(when, prefs, localToday())
    // A habit's tiny version names the small step that still counts (habits-home D5).
    const tiny = task && task.habit && typeof task.habit_tiny === 'string' ? task.habit_tiny.trim() : ''
    if (tiny && !tiny.startsWith('enc:')) body = text.tiny.replace('{tiny}', tiny.charAt(0).toUpperCase() + tiny.slice(1))
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

  /** The logical day (src/lib/dates.ts logicalDay): before the day start it is still yesterday. */
  function badgeDay(now, dayStart) {
    const d = new Date(now)
    const start = Number.isFinite(dayStart) && dayStart > 0 ? dayStart : 0
    if (d.getHours() * 60 + d.getMinutes() < start) d.setDate(d.getDate() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  self.__opentodoBadgeDay = badgeDay

  /**
   * Sets the app icon badge to today's count as the app last stored it. No stored
   * counts (badge off, signed out) or no count for today: the badge is left alone.
   */
  async function updateBadge() {
    const nav = self.navigator
    if (!nav || typeof nav.setAppBadge !== 'function' || typeof nav.clearAppBadge !== 'function') return
    try {
      const db = await openDB()
      let row
      try {
        row = await req(db.transaction(['meta'], 'readonly').objectStore('meta').get(BADGE_KEY))
      } finally {
        db.close()
      }
      const v = row && row.value
      const n = v && v.counts ? v.counts[badgeDay(Date.now(), v.dayStart)] : undefined
      if (typeof n !== 'number') return
      if (n > 0) await nav.setAppBadge(n)
      else await nav.clearAppBadge()
    } catch {
      // No database or no permission: the badge stays as it was.
    }
  }

  /**
   * Done, Snooze 10 min, Dismiss (reminder-done-action D3): Done first. A browser that
   * shows fewer buttons (Chrome shows two) keeps the first ones; a reminder whose
   * notification has no Dismiss is still dismissed from the app.
   */
  function reminderActions(text) {
    const all = [
      { action: 'done', title: plain(text.done) },
      { action: 'snooze10', title: text.snooze },
      { action: 'dismiss', title: text.dismiss },
    ]
    const N = self.Notification
    const max = N && Number.isInteger(N.maxActions) && N.maxActions > 0 ? N.maxActions : all.length
    return all.slice(0, max)
  }

  /**
   * Done (reminder-done-action D1): the worker cannot run the app's completion (a
   * repeating task moves to its next occurrence, an encrypted account's records are
   * encrypted at upload), so the app does it with completeTask. One open window
   * completes the task in place; with none, the app opens at the address a native
   * shell's Done uses, which completes it and shows Today. Offline, the app's ops wait
   * in the outbox like any other change.
   */
  async function completeFromNotification(reminderId) {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // Exactly one window: two would each complete, and a series would move twice.
    const w = windows.find((c) => c.focused || c.visibilityState === 'visible') || windows[0]
    if (w) {
      w.postMessage({ type: 'reminders:done', reminderId })
      return
    }
    await self.clients.openWindow(`/?reminder=${encodeURIComponent(reminderId)}&action=done`)
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
      if ((data.type === 'assigned' || data.type === 'status') && data.taskId) {
        // An assignment or a status change by someone else (assignee-notifications
        // D4). With the app in front the bell already shows it.
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        if (windows.some((c) => c.focused || c.visibilityState === 'visible')) return
        const text = await storedText()
        const key = data.type === 'assigned' ? 'assigned' : data.completed ? 'completed' : 'reopened'
        const task = data.title ? undefined : await readTask(data.taskId)
        const local = task && typeof task.title === 'string' && !task.title.startsWith('enc:') ? task.title : ''
        // A function replacer keeps "$&" and the like in a name literal.
        const name = typeof data.actorName === 'string' && data.actorName ? data.actorName : text.someone
        await self.registration.showNotification(text[key].replace('{name}', () => name), {
          body: data.title || local,
          tag: `task:${data.taskId}`,
          icon: '/pwa-192.png',
          badge: '/pwa-192.png',
          data: { url: `/?task=${encodeURIComponent(data.taskId)}` },
        })
        return
      }
      if (data.type !== 'reminder' || !data.reminderId) {
        await updateBadge()
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
      await updateBadge()
      const { task, reminder, prefs } = await readLocal(data.reminderId, data.taskId)
      // Local state may be fresher than the server's (completed or dismissed offline).
      if (task && (task.completed_at || task.deleted_at)) return
      if (reminder && (reminder.deleted_at || (reminder.dismissed_at != null && reminder.dismissed_at >= data.fireAt))) return
      const text = due(task, data.title, prefs, data.due)
      await self.registration.showNotification(text.title, {
        body: text.body,
        tag: `reminder:${data.reminderId}`,
        renotify: true,
        icon: '/pwa-192.png',
        badge: '/pwa-192.png',
        timestamp: data.fireAt,
        data: { reminderId: data.reminderId, taskId: data.taskId, fireAt: data.fireAt },
        actions: reminderActions(TEXT[languageOf(prefs)]),
      })
      await markShown(data.reminderId, data.fireAt)
    })())
  })

  /** Whether url resolves to this app's own origin ('//elsewhere' does not). */
  function sameOrigin(url) {
    try {
      return new URL(url, self.location.origin).origin === self.location.origin
    } catch {
      return false
    }
  }

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
      // A notification the page showed with an address (focus-mode D12, the end of a
      // focus session): bring an open window there, else open one.
      if (typeof d.url === 'string' && sameOrigin(d.url)) {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        const w = windows[0]
        if (w && 'navigate' in w) {
          try {
            // navigate() refuses a window this worker does not control; open one then.
            await w.navigate(d.url)
            if ('focus' in w) await w.focus()
            return
          } catch {
            // fall through
          }
        }
        await self.clients.openWindow(d.url)
        return
      }
      if (!d.reminderId) return
      if (event.action === 'done') {
        await completeFromNotification(d.reminderId)
        return
      }
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

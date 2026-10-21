// Background sync loop: push the outbox, pull what other devices wrote, repeat
// until both sides are quiet. Runs on mutation, reconnect, tab focus, a timer and
// on live wake-ups from the server's event stream (which carries no data; it only
// tells us to run the exchange now).
import { useSyncExternalStore } from 'react'
import { forgetActivity } from './activity'
import { api, ApiError } from './api'
import { isTransientNetworkError } from './http'
import { bumpLocalEpoch, db, entityTables, getMeta, localEpoch, setMeta, tableOf } from './db'
import { ensureFeedBaselines } from './feed'
import { CLOCK_OFFSET_META, hlcObserveServerTime, hlcOffset } from './hlc'
import { restampSkewed, splitClockSkew } from './clockSkew'
import { applyOps, getDeviceId, onLocalMutation } from './ops'
import { followSharedDueChanges } from './reminders'
import { refreshNotifications } from './notifications'
import { dropUnconfirmed, forgetRejected, storeMemberships, type RejectedNotice } from './sharing'
import { flushPendingPurges, removeLocally, RETENTION_KEY } from './trash'
import { onUploadRequest, refreshLimits, resumeFileMigration, runUploader } from './attachments'
import { refreshMapsAvailable } from './locations'
import { sweepInbox } from './shareInbox'
import { refreshEvents } from './calendarFeeds'
import { ENTITIES, type Clock, type Op, type RowEncryption, type SyncResponse, type SyncState } from './types'
import { isEnabled, loadEncryptionState, refreshFromServer, syncBlocked } from './e2ee'
import { HELD_RETRY_MS, heldCount, holdOps, limitMessage, requeueHeld, splitRejected } from './limits'
import { decryptIncoming, LockedError, markSent, normalizeOnSight, prepareOutgoing, reconcileMode, runMigration } from './e2eeSync'
import { t } from './i18n'
import { uuid } from './ids'

const BATCH = 500
/** Poll interval while the live channel is disconnected (the historical default). */
const INTERVAL_MS = 30_000
/** Poll interval while the live channel is connected: a safety net, not the delivery path. */
const LIVE_INTERVAL_MS = 300_000
const RECONNECT_BASE_MS = 1_000
const RECONNECT_CAP_MS = 30_000
/** No `open` within this window counts as a failed attempt (e.g. a buffering proxy). */
const OPEN_TIMEOUT_MS = 10_000
const EVENTS_PATH = '/api/v1/sync/events'

interface Snapshot {
  state: SyncState
  pending: number
  lastSyncedAt: number | null
  error: string | null
  /** True while the live update stream is connected; polling is the fallback otherwise. */
  live: boolean
  /** Changes the server refused since the user last dismissed the notice (project-sharing). */
  rejected: RejectedNotice | null
}

let snapshot: Snapshot = { state: 'idle', pending: 0, lastSyncedAt: null, error: null, live: false, rejected: null }
const listeners = new Set<() => void>()
let running = false
let again = false
let debounce: ReturnType<typeof setTimeout> | null = null
let timer: ReturnType<typeof setInterval> | null = null
let started = false
/** True until notifications were fetched once in this session (task-assignment). */
let needNotifications = true
/** When ops held back by a server limit were last offered again (multi-tenant-host). */
let lastHeldRetry = 0
/** The last server limit that held ops back in this session. */
let heldReason: string | null = null

/** The exchange running now (syncNow), so a sign-out can wait for it to stop. */
let current: Promise<void> | null = null
/** Aborts the in-flight request of this session's exchange when sync stops (sign-out). */
let controller: AbortController | null = null
/** Failed exchanges in a row without an answer (offline, timeout): the retry backs off. */
let failures = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
/** Removes the window and document listeners startSync added. */
let removeListeners: (() => void) | null = null

/** The session's local data went away while an exchange waited (client-sync-robustness). */
class SessionEnded extends Error {}

// Live channel state.
let source: EventSource | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let openTimer: ReturnType<typeof setTimeout> | null = null
let attempts = 0

function publish(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch }
  for (const fn of listeners) fn()
  // The tabs that do not sync show the leader's status (one tab syncs).
  if (leader && channel) post({ type: 'status', snapshot })
}

export function useSyncStatus(): Snapshot {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => snapshot,
    () => snapshot,
  )
}

/** The current sync status outside React (tests, one-off reads). */
export function syncSnapshot(): Snapshot {
  return snapshot
}

/** Hide the "changes were not accepted" notice. */
export function dismissRejected(): void {
  publish({ rejected: null })
}

function addRejected(n: RejectedNotice): void {
  const prev = snapshot.rejected
  const merge = (a: string[], b: string[]) => [...new Set([...a, ...b])]
  publish({
    rejected: prev
      ? {
        count: prev.count + n.count, projects: merge(prev.projects, n.projects), tasks: merge(prev.tasks, n.tasks),
        assignments: (prev.assignments ?? 0) + (n.assignments ?? 0),
      }
      : n,
  })
}

export function requestSync(delay = 250): void {
  // Another tab runs the sync loop: ask it (one tab syncs).
  if (started && !leader && channel) {
    post({ type: 'sync' })
    return
  }
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => void syncNow(), delay)
}

export function syncNow(): Promise<void> {
  if (started && !leader && channel) return syncViaLeader()
  if (running) {
    again = true
    return current ?? Promise.resolve()
  }
  running = true
  current = (async () => {
    try {
      do {
        again = false
        await runOnce()
      } while (again)
    } finally {
      running = false
      current = null
    }
  })()
  return current
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

/** The shape every sync answer has; anything else did not come from the sync endpoint. */
function isSyncResponse(v: unknown): v is SyncResponse {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  const list = (x: unknown) => x === undefined || Array.isArray(x)
  return Array.isArray(r.ops) && r.ops.every((o) => typeof o === 'object' && o !== null)
    && typeof r.cursor === 'number' && Number.isFinite(r.cursor) && typeof r.hasMore === 'boolean'
    && (r.serverTime === undefined || typeof r.serverTime === 'number')
    && (r.backfillSeq === undefined || typeof r.backfillSeq === 'number')
    && list(r.rejected) && list(r.memberships) && list(r.purged)
    && ((r.rejected ?? []) as unknown[]).every((x) => typeof x === 'object' && x !== null && typeof (x as { id?: unknown }).id === 'string' && typeof (x as { reason?: unknown }).reason === 'string')
}

async function runOnce(): Promise<void> {
  // Sign-out (or stop) starts a new local epoch: from then on this exchange
  // writes nothing, so the previous account's data never lands in the cleared
  // database (client-sync-robustness). Checked after every await that precedes a write.
  const epoch = localEpoch()
  const signal = (controller ??= new AbortController()).signal
  const alive = () => {
    if (localEpoch() !== epoch) throw new SessionEnded()
  }
  try {
    await exchange(alive, signal)
  } catch (err) {
    if (err instanceof SessionEnded || localEpoch() !== epoch) return
    throw err
  }
}

async function exchange(alive: () => void, signal: AbortSignal): Promise<void> {
  const pending = (await db.outbox.count()) + (await heldCount())
  alive()
  publish({ pending })
  if (isOffline()) {
    publish({ state: 'offline' })
    return
  }
  // End-to-end encryption (OpenSpec e2ee, design D5): a device without the key
  // of an encrypted account neither pulls nor pushes.
  // The same while the server has lost the key record (encryption-state-integrity).
  const blocked = await syncBlocked()
  alive()
  if (blocked) {
    publish({ state: 'locked', error: null })
    return
  }
  publish({ state: 'syncing', error: null })
  try {
    const device = await getDeviceId()
    alive()
    // Ops a server limit held back (multi-tenant-host D5) are offered again
    // now and then; the server refuses them again while the limit holds.
    const sinceRetry = Date.now() - lastHeldRetry
    if (sinceRetry >= HELD_RETRY_MS || sinceRetry < 0) {
      lastHeldRetry = Date.now()
      await requeueHeld()
      alive()
    }
    // Notifications are refreshed after the first exchange of a session and after
    // any exchange that brought changes (an assignment arrives as an op).
    let received = needNotifications
    let skewRounds = 0
    for (;;) {
      const cursor = await getMeta<number>('cursor', 0)
      const batch = await db.outbox.orderBy('local').limit(BATCH).toArray()
      const sent = batch.map(({ local: _local, ...op }) => op)
      // The only place ops leave the device: content is encrypted here.
      const wireOps = await prepareOutgoing(sent)
      const backfillAck = await getMeta<number>('backfillAck', 0)
      alive()
      const res: unknown = await api.sync(device, cursor, wireOps, -new Date().getTimezoneOffset(), backfillAck, signal)
      alive()
      // A proxy or captive portal can answer 200 with a page of its own: nothing
      // was synced, so the outbox stays as it is (client-data-safety).
      if (!isSyncResponse(res)) throw new Error(t('The server sent an answer this app does not understand. Your changes stay on this device.'))
      hlcObserveServerTime(res.serverTime)
      // Stored for the service worker's notification actions (and the next start).
      if ((await getMeta<number>(CLOCK_OFFSET_META, 0)) !== hlcOffset()) await setMeta(CLOCK_OFFSET_META, hlcOffset())
      // A server limit (multi-tenant-host) refuses ops without judging them: the
      // device keeps them, unsynced, and sends them again later.
      // A clock refusal (sync-convergence) keeps the change: it is stamped again
      // with the corrected clock and sent in the next round of this loop.
      const { skewed, rest } = splitClockSkew(res.rejected ?? [])
      if (skewed.length > 0 && ++skewRounds > 3) throw new Error(t('This device’s clock is far off and the server keeps refusing its changes. Your changes stay on this device.'))
      const { limited, refused } = splitRejected(rest)
      // The sent batch leaves the outbox in the same transaction that holds the
      // ops a limit refused and forgets the clocks of refused ones (project-sharing:
      // the server's values, which travel in res.ops, then win), so no path
      // drops a change without handling its refusal (client-data-safety).
      let keys: string[] = []
      let notice: RejectedNotice | null = null
      await db.transaction('rw', [...entityTables(), db.outbox, db.meta], async () => {
        if (batch.length > 0) {
          await db.outbox.bulkDelete(batch.map((o) => o.local as number))
          await markSent(sent, wireOps)
        }
        if (limited.length > 0) await holdOps(sent, limited)
        await restampSkewed(sent, skewed, res.serverTime)
        ;({ keys, notice } = await forgetRejected(sent, refused))
        // A refused op never happened: drop it from the local activity log too.
        await forgetActivity(refused.map((r) => r.id))
      })
      if (limited.length > 0) heldReason = limited[0].reason
      if (notice) addRejected(notice)
      const incoming = await decryptIncoming(res.ops)
      alive()
      const mode = await reconcileMode(incoming)
      alive()
      if (mode === 'locked') {
        // Encryption was enabled elsewhere and this device has no key: keep the
        // cursor so the batch is pulled again after unlocking. Rows that only
        // existed here and were refused go now; the server's values come later.
        await dropUnconfirmed(keys)
        publish({ state: 'locked', error: null, pending: (await db.outbox.count()) + (await heldCount()) })
        return
      }
      await applyOps(incoming.ops, { wire: incoming.wire })
      alive()
      if (res.ops.length > 0) received = true
      await dropUnconfirmed(keys)
      alive()
      if (res.memberships) await storeMemberships(res.memberships)
      alive()
      // Purged on the server (trash-and-history D5): drop the rows and queued ops.
      if (res.purged?.length) await removeLocally(res.purged)
      alive()
      if (typeof res.trashRetentionDays === 'number') await setMeta(RETENTION_KEY, res.trashRetentionDays)
      alive()
      // Reminders are personal: another member moving a shared task does not move ours.
      await followSharedDueChanges(res.ops)
      alive()
      // Encrypt-on-sight (OpenSpec e2ee, design D7): queued re-writes upload in
      // the next round of this loop.
      await normalizeOnSight(incoming)
      alive()
      const restored = await generationChanged(res.generation)
      alive()
      if (restored) {
        // The server was restored from a backup: its log went back in time, so our
        // cursor means nothing there and it may lack edits we hold. Re-send every
        // local field with its original clock, then pull everything from zero.
        // A restored server may have lost the key record too: confirm it before
        // re-sending anything, so the re-seed of an encrypted account waits
        // (locked) instead of going out in plaintext (encryption-state-integrity).
        if (await isEnabled()) {
          await refreshFromServer()
          alive()
          if (await syncBlocked()) {
            publish({ state: 'locked', error: null, pending: (await db.outbox.count()) + (await heldCount()) })
            return
          }
        }
        publish({ state: 'reseeding' })
        alive()
        await reseedAfterRestore(res.generation as string)
        alive()
        publish({ pending: await db.outbox.count() })
        continue
      }
      alive()
      await setMeta('cursor', res.cursor)
      // Confirms a page of a joined project's history once it was applied (sync-convergence).
      await setMeta('backfillAck', res.backfillSeq ?? 0)
      const left = await db.outbox.count()
      publish({ pending: left })
      if (!res.hasMore && left === 0) break
    }
    if (received) {
      needNotifications = false
      await refreshNotifications()
      alive()
    }
    // Permanent deletions requested while offline go out once we are connected.
    await flushPendingPurges()
    alive()
    // Shared projects seen for the first time on this device start with everything
    // so far marked as seen (activity-feed), so an upgrade is not a wall of unread.
    await ensureFeedBaselines()
    alive()
    // Encrypted task pages (task-pages D3, D4): a new snapshot after a change, and the
    // guests' replies imported. Loaded on demand; it skips itself when there is nothing.
    void import('./taskPages').then((m) => m.maintainTaskPages()).catch(() => undefined)
    failures = 0
    const held = await heldCount()
    alive()
    if (held > 0) {
      // Everything else is synced; the held changes wait for the limit.
      publish({ state: 'limited', lastSyncedAt: Date.now(), error: limitMessage(heldReason ?? ''), pending: (await db.outbox.count()) + held })
    } else {
      heldReason = null
      publish({ state: 'idle', lastSyncedAt: Date.now(), error: null })
    }
    // Files wait for their rows to reach the server (attachments D3): send them now.
    void runUploader().catch(() => undefined)
    // An encryption change stopped while re-uploading files continues here.
    void resumeFileMigration().catch(() => undefined)
  } catch (err) {
    // The session ended meanwhile (an aborted request lands here): report nothing.
    if (err instanceof SessionEnded) throw err
    alive()
    if (err instanceof ApiError && err.status === 401) {
      publish({ state: 'unauthenticated' })
      return
    }
    if (err instanceof ApiError && err.code === 'demo_limit') {
      // Demo sandbox write budget (OpenSpec `demo-sandboxes`): nothing was
      // applied, the outbox stays queued and uploads when the budget allows.
      publish({ state: 'limited', error: err.message })
      return
    }
    if (err instanceof ApiError && err.code === 'mfa_enrolment_required') {
      // The owner now requires a second factor for this account. Nothing was
      // accepted, so the outbox stays queued and uploads after enrolment.
      publish({ state: 'restricted', error: t('Set up two-factor authentication to keep syncing.') })
      return
    }
    if (err instanceof LockedError) {
      publish({ state: 'locked', error: null })
      return
    }
    if (isTransientNetworkError(err) || isOffline()) {
      // No answer (the network failed, or the request timed out): offline, and
      // the exchange is tried again with backoff. Any other TypeError is a bug
      // and shows as an error, not as "offline" (client-sync-robustness).
      publish({ state: 'offline' })
      scheduleRetry()
      return
    }
    publish({ state: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}

// ---- log generation (server restored from a backup) ----

/** Ops per bulkAdd while re-seeding; the exchange itself still sends BATCH per request. */
const RESEED_CHUNK = 1000

/**
 * Compare the server's log generation with the stored one. The first value a
 * device sees is adopted as is (nothing to compare with); a server that sends
 * none (older build) never triggers a re-seed.
 */
async function generationChanged(generation: string | undefined): Promise<boolean> {
  if (!generation) return false
  const stored = await getMeta<string | null>('generation', null)
  if (stored === null) {
    await setMeta('generation', generation)
    return false
  }
  return stored !== generation
}

/**
 * Re-emit every locally known field as a new op carrying the field's stored
 * clock `(ts, device)`, reset the cursor to 0 and adopt the new generation, in
 * one transaction. The outbox keeps any edits still waiting to upload. Because
 * the clocks are the original ones, the server converges to exactly what this
 * device has, and two devices re-seeding at once converge by the normal rule.
 * Entity ids are unchanged, so nothing is duplicated.
 */
export async function reseedAfterRestore(generation: string): Promise<number> {
  // Never re-send an encrypted account's content while it cannot be encrypted.
  if (await syncBlocked()) throw new LockedError()
  let emitted = 0
  await db.transaction('rw', [...entityTables(), db.outbox, db.meta], async () => {
    let chunk: Op[] = []
    const flush = async () => {
      if (chunk.length === 0) return
      await db.outbox.bulkAdd(chunk)
      emitted += chunk.length
      chunk = []
    }
    const me = (await db.meta.get('userId'))?.value
    // Every synced entity kind, from the one registry (client-data-safety).
    for (const entity of ENTITIES) {
      const rows = await tableOf(entity).toArray()
      for (const row of rows) {
        // Only the author may write a comment (comments-and-activity): other
        // members' comments come back from their own devices.
        if (entity === 'comment' && row.author_id !== me) continue
        // The same for attachments (attachments D1).
        if (entity === 'attachment' && row.author_id !== me) continue
        // And for time entries (time-tracking D11): only the author's are re-sent.
        if (entity === 'time_entry' && row.user_id !== me) continue
        const clock = (row._clock ?? {}) as Clock
        // A value this device could not decrypt goes back as its envelope, never
        // as the placeholder (OpenSpec e2ee).
        const raw = (row._e2ee as RowEncryption | undefined)?.raw ?? {}
        for (const [field, c] of Object.entries(clock)) {
          if (!(field in row)) continue
          // uploaded_at is the server's word (attachments D3); a device never sends it.
          if (entity === 'attachment' && field === 'uploaded_at') continue
          chunk.push({ id: uuid(), entity, entityId: row.id as string, field, value: raw[field] ?? row[field], ts: c.ts, device: c.device })
          if (chunk.length >= RESEED_CHUNK) await flush()
        }
      }
    }
    await flush()
    await db.meta.put({ key: 'cursor', value: 0 })
    await db.meta.put({ key: 'generation', value: generation })
  })
  return emitted
}

// ---- periodic fallback ----

/** After an exchange without an answer: try again soon, backing off up to the cap. */
function scheduleRetry(): void {
  if (!started || retryTimer) return
  const delay = backoffMs(failures)
  failures = Math.min(failures + 1, 10)
  retryTimer = setTimeout(() => {
    retryTimer = null
    requestSync(0)
  }, delay)
}

function armTimer(): void {
  if (!leader) return
  if (timer) clearInterval(timer)
  timer = setInterval(() => void syncNow(), snapshot.live ? LIVE_INTERVAL_MS : INTERVAL_MS)
}

function setLive(live: boolean): void {
  if (snapshot.live === live) return
  publish({ live })
  if (started) armTimer()
}

// ---- live channel ----

/** Jittered exponential backoff: min(cap, base · 2^n) ± 20 %. */
function backoffMs(n: number): number {
  const base = Math.min(RECONNECT_CAP_MS, RECONNECT_BASE_MS * 2 ** n)
  return Math.round(base * (0.8 + Math.random() * 0.4))
}

function clearLiveTimers(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
  if (openTimer) clearTimeout(openTimer)
  openTimer = null
}

function closeSource(): void {
  if (openTimer) clearTimeout(openTimer)
  openTimer = null
  if (source) {
    const es = source
    source = null
    es.onopen = null
    es.onerror = null
    es.close()
  }
  setLive(false)
}

function scheduleReconnect(): void {
  if (!started || reconnectTimer) return
  const delay = backoffMs(attempts)
  attempts = Math.min(attempts + 1, 10)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectLive()
  }, delay)
}

/** One failed attempt: drop the source and try again later with backoff. */
function failLive(es: EventSource): void {
  if (source !== es) return
  closeSource()
  scheduleReconnect()
}

function connectLive(): void {
  // Only the tab that syncs listens for wake-ups (one tab syncs).
  if (!started || !leader || source || typeof EventSource === 'undefined') return
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  // Pointless while offline; the `online` handler calls us again.
  if (isOffline()) return
  void getDeviceId().then(
    (device) => {
      if (!started || !leader || source || isOffline()) return
      const es = new EventSource(`${EVENTS_PATH}?device=${encodeURIComponent(device)}`)
      source = es
      openTimer = setTimeout(() => failLive(es), OPEN_TIMEOUT_MS)
      es.onopen = () => {
        if (source !== es) return
        if (openTimer) clearTimeout(openTimer)
        openTimer = null
        attempts = 0
        setLive(true)
        // Cover anything recorded while we were disconnected.
        requestSync(0)
      }
      es.onerror = () => failLive(es)
      es.addEventListener('ops', (ev) => {
        if (source !== es) return
        void onWakeUp((ev as MessageEvent<string>).data)
      })
      // Subscribed calendars changed on the server (calendar-feeds D8).
      es.addEventListener('calendar', () => {
        if (source !== es) return
        void refreshEvents()
      })
    },
    () => scheduleReconnect(),
  )
}

/** A wake-up names the server's latest cursor; skip the exchange if we already have it. */
async function onWakeUp(data: string): Promise<void> {
  let cursor = Number.NaN
  try {
    cursor = Number((JSON.parse(data) as { cursor?: unknown }).cursor)
  } catch {
    // Malformed payload: fall through and sync anyway, it is only a hint.
  }
  if (Number.isFinite(cursor)) {
    const stored = await getMeta<number>('cursor', 0)
    if (cursor <= stored) return
  }
  requestSync(0)
}

// ---- lifecycle ----

/** Wire up triggers once the user is authenticated. Idempotent. */
export function startSync(): void {
  if (started) {
    requestSync(0)
    connectLive()
    return
  }
  started = true
  onUploadRequest(() => requestSync(0))
  void refreshLimits()
  // Whether the server shows maps (task-locations D6); offline keeps the last answer.
  void refreshMapsAvailable()
  // Shares abandoned on the capture screen leave the hand-over store (attachments D9).
  void sweepInbox().catch(() => undefined)
  const offMutation = onLocalMutation(() => {
    // Reflect the pending edit immediately so the indicator never claims "Synced"
    // while an op is still waiting in the debounce window.
    if (snapshot.state === 'idle') publish({ state: 'syncing', pending: snapshot.pending + 1 })
    requestSync()
  })
  const offs: (() => void)[] = [offMutation, () => onUploadRequest(null)]
  if (typeof window !== 'undefined') {
    const onOnline = () => {
      requestSync(0)
      attempts = 0
      failures = 0
      connectLive()
      void refreshEvents()
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        requestSync(0)
        // Mobile browsers drop the stream silently in the background; reconnect now
        // instead of waiting out the backoff.
        if (!source) {
          attempts = 0
          connectLive()
        }
      }
    }
    const win = window
    const doc = document
    win.addEventListener('online', onOnline)
    doc.addEventListener('visibilitychange', onVisible)
    offs.push(() => win.removeEventListener('online', onOnline), () => doc.removeEventListener('visibilitychange', onVisible))
  }
  removeListeners = () => offs.forEach((off) => off())
  electLeader()
}

/** This tab runs the sync loop now: the timer, the live channel, the first exchange. */
const leaderListeners = new Set<(leading: boolean) => void>()

/**
 * Follows whether this tab runs the sync loop (the device relay answers from it
 * only, mcp-device-relay D5). Called at once with the current state.
 */
export function onLeadership(fn: (leading: boolean) => void): () => void {
  leaderListeners.add(fn)
  fn(leader && started)
  return () => leaderListeners.delete(fn)
}

function tellLeadership(): void {
  for (const fn of leaderListeners) fn(leader && started)
}

function lead(): void {
  if (!started) return
  leader = true
  tellLeadership()
  armTimer()
  requestSync(0)
  connectLive()
  // An encryption re-write job interrupted by a reload continues (OpenSpec e2ee).
  void runMigration().then((ran) => ran && requestSync(0), () => undefined)
}

export function stopSync(): void {
  // A new epoch: the running exchange stops at its next step and its request is
  // aborted, so nothing more is written for this session (client-sync-robustness).
  bumpLocalEpoch()
  controller?.abort()
  controller = null
  again = false
  if (timer) clearInterval(timer)
  timer = null
  if (debounce) clearTimeout(debounce)
  debounce = null
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  failures = 0
  removeListeners?.()
  removeListeners = null
  started = false
  tellLeadership()
  needNotifications = true
  clearLiveTimers()
  closeSource()
  attempts = 0
  resign()
  publish({ state: 'idle', pending: 0, lastSyncedAt: null, error: null, live: false, rejected: null })
}

/**
 * stopSync, then wait until the exchange that was running has stopped. Sign-out
 * awaits this before clearing the local data.
 */
export async function stopSyncAndWait(): Promise<void> {
  const running = current
  stopSync()
  await running?.catch(() => undefined)
}

// ---- one tab syncs (client-sync-robustness) ----
//
// Every tab of the app shares one database and one device id. Only the tab that
// holds the Web Lock runs the loop (exchanges, timer, live channel); the others
// ask it to sync over a BroadcastChannel and show the status it broadcasts.
// When the leader closes, the lock passes to another tab. Without Web Locks or
// BroadcastChannel every tab syncs on its own, as before.

const LOCK_NAME = 'opentodo-sync'
const CHANNEL_NAME = 'opentodo-sync'
/** A follower's syncNow() resolves after the leader answers, or after this long. */
const FOLLOWER_WAIT_MS = 15_000

type Message =
  | { type: 'sync'; id?: string }
  | { type: 'done'; id: string }
  | { type: 'status'; snapshot: Snapshot }
  | { type: 'signout' }

/** True while this tab runs the sync loop (always, without coordination). */
let leader = false
let channel: BroadcastChannel | null = null
let lockAbort: AbortController | null = null
let releaseLock: (() => void) | null = null
const waiting = new Map<string, () => void>()
const signOutListeners = new Set<() => void>()

function coordination(): LockManager | null {
  if (typeof navigator === 'undefined' || typeof BroadcastChannel === 'undefined') return null
  return typeof navigator.locks?.request === 'function' ? navigator.locks : null
}

function post(msg: Message): void {
  try {
    channel?.postMessage(msg)
  } catch {
    // A closed channel: nothing to tell.
  }
}

function onMessage(ev: MessageEvent<Message>): void {
  const msg = ev.data
  if (msg.type === 'signout') {
    for (const fn of signOutListeners) fn()
    return
  }
  if (leader) {
    if (msg.type === 'sync') {
      const run = () => {
        if (msg.id) {
          const id = msg.id
          void syncNow().finally(() => post({ type: 'done', id }))
        } else requestSync(0)
      }
      // The key may have been entered in the asking tab: read it again from the
      // shared database before syncing for it (end-to-end encryption).
      if (snapshot.state === 'locked') void loadEncryptionState().then(run, run)
      else run()
    }
    return
  }
  if (msg.type === 'status') {
    snapshot = msg.snapshot
    for (const fn of listeners) fn()
  } else if (msg.type === 'done') {
    waiting.get(msg.id)?.()
  }
}

function electLeader(): void {
  const locks = coordination()
  if (!locks) {
    lead()
    return
  }
  leader = false
  channel = new BroadcastChannel(CHANNEL_NAME)
  channel.onmessage = onMessage
  const abort = new AbortController()
  lockAbort = abort
  locks.request(LOCK_NAME, { signal: abort.signal }, () => new Promise<void>((resolve) => {
    if (abort.signal.aborted || !started) return resolve()
    releaseLock = resolve
    lead()
  })).catch(() => undefined)
  // Until the lock is ours, the leader (if any) syncs for this tab too.
  post({ type: 'sync' })
}

/** Gives up leadership and the channel; the lock is released once the running exchange stopped. */
function resign(): void {
  leader = false
  tellLeadership()
  lockAbort?.abort()
  lockAbort = null
  const release = releaseLock
  releaseLock = null
  if (release) void (current ?? Promise.resolve()).catch(() => undefined).finally(release)
  if (channel) {
    channel.onmessage = null
    channel.close()
    channel = null
  }
  for (const done of waiting.values()) done()
  waiting.clear()
}

/** A follower's syncNow: the leader runs the exchange and says when it is done. */
function syncViaLeader(): Promise<void> {
  const id = uuid()
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timeout)
      waiting.delete(id)
      resolve()
    }
    const timeout = setTimeout(done, FOLLOWER_WAIT_MS)
    waiting.set(id, done)
    post({ type: 'sync', id })
  })
}

/** Whether this tab runs the sync loop (tests and diagnostics). */
export function isSyncLeader(): boolean {
  return leader
}

/** Tells the other tabs that this browser signed out: they stop syncing and reload. */
export function announceSignOut(): void {
  if (channel) {
    post({ type: 'signout' })
    return
  }
  if (typeof BroadcastChannel === 'undefined') return
  const c = new BroadcastChannel(CHANNEL_NAME)
  c.postMessage({ type: 'signout' } satisfies Message)
  c.close()
}

/** Subscribes to sign-outs in other tabs; returns an unsubscribe function. */
export function onSignOutElsewhere(fn: () => void): () => void {
  signOutListeners.add(fn)
  return () => signOutListeners.delete(fn)
}

/**
 * Runs fn while holding the sync lock, so no tab's exchange runs at the same
 * time (sign-out clears the local data in it). Runs fn directly without Web Locks.
 */
export async function withSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = coordination()
  if (!locks) return fn()
  return locks.request(LOCK_NAME, fn) as Promise<T>
}

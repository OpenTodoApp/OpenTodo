// Background sync loop: push the outbox, pull what other devices wrote, repeat
// until both sides are quiet. Runs on mutation, reconnect, tab focus, a timer and
// on live wake-ups from the server's event stream (which carries no data; it only
// tells us to run the exchange now).
import { useSyncExternalStore } from 'react'
import { forgetActivity } from './activity'
import { api, ApiError } from './api'
import { db, entityTables, getMeta, setMeta } from './db'
import { ensureFeedBaselines } from './feed'
import { hlcObserveServerTime } from './hlc'
import { applyOps, getDeviceId, onLocalMutation } from './ops'
import { followSharedDueChanges } from './reminders'
import { refreshNotifications } from './notifications'
import { dropUnconfirmed, forgetRejected, storeMemberships, type RejectedNotice } from './sharing'
import { flushPendingPurges, removeLocally, RETENTION_KEY } from './trash'
import type { Clock, Entity, Op, RowEncryption, SyncState } from './types'
import { currentKey, isEnabled } from './e2ee'
import { decryptIncoming, LockedError, markSent, normalizeOnSight, prepareOutgoing, reconcileMode, runMigration } from './e2eeSync'

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

// Live channel state.
let source: EventSource | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let openTimer: ReturnType<typeof setTimeout> | null = null
let attempts = 0

function publish(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch }
  for (const fn of listeners) fn()
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
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => void syncNow(), delay)
}

export async function syncNow(): Promise<void> {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    do {
      again = false
      await runOnce()
    } while (again)
  } finally {
    running = false
  }
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

async function runOnce(): Promise<void> {
  const pending = await db.outbox.count()
  publish({ pending })
  if (isOffline()) {
    publish({ state: 'offline' })
    return
  }
  // End-to-end encryption (OpenSpec e2ee, design D5): a device without the key
  // of an encrypted account neither pulls nor pushes.
  if ((await isEnabled()) && !(await currentKey())) {
    publish({ state: 'locked', error: null })
    return
  }
  publish({ state: 'syncing', error: null })
  try {
    const device = await getDeviceId()
    // Notifications are refreshed after the first exchange of a session and after
    // any exchange that brought changes (an assignment arrives as an op).
    let received = needNotifications
    for (;;) {
      const cursor = await getMeta<number>('cursor', 0)
      const batch = await db.outbox.orderBy('local').limit(BATCH).toArray()
      const sent = batch.map(({ local: _local, ...op }) => op)
      // The only place ops leave the device: content is encrypted here.
      const wireOps = await prepareOutgoing(sent)
      const res = await api.sync(device, cursor, wireOps, -new Date().getTimezoneOffset())
      hlcObserveServerTime(res.serverTime)
      if (batch.length > 0) {
        await db.outbox.bulkDelete(batch.map((o) => o.local as number))
        await markSent(sent, wireOps)
      }
      const incoming = await decryptIncoming(res.ops)
      if ((await reconcileMode(incoming)) === 'locked') {
        // Encryption was enabled elsewhere and this device has no key: keep the
        // cursor so the batch is pulled again after unlocking.
        publish({ state: 'locked', error: null, pending: await db.outbox.count() })
        return
      }
      // Refused ops (project-sharing): forget their local clocks so the server's
      // values, which travel in res.ops, win; drop rows that only existed here.
      const { keys, notice } = await forgetRejected(sent, res.rejected ?? [])
      // A refused op never happened: drop it from the local activity log too.
      await forgetActivity((res.rejected ?? []).map((r) => r.id))
      await applyOps(incoming.ops, { wire: incoming.wire })
      if (res.ops.length > 0) received = true
      await dropUnconfirmed(keys)
      if (notice) addRejected(notice)
      if (res.memberships) await storeMemberships(res.memberships)
      // Purged on the server (trash-and-history D5): drop the rows and queued ops.
      if (res.purged?.length) await removeLocally(res.purged)
      if (typeof res.trashRetentionDays === 'number') await setMeta(RETENTION_KEY, res.trashRetentionDays)
      // Reminders are personal: another member moving a shared task does not move ours.
      await followSharedDueChanges(res.ops)
      // Encrypt-on-sight (OpenSpec e2ee, design D7): queued re-writes upload in
      // the next round of this loop.
      await normalizeOnSight(incoming)
      if (await generationChanged(res.generation)) {
        // The server was restored from a backup: its log went back in time, so our
        // cursor means nothing there and it may lack edits we hold. Re-send every
        // local field with its original clock, then pull everything from zero.
        publish({ state: 'reseeding' })
        await reseedAfterRestore(res.generation as string)
        publish({ pending: await db.outbox.count() })
        continue
      }
      await setMeta('cursor', res.cursor)
      const left = await db.outbox.count()
      publish({ pending: left })
      if (!res.hasMore && left === 0) break
    }
    if (received) {
      needNotifications = false
      await refreshNotifications()
    }
    // Permanent deletions requested while offline go out once we are connected.
    await flushPendingPurges()
    // Shared projects seen for the first time on this device start with everything
    // so far marked as seen (activity-feed), so an upgrade is not a wall of unread.
    await ensureFeedBaselines()
    publish({ state: 'idle', lastSyncedAt: Date.now(), error: null })
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      publish({ state: 'unauthenticated' })
      return
    }
    if (err instanceof ApiError && err.code === 'mfa_enrolment_required') {
      // The owner now requires a second factor for this account. Nothing was
      // accepted, so the outbox stays queued and uploads after enrolment.
      publish({ state: 'restricted', error: 'Set up two-factor authentication to keep syncing.' })
      return
    }
    if (err instanceof LockedError) {
      publish({ state: 'locked', error: null })
      return
    }
    if (err instanceof TypeError) {
      // fetch() rejects with TypeError when the network is unreachable.
      publish({ state: 'offline' })
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
  let emitted = 0
  await db.transaction('rw', [...entityTables(), db.outbox, db.meta], async () => {
    let chunk: Op[] = []
    const flush = async () => {
      if (chunk.length === 0) return
      await db.outbox.bulkAdd(chunk)
      emitted += chunk.length
      chunk = []
    }
    // Every synced entity kind (keep in step with ENTITIES / entityTables()).
    const tables: [Entity, unknown][] = [
      ['project', db.projects], ['task', db.tasks], ['label', db.labels], ['view', db.views], ['reminder', db.reminders],
      ['section', db.sections],
      ['comment', db.comments],
      ['project_prefs', db.prefs],
    ]
    const me = (await db.meta.get('userId'))?.value
    for (const [entity, table] of tables) {
      const rows = (await (table as unknown as { toArray(): Promise<Record<string, unknown>[]> }).toArray())
      for (const row of rows) {
        // Only the author may write a comment (comments-and-activity): other
        // members' comments come back from their own devices.
        if (entity === 'comment' && row.author_id !== me) continue
        const clock = (row._clock ?? {}) as Clock
        // A value this device could not decrypt goes back as its envelope, never
        // as the placeholder (OpenSpec e2ee).
        const raw = (row._e2ee as RowEncryption | undefined)?.raw ?? {}
        for (const [field, c] of Object.entries(clock)) {
          if (!(field in row)) continue
          chunk.push({ id: crypto.randomUUID(), entity, entityId: row.id as string, field, value: raw[field] ?? row[field], ts: c.ts, device: c.device })
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

function armTimer(): void {
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
  if (!started || source || typeof EventSource === 'undefined') return
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  // Pointless while offline; the `online` handler calls us again.
  if (isOffline()) return
  void getDeviceId().then(
    (device) => {
      if (!started || source || isOffline()) return
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
  onLocalMutation(() => {
    // Reflect the pending edit immediately so the indicator never claims "Synced"
    // while an op is still waiting in the debounce window.
    if (snapshot.state === 'idle') publish({ state: 'syncing', pending: snapshot.pending + 1 })
    requestSync()
  })
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      requestSync(0)
      attempts = 0
      connectLive()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        requestSync(0)
        // Mobile browsers drop the stream silently in the background; reconnect now
        // instead of waiting out the backoff.
        if (!source) {
          attempts = 0
          connectLive()
        }
      }
    })
  }
  armTimer()
  requestSync(0)
  connectLive()
  // An encryption re-write job interrupted by a reload continues (OpenSpec e2ee).
  void runMigration().then((ran) => ran && requestSync(0), () => undefined)
}

export function stopSync(): void {
  if (timer) clearInterval(timer)
  timer = null
  if (debounce) clearTimeout(debounce)
  debounce = null
  started = false
  needNotifications = true
  clearLiveTimers()
  closeSource()
  attempts = 0
  publish({ state: 'idle', pending: 0, lastSyncedAt: null, error: null, live: false, rejected: null })
}

// Device relay (OpenSpec change mcp-device-relay): this device answers the
// decrypt and encrypt steps of an AI connector's tool calls for an end-to-end
// encrypted account, from the tab that syncs, while it is opted in and
// unlocked. The server never gets the account key. Security review: R1 (each
// stream negotiates its own AES-GCM key over ECDH P-256), R3 (only content
// fields of known entities, at most MAX_VALUES a request), R4/R5 (caps kept on
// this device and counting both directions). Values are never stored here.
import { api } from './api'
import { b64url, decryptValue, encryptValue, fromB64url, utf8 } from './crypto'
import { getMeta, setMeta } from './db'
import { currentKey, isContentField, onEncryptionChange, encryptionSnapshot } from './e2ee'
import { getDeviceId } from './ops'
import { onLeadership } from './sync'
import type { Entity } from './types'

export const EVENTS_PATH = '/api/v1/relay/events'
export const HKDF_INFO = 'opentodo relay v1'
export const MAX_VALUES = 2000
/** Device caps (design D6): decrypted plus encrypted values. */
export const HOUR_CAP = 5000
export const DAY_CAP = 20_000
const RECENT_MAX = 20
const K_OPTED_IN = 'relay.optedIn'
const K_CONFIRM = 'relay.confirmWrites'
const K_USAGE = 'relay.usage'
const K_RECENT = 'relay.recent'

export interface RelayDevice {
  deviceId: string
  label: string
  enabledAt: number
  online: boolean
  thisSession: boolean
}

/** One relayed call, as the device lists it: never a value. */
export interface RecentCall {
  at: number
  tool: string
  op: 'decrypt' | 'encrypt'
  count: number
  outcome: 'answered' | 'device_limit' | 'declined_on_device' | 'locked' | 'refused'
}

interface Usage { hourStart: number; hour: number; dayStart: number; day: number }

export interface RelayItem { entity: string; id: string; field: string; value: string }
interface RelayCallInfo { tool: string; token?: string; write: boolean }
interface RelayRequest { op: 'decrypt' | 'encrypt'; items: RelayItem[]; call: RelayCallInfo; deadline: number }
interface RelayResult { value?: string; error?: string }
type Answer = { results: RelayResult[] } | { error: string }

/** A relayed write waiting for the user's decision (design D7). */
export interface PendingConfirmation {
  tool: string
  token?: string
  items: RelayItem[]
  deadline: number
  decide: (apply: boolean) => void
}

export interface RelaySnapshot {
  optedIn: boolean
  connected: boolean
  busy: boolean
  confirmWrites: boolean
  recent: RecentCall[]
  pending: PendingConfirmation | null
}

let snapshot: RelaySnapshot = { optedIn: false, connected: false, busy: false, confirmWrites: false, recent: [], pending: null }
const listeners = new Set<() => void>()

function publish(patch: Partial<RelaySnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  for (const fn of listeners) fn()
}

export function relaySnapshot(): RelaySnapshot {
  return snapshot
}

export function onRelayChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ---- stream crypto (review R1) ----

/** The derived AES-GCM key of one stream from this device's ECDH key and the server's. */
export async function streamKey(priv: CryptoKey, serverPub: BufferSource, streamId: string): Promise<CryptoKey> {
  const pub = await crypto.subtle.importKey('raw', serverPub, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256)
  const hkdf = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: utf8(streamId), info: utf8(HKDF_INFO) },
    hkdf, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function seal(key: CryptoKey, plaintext: string, aad: string): Promise<string> {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: utf8(aad) }, key, utf8(plaintext)))
  const out = new Uint8Array(nonce.length + ct.length)
  out.set(nonce)
  out.set(ct, nonce.length)
  return b64url(out)
}

export async function open(key: CryptoKey, box: string, aad: string): Promise<string> {
  const raw = fromB64url(box)
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: utf8(aad) }, key, raw.slice(12))
  return new TextDecoder().decode(pt)
}

// ---- caps (review R4, R5) ----

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** Counts n values against the caps; false (and nothing counted) when over. */
export async function spend(n: number, now = Date.now()): Promise<boolean> {
  const u = await getMeta<Usage>(K_USAGE, { hourStart: now, hour: 0, dayStart: now, day: 0 })
  if (now - u.hourStart >= HOUR) Object.assign(u, { hourStart: now, hour: 0 })
  if (now - u.dayStart >= DAY) Object.assign(u, { dayStart: now, day: 0 })
  if (u.hour + n > HOUR_CAP || u.day + n > DAY_CAP) {
    await setMeta(K_USAGE, u)
    return false
  }
  u.hour += n
  u.day += n
  await setMeta(K_USAGE, u)
  return true
}

async function remember(call: RecentCall): Promise<void> {
  const recent = [call, ...(await getMeta<RecentCall[]>(K_RECENT, []))].slice(0, RECENT_MAX)
  await setMeta(K_RECENT, recent)
  publish({ recent })
}

// ---- answering ----

/** What this device answers to one request (exported for tests). */
export async function answer(req: RelayRequest): Promise<Answer> {
  const tool = req.call?.tool ?? ''
  const op = req.op
  const items = Array.isArray(req.items) ? req.items : []
  const note = (outcome: RecentCall['outcome']) => remember({ at: Date.now(), tool, op, count: items.length, outcome })
  if ((op !== 'decrypt' && op !== 'encrypt') || items.length > MAX_VALUES) {
    await note('refused')
    return { error: 'refused' }
  }
  const key = await currentKey()
  if (!key) {
    await note('locked')
    return { error: 'locked' }
  }
  if (!(await spend(items.length))) {
    await note('device_limit')
    return { error: 'device_limit' }
  }
  if (op === 'encrypt' && (await getMeta<boolean>(K_CONFIRM, false))) {
    const apply = await confirm(req)
    if (!apply) {
      await note('declined_on_device')
      return { error: 'declined_on_device' }
    }
  }
  const results: RelayResult[] = []
  for (const it of items) {
    if (typeof it?.value !== 'string' || !isContentField(it.entity as Entity, it.field) || !it.id) {
      results.push({ error: 'refused' })
      continue
    }
    try {
      results.push({ value: op === 'decrypt'
        ? await decryptValue(key, it.entity, it.id, it.field, it.value)
        : await encryptValue(key, it.entity, it.id, it.field, it.value) })
    } catch {
      results.push({ error: op === 'decrypt' ? 'decrypt_failed' : 'encrypt_failed' })
    }
  }
  await note('answered')
  return { results }
}

/** Asks the user to apply or decline a relayed write before its deadline. */
function confirm(req: RelayRequest): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const decide = (apply: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      publish({ pending: null })
      resolve(apply)
    }
    const timer = setTimeout(() => decide(false), Math.max(0, req.deadline - Date.now() - 500))
    publish({ pending: { tool: req.call.tool, token: req.call.token, items: req.items, deadline: req.deadline, decide } })
  })
}

// ---- the stream ----

let source: EventSource | null = null
let retry: ReturnType<typeof setTimeout> | null = null
let attempts = 0
let leading = false
let started = false

function disconnect(): void {
  if (retry) clearTimeout(retry)
  retry = null
  source?.close()
  source = null
  publish({ connected: false, busy: false })
}

async function connect(): Promise<void> {
  if (source || !started || !leading || !snapshot.optedIn || !encryptionSnapshot().unlocked) return
  if (typeof EventSource === 'undefined' || !crypto?.subtle) return
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']) as CryptoKeyPair
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const device = await getDeviceId()
  if (source || !leading || !snapshot.optedIn) return
  const es = new EventSource(`${EVENTS_PATH}?device=${encodeURIComponent(device)}&key=${b64url(pub)}`)
  source = es
  let key: CryptoKey | null = null
  es.addEventListener('hello', (ev) => {
    void (async () => {
      const hello = JSON.parse((ev as MessageEvent<string>).data) as { stream: string; key: string }
      key = await streamKey(pair.privateKey, fromB64url(hello.key), hello.stream)
      attempts = 0
      publish({ connected: true })
    })().catch(() => fail(es))
  })
  es.addEventListener('request', (ev) => {
    void (async () => {
      if (!key) return
      const { id, box } = JSON.parse((ev as MessageEvent<string>).data) as { id: string; box: string }
      publish({ busy: true })
      try {
        const req = JSON.parse(await open(key, box, id)) as RelayRequest
        const out = await answer(req)
        await api.relayAnswer(id, await seal(key, JSON.stringify(out), id))
      } finally {
        publish({ busy: false })
      }
    })().catch(() => undefined)
  })
  es.onerror = () => fail(es)
}

function fail(es: EventSource): void {
  if (source !== es) return
  disconnect()
  attempts++
  // Opted out elsewhere, or the session changed: stop rather than retry forever.
  void api.relayDevices().then((r) => getDeviceId().then((device) => {
    const mine = r.devices.find((d) => d.deviceId === device && d.thisSession)
    if (!mine) return setOptedIn(false)
    retry = setTimeout(() => void connect(), Math.min(60_000, 2000 * 2 ** Math.min(attempts, 5)))
  }), () => {
    retry = setTimeout(() => void connect(), Math.min(60_000, 2000 * 2 ** Math.min(attempts, 5)))
  })
}

async function setOptedIn(on: boolean): Promise<void> {
  await setMeta(K_OPTED_IN, on)
  publish({ optedIn: on })
  if (on) void connect()
  else disconnect()
}

/** A short label for this device, from the browser. */
export function deviceLabel(ua = typeof navigator === 'undefined' ? '' : navigator.userAgent): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} on ${os}` : browser
}

/** Opts this device in (needs a recently confirmed session; the API asks). */
export async function optIn(): Promise<void> {
  await api.relayOptIn(await getDeviceId(), deviceLabel())
  await setOptedIn(true)
}

/** Opts this device out ("Stop relaying"). */
export async function optOut(): Promise<void> {
  disconnect()
  try {
    await api.relayOptOut(await getDeviceId(), 'user')
  } finally {
    await setOptedIn(false)
  }
}

export async function setConfirmWrites(on: boolean): Promise<void> {
  await setMeta(K_CONFIRM, on)
  publish({ confirmWrites: on })
}

/** Starts following leadership and the lock; returns a stop function. */
export function startRelay(): () => void {
  started = true
  void Promise.all([getMeta<boolean>(K_OPTED_IN, false), getMeta<boolean>(K_CONFIRM, false), getMeta<RecentCall[]>(K_RECENT, [])])
    .then(([optedIn, confirmWrites, recent]) => {
      publish({ optedIn, confirmWrites, recent })
      void connect()
    })
  const offLead = onLeadership((on) => {
    leading = on
    if (on) void connect()
    else disconnect()
  })
  let wasUnlocked = encryptionSnapshot().unlocked
  const offLock = onEncryptionChange(() => {
    const unlocked = encryptionSnapshot().unlocked
    const locked = wasUnlocked && !unlocked
    wasUnlocked = unlocked
    if (unlocked) {
      void connect()
      return
    }
    // Locking (an unlocked device becoming locked) ends the opt-in (design D3);
    // other changes of the encryption state while locked do not.
    if (locked && snapshot.optedIn) {
      disconnect()
      void getDeviceId().then((d) => api.relayOptOut(d, 'locked')).catch(() => undefined).finally(() => void setOptedIn(false))
    }
  })
  return () => {
    started = false
    offLead()
    offLock()
    disconnect()
  }
}

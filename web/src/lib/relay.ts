// Device relay (OpenSpec change mcp-device-relay): this device answers the
// decrypt and encrypt steps of an AI connector's tool calls for an end-to-end
// encrypted account, from the tab that syncs, while it is opted in and
// unlocked. The server never gets the account key. Security review: R1 (each
// stream negotiates its own AES-GCM key over ECDH P-256), R3 (only content
// fields of known entities, at most MAX_VALUES a request), R4/R5 (caps kept on
// this device and counting both directions). Values are never stored here.
//
// The same stream runs the account's routines on this device (OpenSpec change
// routines-ai-step, D7): "Run my routines on this device" is its own opt-in,
// survives locking (the stream is open only while unlocked) and announces the
// capabilities routines and ai. A routine.run request carries ids only; the
// runner (lib/rules/deviceRun, loaded on the first request) plans on this
// device's decrypted copy and commits ciphertext.
import { api } from './api'
import { b64url, decryptValue, encryptValue, fromB64url, utf8 } from './crypto'
import { getMeta, setMeta } from './db'
import { currentKey, isContentField, onEncryptionChange, encryptionSnapshot } from './e2ee'
import { getDeviceId } from './ops'
import { onLeadership } from './sync'
import type { Entity } from './types'
import { createStore } from './store'

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
const K_ROUTINES = 'relay.routines'
const K_ROUTINE_RECENT = 'relay.routineRecent'

export interface RelayDevice {
  deviceId: string
  label: string
  enabledAt: number
  online: boolean
  thisSession: boolean
  /** routines-ai-step D7: the device's opt-ins, its own stream and what it announced. */
  mcp?: boolean
  routines?: boolean
  connected?: boolean
  capabilities?: string[]
}

/** One routine run of this device, as its relay panel lists it: never text. */
export interface RecentRoutineRun {
  at: number
  rule: string
  name: string
  outcome: string
  writes: number
}

/** A routine.run request (ids and numbers only, routines-ai-step D7). */
export interface RoutineRunRequest {
  op: 'routine.run'
  rule: string
  run: string
  occurrence: string
  at: number
  task?: string
  rev: string
  auto: boolean
  tokens: number
  budget: number
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
  /** "Run my routines on this device", the routine running now and the last runs. */
  routines: boolean
  running: { rule: string; name: string } | null
  routineRecent: RecentRoutineRun[]
}

const snapshot = createStore<RelaySnapshot>('relay', { optedIn: false, connected: false, busy: false, confirmWrites: false, recent: [], pending: null,
  routines: false, running: null, routineRecent: [] })

function publish(patch: Partial<RelaySnapshot>): void {
  snapshot.update((cur) => ({ ...cur, ...patch }))
}

export const relaySnapshot = snapshot.get

export const onRelayChange = snapshot.subscribe

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

const wanted = () => snapshot.get().optedIn || snapshot.get().routines

/** What this device announces for routines: routines, and ai when the on-device assistant can run routine steps. */
async function capabilities(): Promise<string> {
  if (!snapshot.get().routines) return ''
  try {
    const { deviceAIReady } = await import('./rules/deviceAI')
    return (await deviceAIReady()) ? 'routines,ai' : 'routines'
  } catch {
    return 'routines'
  }
}

async function connect(): Promise<void> {
  if (source || !started || !leading || !wanted() || !encryptionSnapshot().unlocked) return
  if (typeof EventSource === 'undefined' || !crypto?.subtle) return
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']) as CryptoKeyPair
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const device = await getDeviceId()
  const caps = await capabilities()
  if (source || !leading || !wanted()) return
  const es = new EventSource(`${EVENTS_PATH}?device=${encodeURIComponent(device)}&key=${b64url(pub)}${caps ? `&caps=${caps}` : ''}`)
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
  es.addEventListener('routine', (ev) => {
    void (async () => {
      if (!key) return
      const { id, box } = JSON.parse((ev as MessageEvent<string>).data) as { id: string; box: string }
      const req = JSON.parse(await open(key, box, id)) as RoutineRunRequest
      if (req.op !== 'routine.run' || req.run !== id) return
      await runRoutineRequest(req)
    })().catch(() => undefined)
  })
  es.onerror = () => fail(es)
}

let queue: Promise<void> = Promise.resolve()

/** Runs one routine.run request on this device, one at a time (exported for Run now and tests). */
export function runRoutineRequest(req: RoutineRunRequest): Promise<void> {
  queue = queue.then(async () => {
    const { runOnDevice } = await import('./rules/deviceRun')
    const out = await runOnDevice(req, (name) => publish({ running: { rule: req.rule, name } }))
    const recent = [{ at: Date.now(), rule: req.rule, name: out.name, outcome: out.outcome, writes: out.writes }, ...(await getMeta<RecentRoutineRun[]>(K_ROUTINE_RECENT, []))].slice(0, RECENT_MAX)
    await setMeta(K_ROUTINE_RECENT, recent)
    publish({ routineRecent: recent })
  }).catch(() => undefined).finally(() => publish({ running: null }))
  return queue
}

function fail(es: EventSource): void {
  if (source !== es) return
  disconnect()
  attempts++
  // Opted out elsewhere, or the session changed: stop rather than retry forever.
  void api.relayDevices().then((r) => getDeviceId().then((device) => {
    const mine = r.devices.find((d) => d.deviceId === device && d.thisSession)
    if (!mine) return Promise.all([setOptedIn(false), setRoutines(false)])
    if (mine.mcp === false && snapshot.get().optedIn) void setOptedIn(false)
    if (mine.routines === false && snapshot.get().routines) void setRoutines(false)
    retry = setTimeout(() => void connect(), Math.min(60_000, 2000 * 2 ** Math.min(attempts, 5)))
  }), () => {
    retry = setTimeout(() => void connect(), Math.min(60_000, 2000 * 2 ** Math.min(attempts, 5)))
  })
}

async function setOptedIn(on: boolean): Promise<void> {
  await setMeta(K_OPTED_IN, on)
  publish({ optedIn: on })
  reconnect()
}

async function setRoutines(on: boolean): Promise<void> {
  await setMeta(K_ROUTINES, on)
  publish({ routines: on })
  reconnect()
}

/** Opens the stream again with the opt-ins and capabilities of now (the server reads them at open). */
function reconnect(): void {
  disconnect()
  if (wanted()) void connect()
}

/** Turns on "Run my routines on this device" (needs an unlocked device and a recently confirmed session; the API asks). */
export async function routinesOptIn(): Promise<void> {
  await api.routinesDeviceOptIn(await getDeviceId(), deviceLabel())
  await setRoutines(true)
}

/** Turns it off on this device, or for another device of the account. */
export async function routinesOptOut(device?: string): Promise<void> {
  const mine = await getDeviceId()
  await api.routinesDeviceOptOut(device ?? mine)
  if (!device || device === mine) await setRoutines(false)
}

/** The capabilities may have changed (the on-device assistant set up or its consent): announce them again. */
export function refreshCapabilities(): void {
  if (snapshot.get().routines && source) reconnect()
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
  void Promise.all([getMeta<boolean>(K_OPTED_IN, false), getMeta<boolean>(K_CONFIRM, false), getMeta<RecentCall[]>(K_RECENT, []),
    getMeta<boolean>(K_ROUTINES, false), getMeta<RecentRoutineRun[]>(K_ROUTINE_RECENT, [])])
    .then(([optedIn, confirmWrites, recent, routines, routineRecent]) => {
      publish({ optedIn, confirmWrites, recent, routines, routineRecent })
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
    // Locking (an unlocked device becoming locked) ends the AI connector
    // opt-in (design D3); other changes of the encryption state while locked
    // do not. The routines opt-in stays: the stream closes until unlocked.
    if (locked) disconnect()
    if (locked && snapshot.get().optedIn) {
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

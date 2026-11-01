// The vault's state file, .opentodo/state.json (internal/vault/state.go): the
// same file, version and members as `ot vault`, so a folder moves between the
// two; `owner` and `lease_until` say which installation syncs it
// (obsidian-vault-sync D3, D4).
import { localDateTime } from './zone'
import { NewerStateError, NotVaultError, OwnedError, type FileAdapter, type Owner, type State } from './types'

export const STATE_DIR = '.opentodo'
export const STATE_PATH = `${STATE_DIR}/state.json`
export const STATE_VERSION = 2
/** How long a sync keeps the folder's lease (design D4). */
export const LEASE_MS = 5 * 60 * 1000

function randomHex(n: number): string {
  const b = crypto.getRandomValues(new Uint8Array(n))
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

export const randomDevice = () => 'vault:' + randomHex(12)

export function newState(profile: string, server: string, device: string): State {
  return { version: STATE_VERSION, device, profile, server, cursor: 0, clock: 0, offset: 0, store: {}, files: {}, printed: {}, extra: {}, initialized: false }
}

/** Reads a vault's state; NotVaultError when the folder has none. */
export async function loadState(files: FileAdapter): Promise<State> {
  const raw = await files.read(STATE_PATH)
  if (raw === null) throw new NotVaultError('not a vault')
  let st: State
  try {
    st = JSON.parse(raw) as State
  } catch (err) {
    throw new Error(`the vault state ${STATE_PATH} is unreadable: ${(err as Error).message}`)
  }
  if (st === null || typeof st !== 'object') throw new Error(`the vault state ${STATE_PATH} is unreadable`)
  if ((st.version ?? 0) > STATE_VERSION) throw new NewerStateError(`the vault state was written by a newer version (format ${st.version}; this plugin reads up to ${STATE_VERSION}): update the OpenTodo plugin`)
  st.store ??= {}
  st.files ??= {}
  st.printed ??= {}
  st.extra ??= {}
  st.cursor ??= 0
  st.clock ??= 0
  st.offset ??= 0
  st.initialized ??= false
  for (const e of Object.keys(st.store)) st.store[e] ??= {}
  return st
}

/** The state as Go's json.Marshal writes it: the same members, the empty ones left out where Go leaves them out. */
export function stateJSON(st: State): Record<string, unknown> {
  const out: Record<string, unknown> = {
    version: STATE_VERSION, device: st.device, profile: st.profile, server: st.server, cursor: st.cursor,
  }
  if (st.generation) out.generation = st.generation
  out.clock = st.clock
  out.offset = st.offset
  if (st.backfill_ack) out.backfill_ack = st.backfill_ack
  if (st.shared && st.shared.length > 0) out.shared = st.shared
  out.store = st.store
  out.files = st.files
  out.printed = st.printed
  if (st.extra && Object.keys(st.extra).length > 0) out.extra = st.extra
  out.initialized = st.initialized
  if (st.tasknotes !== undefined && st.tasknotes !== null) out.tasknotes = st.tasknotes
  if (st.owner) out.owner = st.owner
  if (st.lease_until) out.lease_until = st.lease_until
  return out
}

/** Writes the state atomically (state.json.tmp, then a rename). */
export async function saveState(files: FileAdapter, st: State): Promise<void> {
  st.version = STATE_VERSION
  await files.writeAtomic(STATE_PATH, JSON.stringify(stateJSON(st)))
}

/** The refusal of a folder another installation owns (OwnedError in state.go). */
export function ownedError(owner: Owner, leaseUntil: number, now: number, zone: string): OwnedError {
  const label = owner.label || 'another device'
  const until = localDateTime(leaseUntil, zone)
  const running = leaseUntil > now
  const msg = running
    ? `this folder is synced by ${label}, whose lease runs until ${until}`
    : `this folder is synced by ${label}, whose lease ended at ${until} (it may only be asleep)`
  return new OwnedError(msg, owner, leaseUntil, running)
}

/** An OwnedError when the state names an installation other than o; a state without an owner is never refused. */
export function checkOwner(st: State, o: Owner | null | undefined, now: number, zone: string): OwnedError | null {
  if (!o || !st.owner || st.owner.install === o.install) return null
  return ownedError(st.owner, st.lease_until ?? 0, now, zone)
}

/** A fresh vault device of the folder (design D5): no cursor, no base, nothing recorded about the files. */
export function takeOver(st: State, device: string): void {
  st.device = device
  st.cursor = 0
  st.generation = ''
  st.backfill_ack = 0
  st.clock = 0
  st.offset = 0
  st.shared = undefined
  st.store = {}
  st.files = {}
  st.printed = {}
  st.extra = {}
  st.initialized = false
  st.owner = undefined
  st.lease_until = 0
  const tn = st.tasknotes as { hashes?: unknown } | undefined
  if (tn && typeof tn === 'object') tn.hashes = {}
}

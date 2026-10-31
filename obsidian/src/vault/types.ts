// The engine's boundary (obsidian-vault-sync task 3.1): a file adapter, a
// transport and a crypter, so the engine imports nothing from Obsidian and
// runs the shared vectors against in-memory stand-ins.
import type { Op } from './store'

/**
 * The vault folder. Paths are slash-separated and relative to it; `list`
 * returns every file below it, hidden ones and those in hidden folders too
 * (`.opentodo/state.json`, iCloud's `.<name>.icloud`).
 */
export interface FileAdapter {
  list(): Promise<string[]>
  read(path: string): Promise<string | null>
  /**
   * Writes a file, creating its folders. With expected, only while the file
   * still holds that text (null: while it does not exist): an edit made since
   * the sync read the file is kept, and the next sync merges it.
   */
  write(path: string, text: string, expected?: string | null): Promise<unknown>
  /** Writes path.tmp, then renames it over path (the state file). */
  writeAtomic(path: string, text: string): Promise<void>
  remove(path: string): Promise<void>
  /** Removes a folder when it is empty. */
  removeDir(path: string): Promise<void>
  exists(path: string): Promise<boolean>
}

/** One POST /api/v1/sync exchange (docs/sync.md "Exchange"). */
export interface Request {
  device: string
  cursor: number
  ops: Op[]
  features?: string[]
  backfillAck?: number
}

export interface Reply {
  ops: Op[]
  cursor: number
  hasMore?: boolean
  serverTime?: number
  generation?: string
  rejected?: { id: string; reason: string; serverTime?: number }[]
  memberships?: { projectId: string }[]
  purged?: { entity: string; entityId: string }[]
  backfillSeq?: number
}

export interface Transport {
  exchange(req: Request): Promise<Reply>
}

/** Opens and seals content values of an encrypted account on the device. */
export interface Crypter {
  open(entity: string, id: string, field: string, value: string): Promise<string>
  seal(entity: string, id: string, field: string, plaintext: string): Promise<string>
}

/** The installation that syncs a folder (state.go Owner). */
export interface Owner {
  kind: 'cli' | 'obsidian'
  install: string
  label: string
}

export interface Options {
  files: FileAdapter
  transport: Transport
  crypter?: Crypter | null
  userID: string
  now: () => number
  /** The machine's time zone, an IANA name. */
  zone: string
  readOnly?: boolean
  dryRun?: boolean
  /** A new state (ot vault init); else the folder's state file is read. */
  state?: State | null
  owner?: Owner | null
  takeOver?: boolean
  /** The device id of a new or taken-over vault (tests pin it). */
  newDevice?: () => string
  /** Plaintext of ciphertext values opened by earlier syncs, keyed by entity, id, field and value; kept by the caller so a sync opens only new values. */
  plain?: Map<string, string | null>
}

export interface Event {
  kind: string
  file?: string
  task?: string
  text: string
}

/** What a sync did (internal/vault Report). */
export interface Report {
  written: number
  created: number
  updated: number
  trashed: number
  conflicts: number
  warnings: string[]
  cursor: number
  events: Event[]
  projects: number
  tasks: number
  planned?: Op[]
  files?: string[]
}

export interface FileState {
  project: string
  hash: string
}

/** The vault's state file, .opentodo/state.json (version 2, state.go). */
export interface State {
  version: number
  device: string
  profile: string
  server: string
  cursor: number
  generation?: string
  clock: number
  offset: number
  backfill_ack?: number
  shared?: string[]
  store: import('./store').Store
  files: Record<string, FileState>
  printed: Record<string, string>
  extra?: Record<string, string>
  initialized: boolean
  /** A linked TaskNotes folder: the plugin refuses such a folder and keeps the member. */
  tasknotes?: unknown
  owner?: Owner
  lease_until?: number
}

/** A sync stopped by a vault limit; nothing was written or pushed. */
export class LimitError extends Error {}

/** A folder another installation owns (vault_owned); nothing was sent. */
export class OwnedError extends Error {
  constructor(message: string, public owner: Owner, public leaseUntil: number, public running: boolean) {
    super(message)
  }
}

/** The folder has no state file. */
export class NotVaultError extends Error {}

/** A state written by a newer engine. */
export class NewerStateError extends Error {}

/** A state with a TaskNotes folder linked: the plugin leaves it to ot vault. */
export class TaskNotesError extends Error {}

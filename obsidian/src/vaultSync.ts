// Vault sync in the plugin (OpenSpec change obsidian-vault-sync): one folder of
// the Obsidian vault synced with OpenTodo by the same engine rules as `ot vault`
// (src/vault/), as a vault device `vault:<id>` with the plugin's full token.
// It syncs when the plugin loads, once a file in the folder has held still for
// a second after a change, every 30 seconds while Obsidian is in front, when
// Obsidian comes back to the front and on the command; never in the
// background. A failed sync changes nothing and is retried after 30 s, 1, 2
// and then every 5 minutes. A folder another installation owns is not synced
// until the user takes it over (design D4, D5).
import { ApiError, NetworkError, type Client } from './api'
import type { Account } from './connect'
import type { Keyring } from './crypt'
import { K, type DeviceStorage } from './storage'
import { tr } from './strings'
import { sync, vaultFile } from './vault/engine'
import { loadState, newState, randomDevice, saveState, STATE_PATH } from './vault/state'
import { LimitError, NewerStateError, NotVaultError, OwnedError, TaskNotesError, type FileAdapter, type Owner, type Report, type Transport } from './vault/types'
import { systemZone } from './vault/zone'

/** Timings (design D6); tests shorten them. */
export const STABLE_MS = 1000
export const EVERY_MS = 30_000
export const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000]
/** File events this long after a sync are its own writes. */
const OWN_WRITES_MS = 1500

export const DEFAULT_FOLDER = 'OpenTodo'

export type VaultStatus =
  | { kind: 'off' }
  | { kind: 'waiting' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: number; report: Report }
  | { kind: 'disconnected' }
  | { kind: 'locked' }
  | { kind: 'owned'; owner: Owner; leaseUntil: number; running: boolean }
  | { kind: 'tasknotes' }
  | { kind: 'failed'; message: string; retryAt: number }

export type Trigger = 'load' | 'files' | 'interval' | 'visible' | 'command' | 'enable' | 'take-over'

export interface VaultHost {
  store: DeviceStorage
  keys: Keyring
  client(): Client | null
  account(): Account | null
  server(): string | null
  /** The vault folder as files. */
  files(folder: string): FileAdapter
  /** This installation, as the state file names it. */
  owner(): Owner
  /** Whether Obsidian is in front. */
  visible(): boolean
  changed(): void
  now?: () => number
}

/** The folder still holds Markdown files: turning sync on adopts them as projects. */
export class NeedsAdoptError extends Error {
  constructor(public count: number) {
    super('the folder holds Markdown files')
  }
}

/** The plugin's label for this device in the state file: kept in English, other devices read it. */
export function deviceLabel(p: { isIosApp?: boolean; isAndroidApp?: boolean; isPhone?: boolean; isTablet?: boolean; isMacOS?: boolean; isWin?: boolean; isLinux?: boolean }): string {
  if (p.isIosApp) return p.isTablet ? 'Obsidian on iPad' : 'Obsidian on iPhone'
  if (p.isAndroidApp) return p.isTablet ? 'Obsidian on an Android tablet' : 'Obsidian on Android'
  if (p.isMacOS) return 'Obsidian on a Mac'
  if (p.isWin) return 'Obsidian on Windows'
  if (p.isLinux) return 'Obsidian on Linux'
  return 'Obsidian'
}

/** Whether a vault path lies inside the synced folder. */
export function inFolder(path: string, folder: string | null): boolean {
  if (folder === null) return false
  if (folder === '') return true
  return path === folder || path.startsWith(folder + '/')
}

/** A transport over the plugin's client (task 3.3): the full exchange on /api/v1/sync. */
export function clientTransport(c: Client): Transport {
  return { exchange: (req) => c.exchange(req) }
}

export class VaultSync {
  status: VaultStatus = { kind: 'off' }
  private running: Promise<VaultStatus> | null = null
  private again = false
  private failures = 0
  private retryAt = 0
  private lastEnd = 0
  private stableTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  /** What the account key opened, across syncs; cleared when the folder or the lock changes. */
  private plain = new Map<string, string | null>()

  constructor(private host: VaultHost) {
    if (this.folder() !== null) this.status = { kind: 'waiting' }
  }

  private now(): number {
    return (this.host.now ?? Date.now)()
  }

  /** The synced folder on this device, null when vault sync is off. */
  folder(): string | null {
    return this.host.store.get<string>(K.vaultFolder)
  }

  /** Whether a path is a file of the synced folder (Send line refuses its lines, D8). */
  covers(path: string): boolean {
    return inFolder(path, this.folder())
  }

  private set(s: VaultStatus): VaultStatus {
    this.status = s
    this.host.changed()
    return s
  }

  /** What turning sync on for a folder needs: nothing, or adopting its Markdown files. */
  async check(folder: string): Promise<{ state: boolean; notes: number }> {
    const files = this.host.files(folder)
    if ((await files.read(STATE_PATH)) !== null) return { state: true, notes: 0 }
    return { state: false, notes: (await files.list()).filter(vaultFile).length }
  }

  /**
   * Turns vault sync on for a folder: continues from its state file, or does
   * what `ot vault init` does (refusing a folder with Markdown files unless
   * adopt). The folder is kept only when the first sync succeeds.
   */
  async enable(folder: string, adopt = false): Promise<VaultStatus> {
    folder = folder.replace(/^\/+|\/+$/g, '')
    const { state, notes } = await this.check(folder)
    if (!state && notes > 0 && !adopt) throw new NeedsAdoptError(notes)
    const prev = this.folder()
    this.host.store.set(K.vaultFolder, folder)
    const s = await this.run('enable', state ? null : newState('default', this.host.server() ?? '', randomDevice()))
    if (s.kind !== 'synced' && s.kind !== 'owned' && s.kind !== 'locked') {
      if (prev === null) this.host.store.remove(K.vaultFolder)
      else this.host.store.set(K.vaultFolder, prev)
      if (prev === null) this.status = { kind: 'off' }
      this.host.changed()
    }
    return s
  }

  /** Turns vault sync off: the files and the state stay, and the lease is given up so another device can sync without taking over. */
  async disable(): Promise<void> {
    const folder = this.folder()
    this.stop()
    this.host.store.remove(K.vaultFolder)
    this.plain.clear()
    this.failures = 0
    this.retryAt = 0
    this.set({ kind: 'off' })
    if (folder === null) return
    try {
      const files = this.host.files(folder)
      const st = await loadState(files)
      if (st.owner?.install === this.host.owner().install) {
        st.owner = undefined
        st.lease_until = 0
        await saveState(files, st)
      }
    } catch {
      // No state, or unreadable: nothing to give up.
    }
  }

  /** "Take over syncing here" (design D5). */
  takeOver(): Promise<VaultStatus> {
    return this.run('take-over')
  }

  stop(): void {
    if (this.stableTimer) clearTimeout(this.stableTimer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.stableTimer = this.retryTimer = null
  }

  /** A file changed: sync once the folder's files held still for a second. */
  fileChanged(path: string): void {
    const folder = this.folder()
    if (!inFolder(path, folder) || this.running || this.now() - this.lastEnd < OWN_WRITES_MS) return
    const rel = folder === '' ? path : path.slice(folder!.length + 1)
    if (rel.startsWith('.opentodo/') || (!vaultFile(rel) && !rel.endsWith('.icloud'))) return
    if (this.stableTimer) clearTimeout(this.stableTimer)
    this.stableTimer = setTimeout(() => {
      this.stableTimer = null
      void this.run('files')
    }, STABLE_MS)
  }

  /** The 30-second interval: a sync while Obsidian is in front. */
  tick(): void {
    if (this.host.visible()) void this.run('interval')
  }

  /** Obsidian came back to the front. */
  shown(): void {
    if (this.host.visible()) void this.run('visible')
  }

  /**
   * Runs one sync now (or after the one running). Automatic triggers wait out
   * a back-off; the command, enabling and taking over do not.
   */
  async run(trigger: Trigger, init: ReturnType<typeof newState> | null = null): Promise<VaultStatus> {
    if (this.folder() === null) return this.status
    const manual = trigger === 'command' || trigger === 'enable' || trigger === 'take-over'
    if (!manual && this.retryAt > this.now()) return this.status
    if (this.running) {
      if (!manual) {
        this.again = true
        return this.running
      }
      await this.running.catch(() => undefined)
    }
    this.running = this.once(trigger, init)
    try {
      return await this.running
    } finally {
      this.running = null
      this.lastEnd = this.now()
      if (this.again) {
        this.again = false
        void this.run('files')
      }
    }
  }

  private async once(trigger: Trigger, init: ReturnType<typeof newState> | null): Promise<VaultStatus> {
    const folder = this.folder()!
    const c = this.host.client()
    const account = this.host.account()
    if (!c || !account) return this.set({ kind: 'disconnected' })
    if (account.encrypted && !this.host.keys.unlocked) {
      this.plain.clear()
      return this.set({ kind: 'locked' })
    }
    // A value that did not open is tried again on every sync.
    for (const [k, v] of this.plain) if (v === null) this.plain.delete(k)
    this.set({ kind: 'syncing' })
    try {
      const report = await sync({
        files: this.host.files(folder), transport: clientTransport(c), crypter: account.encrypted ? this.host.keys.crypter() : null,
        userID: account.userId, now: () => this.now(), zone: systemZone(), state: init, owner: this.host.owner(), takeOver: trigger === 'take-over', plain: this.plain,
      })
      this.failures = 0
      this.retryAt = 0
      if (this.retryTimer) clearTimeout(this.retryTimer)
      return this.set({ kind: 'synced', at: this.now(), report })
    } catch (err) {
      if (err instanceof OwnedError) return this.set({ kind: 'owned', owner: err.owner, leaseUntil: err.leaseUntil, running: err.running })
      if (err instanceof TaskNotesError) return this.set({ kind: 'tasknotes' })
      return this.fail(failureMessage(err))
    }
  }

  private fail(message: string): VaultStatus {
    const wait = BACKOFF_MS[Math.min(this.failures, BACKOFF_MS.length - 1)]
    this.failures++
    this.retryAt = this.now() + wait
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      if (this.host.visible()) void this.run('interval')
    }, wait)
    return this.set({ kind: 'failed', message, retryAt: this.retryAt })
  }
}

/** Why a sync failed, for the settings tab and the status bar. */
export function failureMessage(err: unknown): string {
  if (err instanceof NetworkError) return tr('OpenTodo cannot be reached right now. Nothing was changed; the sync is tried again.')
  if (err instanceof ApiError && err.status === 401) return tr('OpenTodo did not accept this device’s token any more. Connect again in the plugin settings.')
  if (err instanceof ApiError && err.code === 'insufficient_scope') return tr('The vault needs a full token.')
  if (err instanceof NotVaultError) return tr('The folder has no .opentodo/state.json any more. Turn vault sync off and on again to start over.')
  if (err instanceof NewerStateError) return tr('A newer version of OpenTodo wrote this folder’s state. Update the plugin.')
  if (err instanceof LimitError) return tr('A vault limit was reached, so nothing was written or sent: {reason}', { reason: err.message })
  return err instanceof Error ? err.message : String(err)
}

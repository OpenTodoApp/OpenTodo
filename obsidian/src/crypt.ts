// Encrypted accounts (obsidian-plugin D10): the passphrase unlocks the account
// key on this device with the web app's own code, the key stays in memory until
// Obsidian closes unless the user asks to remember it, and every content value
// is sealed before it enters the outbox.
import { b64url, checkRecordParams, fromB64url, unlockWithPassphrase, unlockWithRecoveryKey, type KeyRecord } from '../../web/src/lib/crypto'
import { openValue, sealValue } from '../../web/src/lib/e2eeEnvelope'
import type { Entity } from '../../web/src/lib/types'
import { K, type DeviceStorage } from './storage'
import type { Op } from './ops'

export class LockedError extends Error {
  constructor() {
    super('locked')
  }
}

export class Keyring {
  private key: CryptoKey | null = null

  constructor(private store: DeviceStorage) {}

  /** Loads a key remembered on this device, if any. */
  async restore(): Promise<boolean> {
    const raw = this.store.get<string>(K.key)
    if (!raw) return false
    try {
      this.key = await crypto.subtle.importKey('raw', fromB64url(raw), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
      return true
    } catch {
      this.store.remove(K.key)
      return false
    }
  }

  get unlocked(): boolean {
    return this.key !== null
  }

  get remembered(): boolean {
    return this.store.get<string>(K.key) !== null
  }

  /**
   * Unlocks with the passphrase or the recovery key; throws WrongSecretError
   * or KeyRecordParamsError. With `remember`, the raw key is kept in this
   * device's storage, as `ot encryption unlock` keeps it in a file.
   */
  async unlock(record: KeyRecord, secret: string, remember: boolean): Promise<void> {
    checkRecordParams(record)
    const recovery = /^[A-Za-z0-9]{4}(-[A-Za-z0-9]{4}){13}$/.test(secret.trim())
    const extractable = await (recovery ? unlockWithRecoveryKey(record, secret, true) : unlockWithPassphrase(record, secret, true))
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', extractable))
    this.key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    if (remember) this.store.set(K.key, b64url(raw))
    else this.store.remove(K.key)
    raw.fill(0)
  }

  lock(): void {
    this.key = null
    this.store.remove(K.key)
  }

  /**
   * Seals the content values of ops in the personal scope; `personal` says
   * whether an op's entity is personal (a task in a shared project is not).
   */
  async seal(ops: Op[], personal: (op: Op) => boolean): Promise<Op[]> {
    const key = this.key
    if (!key) throw new LockedError()
    const out: Op[] = []
    for (const op of ops) out.push(personal(op) ? { ...op, value: await sealValue(key, op.entity as Entity, op.entityId, op.field, op.value) } : op)
    return out
  }

  /** Opens one value read from the server; null when it cannot be decrypted. */
  async open(entity: Entity, id: string, field: string, value: unknown): Promise<unknown> {
    if (!this.key) throw new LockedError()
    try {
      return await openValue(this.key, entity, id, field, value)
    } catch {
      return null
    }
  }
}

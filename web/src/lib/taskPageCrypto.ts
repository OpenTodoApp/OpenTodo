// The share key of an encrypted task page (OpenSpec task-pages, design D3): a random
// 256-bit AES-GCM key per page, never derived from or equal to the account key. The
// publisher's device encrypts the page's snapshot with it, the link carries it after
// `#` (browsers never send the fragment), the guest's browser decrypts the snapshot
// and encrypts replies with it, and the publisher's devices keep it wrapped with the
// account key on the server so each of them can update the page. The value format is
// the app's own (crypto.ts encryptValue), bound to fixed names, so the server can
// never move a reply into the snapshot slot or the other way round.
import { b64url, decryptValue, encryptValue, fromB64url } from './crypto'

const PAGE = 'task_page'

export async function generateShareKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}

/** The text after `#` in a page link. */
export async function shareKeyFragment(key: CryptoKey): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.exportKey('raw', key)))
}

/** The share key from a link's fragment, or null when it is missing or malformed. */
export async function shareKeyFromFragment(fragment: string): Promise<CryptoKey | null> {
  const text = fragment.replace(/^#/, '').trim()
  if (!/^[A-Za-z0-9_-]{43}$/.test(text)) return null
  try {
    const raw = fromB64url(text)
    if (raw.length !== 32) return null
    return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  } catch {
    return null
  }
}

export function encryptSnapshot(key: CryptoKey, snapshot: unknown): Promise<string> {
  return encryptValue(key, PAGE, 'page', 'snapshot', JSON.stringify(snapshot))
}

/** The snapshot, or throws when the key does not open it (a changed fragment). */
export async function decryptSnapshot<T>(key: CryptoKey, ciphertext: string): Promise<T> {
  return JSON.parse(await decryptValue(key, PAGE, 'page', 'snapshot', ciphertext)) as T
}

/** A guest's reply as the page sends it: name and body, encrypted together. */
export interface GuestReply {
  name: string
  body: string
  sentAt: number
}

export function encryptReply(key: CryptoKey, reply: GuestReply): Promise<string> {
  return encryptValue(key, PAGE, 'page', 'reply', JSON.stringify(reply))
}

export async function decryptReply(key: CryptoKey, ciphertext: string): Promise<GuestReply> {
  const r = JSON.parse(await decryptValue(key, PAGE, 'page', 'reply', ciphertext)) as Partial<GuestReply>
  const name = typeof r.name === 'string' ? r.name.trim().slice(0, 40) : ''
  const body = typeof r.body === 'string' ? r.body.trim().slice(0, 4000) : ''
  if (!name || !body) throw new Error('malformed reply')
  return { name, body, sentAt: typeof r.sentAt === 'number' ? r.sentAt : 0 }
}

/** The share key wrapped with the account key, bound to the task. */
export async function wrapShareKey(accountKey: CryptoKey, taskId: string, share: CryptoKey): Promise<string> {
  return encryptValue(accountKey, PAGE, taskId, 'share_key', await shareKeyFragment(share))
}

export async function unwrapShareKey(accountKey: CryptoKey, taskId: string, wrapped: string): Promise<CryptoKey> {
  const key = await shareKeyFromFragment(await decryptValue(accountKey, PAGE, taskId, 'share_key', wrapped))
  if (!key) throw new Error('malformed share key')
  return key
}

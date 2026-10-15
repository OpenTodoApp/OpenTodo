// The hand-over store for files shared to the installed app (OpenSpec change
// attachments, design D9). The service worker receives the share sheet's POST,
// writes the files and text here and redirects to /share?inbox=<id>; the capture
// screen reads the entry and deletes it on Save or Cancel. A separate IndexedDB
// database with the raw API, so the service worker needs no Dexie.

export const INBOX_DB = 'opentodo-share'
const STORE = 'inbox'
/** Entries older than this are swept at startup (an abandoned share). */
export const INBOX_MAX_AGE_MS = 10 * 60 * 1000

export interface SharedFile {
  name: string
  type: string
  blob: Blob
}

export interface InboxEntry {
  id: string
  createdAt: number
  title: string
  text: string
  url: string
  files: SharedFile[]
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(INBOX_DB, 1)
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'id' }) }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open()
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req ? req.result : undefined)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally {
    db.close()
  }
}

export async function putInboxEntry(entry: InboxEntry): Promise<void> {
  await run('readwrite', (s) => s.put(entry))
}

export async function getInboxEntry(id: string): Promise<InboxEntry | undefined> {
  return run<InboxEntry>('readonly', (s) => s.get(id))
}

export async function deleteInboxEntry(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id))
}

/** Remove entries older than ten minutes (called at app start). */
export async function sweepInbox(now = Date.now()): Promise<void> {
  const all = (await run<InboxEntry[]>('readonly', (s) => s.getAll())) ?? []
  const old = all.filter((e) => now - e.createdAt > INBOX_MAX_AGE_MS)
  for (const e of old) await deleteInboxEntry(e.id)
}

/** Remove everything (sign-out). */
export async function clearInbox(): Promise<void> {
  await run('readwrite', (s) => s.clear())
}

/** The entry for a share sheet POST: the files and the text fields. */
export function entryFromForm(form: FormData, id: string, now = Date.now()): InboxEntry {
  const text = (k: string) => {
    const v = form.get(k)
    return typeof v === 'string' ? v : ''
  }
  const files = form.getAll('files').filter((f): f is File => typeof f !== 'string')
  return { id, createdAt: now, title: text('title'), text: text('text'), url: text('url'), files: files.map((f) => ({ name: f.name, type: f.type, blob: f })) }
}

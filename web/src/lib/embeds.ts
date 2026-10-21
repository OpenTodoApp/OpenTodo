// Images embedded in notes and comments (OpenSpec change editor-everywhere,
// design D5). An embed names an attachment; it carries no bytes. Here the id
// becomes something to show: the bytes this device holds, the app's own
// authenticated content route, or a placeholder. An encrypted attachment is
// decrypted on the device. Nothing is ever loaded from another address.
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { contentUrl, isImage } from './attachments'
import { decryptFile } from './crypto'
import { db } from './db'
import { currentKey, onEncryptionChange } from './e2ee'
import { fetchWithTimeout, transferTimeoutMs } from './http'

export type EmbedState =
  | { kind: 'loading' }
  | { kind: 'ready'; src: string; name: string }
  | { kind: 'uploading' | 'waiting'; name: string }
  /** An encrypted attachment on a device that has no key. */
  | { kind: 'locked'; name: string }
  /** Removed, not an image, a link, unknown, or an attachment of another task. */
  | { kind: 'removed' }

/** The attachment row an embed may show: an image file of the same task that is not deleted. */
async function embeddable(id: string, taskId: string | null | undefined) {
  const a = await db.attachments.get(id)
  if (!a || a.deleted_at || a.url || !isImage(a.mime) || !taskId || a.task_id !== taskId) return null
  return a
}

/** What an embed of attachment `id` in task `taskId` shows on this device, kept current. */
export function useEmbeddedImage(id: string, taskId: string | null | undefined): EmbedState {
  const row = useLiveQuery(async () => {
    const a = await embeddable(id, taskId)
    return { a, blob: a ? await db.attachmentBlobs.get(id) : undefined }
  }, [id, taskId])
  const [keyEpoch, setKeyEpoch] = useState(0)
  useEffect(() => onEncryptionChange(() => setKeyEpoch((n) => n + 1)), [])
  const [decrypted, setDecrypted] = useState<{ key: string; state: EmbedState } | null>(null)
  const a = row?.a
  const blob = row?.blob?.blob
  // Plain bytes still on this device show at once (also offline, also while uploading).
  const local = useObjectUrl(a && !a.encrypted ? blob : undefined)
  const wanted = a?.encrypted && (blob || a.uploaded_at) ? `${a.id}:${keyEpoch}:${blob ? 'local' : 'remote'}` : null
  const name = a?.name ?? ''
  const mime = a?.mime ?? ''
  useEffect(() => {
    if (!wanted) return
    let url: string | null = null
    let live = true
    void (async () => {
      const key = await currentKey()
      if (!key) {
        if (live) setDecrypted({ key: wanted, state: { kind: 'locked', name } })
        return
      }
      try {
        let envelope = blob
        if (!envelope) {
          const res = await fetchWithTimeout(contentUrl(id), { credentials: 'same-origin', timeoutMs: transferTimeoutMs() })
          if (!res.ok) throw new Error(String(res.status))
          envelope = await res.blob()
        }
        const plain = await decryptFile(key, id, envelope, mime)
        if (!live) return
        url = URL.createObjectURL(plain)
        setDecrypted({ key: wanted, state: { kind: 'ready', src: url, name } })
      } catch {
        if (live) setDecrypted({ key: wanted, state: { kind: 'waiting', name } })
      }
    })()
    return () => {
      live = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [wanted, id, name, mime, blob])
  if (row === undefined) return { kind: 'loading' }
  if (!a) return { kind: 'removed' }
  if (a.encrypted) {
    if (!wanted) return { kind: 'uploading', name: a.name }
    return decrypted?.key === wanted ? decrypted.state : { kind: 'loading' }
  }
  if (local) return { kind: 'ready', src: local, name: a.name }
  if (a.uploaded_at) return { kind: 'ready', src: contentUrl(a.id), name: a.name }
  return { kind: row.blob?.reason ? 'waiting' : 'uploading', name: a.name }
}

/** An object URL for a local blob, revoked when it changes or the caller goes. */
function useObjectUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob || typeof URL.createObjectURL !== 'function') {
      setUrl(null)
      return
    }
    const u = URL.createObjectURL(blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [blob])
  return url
}

/** The attachment ids a Markdown text embeds (`![…](attachment:<id>)` lines). */
export function embeddedIds(markdown: string): string[] {
  const out = new Set<string>()
  for (const m of markdown.matchAll(/!\[(?:\\.|[^\]\\])*\]\(attachment:([A-Za-z0-9_-]+)\)/g)) out.add(m[1])
  return [...out]
}

// Opening an attachment (OpenSpec `attachments`, design D6, D7): in a new tab, or
// as a download for a type the browser should not render. Web only: it opens
// pages and object URLs, so the native app, which shares lib/attachments.ts
// (native-app-foundation D2), does not import it.
import { AttachmentError, contentUrl, isInlineType, linkHref } from './attachments'
import { decryptFile } from './crypto'
import { db } from './db'
import { currentKey } from './e2ee'
import { fetchWithTimeout, transferTimeoutMs } from './http'
import { t } from './i18n'
import type { Attachment } from './types'

/**
 * Open an attachment in a new tab: a link opens its address; a file this
 * device still holds opens from here (also offline); an uploaded file opens
 * from the server, which serves risky types as downloads.
 */
export async function openAttachment(a: Attachment, opts: { download?: boolean } = {}): Promise<void> {
  if (a.url) {
    const href = linkHref(a.url)
    if (href) window.open(href, '_blank', 'noopener,noreferrer')
    return
  }
  const local = await db.attachmentBlobs.get(a.id)
  if (a.encrypted) {
    // The server holds an envelope only: fetch it (or use the local copy) and decrypt here.
    const key = await currentKey()
    if (!key) throw new AttachmentError('locked', t('Unlock encryption on this device to open this file.'))
    let envelope = local?.blob
    if (!envelope) {
      const res = await fetchWithTimeout(contentUrl(a.id), { credentials: 'same-origin', timeoutMs: transferTimeoutMs() })
      if (!res.ok) throw new AttachmentError('invalid', res.status === 404 ? t('This file is missing on the server.') : t('The server answered {status}.', { status: res.status }))
      envelope = await res.blob()
    }
    openBlob(await decryptFile(key, a.id, envelope, a.mime), a, opts.download)
    return
  }
  if (local) {
    openBlob(new Blob([local.blob], { type: a.mime }), a, opts.download)
    return
  }
  window.open(contentUrl(a.id, opts.download), '_blank', 'noopener')
}

/** Open bytes held on this device; types the browser should not render are downloaded. */
function openBlob(blob: Blob, a: Attachment, download?: boolean) {
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.target = '_blank'
  link.rel = 'noopener'
  if (download || !isInlineType(a.mime)) link.download = a.name
  link.click()
  setTimeout(() => URL.revokeObjectURL(href), 60_000)
}

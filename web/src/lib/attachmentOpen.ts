// Opening an attachment (OpenSpec `attachments`, design D6, D7): in a new tab, or
// as a download for a type the browser should not render. In a phone shell, which has
// no tabs, every file is saved through the shell's save dialog (#1654). Kept out of
// lib/attachments.ts, which the sync path imports: it opens pages and object URLs.
import { AttachmentError, contentUrl, fileKeyOf, isInlineType, linkHref } from './attachments'
import { decryptFile } from './crypto'
import { db } from './db'
import { currentKey } from './e2ee'
import { fetchWithTimeout, transferTimeoutMs } from './http'
import { t } from './i18n'
import { shell } from './shell'
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
  // Safari and the Home Screen app allow a new window or a download only inside the
  // click: past an await it is blocked without a word. A download, or a type the
  // browser does not show, of a file the server holds is the server's copy, saved by
  // an anchor clicked now (the device's copy is the same bytes; offline it is used).
  if (!a.encrypted && a.uploaded_at && !shell() && (opts.download || !isInlineType(a.mime)) && navigator.onLine !== false) {
    const link = document.createElement('a')
    link.href = contentUrl(a.id, true)
    link.download = a.name
    link.click()
    return
  }
  // A file that opens in a tab gets its tab now, and the tab is sent to the file
  // once its bytes or address are known.
  const tab = !opts.download && !shell() && isInlineType(a.mime) ? window.open('about:blank', '_blank') : null
  if (tab) tab.opener = null
  try {
    await openFile(a, opts, tab)
  } catch (err) {
    tab?.close()
    throw err
  }
}

async function openFile(a: Attachment, opts: { download?: boolean }, tab: Window | null): Promise<void> {
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
    openBlob(await decryptFile(key, fileKeyOf(a), envelope, a.mime), a, opts.download, tab)
    return
  }
  if (local) {
    openBlob(new Blob([local.blob], { type: a.mime }), a, opts.download, tab)
    return
  }
  if (shell()) {
    // A phone shell has no tabs (#1654): a new window is blocked or reaches the system
    // browser without the session, so the file is saved through the shell instead.
    const { saveFromServer } = await import('./saveFile')
    saveFromServer(contentUrl(a.id, true), a.name)
    return
  }
  if (tab) tab.location.href = contentUrl(a.id, opts.download)
  else window.open(contentUrl(a.id, opts.download), '_blank', 'noopener')
}

/** Open bytes held on this device; types the browser should not render are downloaded. */
function openBlob(blob: Blob, a: Attachment, download: boolean | undefined, tab: Window | null) {
  if (download || !isInlineType(a.mime) || shell()) {
    void import('./saveFile').then((m) => m.saveFile(blob, a.name))
    return
  }
  const href = URL.createObjectURL(blob)
  setTimeout(() => URL.revokeObjectURL(href), 60_000)
  if (tab) {
    tab.location.href = href
    return
  }
  const link = document.createElement('a')
  link.href = href
  link.target = '_blank'
  link.rel = 'noopener'
  link.click()
}

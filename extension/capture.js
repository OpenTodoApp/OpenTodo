// What a click captures (OpenSpec change extension-v2, share-capture "Context menu
// on links, images and selections"): pure helpers shared by the background script
// and the popup, tested with `node --test extension/capture.test.js`.
import { MAX_TEXT, MAX_TITLE, isWebUrl } from './share-url.js'

/** The storage.session key of the capture a context-menu click hands to the popup. */
export const PENDING_KEY = 'pendingCapture'

/** The file name of an image address ("boiler-manual.png"), else the address. */
export function fileNameOf(src) {
  try {
    const u = new URL(src)
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() ?? '')
    return last || u.hostname
  } catch {
    return String(src ?? '')
  }
}

/**
 * The capture for a context-menu click: `info` is the browser's OnClickData, `tab`
 * the tab it happened in. Nothing is fetched: an image is referred to by its address.
 * Returns {title, text, url, imageUrl}: the popup's line, its description, the
 * origin address and, for an image, the image's address.
 */
export function captureFromMenu(info, tab) {
  const tabTitle = String(tab?.title ?? '')
  const tabUrl = isWebUrl(tab?.url) ? tab.url : ''
  // An inline (data:) image has no address worth keeping: the page is captured instead.
  if (info?.mediaType === 'image' && isWebUrl(info.srcUrl)) {
    return clip({ title: fileNameOf(info.srcUrl), text: '', url: tabUrl, imageUrl: info.srcUrl })
  }
  if (info?.linkUrl) {
    // Firefox reports the link's text; Chromium does not, and a selected link's
    // text arrives as the selection.
    const text = String(info.linkText ?? info.selectionText ?? '').trim()
    return clip({ title: text || info.linkUrl, text: '', url: isWebUrl(info.linkUrl) ? info.linkUrl : tabUrl, imageUrl: '' })
  }
  return clip({ title: tabTitle, text: String(info?.selectionText ?? ''), url: tabUrl, imageUrl: '' })
}

/** The capture for the toolbar button or the shortcut: the tab and its selection. */
export function captureFromTab(tab, selection = '') {
  return clip({ title: String(tab?.title ?? ''), text: selection, url: isWebUrl(tab?.url) ? tab.url : '', imageUrl: '' })
}

function clip(c) {
  return { ...c, title: c.title.slice(0, MAX_TITLE), text: c.text.slice(0, MAX_TEXT) }
}

/**
 * The task's description: an image's address first, then the selection (or the
 * mail's From line), then a blank line and the page address when it is kept as
 * the origin (share-capture "Quick save").
 */
export function descriptionOf({ imageUrl = '', text = '', url = '', keepUrl = true } = {}) {
  const parts = []
  if (imageUrl) parts.push(imageUrl)
  if (text.trim()) parts.push(text.trim())
  const body = parts.join('\n\n')
  if (!keepUrl || !url) return body
  return body ? `${body}\n\n${url}` : url
}

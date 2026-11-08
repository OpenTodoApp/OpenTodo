// The page brands itself (OpenSpec change signed-web-app, design D7): loaded
// lazily from main.tsx, so the first load doesn't carry it.
import { getBranding, logoUrl, subscribeBranding, type Branding } from './branding'

const DEFAULT_ICON = { href: '/favicon.svg', type: 'image/svg+xml' }
const DEFAULT_TOUCH_ICON = '/apple-touch-icon.png'

function setAttr(el: Element | null, name: string, value: string): void {
  if (el && el.getAttribute(name) !== value) el.setAttribute(name, value)
}

/**
 * Brands the page itself (OpenSpec change signed-web-app, design D7): the
 * service worker serves the signed index.html byte for byte, so the favicon,
 * the touch icon and the description come from the branding this device keeps,
 * not from a page the server rewrote. The tab title follows pageTitle(). Pages
 * the server serves directly (a first visit) are still rewritten by the server.
 */
export function applyBrandingToPage(b: Branding = getBranding(), doc: Document = document): void {
  const icon = doc.querySelector('link[rel="icon"]')
  setAttr(icon, 'href', logoUrl(32, b) ?? DEFAULT_ICON.href)
  setAttr(icon, 'type', b.logoVersion > 0 ? 'image/png' : DEFAULT_ICON.type)
  setAttr(doc.querySelector('link[rel="apple-touch-icon"]'), 'href', logoUrl(180, b) ?? DEFAULT_TOUCH_ICON)
  const desc = doc.querySelector('meta[name="description"]')
  if (desc && !desc.hasAttribute('data-default')) desc.setAttribute('data-default', desc.getAttribute('content') ?? '')
  setAttr(desc, 'content', b.name || desc?.getAttribute('data-default') || '')
  if (b.name && (!doc.title || doc.title === 'OpenTodo')) doc.title = b.name
}

/** Brands the page now and whenever the branding changes. */
export function watchPageBranding(doc: Document = document): () => void {
  applyBrandingToPage(getBranding(), doc)
  return subscribeBranding(() => applyBrandingToPage(getBranding(), doc))
}

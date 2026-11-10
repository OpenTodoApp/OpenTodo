// Opening a task's origin (OpenSpec change task-origin, obsidian-origin D4): the
// address the device may open and the opening itself, through a native shell
// when there is one. Web only: it opens tabs and asks the shell, so the native
// app, which shares lib/taskOrigin.ts (native-app-foundation D2), does not import it.
import { has, openObsidian, shell } from './shell'
import { httpURL, obsidianURL } from './taskOrigin'
import type { Origin } from './types'

/**
 * The address the device may open for an origin, as it reads it after any
 * decryption ("Origin links open only http(s)"): an http(s) URL of any kind but
 * `obsidian`, or the valid note link of an `obsidian` origin. In a native shell a
 * note link opens only when the shell lists `obsidian-links`. Null otherwise: the
 * chip then has no link, and its menu offers Copy link when there is a URL.
 */
export function originLink(origin: Origin): { href: string; obsidian: boolean } | null {
  if (!origin.url) return null
  if (origin.kind === 'obsidian') {
    if (!obsidianURL(origin.url, origin.id)) return null
    return !shell() || has('obsidian-links') ? { href: origin.url, obsidian: true } : null
  }
  return httpURL(origin.url) ? { href: origin.url, obsidian: false } : null
}

/**
 * Open the origin: an http(s) URL in a new tab without passing the opener or the
 * referrer; an Obsidian note through the system (design D4), in a browser by an
 * ordinary link activation (the browser asks before opening the app and leaves
 * no tab behind), in a shell through its external-link method. Opens nothing
 * when `originLink` gives no link.
 */
export function openOrigin(origin: Origin): void {
  const link = originLink(origin)
  if (!link) return
  if (!link.obsidian) {
    window.open(link.href, '_blank', 'noopener,noreferrer')
  } else if (shell()) {
    openObsidian(link.href)
  } else {
    const a = document.createElement('a')
    a.href = link.href
    a.rel = 'noreferrer'
    a.click()
  }
}

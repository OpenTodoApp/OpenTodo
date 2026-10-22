// Page changes for assistive technology (OpenSpec assistive-tech-semantics,
// accessibility "Page changes are announced"): the tab title names the page
// ("Today – OpenTodo"), and a navigation the person started moves focus to the
// page's heading, so a screen reader reads where they are. Focus is left alone on
// the first load, while a dialog, an overlay or the task panel holds it, while a
// text field has it, and when the new page already focused something itself (the
// Settings row a link asked for, the list's cursor row).
import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react'
import { isTypingTarget } from './shortcuts'
import { t } from '../lib/i18n'
import { getBranding } from '../lib/branding'

/** Elements that own focus over the page: dialogs, overlays (menus, sheets) and the task panel. */
const OWNERS = '[role="dialog"], [role="alertdialog"], [data-overlay], [data-overlay-root], [data-detail-for]'

/** The tab title for a page heading. */
export function pageTitle(heading: string | null | undefined): string {
  const page = heading?.replace(/\s+/g, ' ').trim()
  // A branded instance (instance-branding) names itself in the tab.
  const app = getBranding().name
  if (app) return page ? `${page} – ${app}` : app
  return page ? t('{page} – OpenTodo', { page }) : 'OpenTodo'
}

/** The page's level-one heading: the header's title, or the phone bar's below 768 px. */
export function pageHeading(frame: ParentNode | null): HTMLElement | null {
  if (!frame) return null
  return frame.querySelector<HTMLElement>('h1[data-page-title]') ?? frame.querySelector<HTMLElement>('h1[data-phone-title]') ?? frame.querySelector<HTMLElement>('h1')
}

/** The heading's text; a rename field in the heading gives its value. */
function headingText(h: HTMLElement | null): string {
  if (!h) return ''
  return h.textContent?.trim() || h.querySelector('input')?.value || ''
}

/** Moves focus to an element that is not focusable by itself, without scrolling. */
export function focusHeading(el: HTMLElement): void {
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
}

/**
 * Whether the person has used the page yet (the User Activation API; true where it is
 * missing): the first load and its start-view redirect keep focus where the browser put it.
 */
function usedPage(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  return ua ? ua.hasBeenActive : true
}

/** How long a navigation waits for its page's heading (a lazy chunk, a live query). */
const WAIT_MS = 3000

/**
 * Keeps document.title on the page heading inside `frame` and, after a navigation
 * the person started, moves focus to that heading once it is there. `content` is
 * the page's own area: focus the page moved there itself is kept.
 */
export function usePageFocus(routeKey: unknown, frame: RefObject<HTMLElement | null>, content: RefObject<HTMLElement | null>): void {
  // The tab title follows the heading, also when its text arrives later (a project's name from the database).
  useEffect(() => {
    const root = frame.current
    if (!root) return
    let raf = 0
    const update = () => {
      raf = 0
      const next = pageTitle(headingText(pageHeading(root)))
      if (document.title !== next) document.title = next
    }
    update()
    const obs = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(update) })
    obs.observe(root, { childList: true, subtree: true, characterData: true })
    return () => {
      obs.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [frame])

  // Before the new page's effects run: where focus was when the route changed.
  const before = useRef<Element | null>(null)
  const first = useRef(true)
  useLayoutEffect(() => {
    before.current = document.activeElement
  }, [routeKey])

  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (!usedPage()) return
    const root = frame.current
    if (!root) return
    const was = before.current
    let done = false
    const tryFocus = (): boolean => {
      const h = pageHeading(root)
      if (!h) return false
      done = true
      const active = document.activeElement as HTMLElement | null
      if (active && active !== document.body) {
        if (active.closest(OWNERS) || isTypingTarget(active)) return true
        // The page moved focus into itself (a requested row, the list cursor): keep it.
        if (active !== was && content.current?.contains(active)) return true
      }
      focusHeading(h)
      return true
    }
    // One frame first: a palette or menu that started the navigation closes and returns focus.
    let obs: MutationObserver | null = null
    const raf = requestAnimationFrame(() => {
      if (tryFocus()) return
      obs = new MutationObserver(() => { if (!done && tryFocus()) obs?.disconnect() })
      obs.observe(root, { childList: true, subtree: true })
    })
    const stop = setTimeout(() => obs?.disconnect(), WAIT_MS)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(stop)
      obs?.disconnect()
    }
  }, [routeKey, frame, content])
}

/**
 * "Skip to content": the first stop of the Tab order, shown when focused; it moves
 * focus to the page heading (or the content area when the page has none).
 */
export function SkipLink({ frame, content }: { frame: RefObject<HTMLElement | null>; content: RefObject<HTMLElement | null> }) {
  return (
    <a href="#content" data-skip-link
      onClick={(e) => {
        e.preventDefault()
        const target = pageHeading(content.current) ?? pageHeading(frame.current) ?? content.current
        if (target) focusHeading(target)
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:text-body focus:text-strong focus:shadow-2 focus:outline-2 focus:outline-focus">
      {t('Skip to content')}
    </a>
  )
}

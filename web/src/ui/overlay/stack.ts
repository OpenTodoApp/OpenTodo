// Shared overlay plumbing (OpenSpec change `mobile-layout`, design D1): a stack so
// only the topmost overlay answers Escape, a reference-counted scroll lock for the
// page behind, and focus capture / restore. Kept free of React so it is unit-tested
// with plain objects.
import { useSyncExternalStore } from 'react'

interface Entry { id: number; onEscape: () => void }
const stack: Entry[] = []
let nextId = 1
let listening = false
// Who wants to know when a sheet opens or closes (the phone tab bar hides meanwhile).
const depthListeners = new Set<() => void>()
const notifyDepth = () => depthListeners.forEach((fn) => fn())

function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.isComposing) return
  const top = stack[stack.length - 1]
  if (!top) return
  // Capture phase on window: the topmost overlay wins over every other Escape
  // handler (detail panel, list selection) and nothing behind it reacts.
  e.preventDefault()
  e.stopPropagation()
  top.onEscape()
}

/** Registers an open overlay; returns its id and the function that removes it. */
export function pushOverlay(onEscape: () => void, target: Pick<Window, 'addEventListener'> | null = typeof window === 'undefined' ? null : window): { id: number; pop: () => void } {
  const entry = { id: nextId++, onEscape }
  stack.push(entry)
  notifyDepth()
  if (!listening && target) {
    target.addEventListener('keydown', onKey as EventListener, true)
    listening = true
  }
  return {
    id: entry.id,
    pop: () => {
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      notifyDepth()
    },
  }
}

/** Topmost overlay's Escape handler, for tests and for a manual dispatch. */
export function escapeTop(): boolean {
  const top = stack[stack.length - 1]
  if (!top) return false
  top.onEscape()
  return true
}

export function overlayDepth(): number {
  return stack.length
}

/** How many overlays are open, live (app-shell "Phone navigation": the tab bar and the add button hide while a sheet is open). */
export function useOverlayDepth(): number {
  return useSyncExternalStore((fn) => { depthListeners.add(fn); return () => { depthListeners.delete(fn) } }, overlayDepth, () => 0)
}

// ------------------------------------------------------------------ scroll lock

interface Lockable { style: { overflow: string } }
const locks = new Map<Lockable, { count: number; previous: string }>()

/** Keeps `el` (default: body) from scrolling until every lock is released. */
export function lockScroll(el: Lockable | null = typeof document === 'undefined' ? null : document.body): () => void {
  if (!el) return () => {}
  const cur = locks.get(el)
  if (cur) cur.count++
  else {
    locks.set(el, { count: 1, previous: el.style.overflow })
    el.style.overflow = 'hidden'
  }
  let released = false
  return () => {
    if (released) return
    released = true
    const l = locks.get(el)
    if (!l) return
    if (--l.count === 0) {
      el.style.overflow = l.previous
      locks.delete(el)
    }
  }
}

// ------------------------------------------------------------------ focus

interface Focusable { focus(opts?: FocusOptions): void; isConnected?: boolean }

/**
 * Remembers where focus should go back to when an overlay closes: the trigger when
 * one is given (Safari does not focus a clicked button), else the element focused
 * at open time. Focus is only moved back when nothing else took it meanwhile (the
 * overlay's own content was removed, so focus fell back to the body): a menu action
 * that opens an inline editor keeps the editor focused.
 */
export function captureFocus(
  trigger?: Focusable | null,
  doc: { activeElement: unknown; body?: unknown } | null = typeof document === 'undefined' ? null : document,
  inside?: (el: unknown) => boolean,
): () => void {
  const active = doc?.activeElement as Focusable | null
  // The overlay's own autofocused field is not where focus goes back to.
  const usable = active && active !== doc?.body && !(inside && inside(active))
  const back = trigger ?? (usable ? active : lastPressed) ?? null
  return () => {
    const now = doc?.activeElement
    const free = !now || now === doc?.body || (inside ? inside(now) : false)
    if (!free) return
    if (back && back.isConnected !== false && typeof back.focus === 'function') back.focus({ preventScroll: true })
  }
}

// Safari (and touch taps) do not focus a pressed button, so the element that opened
// a dialog is remembered from the last press.
let lastPressed: Focusable | null = null
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => {
    const el = (e.target as Element | null)?.closest?.('button, a[href], [role="button"], [tabindex]:not([tabindex="-1"])')
    lastPressed = el && !el.closest('[data-overlay-root]') ? (el as unknown as Focusable) : lastPressed
  }, true)
  // A dialog opened from the keyboard returns to the focused element, never to an old press.
  document.addEventListener('keydown', () => { lastPressed = null }, true)
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

/** Moves focus into `panel`: an [autofocus] element, else the first focusable, else the panel. */
export function focusInto(panel: HTMLElement) {
  if (panel.contains(document.activeElement)) return
  const auto = panel.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
  const first = auto ?? [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].find((el) => !el.hasAttribute('data-overlay-close'))
  ;(first ?? panel).focus({ preventScroll: true })
}

/** Keeps Tab and Shift+Tab inside `panel`. */
export function trapTab(e: KeyboardEvent | React.KeyboardEvent, panel: HTMLElement) {
  if (e.key !== 'Tab') return
  const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement)
  if (items.length === 0) { e.preventDefault(); return }
  const first = items[0], last = items[items.length - 1]
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}

// ------------------------------------------------------------------ viewport

const WIDE = '(min-width: 640px)'
const FINE = '(pointer: fine)'
const subscribers = new Map<string, (cb: () => void) => () => void>()
function mediaSubscriber(query: string) {
  let fn = subscribers.get(query)
  if (!fn) {
    fn = (cb: () => void) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    }
    subscribers.set(query, fn)
  }
  return fn
}

/** False below 640 px, where popovers open as bottom sheets and dialogs full screen. */
export function useWide(): boolean {
  return useSyncExternalStore(mediaSubscriber(WIDE), () => window.matchMedia(WIDE).matches, () => true)
}

/** True with a mouse or trackpad (first-run "Empty states name the action first"): key hints are printed only then. */
export function useFinePointer(): boolean {
  return useSyncExternalStore(mediaSubscriber(FINE), () => window.matchMedia(FINE).matches, () => false)
}

/**
 * The on-screen keyboard (design D2): publishes how much of the layout viewport it
 * covers as `--vv-bottom`, so bottom sheets sit above it, and scrolls the focused
 * field back into view when the keyboard opens. Installed once at startup.
 */
export function watchVisualViewport(): () => void {
  const vv = typeof window === 'undefined' ? undefined : window.visualViewport
  if (!vv) return () => {}
  const update = () => {
    const covered = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop))
    document.documentElement.style.setProperty('--vv-bottom', `${Math.round(covered)}px`)
    const el = document.activeElement as HTMLElement | null
    if (el && el.matches?.('input, textarea, select, [contenteditable="true"]')) {
      const r = el.getBoundingClientRect()
      if (r.bottom > vv.offsetTop + vv.height || r.top < vv.offsetTop) el.scrollIntoView({ block: 'nearest' })
    }
  }
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
  return () => {
    vv.removeEventListener('resize', update)
    vv.removeEventListener('scroll', update)
  }
}

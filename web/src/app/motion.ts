// Motion helpers (OpenSpec changes ux-overhaul and motion-v2; task-list-presentation
// "Completion feedback", "List reflow", "Drag feedback"; design-system "Reduced
// motion"; appearance-preferences "Haptic feedback preference"): the motion tokens,
// the reduced-motion and no-motion guards, the departing rows of the completion
// sequence, the bounded list transition and the haptic tick.
import { flushSync } from 'react-dom'
import { useSyncExternalStore } from 'react'
import { readHapticsPref, watchHapticsPref } from '../lib/haptics'
import { resettable } from '../lib/moduleState'

/** A duration token in milliseconds, or the fallback when the stylesheet has none (tests). */
function tokenMs(name: string, fallback: number): number {
  if (typeof document === 'undefined') return fallback
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  if (!raw) return fallback
  const n = parseFloat(raw)
  if (!Number.isFinite(n)) return fallback
  return raw.endsWith('ms') ? n : raw.endsWith('s') ? n * 1000 : n
}

/** The emphasis duration (`--duration-emphasis`), 250 ms unless the stylesheet says otherwise. */
export function emphasisMs(): number {
  return tokenMs('--duration-emphasis', 250)
}

/** The moment (`--duration-moment`), 400 ms: the completion sequence, list reflow and overlay entrances. */
export function momentMs(): number {
  return tokenMs('--duration-moment', 400)
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** The no-motion attribute (Display mode, e-ink): every change is instant. */
export function noMotion(): boolean {
  return typeof document !== 'undefined' && document.documentElement.dataset.motion === 'none'
}

// ---- departing rows (motion-v2 D2, D3) ----

/** `leave`: completed, playing its sequence; `restored`: brought back by Undo, fading in. */
export type Departure = 'leave' | 'restored'

const RESTORE_MS = 120
let departures: ReadonlyMap<string, Departure> = new Map()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const listeners = new Set<() => void>()

function setDeparture(id: string, kind: Departure | null, ms = 0): void {
  clearTimeout(timers.get(id))
  timers.delete(id)
  const next = new Map(departures)
  if (kind) next.set(id, kind)
  else next.delete(id)
  departures = next
  if (kind) timers.set(id, setTimeout(() => setDeparture(id, null), ms))
  for (const l of listeners) l()
}

/**
 * Records a local completion just before its op is written: the list keeps the row on
 * screen as a departing row for the moment (120 ms under reduced motion, not at all
 * under no motion). The write never waits for it.
 */
export function markCompleted(id: string): void {
  if (noMotion()) return
  setDeparture(id, 'leave', prefersReducedMotion() ? RESTORE_MS : momentMs())
}

/** Undo during the sequence: the departure ends and the real row fades back in. */
export function cancelDeparture(id: string): void {
  if (departures.get(id) !== 'leave') return
  if (noMotion()) setDeparture(id, null)
  else setDeparture(id, 'restored', RESTORE_MS)
}

/** Ends every running departure (Undo restores the last action, whichever rows it touched). */
export function cancelDepartures(): void {
  for (const id of [...departures.keys()]) cancelDeparture(id)
}

export function departures$(): ReadonlyMap<string, Departure> {
  return departures
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

/** The running departures, live. */
export function useDepartures(): ReadonlyMap<string, Departure> {
  return useSyncExternalStore(subscribe, departures$, departures$)
}

/** Tests: forget every departure at once. */
export function resetDepartures(): void {
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
  departures = new Map()
  for (const l of listeners) l()
}
resettable('departures', resetDepartures)

/**
 * Ghost rows and cards (motion-v2 D2): the last row model of a task that left the list
 * while departing. The list renders them with `data-departing`; counts, the keyboard
 * cursor and drop targets come from the list's data, which never holds them.
 */
const ghosts = new WeakSet<object>()
export const markGhost = <T extends object>(o: T): T => { ghosts.add(o); return o }
export const isGhost = (o: object): boolean => ghosts.has(o)

/**
 * Keeps departing rows on screen: for every list (a group's rows, a column's cards),
 * a row that was shown in the last render and is now gone while its task departs is
 * shown once more at its old place, as a ghost copy, until the departure ends.
 */
export function withGhosts<T extends object>(
  lists: { key: string; items: T[] }[],
  idOf: (item: T) => string,
  ghostOf: (item: T) => T,
  live: ReadonlyMap<string, Departure>,
  memory: Map<string, { list: string; after: string | null; ghost: T }>,
): Map<string, T[]> {
  const present = new Set<string>()
  for (const l of lists) for (const it of l.items) present.add(idOf(it))
  // Forget departures that ended, or whose task came back (Undo).
  for (const id of [...memory.keys()]) if (live.get(id) !== 'leave' || present.has(id)) memory.delete(id)
  const out = new Map<string, T[]>()
  for (const l of lists) {
    const items = [...l.items]
    for (const [id, g] of memory) {
      if (g.list !== l.key || present.has(id)) continue
      const after = g.after === null ? 0 : items.findIndex((x) => idOf(x) === g.after) + 1
      items.splice(g.after !== null && after === 0 ? items.length : after, 0, g.ghost)
    }
    out.set(l.key, items)
  }
  // Remember where every departing row still sits, for the render in which it leaves.
  for (const l of lists) {
    l.items.forEach((it, i) => {
      const id = idOf(it)
      if (live.get(id) === 'leave') memory.set(id, { list: l.key, after: i > 0 ? idOf(l.items[i - 1]) : null, ghost: markGhost(ghostOf(it)) })
    })
  }
  return out
}

// ---- list reflow (motion-v2 D4) ----

/** The most rows a list transition names; a change touching more applies at once. */
export const REFLOW_CAP = 40

interface ViewTransitionLike { finished: Promise<void>; skipTransition(): void }
type StartViewTransition = (update: () => Promise<void> | void) => ViewTransitionLike
let running: ViewTransitionLike | null = null
const commitWaiters = new Set<() => void>()
let listsMounted = 0
/** How long a transition waits for the list to show a write before it takes the new picture. */
const COMMIT_WAIT_MS = 150

/** The list calls this after each commit, so a transition can wait for the new rows. */
export function listCommitted(): void {
  for (const w of [...commitWaiters]) w()
}

/** A list registers while mounted: without one on screen nothing is worth a transition. */
export function registerList(): () => void {
  listsMounted++
  return () => { listsMounted-- }
}

function nextCommit(timeout: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { commitWaiters.delete(done); clearTimeout(timer); resolve() }
    const timer = setTimeout(done, timeout)
    commitWaiters.add(done)
  })
}

function textFieldFocused(): boolean {
  const el = typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type))
}

/** Whether a local list change of `affected` rows may animate (design D4's gates). */
export function canReflow(affected: number): boolean {
  if (typeof document === 'undefined') return false
  const start = (document as unknown as { startViewTransition?: StartViewTransition }).startViewTransition
  return typeof start === 'function' && listsMounted > 0 && !prefersReducedMotion() && !noMotion() && affected > 0 && affected <= REFLOW_CAP
    && !textFieldFocused() && document.visibilityState !== 'hidden'
}

/** Names the rows on screen (at most the cap) so the browser moves them; returns the cleanup. */
function nameRows(): () => void {
  const named: HTMLElement[] = []
  const seen = new Set<string>()
  const h = typeof window === 'undefined' ? 0 : window.innerHeight
  for (const el of document.querySelectorAll<HTMLElement>('[data-task-id]')) {
    if (named.length >= REFLOW_CAP) break
    const id = el.dataset.taskId!
    if (seen.has(id)) continue
    const r = el.getBoundingClientRect()
    if (h && (r.bottom < 0 || r.top > h)) continue
    seen.add(id)
    el.style.setProperty('view-transition-name', `task-${CSS.escape(id)}`)
    named.push(el)
  }
  return () => { for (const el of named) el.style.removeProperty('view-transition-name') }
}

/**
 * Runs a local list change (reschedule, drag, bulk action, Undo, a sidebar drop) so the
 * rows that stay slide to their new places: inside a view transition when every gate
 * holds, directly otherwise. The write is never delayed: `update` starts at once and
 * the new snapshot is taken after the list's next commit. Sync batches never call this.
 */
export async function withListTransition<T>(affected: number, update: () => Promise<T>): Promise<T> {
  if (!canReflow(affected)) return update()
  running?.skipTransition()
  const start = (document as unknown as { startViewTransition: StartViewTransition }).startViewTransition.bind(document)
  let clearOld = nameRows()
  let result!: T
  let failure: unknown
  const vt = start(async () => {
    clearOld()
    try {
      result = await update()
      // The list shows a write on its next commit (a live query); never wait longer than this.
      await nextCommit(COMMIT_WAIT_MS)
    } catch (err) { failure = err }
    flushSync(() => {})
    clearOld = nameRows()
  })
  running = vt
  vt.finished.finally(() => { clearOld(); if (running === vt) running = null }).catch(() => {})
  await vt.finished.catch(() => {})
  if (failure) throw failure
  return result
}

// ---- haptics (motion-v2 D6) ----

let hapticsOn: boolean | null = null
let watching = false

function watchHaptics(): void {
  if (watching) return
  watching = true
  watchHapticsPref((on) => { hapticsOn = on })
}

/** Whether this device can vibrate at all (the Appearance switch shows only then). */
export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function'
}

/** A short tick (10 ms) when a task completes or a long press lifts one, unless haptics are off. */
export function tick(): void {
  if (!canVibrate()) return
  watchHaptics()
  if (hapticsOn === null) {
    void readHapticsPref().then((on) => { hapticsOn = on; if (on) navigator.vibrate(10) }, () => {})
    return
  }
  if (hapticsOn) navigator.vibrate(10)
}

/** Tests: forget the cached preference. */
export function resetHaptics(): void {
  hapticsOn = null
}
resettable('haptics', resetHaptics)

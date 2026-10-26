// The shortcut dispatcher (OpenSpec change ux-overhaul, keyboard-shortcuts "One
// shortcut registry with scopes", design D5): the only `keydown` listener on the
// window. Views, the panel, the board, the calendar and the Vim layer register a
// scope frame with handlers for registry ids; a key press is resolved against the
// registry (`web/src/lib/shortcuts.ts`) in the innermost active scope first, and
// runs once. No DOM beyond the event and `document.activeElement`, so tests drive
// it with plain frames and synthetic events.
import { type Chord, chordKey, chordsOf, matchesChord, SHORTCUTS, type Shortcut, type ShortcutScope } from '../../lib/shortcuts'
import { resettable } from '../../lib/moduleState'

export type ShortcutHandler = (e: KeyboardEvent, s: Shortcut) => boolean | void

export interface ScopeFrame {
  scope: ShortcutScope
  /** The route view, for the `view` scope. */
  view?: string
  /** Handlers by registry id; a handler returning `false` lets the key fall through. */
  handlers: Partial<Record<string, ShortcutHandler>>
  /** Only active while focus is inside this element (the task panel); `undefined` from the function means no restriction, `null` no element yet. */
  within?: () => Element | null | undefined
  /** Runs before the registry for every key (the Vim machine, "any key dismisses"); `true` consumes the key. */
  any?: (e: KeyboardEvent) => boolean | void
  /** While true, the frame is skipped (the view's own modal is open). */
  paused?: () => boolean
  /** Consulted before every other frame, whatever its scope (the former capturing listeners). */
  capture?: boolean
}

const DEPTH: Record<ShortcutScope, number> = { vim: 8, editor: 7, panel: 6, board: 5, timeline: 5, list: 4, calendar: 4, view: 3, global: 2 }
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta'])
const PREFIX_MS = 800

let frames: ScopeFrame[] = []
let order = 0
const stamps = new WeakMap<ScopeFrame, number>()

/** Registers a scope frame; returns the function that removes it. The first frame installs the window listener. */
export function registerShortcutScope(frame: ScopeFrame): () => void {
  stamps.set(frame, ++order)
  frames = [...frames, frame]
  const release = typeof window === 'undefined' ? () => {} : installShortcutDispatcher()
  return () => {
    frames = frames.filter((f) => f !== frame)
    release()
  }
}

/** The scopes on screen right now (for the cheat sheet's "here" groups). */
export function activeScopes(): { scope: ShortcutScope; view?: string }[] {
  return frames.filter((f) => !f.paused?.()).map((f) => ({ scope: f.scope, view: f.view }))
}

/** Whether a frame of this scope is registered. */
export function hasScope(scope: ShortcutScope): boolean {
  return frames.some((f) => f.scope === scope && !f.paused?.())
}

// ---------------------------------------------------------------- prefix (`g`, `d`)

let pending: Chord[] = []
let pendingTimer: ReturnType<typeof setTimeout> | undefined
// While held (the sequence spotlight is open), the prefix does not expire.
let held = false
const prefixListeners = new Set<() => void>()

function notifyPrefix(): void {
  prefixListeners.forEach((fn) => fn())
}

function armPrefix(seq: Chord[]): void {
  pending = seq
  clearTimeout(pendingTimer)
  if (!held) pendingTimer = setTimeout(clearPrefix, PREFIX_MS)
  notifyPrefix()
}

/** A sequence is under way (`g` was pressed): single keys wait for its second half. */
export function isPrefixPending(): boolean {
  return pending.length > 0
}

export function clearPrefix(): void {
  const had = pending.length > 0
  pending = []
  held = false
  clearTimeout(pendingTimer)
  if (had) notifyPrefix()
}

/** The chords pressed so far of a sequence under way (empty when none). */
export function pendingPrefix(): Chord[] {
  return pending
}

/** Calls `fn` whenever a sequence starts, extends or ends; returns the unsubscribe function. */
export function subscribePrefix(fn: () => void): () => void {
  prefixListeners.add(fn)
  return () => { prefixListeners.delete(fn) }
}

/** Holds the pending prefix (no expiry) while the spotlight shows it; `false` restarts the expiry. */
export function holdPrefix(on: boolean): void {
  if (!pending.length) return
  held = on
  clearTimeout(pendingTimer)
  if (!on) pendingTimer = setTimeout(clearPrefix, PREFIX_MS)
}

/** Arms the `g` prefix from outside (the Vim layer's `gg` shares it). */
export function armGPrefix(): void {
  armPrefix([{ key: 'g', ctrl: false, alt: false, shift: false, symbol: false }])
}

// ---------------------------------------------------------------- guards

/** A text entry control has focus: single-key shortcuts stay out of it. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null
  return !!t && typeof t.tagName === 'string' && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || !!t.isContentEditable)
}

/**
 * A control Enter activates on its own (a button, a link, a tab, a menu item): the
 * "open the selected item" shortcuts stand back for it, so the native click wins.
 */
export function isActivationTarget(target: EventTarget | null): boolean {
  const t = target as Element | null
  return !!t && typeof t.matches === 'function' && t.matches('button, a[href], summary, select, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="switch"], [role="treeitem"], input[type="checkbox"], input[type="radio"]')
}

function dialogOpen(): boolean {
  // The sequence spotlight is a hint over the page, not a modal: it does not mute the scopes.
  return typeof document !== 'undefined' && !!document.querySelector('[role="dialog"]:not([data-spotlight])')
}

function focusInside(frame: ScopeFrame): boolean {
  if (!frame.within) return true
  const root = frame.within()
  if (root === undefined) return true
  return !!root && typeof document !== 'undefined' && root.contains(document.activeElement)
}

// ---------------------------------------------------------------- resolution

const byScope = new Map<ShortcutScope, Shortcut[]>()
for (const s of SHORTCUTS) {
  if (s.note || s.local) continue
  byScope.set(s.scope, [...(byScope.get(s.scope) ?? []), s])
}

function prefixMatches(seq: Chord[], pend: Chord[]): boolean {
  if (seq.length <= pend.length) return false
  for (let i = 0; i < pend.length; i++) if (chordKey([seq[i]]) !== chordKey([pend[i]])) return false
  return true
}

interface Candidate { entry: Shortcut; frame: ScopeFrame; seq: Chord[] }

/** Entries of a frame whose chord completes with this key, given the pending prefix. */
function candidatesOf(frame: ScopeFrame, e: KeyboardEvent, pend: Chord[]): { done: Candidate[]; longer: boolean } {
  const done: Candidate[] = []
  let longer = false
  for (const entry of byScope.get(frame.scope) ?? []) {
    if (frame.scope === 'view' && entry.views && (!frame.view || !entry.views.includes(frame.view))) continue
    if (!frame.handlers[entry.id]) continue
    for (const seq of chordsOf(entry)) {
      if (!prefixMatches(seq, pend)) continue
      if (!matchesChord(seq[pend.length], e)) continue
      if (seq.length === pend.length + 1) done.push({ entry, frame, seq })
      else longer = true
    }
  }
  return { done, longer }
}

function sortedFrames(): ScopeFrame[] {
  const stamp = (f: ScopeFrame) => stamps.get(f) ?? 0
  return [...frames]
    .filter((f) => !f.paused?.())
    .sort((a, b) => Number(!!b.capture) - Number(!!a.capture) || DEPTH[b.scope] - DEPTH[a.scope] || stamp(b) - stamp(a))
}

/** Within one scope level, an entry that overrides another candidate runs first. */
function byOverride(list: Candidate[]): Candidate[] {
  const ids = new Set(list.map((c) => c.entry.id))
  const rank = (c: Candidate) => (c.entry.overrides ?? []).filter((id) => ids.has(id)).length
  return [...list].sort((a, b) => rank(b) - rank(a))
}

/** Resolves one key press; returns whether a shortcut ran (or a prefix was armed). */
export function dispatch(e: KeyboardEvent): boolean {
  if (MODIFIERS.has(e.key) || e.isComposing) return false
  const pend = pending
  const typing = isTypingTarget(e.target)
  const dialog = dialogOpen()
  const active = sortedFrames()
  let longer = false
  // `any` hooks of capturing frames (the Vim machine, "any key dismisses") see the key first.
  for (const frame of active) {
    if (!frame.capture || !frame.any || !focusInside(frame)) continue
    if (frame.any(e) === true) { clearPrefix(); return true }
  }
  // Then scope by scope, innermost first; frames of one scope share an override order.
  let i = 0
  while (i < active.length) {
    const level = active[i]
    const group: ScopeFrame[] = []
    for (; i < active.length && active[i].scope === level.scope && !!active[i].capture === !!level.capture; i++) group.push(active[i])
    const found: Candidate[] = []
    for (const frame of group) {
      if (!focusInside(frame)) continue
      if (!frame.capture && frame.any && frame.any(e) === true) { clearPrefix(); return true }
      const c = candidatesOf(frame, e, pend)
      found.push(...c.done)
      longer ||= c.longer
    }
    for (const c of byOverride(found)) {
      const s = c.entry
      if (typing && !s.typing) continue
      if (dialog && s.scope !== 'global' && !s.dialog) continue
      const r = c.frame.handlers[s.id]!(e, s)
      if (r === false) continue
      if (!s.passive) e.preventDefault()
      clearPrefix()
      return true
    }
  }
  if (longer && !typing) {
    // The key starts (or extends) a sequence: wait for the rest.
    armPrefix([...pend, chordOf(e)])
    e.preventDefault()
    return true
  }
  if (pend.length) {
    // A sequence nothing completes ends here; the key does nothing else (as `g` then a stray key always did).
    clearPrefix()
    return true
  }
  return false
}

/** One way to finish the pending sequence: the entry and the chord that completes it. */
export interface Continuation { entry: Shortcut; next: Chord }

/**
 * What can complete the pending sequence right now (shortcut-spotlight D3): entries of
 * the active, unpaused frames that have a handler, one per completing chord, innermost
 * scope first. Empty when nothing is pending.
 */
export function pendingContinuations(): Continuation[] {
  const pend = pending
  if (!pend.length) return []
  const out: Continuation[] = []
  const seen = new Set<string>()
  for (const frame of sortedFrames()) {
    if (!focusInside(frame)) continue
    for (const entry of byScope.get(frame.scope) ?? []) {
      if (frame.scope === 'view' && entry.views && (!frame.view || !entry.views.includes(frame.view))) continue
      if (!frame.handlers[entry.id]) continue
      for (const seq of chordsOf(entry)) {
        if (seq.length !== pend.length + 1 || !prefixMatches(seq, pend)) continue
        const k = chordKey([seq[pend.length]])
        if (seen.has(k)) continue
        seen.add(k)
        out.push({ entry, next: seq[pend.length] })
      }
    }
  }
  return out
}

function chordOf(e: KeyboardEvent): Chord {
  const letter = e.key.length === 1 && /[a-z]/i.test(e.key)
  return { key: letter ? e.key.toLowerCase() : e.key.toLowerCase(), ctrl: e.ctrlKey ? 'ctrl' : e.metaKey ? 'meta' : false, alt: e.altKey, shift: e.shiftKey, symbol: e.key.length === 1 && !letter && !/[0-9]/.test(e.key) }
}

let installed = 0
const onWindowKey = (e: KeyboardEvent) => { dispatch(e) }

/** Installs the one window listener (shared by every caller); returns the function that releases it. */
export function installShortcutDispatcher(target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
  if (installed++ === 0) target.addEventListener('keydown', onWindowKey)
  let released = false
  return () => {
    if (released) return
    released = true
    if (--installed === 0) target.removeEventListener('keydown', onWindowKey)
  }
}

/** Forgets every frame and the prefix (tests). */
export function resetShortcutScopes(): void {
  frames = []
  clearPrefix()
}
resettable('shortcuts', resetShortcutScopes)

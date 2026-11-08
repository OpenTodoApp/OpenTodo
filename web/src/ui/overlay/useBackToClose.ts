// Back closes an open overlay (the Android back gesture) instead of leaving the page
// behind it. Each open overlay owns one marker history entry at the same address, numbered
// by its depth (1 = the first overlay open, 2 = one opened over it). Back lands on the
// entry below and closes every overlay above it. Closed by other means, the overlays
// pop their entries together, once, and only while their markers are still on top.
// Touch only: with a mouse, the browser's Back is not how an overlay is dismissed.
import { useEffect, useLayoutEffect, useRef } from 'react'
import { resettable } from '../../lib/moduleState'

interface Open { mark: number; close: () => void }
const open = new Set<Open>()
/** Marker entries currently on top of the history, owned or not yet released. */
let depth = 0
let flushing = false
/** Traversals started by `flush` that have not landed yet (history.go is asynchronous). */
let landing = false
let waiting: Array<() => void> = []

const markOf = (): number => (history.state as { overlay?: number } | null)?.overlay ?? 0
/** Not in WebKit (Safari and every iOS browser): the feature is for Android's Back, and WebKit
 *  hung, then crashed, loading the page again after a marker was popped and another pushed
 *  (release 0.22.0 layout check). */
const webkit = () => typeof navigator !== 'undefined' && navigator.vendor === 'Apple Computer, Inc.'
const touch = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches && !webkit()
const top = () => Math.max(0, ...[...open].map((o) => o.mark))

function settle() {
  landing = false
  const run = waiting
  waiting = []
  run.forEach((fn) => fn())
}

function onPop() {
  // The traversal `flush` started has landed: navigations held back meanwhile go ahead, after
  // the other popstate listeners (the router's) have seen it.
  if (landing) setTimeout(settle, 0)
  const cur = markOf()
  // A marker nobody owns (left under a route that replaced the one above it, or reached with Forward after
  // Back closed its overlay): step over it. Forward then seems to do nothing, on purpose: there is no overlay
  // left to reopen, and landing on a dead entry would take one more Back to leave.
  if (cur > 0 && ![...open].some((o) => o.mark === cur)) { depth = Math.min(depth, cur - 1); history.back(); return }
  if (cur >= depth) return
  depth = cur
  for (const o of [...open].sort((a, b) => b.mark - a.mark)) if (o.mark > cur) o.close()
}

// Released entries are popped after the commit, so overlays closing together pop once
// and a re-mount (StrictMode, a keyed remount) takes its entry back instead.
function flush() {
  flushing = false
  const keep = top()
  if (depth <= keep) return
  if (markOf() === depth) {
    const n = depth - keep
    depth = keep
    landing = true
    setTimeout(() => { if (landing) settle() }, 1000) // a traversal that never lands must not hold a navigation back
    history.go(-n)
  } else {
    // The route moved on since: the entries are buried and cannot be popped from here.
    depth = keep
  }
}

/** A load that lands on a marker entry (a reload, or the same address loaded again, which
 *  keeps the entry and its state) has no overlay open: the entry becomes a plain one again.
 *  Left as a marker, the first overlay closed after it stepped Back over it into the page
 *  before, and WebKit crashed on that traversal (release 0.22.0 layout check). */
export function releaseStaleMarker() {
  if (markOf() === 0 || open.size > 0) return
  const { overlay: _, ...rest } = history.state as Record<string, unknown>
  history.replaceState(Object.keys(rest).length ? rest : null, '')
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', onPop)
  releaseStaleMarker()
}
resettable('backToClose', () => { open.clear(); depth = 0; flushing = false; landing = false; waiting = [] })

/** While a traversal started by a closed overlay is still on its way, a navigation would be undone
 *  by it (it steps back over the new entry): `fn` runs once it has landed. Returns false, and does
 *  not run `fn`, when nothing is on its way. */
export function afterOverlayPops(fn: () => void): boolean {
  if (!landing) return false
  waiting.push(fn)
  return true
}

/** While `isOpen`, Back calls `onClose`; closing any other way releases the history entry again. */
export function useBackToClose(isOpen: boolean, onClose: () => void) {
  const close = useRef(onClose)
  useLayoutEffect(() => { close.current = onClose })
  useEffect(() => {
    if (!isOpen || !touch()) return
    const entry: Open = { mark: top() + 1, close: () => close.current() }
    if (entry.mark > depth) {
      history.pushState({ overlay: entry.mark }, '')
      depth = entry.mark
    }
    open.add(entry)
    return () => {
      open.delete(entry)
      if (!flushing) { flushing = true; queueMicrotask(flush) }
    }
  }, [isOpen])
}

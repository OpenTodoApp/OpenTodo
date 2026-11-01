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

const markOf = (): number => (history.state as { overlay?: number } | null)?.overlay ?? 0
const touch = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
const top = () => Math.max(0, ...[...open].map((o) => o.mark))

function onPop() {
  const cur = markOf()
  // A marker nobody owns (left under a route that replaced the one above it): step over it.
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
    history.go(-n)
  } else {
    // The route moved on since: the entries are buried and cannot be popped from here.
    depth = keep
  }
}

if (typeof window !== 'undefined') window.addEventListener('popstate', onPop)
resettable('backToClose', () => { open.clear(); depth = 0; flushing = false })

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

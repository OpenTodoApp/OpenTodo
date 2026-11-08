// Opening the command bar (OpenSpec changes search-and-command-palette D1 and
// moments-and-onboarding D7, D11), owned by the Shell: Ctrl/⌘+K opens it in Search
// from everywhere, also while typing, except in the notes editor where the keys insert
// a link; `q` focuses the list's quick add where there is one and otherwise opens the
// bar in Add mode. "Log a win" (today-closed-list D6) opens it in Add with "Log as
// done" on. The bar is a lazy chunk, loaded on the first open; its search index is
// prepared before that, in idle moments once the page has been left alone
// (PaletteWarmer, list-rendering-at-scale D6).
import { useEffect, useState } from 'react'
import { overlayDepth } from '../../ui'
import { listState } from '../listActions'
import { useShortcutScope } from '../shortcuts'
import { logWinRequest } from '../signals'

/** How long the page is left alone before the bar's search index is prepared, in ms. */
const WARM_AFTER_MS = 2000
const INPUTS = ['keydown', 'pointerdown', 'wheel', 'touchstart'] as const

export function useCommandBar() {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<'search' | 'add'>('search')
  const [win, setWin] = useState(false)
  const show = (m: 'search' | 'add', asWin = false) => { setMode(m); setWin(asWin); setLoaded(true); setOpen(true) }
  useEffect(() => logWinRequest.subscribe(() => { logWinRequest.take(); show('add', true) }), [])
  const [warm, setWarm] = useState(false)
  // Once the page has been left alone for a moment (no key or press), so the work
  // never runs in front of an interaction that follows another.
  useEffect(() => {
    let cancelIdle = () => {}
    let timer: ReturnType<typeof setTimeout>
    const start = () => {
      stopListening()
      if (typeof requestIdleCallback !== 'function') return setWarm(true)
      const h = requestIdleCallback(() => setWarm(true))
      cancelIdle = () => cancelIdleCallback(h)
    }
    const quiet = () => { clearTimeout(timer); timer = setTimeout(start, WARM_AFTER_MS) }
    const stopListening = () => { for (const type of INPUTS) window.removeEventListener(type, quiet, true) }
    for (const type of INPUTS) window.addEventListener(type, quiet, { capture: true, passive: true })
    quiet()
    return () => { clearTimeout(timer); stopListening(); cancelIdle() }
  }, [])
  useShortcutScope('global', {
    'global.palette': (e) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-notes-editor], .ProseMirror')) return false
      show('search')
    },
    // Global entries reach open dialogs: those keep the key.
    'list.quick-add': () => {
      if (overlayDepth() > 0) return false
      if (listState()?.focusQuickAdd(null)) return
      show('add')
    },
  })
  return {
    open, loaded, mode, win, openSearch: () => show('search'), close: () => setOpen(false),
    /** Prepare the search index now (PaletteWarmer); false again once it is done. */
    warm: warm && !open, warmed: () => setWarm(false),
  }
}

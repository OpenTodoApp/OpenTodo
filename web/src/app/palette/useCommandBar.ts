// Opening the command bar (OpenSpec changes search-and-command-palette D1 and
// moments-and-onboarding D7, D11), owned by the Shell: Ctrl/⌘+K opens it in Search
// from everywhere, also while typing, except in the notes editor where the keys insert
// a link; `q` focuses the list's quick add where there is one and otherwise opens the
// bar in Add mode. "Log a win" (today-closed-list D6) opens it in Add with "Log as
// done" on. The bar is a lazy chunk, loaded on the first open.
import { useEffect, useState } from 'react'
import { overlayDepth } from '../../ui'
import { listState } from '../listActions'
import { useShortcutScope } from '../shortcuts'
import { logWinRequest } from '../signals'

export function useCommandBar() {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [mode, setMode] = useState<'search' | 'add'>('search')
  const [win, setWin] = useState(false)
  const show = (m: 'search' | 'add', asWin = false) => { setMode(m); setWin(asWin); setLoaded(true); setOpen(true) }
  useEffect(() => logWinRequest.subscribe(() => { logWinRequest.take(); show('add', true) }), [])
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
  return { open, loaded, mode, win, openSearch: () => show('search'), close: () => setOpen(false) }
}

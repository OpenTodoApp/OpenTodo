// The sidebar folds to its icon rail while a docked panel would leave the list too
// little room (tablet-layouts D2): at 1024 px a docked task left the list 278 px.
// Measured on the app frame, so split view and Stage Manager windows follow the
// width they get. Never stored: the user's own collapse stays as they set it.
import { useEffect, useState, type RefObject } from 'react'
import { keysOf } from '../lib/shortcuts'
import { setSidebarToggle, useMediaQuery } from '../ui'
import { SPLIT_QUERY, usePanel } from './panel'
import { foldForRoom, toggleSidebarCollapsed, useSidebarLayout, type SidebarLayout } from './sidebarLayout'

const remOf = (px: number) => px / (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16)

/**
 * The sidebar's layout on screen, and the toggle every page header shows and `[` uses
 * (precision-shell D2): while folded for room, the toggle opens the sidebar and keeps
 * it open until the panel closes.
 */
export function useRoomFold(frame: RefObject<HTMLElement | null>): { sidebar: SidebarLayout; toggle: () => void } {
  const stored = useSidebarLayout()
  const panel = usePanel()
  const wide = useMediaQuery(SPLIT_QUERY)
  const docked = !!panel && wide && !stored.collapsed
  const [folded, setFolded] = useState(false)
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const el = frame.current
    if (!docked || held || !el || typeof ResizeObserver === 'undefined') { setFolded(false); return }
    const measure = (px: number) => setFolded((f) => foldForRoom(f, true, remOf(px), stored.width))
    measure(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(([e]) => measure(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [frame, docked, held, stored.width])
  // The hold ends with the panel.
  if (!docked && held) setHeld(false)
  const toggle = () => (folded ? (setFolded(false), setHeld(true)) : toggleSidebarCollapsed())
  const collapsed = stored.collapsed || folded
  useEffect(() => {
    setSidebarToggle({ collapsed, toggle, shortcut: keysOf('global.sidebar') })
    return () => setSidebarToggle(null)
  }, [collapsed]) // eslint-disable-line react-hooks/exhaustive-deps -- a new toggle comes with every change of `collapsed`, the state it reads
  return { sidebar: { ...stored, collapsed }, toggle }
}

// tablet-layouts D2: the sidebar folds to its icon rail while a docked panel would
// leave the list too little room, and unfolds only when the room holds with it open.
import { describe, expect, it } from 'vitest'
import { foldForRoom, LIST_ROOM_REM, SIDEBAR_COLLAPSED_REM } from './sidebarLayout'

describe('foldForRoom', () => {
  it('never folds without a docked panel', () => {
    expect(foldForRoom(false, false, 10, 16)).toBe(false)
    expect(foldForRoom(true, false, 10, 16)).toBe(false)
  })

  it('folds when the frame is under the room, as at 1024 px with a task docked', () => {
    // 1024 px: the frame beside a 26 rem panel and a 16 rem sidebar is about 21.5 rem.
    expect(foldForRoom(false, true, 21.5, 16)).toBe(true)
    expect(foldForRoom(false, true, LIST_ROOM_REM, 16)).toBe(false)
  })

  it('stays folded until the room holds with the sidebar back at its width', () => {
    const folded = 21.5 + (16 - SIDEBAR_COLLAPSED_REM) // the frame once folded
    expect(foldForRoom(true, true, folded, 16)).toBe(true)
    expect(foldForRoom(true, true, LIST_ROOM_REM + 16 - SIDEBAR_COLLAPSED_REM, 16)).toBe(false)
  })
})

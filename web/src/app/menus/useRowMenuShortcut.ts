// Keyboard entry to a row's action menu (OpenSpec change labels-and-menus, design
// D7): ".", Shift+F10 and the ContextMenu key open the focused row's menu; F2
// renames and Alt+↑/↓ (Alt+Shift+↑/↓ for top and bottom) reorder when the row
// offers them. Nothing happens while typing in a field.
import type { KeyboardEvent } from 'react'

export interface RowMenuHandlers {
  openMenu: () => void
  rename?: () => void
  /** -1 / +1 one step; 'top' / 'bottom' to the ends. */
  move?: (to: -1 | 1 | 'top' | 'bottom') => void
}

function typing(item: EventTarget | null): boolean {
  const el = item as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

/** Returns true when the key was handled. Exported for tests and for non-React callers. */
export function handleRowKey(e: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'altKey' | 'ctrlKey' | 'metaKey' | 'target'>, h: RowMenuHandlers): boolean {
  if (typing(e.target) || e.ctrlKey || e.metaKey) return false
  if ((e.key === '.' && !e.altKey) || (e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
    h.openMenu()
    return true
  }
  if (e.key === 'F2' && h.rename && !e.altKey && !e.shiftKey) {
    h.rename()
    return true
  }
  if (e.altKey && h.move && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    h.move(e.shiftKey ? (e.key === 'ArrowUp' ? 'top' : 'bottom') : (e.key === 'ArrowUp' ? -1 : 1))
    return true
  }
  return false
}

/** onKeyDown for a row element. */
export function useRowMenuShortcut(h: RowMenuHandlers) {
  return (e: KeyboardEvent) => {
    if (handleRowKey(e, h)) {
      e.preventDefault()
      e.stopPropagation()
    }
  }
}

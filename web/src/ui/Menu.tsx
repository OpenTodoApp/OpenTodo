// Menu items (OpenSpec change ui-primitives, design D5): rendered inside the
// overlay Menu with kind="menu", which provides the menu role, closing and the
// roving keyboard model below.
import { createContext, useContext, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/** Set by the overlay Menu (kind="menu"): closes it and returns focus to the trigger. */
export const MenuCloseContext = createContext<(() => void) | null>(null)

export interface MenuItemProps {
  label: string
  onSelect: () => void
  icon?: IconName
  /** Keyboard shortcut hint, e.g. "R" or "Shift+D"; shown right-aligned and announced. */
  shortcut?: string
  /** Secondary text, e.g. why the item is unavailable. */
  description?: string
  danger?: boolean
  disabled?: boolean
  /** Checkable item (pin, start view): announced as checked or not. */
  checked?: boolean
  /** Test and script hooks (`data-help-button`). */
  [hook: `data-${string}`]: string | boolean | undefined
}

export function MenuItem({ label, onSelect, icon, shortcut, description, danger, disabled, checked, ...hooks }: MenuItemProps) {
  const close = useContext(MenuCloseContext)
  const id = useId()
  const describedBy = [shortcut && `${id}-k`, description && `${id}-d`].filter(Boolean).join(' ') || undefined
  // The name comes from the visible label (WCAG 2.5.3 Label in Name); the description and
  // the shortcut hint are hidden from the name and announced as the item's description.
  return (
    <button
      {...hooks}
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-checked={checked}
      aria-describedby={describedBy}
      aria-keyshortcuts={shortcut}
      disabled={disabled}
      data-menu-label={label}
      onClick={() => { onSelect(); close?.() }}
      className={`flex w-full items-start gap-2.5 rounded-control px-2.5 py-2 text-left text-body outline-none transition duration-(--duration-ui)
        hover:bg-sunken focus-visible:bg-sunken dark:hover:bg-raised dark:focus-visible:bg-raised
        disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent
        ${danger ? 'text-danger hover:bg-danger-soft focus-visible:bg-danger-soft dark:hover:bg-danger-soft dark:focus-visible:bg-danger-soft' : 'text-default'}`}
    >
      <span className="mt-0.5 flex w-4 shrink-0 justify-center">
        {checked ? <Icon name="check" /> : icon ? <Icon name={icon} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {description && <span id={`${id}-d`} aria-hidden className="block text-meta text-muted">{description}</span>}
      </span>
      {shortcut && <kbd id={`${id}-k`} aria-hidden className="ui-kbd mt-0.5 shrink-0">{shortcut}</kbd>}
    </button>
  )
}

export function MenuGroup({ label, children }: { label?: string; children: ReactNode }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={label ? id : undefined}>
      {label && <div id={id} className="px-2.5 pb-1 pt-2 text-hint font-semibold uppercase tracking-wide text-faint">{label}</div>}
      {children}
    </div>
  )
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-(--ot-border)" />
}

/** The next item index for a key, skipping nothing (callers pass enabled items only). */
export function nextIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null
  if (key === 'ArrowDown') return current < 0 ? 0 : (current + 1) % count
  if (key === 'ArrowUp') return current < 0 ? count - 1 : (current - 1 + count) % count
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

/**
 * Keyboard model for menus: ↑/↓ wrap, Home/End, type-ahead (500 ms buffer),
 * disabled items skipped. Returns the keydown handler for the menu's container.
 */
export function useRovingMenu() {
  const buffer = useRef({ text: '', at: 0 })
  return (e: KeyboardEvent<HTMLElement>) => {
    const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')]
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    const step = nextIndex(e.key, current, items.length)
    if (step !== null) {
      e.preventDefault()
      items[step].focus()
      return
    }
    if (e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now()
      buffer.current = { text: now - buffer.current.at > 500 ? e.key.toLowerCase() : buffer.current.text + e.key.toLowerCase(), at: now }
      const q = buffer.current.text
      const order = [...items.slice(current + 1), ...items.slice(0, current + 1)]
      const hit = order.find((el) => (el.dataset.menuLabel ?? '').toLowerCase().startsWith(q))
        ?? (q.length > 1 ? undefined : order.find((el) => (el.dataset.menuLabel ?? '').toLowerCase().startsWith(q[0])))
      if (hit) {
        e.preventDefault()
        hit.focus()
      }
    }
  }
}

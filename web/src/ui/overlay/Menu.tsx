import { type ReactNode, useRef, useState } from 'react'
import { MenuCloseContext, useRovingMenu } from '../Menu'
import { Popover } from './Popover'

/**
 * A button that opens a Popover (replaces the `<details>` menus): `aria-haspopup`,
 * `aria-expanded`, and focus back on the button when the menu closes. `children`
 * may be a function receiving `close`. Controlled when `open` is given.
 *
 * kind="menu" (OpenSpec change ui-primitives D5) is for action menus built from
 * MenuItem: menu roles, focus on the first item, arrow keys, Home/End and
 * type-ahead, and an item closes the menu. kind="dialog" (default) stays for
 * panels with form controls (label colours, the project "Move to" select).
 */
export function Menu({ label, title, trigger, triggerClassName = '', align = 'end', width, className = 'p-1', open: openProp, onOpenChange, kind = 'dialog', children }: {
  /** Accessible name of the trigger. */
  label: string
  /** Title of the panel (sheet title on phones); defaults to `label`. */
  title?: string
  trigger: ReactNode
  triggerClassName?: string
  align?: 'start' | 'end'
  width?: string
  className?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  kind?: 'menu' | 'dialog'
  children: ReactNode | ((close: () => void) => ReactNode)
}) {
  const [own, setOwn] = useState(false)
  const open = openProp ?? own
  const set = (v: boolean) => { if (openProp === undefined) setOwn(v); onOpenChange?.(v) }
  const ref = useRef<HTMLButtonElement>(null)
  const close = () => set(false)
  const roving = useRovingMenu()
  const content = typeof children === 'function' ? children(close) : children
  return (
    <>
      <button ref={ref} type="button" className={triggerClassName} aria-label={label} aria-haspopup={kind} aria-expanded={open}
        onClick={() => set(!open)}>{trigger}</button>
      <Popover open={open} onClose={close} anchor={ref} label={title ?? label} align={align} width={width} className={className} role={kind}>
        {kind === 'menu'
          ? <MenuCloseContext.Provider value={close}><div role="none" onKeyDown={roving}>{content}</div></MenuCloseContext.Provider>
          : content}
      </Popover>
    </>
  )
}

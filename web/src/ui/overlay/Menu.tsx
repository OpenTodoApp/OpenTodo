import { type ButtonHTMLAttributes, type ReactNode, useRef, useState } from 'react'
import { MenuCloseContext, useRovingMenu } from '../Menu'
import { Tooltip } from '../Tooltip'
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
export function Menu({ label, title, trigger, triggerClassName = '', triggerProps, tip, tipSide, tipShortcut, align = 'end', width, className = 'p-1', open: openProp, onOpenChange, kind = 'dialog', namedByContent = false, children }: {
  /** Accessible name of the trigger. */
  label: string
  /** The trigger shows its whole name as text (with a badge, say): it is named by that text, not by `label`. */
  namedByContent?: boolean
  /** Title of the panel (sheet title on phones); defaults to `label`. */
  title?: string
  trigger: ReactNode
  triggerClassName?: string
  /** Extra attributes for the trigger (`aria-current`, test hooks). */
  triggerProps?: ButtonHTMLAttributes<HTMLButtonElement> & Record<`data-${string}`, string | boolean | undefined>
  /** A tooltip on the trigger (a truncated name, the icon rail). */
  tip?: string
  tipSide?: 'top' | 'bottom' | 'right'
  /** The keys shown in the trigger's tooltip (rows-v2 D7: "Priority · 1 / 2 / 3 / 4"). */
  tipShortcut?: string
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
  const button = (
    <button ref={ref} type="button" {...triggerProps} className={triggerClassName} aria-label={namedByContent ? undefined : label} aria-haspopup={kind} aria-expanded={open}
      onClick={() => set(!open)}>{trigger}</button>
  )
  return (
    <>
      {tip ? <Tooltip label={tip} side={tipSide} shortcut={tipShortcut}>{button}</Tooltip> : button}
      <Popover open={open} onClose={close} anchor={ref} label={title ?? label} align={align} width={width} className={className} role={kind}>
        {kind === 'menu'
          ? <MenuCloseContext.Provider value={close}><div role="none" onKeyDown={roving}>{content}</div></MenuCloseContext.Provider>
          : content}
      </Popover>
    </>
  )
}

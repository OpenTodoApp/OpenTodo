import { type ReactNode, useRef, useState } from 'react'
import { Popover } from './Popover'

/**
 * A button that opens a Popover (replaces the `<details>` menus): `aria-haspopup`,
 * `aria-expanded`, and focus back on the button when the menu closes. `children`
 * may be a function receiving `close`. Controlled when `open` is given.
 */
export function Menu({ label, title, trigger, triggerClassName = '', align = 'end', width, className = 'p-1', open: openProp, onOpenChange, children }: {
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
  children: ReactNode | ((close: () => void) => ReactNode)
}) {
  const [own, setOwn] = useState(false)
  const open = openProp ?? own
  const set = (v: boolean) => { if (openProp === undefined) setOwn(v); onOpenChange?.(v) }
  const ref = useRef<HTMLButtonElement>(null)
  const close = () => set(false)
  return (
    <>
      <button ref={ref} type="button" className={triggerClassName} aria-label={label} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => set(!open)}>{trigger}</button>
      <Popover open={open} onClose={close} anchor={ref} label={title ?? label} align={align} width={width} className={className}>
        {typeof children === 'function' ? children(close) : children}
      </Popover>
    </>
  )
}

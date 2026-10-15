// Buttons (OpenSpec change ui-primitives, design D3): four emphasis levels, three
// sizes, icon-only, and a busy state that ignores repeated activation.
import { forwardRef, useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { Tooltip } from './Tooltip'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface BaseProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Busy from outside (e.g. a form submitting); a returned promise also sets it. */
  busy?: boolean
  /** A returned promise keeps the button busy until it settles; activations meanwhile are ignored. */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => unknown
}

export interface ButtonProps extends BaseProps {
  icon?: IconName
  iconEnd?: IconName
  children?: ReactNode
}

function useBusy(onClick: BaseProps['onClick'], busyProp?: boolean) {
  const [pending, setPending] = useState(false)
  const running = useRef(false)
  const busy = !!busyProp || pending
  const handle = (e: MouseEvent<HTMLButtonElement>) => {
    if (busy || running.current) {
      e.preventDefault()
      return
    }
    const result = onClick?.(e)
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      running.current = true
      setPending(true)
      void (result as Promise<unknown>).finally(() => {
        running.current = false
        setPending(false)
      })
    }
  }
  return { busy, handle }
}

const SPINNER = 'animate-spin motion-reduce:animate-none'
const iconSize = (size: ButtonSize): 'sm' | 'md' => (size === 'lg' ? 'md' : 'sm')

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconEnd, busy: busyProp, onClick, className, children, type = 'button', ...rest },
  ref,
) {
  const { busy, handle } = useBusy(onClick, busyProp)
  return (
    <button
      ref={ref}
      type={type}
      className={`ui-btn ui-btn--${variant} ui-btn--${size}${className ? ` ${className}` : ''}`}
      aria-busy={busy || undefined}
      onClick={handle}
      {...rest}
    >
      {busy ? <Icon name="loader-circle" size={iconSize(size)} className={SPINNER} /> : icon && <Icon name={icon} size={iconSize(size)} />}
      {children}
      {iconEnd && <Icon name={iconEnd} size={iconSize(size)} />}
    </button>
  )
})

export interface IconButtonProps extends BaseProps {
  icon: IconName
  /** Required: the action's name, announced and shown as a tooltip. */
  label: string
  /** The shortcut shown in the tooltip. */
  shortcut?: string
  /** Off when the control sits where a tooltip cannot open (inside another tooltip's trigger). */
  tooltip?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, shortcut, tooltip = true, variant = 'ghost', size = 'md', busy: busyProp, onClick, className, type = 'button', ...rest },
  ref,
) {
  const { busy, handle } = useBusy(onClick, busyProp)
  // The name is the tooltip (design-system "Tooltip primitive"); no native title.
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      className={`ui-btn ui-btn--icon ui-btn--${variant} ui-btn--${size}${className ? ` ${className}` : ''}`}
      aria-busy={busy || undefined}
      onClick={handle}
      {...rest}
    >
      <Icon name={busy ? 'loader-circle' : icon} size={iconSize(size)} className={busy ? SPINNER : undefined} />
    </button>
  )
  return tooltip ? <Tooltip label={label} shortcut={shortcut}>{button}</Tooltip> : button
})

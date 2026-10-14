// One line-icon set (OpenSpec change ui-primitives, design D2): Lucide paths
// vendored in icons/lucide.ts, drawn in the current text colour.
import type { CSSProperties } from 'react'
import { ICONS, type IconName } from './icons/lucide'

export type { IconName }

const SIZES = { xs: 12, sm: 16, md: 20, lg: 24 } as const
export type IconSize = keyof typeof SIZES | number

export interface IconProps {
  name: IconName
  size?: IconSize
  /** Accessible name; without it the icon is decorative and hidden from assistive technology. */
  label?: string
  className?: string
  style?: CSSProperties
}

export function Icon({ name, size = 'sm', label, className, style }: IconProps) {
  const px = typeof size === 'number' ? size : SIZES[size]
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const, focusable: 'false' as const }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={px >= 20 ? 1.75 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`ui-icon shrink-0${className ? ` ${className}` : ''}`}
      style={style}
      data-icon={name}
      {...a11y}
      // Static, trusted path data generated from lucide-static (never user input).
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  )
}

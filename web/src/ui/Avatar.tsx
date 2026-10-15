// Avatar (OpenSpec change ui-primitives, design D8): initials on a palette hue
// derived from the account id, so a person has the same colour everywhere.
import { HUE_NAMES } from './tokens/pairs'
import type { HueName } from './tokens/palette'

/** Initials for a name or email: first letters of the first two words. */
export function initials(name: string): string {
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[1][0] : '')).toUpperCase()
}

/** FNV-1a 32-bit hash of the account id, mapped onto the 12 palette hues. */
export function avatarHue(accountId: string): HueName {
  let h = 0x811c9dc5
  for (let i = 0; i < accountId.length; i++) {
    h ^= accountId.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return HUE_NAMES[h % HUE_NAMES.length]
}

const SIZES = { xs: 'h-4 w-4 text-[9px]', sm: 'h-6 w-6 text-hint', md: 'h-8 w-8 text-meta', lg: 'h-10 w-10 text-meta' } as const // style-lint-allow: initials inside a 20 px circle

export interface AvatarProps {
  id: string
  name: string
  size?: keyof typeof SIZES
  /** Decorative next to a visible name (default); otherwise the name is announced. */
  decorative?: boolean
  className?: string
}

export function Avatar({ id, name, size = 'sm', decorative = true, className }: AvatarProps) {
  return (
    <span
      data-hue={avatarHue(id)}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-hue-soft font-semibold text-hue ${SIZES[size]}${className ? ` ${className}` : ''}`}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name })}
    >
      {initials(name)}
    </span>
  )
}

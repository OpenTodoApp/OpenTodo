// List row (OpenSpec change ui-primitives, design D9): a focusable row with an
// optional leading icon or avatar, label, details, badges and a trailing menu.
import type { KeyboardEvent, ReactNode } from 'react'

export interface ListRowProps {
  leading?: ReactNode
  label: ReactNode
  meta?: ReactNode
  badges?: ReactNode
  /** Trailing actions, usually a Menu of MenuItems. */
  menu?: ReactNode
  /** Existing key handlers of the view (Enter to open, Delete to remove…). */
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
  onClick?: () => void
  /** Accessible name when the label is not plain text. */
  ariaLabel?: string
  className?: string
}

export function ListRow({ leading, label, meta, badges, menu, onKeyDown, onClick, ariaLabel, className }: ListRowProps) {
  return (
    <div
      tabIndex={0}
      role="group"
      aria-label={ariaLabel}
      onKeyDown={(e) => { if (e.target === e.currentTarget) onKeyDown?.(e) }}
      onClick={onClick}
      className={`group flex min-h-(--size-row) items-center gap-3 rounded-control px-3 py-2 outline-none hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus dark:hover:bg-raised${onClick ? ' cursor-pointer' : ''}${className ? ` ${className}` : ''}`}
    >
      {leading && <span className="flex shrink-0 items-center text-muted">{leading}</span>}
      <div className="min-w-0 flex-1">
        <div className="user-text text-body text-default">{label}</div>
        {(meta || badges) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-meta text-muted">
            {meta && <span className="user-text min-w-0">{meta}</span>}
            {badges}
          </div>
        )}
      </div>
      {menu && <div className="shrink-0" onClick={(e) => e.stopPropagation()}>{menu}</div>}
    </div>
  )
}

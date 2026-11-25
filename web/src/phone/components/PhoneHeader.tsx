// The bar of a phone screen (OpenSpec change phone-ui-trial, design D5, D9): one
// row, sticky inside the screen's own scroller so two screens can sit side by
// side. `title` shows in the bar only once the screen's large title has scrolled
// away; a screen without a large title passes `shown`.
import type { ReactNode } from 'react'

export function PhoneHeader({ lead, title, shown = false, trailing }: {
  /** The control at the start: the menu button, or Back. */
  lead: ReactNode
  title?: string
  /** Whether the title is in the bar now. */
  shown?: boolean
  trailing?: ReactNode
}) {
  return (
    <header data-phone-header data-titled={shown || undefined}
      className={`sticky top-0 z-10 flex min-h-12 items-center gap-1 bg-canvas px-2 pt-[max(0.25rem,var(--safe-top))] ${shown ? 'border-b border-soft' : ''}`}>
      <div className="flex shrink-0 items-center">{lead}</div>
      <p aria-hidden={!shown} className={`min-w-0 flex-1 truncate text-center text-title text-strong transition-opacity duration-(--duration-ui) ${shown ? 'opacity-100' : 'opacity-0'}`}>{title}</p>
      <div className="flex shrink-0 items-center gap-1">{trailing}</div>
    </header>
  )
}

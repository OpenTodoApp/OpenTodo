// The bar of a phone screen (OpenSpec change phone-ui-trial, design D5, D9): one
// row, sticky inside the screen's own scroller so two screens can sit side by
// side. `title` shows in the bar only once the screen's large title has scrolled
// away; a screen without a large title passes `shown`.
import type { ReactNode } from 'react'

export function PhoneHeader({ lead, title, shown = false, trailing, bleed = false, progress }: {
  /** The control at the start: the menu button, or Back. */
  lead: ReactNode
  title?: string
  /** Whether the title is in the bar now. */
  shown?: boolean
  trailing?: ReactNode
  /** Inside a page's 16 px gutter (a page header): the bar reaches the screen's edges. */
  bleed?: boolean
  /** Shown after the title once the bar has it: Today's progress (phone-delight D9). */
  progress?: ReactNode
}) {
  return (
    <header data-phone-header data-titled={shown || undefined}
      className={`sticky top-0 z-10 flex min-h-12 items-center gap-1 px-2 pt-[max(0.25rem,var(--safe-top))] transition-colors duration-(--duration-ui) ${bleed ? '-mx-4' : ''} ${shown ? 'border-b border-soft bg-canvas/85 backdrop-blur-xl' : 'border-b border-transparent'}`}>
      <div className="flex shrink-0 items-center">{lead}</div>
      <p aria-hidden={!shown} className={`flex min-w-0 flex-1 items-center justify-center gap-2 text-title text-strong transition-opacity duration-(--duration-ui) ${shown ? 'opacity-100' : 'opacity-0'}`}>
        <span className="min-w-0 truncate">{title}</span>{progress}
      </p>
      <div className="flex shrink-0 items-center gap-1">{trailing}</div>
    </header>
  )
}

// Where a page is (OpenSpec accessibility "Location and link purpose", WCAG 2.4.8;
// accessibility-aaa D7): the path from the top to the page's parent, each step a link,
// as one quiet line that takes the place of the lead line rather than adding a row.
// Navigation is the caller's (`onSelect`); the `href` keeps middle-click and copying
// the link working. The separators are drawn, not read: the list order carries them.
import type { MouseEvent, ReactNode } from 'react'
import { Icon } from '../Icon'

export interface TrailStep {
  label: ReactNode
  href: string
  /** Navigates in the app; a modified click or a non-primary button falls through to the href. */
  onSelect?: () => void
}

export interface TrailProps {
  steps: readonly TrailStep[]
  /** The landmark's name, "You are here" translated by the caller. */
  label: string
  className?: string
}

function plain(e: MouseEvent) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
}

export function Trail({ steps, label, className }: TrailProps) {
  if (!steps.length) return null
  return (
    <nav aria-label={label} data-trail className={`min-w-0 text-meta text-muted${className ? ` ${className}` : ''}`}>
      <ol className="flex min-w-0 flex-wrap items-center gap-y-0.5">
        {steps.map((s, i) => (
          <li key={`${s.href}-${i}`} className="flex min-w-0 items-center">
            {i > 0 && <Icon name="chevron-right" size="xs" className="mx-0.5 shrink-0 text-faint" aria-hidden="true" />}
            <a href={s.href} className="ui-hit min-w-0 overflow-visible whitespace-nowrap rounded-chip px-0.5 hover:text-default hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              onClick={(e) => { if (!s.onSelect || !plain(e)) return; e.preventDefault(); s.onSelect() }}>
              {s.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

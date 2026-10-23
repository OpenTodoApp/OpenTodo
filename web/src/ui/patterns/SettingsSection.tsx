// Settings section and row (OpenSpec change ui-primitives, design D9; ux-overhaul
// settings-navigation "Panel cards and rows"): a card with heading, one-sentence
// description and rows. No actions and no help link in the header: the page
// header carries Help, and a section's primary action is a row's control.
// settings-copy D3: the one line may end with "Learn more", which opens the card's
// guide section beside the page; it is part of the line, never a header action.
// settings-refresh D1: a card may carry an icon before its title, from the copy table.
// precision-settings D3: every section is flat (no card surface, no icon before the
// heading): a label-size heading, its one line, then rows between hairlines.
import { useId, type ReactNode } from 'react'
import { LearnMore } from '../LearnMore'

export interface SettingsSectionProps {
  title: string
  /** The section table's icon (settings-navigation "Card icons"): shown in search results, not on the page. */
  icon?: string
  description?: ReactNode
  /** Heading level: h2 under the section page's single h1 (default), h3 when nested. */
  level?: 2 | 3
  id?: string
  /** A stable heading id (kept from the earlier layout for links and tests); generated when absent. */
  headingId?: string
  /** A Help screen id: the line ends with a Learn more link that opens it beside the page. */
  learnMore?: string
  testId?: string
  children: ReactNode
}

export function SettingsSection({ title, description, level = 2, id, headingId: fixedId, learnMore, testId, children }: SettingsSectionProps) {
  const generated = useId()
  const headingId = fixedId ?? generated
  const H = level === 2 ? 'h2' : 'h3'
  return (
    <section id={id} aria-labelledby={headingId} data-testid={testId} data-settings-card className="ui-settings-section">
      <div className="min-w-0">
        <H id={headingId} className="text-meta font-medium text-muted outline-none">{title}</H>
        {(description || learnMore) && (
          <p className="mt-1 text-meta text-muted" data-settings-line>
            {description}
            {learnMore && <>{description ? ' ' : ''}<LearnMore screen={learnMore} topic={title} className="text-meta" /></>}
          </p>
        )}
      </div>
      <div className="mt-3 divide-y divide-soft border-y border-soft">{children}</div>
    </section>
  )
}

export interface SettingRowProps {
  label: ReactNode
  description?: ReactNode
  /** The current state, as a badge beside the label. */
  status?: ReactNode
  control?: ReactNode
  /** id of the control, so the label names it. */
  htmlFor?: string
  /** An id for links and the settings search (the row scrolls into view and takes focus). */
  id?: string
}

export function SettingRow({ label, description, status, control, htmlFor, id }: SettingRowProps) {
  const Label = htmlFor ? 'label' : 'div'
  return (
    <div id={id} tabIndex={id ? -1 : undefined} data-setting-row={id}
      className="grid gap-3 py-3 outline-none focus-visible:rounded-control focus-visible:ring-2 focus-visible:ring-focus sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Label {...(htmlFor ? { htmlFor } : {})} className="block text-body font-medium text-default">{label}</Label>
          {status && <span className="text-meta text-default" data-setting-status>{status}</span>}
        </div>
        {description && <p className="mt-0.5 text-meta text-muted">{description}</p>}
      </div>
      {control && <div className="flex flex-wrap items-center gap-2 sm:justify-end" data-setting-control>{control}</div>}
    </div>
  )
}

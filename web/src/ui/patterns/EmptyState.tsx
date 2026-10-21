// EmptyState (OpenSpec changes ui-primitives D9 and lean-chrome D7): the contract every
// empty view follows (task-list-presentation "Empty views"): one sentence as the
// region's heading, at most one primary action and at most one secondary text link.
// No icon, no second sentence, no printed key hint: the action's key is shown in its
// tooltip, and only with a fine pointer. A view cannot add a second button or a hint
// line without changing this file; it passes data, not nodes.
//
// `icon`, `body` and `control` are the older free-form slots, kept only for the
// settings panels and the task panel's tabs until the `settings-copy` change moves them
// to the contract. Task views never pass them. `illustration` names one of the calm
// drawings of ui/illustrations (inbox-means-unplaced D9), drawn above the sentence.
import { type ReactNode, useId } from 'react'
import { Button } from '../Button'
import { Icon, type IconName } from '../Icon'
import { Illustration, type IllustrationName } from '../illustrations/Illustration'
import { Tooltip } from '../Tooltip'
import { useFinePointer } from '../overlay/stack'
import { t } from '../../lib/i18n'

export interface EmptyStateAction {
  /** What the button does, as a verb ("Add a task"). */
  label: string
  onClick: () => void
  /** The key that does the same, shown in the button's tooltip on fine pointers only. */
  shortcut?: string
}

export interface EmptyStateLink {
  label: string
  onClick: () => void
}

export interface EmptyStateProps {
  /** The one sentence, ending with a full stop; the region's heading. */
  title: string
  /** The one primary action. */
  action?: EmptyStateAction
  /** At most one secondary text link. */
  secondary?: EmptyStateLink
  testId?: string
  /** Less space around it and an h3, for an empty day inside a list of days headed by h2 (the calendar's agenda and day list). */
  compact?: boolean
  /** A decorative illustration above the sentence (design-system "Illustrations"); hidden from assistive technology. */
  illustration?: IllustrationName
  /** Settings-only until `settings-copy`: an icon above the sentence. */
  icon?: IconName
  /** Settings-only until `settings-copy`: a second line of explanation. */
  body?: ReactNode
  /** Settings-only until `settings-copy`: a free-form control in place of `action`. */
  control?: ReactNode
}

export function EmptyState({ title, action, secondary, testId, compact, illustration, icon, body, control }: EmptyStateProps) {
  const headingId = useId()
  const fine = useFinePointer()
  const Heading = compact ? 'h3' : 'h2'
  const button = action && (
    <Button size="sm" variant="primary" onClick={action.onClick} data-empty-action>{action.label}</Button>
  )
  return (
    <section aria-labelledby={headingId} data-testid={testId} data-empty-view
      className={`flex flex-col items-center text-center ${compact ? 'gap-1 px-2 py-2' : 'gap-2 px-4 py-8'}`}>
      {illustration && <div className="mb-1"><Illustration name={illustration} /></div>}
      {!illustration && icon && <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-sunken text-muted"><Icon name={icon} size="md" /></span>}
      <Heading id={headingId} className="text-body font-medium text-default">{title}</Heading>
      {body && <p className="max-w-sm text-meta text-muted">{body}</p>}
      {button && (
        <div className={compact ? '' : 'mt-2'}>
          {fine && action.shortcut
            ? <Tooltip label={t.rich('Press {key}', { key: <kbd className="ui-kbd">{action.shortcut}</kbd> })}>{button}</Tooltip>
            : button}
        </div>
      )}
      {!button && control && <div className="mt-2">{control}</div>}
      {secondary && (
        <button type="button" className="text-meta text-accent underline" onClick={secondary.onClick} data-empty-secondary>{secondary.label}</button>
      )}
    </section>
  )
}

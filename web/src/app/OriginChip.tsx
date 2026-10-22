// The origin chip of a row and a card (OpenSpec change task-origin, design D7;
// task-list-presentation "Metadata language"): an icon for the kind, the
// external id or the URL's host, and the stored page title as a tooltip. With a
// URL it is a link that opens the source in a new tab without the referrer.
//
// A link cannot live inside the row's open button (interactive content inside
// a button), so the chip sits at the row's trailing edge beside the metadata,
// outside the open control. Detailed rows show it as a neutral chip. Calm rows
// show it quiet, like the counts (faint, muted while the row is hovered or
// holds focus), so it is never one of the full-contrast metadata items the Calm
// budget caps (calm-rows D10, MAX_CALM_ROW_ITEMS).
import { Icon, NeutralChip, ReadAs, Tooltip } from '../ui'
import type { ReactElement } from 'react'
import { t } from '../lib/i18n'
import { originIcon, originLabel } from '../lib/taskOrigin'
import type { Origin } from '../lib/types'

/** The text a chip reads as: the id or host, "Email" for a mail (its Message-ID is not a label). */
export function originText(origin: Origin): string {
  return originLabel(origin) || t('Email')
}

const QUIET = 'inline-flex max-w-40 min-w-0 items-center gap-1 text-meta text-faint transition-colors duration-(--duration-ui) group-hover:text-muted group-focus-within:text-muted'
const LINK = 'inline-flex max-w-40 min-w-0 rounded-chip outline-none hover:text-default focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus'

export function OriginChip({ origin, quiet = false }: { origin: Origin; quiet?: boolean }) {
  const text = originText(origin)
  const icon = originIcon(origin)
  // The stored page title, as a tooltip (never a second line).
  const tip = origin.title || undefined
  const withTip = (el: ReactElement<Record<string, unknown>>) => (tip ? <Tooltip label={tip}>{el}</Tooltip> : el)
  const face = quiet
    ? <span className={QUIET}><Icon name={icon} size="xs" /><span className="truncate">{text}</span></span>
    : <NeutralChip icon={icon}>{text}</NeutralChip>
  if (origin.url) {
    return withTip(
      <a href={origin.url} target="_blank" rel="noopener noreferrer" data-origin={origin.kind}
        aria-label={t('Opens the source {text}', { text })} className={`mt-0.5 shrink-0 ${LINK}`}
        // Activating the chip opens the source only: the row neither opens nor starts a drag.
        onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        {face}
      </a>,
    )
  }
  return withTip(
    <span data-origin={origin.kind} className="mt-0.5 inline-flex max-w-40 min-w-0 shrink-0">
      <ReadAs label={t('From {text}', { text })}>{face}</ReadAs>
    </span>,
  )
}

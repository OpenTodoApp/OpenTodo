// The origin chip of a row and a card (OpenSpec change task-origin, design D7;
// task-list-presentation "Metadata language"): an icon for the kind, the
// external id or the URL's host, and the stored page title as a tooltip. With a
// URL it is a link that opens the source in a new tab without the referrer.
// An Obsidian note (obsidian-origin D4, D5) reads as the note's name with a note
// icon and opens the note through the system: in a browser by an ordinary link
// activation, in a native shell through its external-link method. An origin
// with a URL the device will not open (a shell without `obsidian-links`, an
// unsafe decrypted value) is a menu with Copy link instead.
//
// A link cannot live inside the row's open button (interactive content inside
// a button), so the chip sits at the row's trailing edge beside the metadata,
// outside the open control. Detailed rows show it as a neutral chip. Calm rows
// show it quiet, like the counts (faint, muted while the row is hovered or
// holds focus), so it is never one of the full-contrast metadata items the Calm
// budget caps (calm-rows D10, MAX_CALM_ROW_ITEMS).
import { Icon, Menu, MenuItem, NeutralChip, ReadAs, Tooltip } from '../ui'
import type { ReactElement, SyntheticEvent } from 'react'
import { copyText } from '../lib/clipboard'
import { t } from '../lib/i18n'
import { safeUrl } from '../lib/share'
import { shell } from '../lib/shell'
import { obsidianPlace, openOrigin, originIcon, originLabel, originLink } from '../lib/taskOrigin'
import type { Origin } from '../lib/types'
import { act } from './actionError'

/** The text a chip reads as: the id or host, "Email" for a mail (its Message-ID is not a label). */
export function originText(origin: Origin): string {
  return originLabel(origin) || t('Email')
}

/**
 * The tooltip of an origin: "Open in Obsidian: <vault> › <path>" for a valid
 * Obsidian note (obsidian-origin D5), else the stored page title, else nothing.
 */
export function originTip(origin: Origin): string | undefined {
  const place = obsidianPlace(origin)
  return place ? t('Open in Obsidian: {vault} › {path}', place) : origin.title || undefined
}

const QUIET = 'inline-flex max-w-40 min-w-0 items-center gap-1 text-meta text-faint transition-colors duration-(--duration-ui) group-hover:text-muted group-focus-within:text-muted'
const LINK = 'inline-flex max-w-40 min-w-0 rounded-chip outline-none hover:text-default focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-focus'

// Activating the chip acts on the source only: the row neither opens nor starts a drag.
const stop = (e: SyntheticEvent) => e.stopPropagation()

export function OriginChip({ origin, quiet = false }: { origin: Origin; quiet?: boolean }) {
  const text = originText(origin)
  const icon = originIcon(origin)
  // The stored page title or the Obsidian note's place, as a tooltip (never a second line).
  const tip = originTip(origin)
  const withTip = (el: ReactElement<Record<string, unknown>>) => (tip ? <Tooltip label={tip}>{el}</Tooltip> : el)
  const face = quiet
    ? <span className={QUIET}><Icon name={icon} size="xs" /><span className="truncate">{text}</span></span>
    : <NeutralChip icon={icon}>{text}</NeutralChip>
  const label = t('Opens the source {text}', { text })
  const link = originLink(origin)
  if (link?.obsidian) {
    // A same-page link activation: the browser asks before it opens Obsidian and
    // leaves no tab. A shell never navigates its web view to it: it hands it over.
    return withTip(
      <a href={link.href} rel="noreferrer" data-origin={origin.kind} aria-label={label} className={`mt-0.5 shrink-0 ${LINK}`}
        onClick={(e) => { stop(e); if (shell()) { e.preventDefault(); openOrigin(origin) } }} onPointerDown={stop}>
        {face}
      </a>,
    )
  }
  // Decrypted values never passed the server's URL check: only http(s) is a link
  // (attachment-client-hardening D3).
  const href = origin.kind === 'obsidian' ? null : safeUrl(origin.url)
  if (href) {
    return withTip(
      <a href={href} target="_blank" rel="noopener noreferrer" data-origin={origin.kind}
        aria-label={label} className={`mt-0.5 shrink-0 ${LINK}`}
        onClick={stop} onPointerDown={stop}>
        {face}
      </a>,
    )
  }
  const url = origin.url
  if (url) {
    return (
      <span data-origin={origin.kind} className="mt-0.5 inline-flex max-w-40 min-w-0 shrink-0" onClick={stop} onPointerDown={stop}>
        <Menu kind="menu" label={t('From {text}', { text })} trigger={face} triggerClassName={LINK} tip={origin.title || undefined} width="sm:w-48">
          <MenuItem label={t('Copy link')} icon="copy" onSelect={() => act(copyText(url))} data-origin-copy />
        </Menu>
      </span>
    )
  }
  return withTip(
    <span data-origin={origin.kind} className="mt-0.5 inline-flex max-w-40 min-w-0 shrink-0">
      <ReadAs label={t('From {text}', { text })}>{face}</ReadAs>
    </span>,
  )
}

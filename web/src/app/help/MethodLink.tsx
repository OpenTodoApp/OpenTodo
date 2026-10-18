// The reference from a screen to the Open Loops method (OpenSpec change
// open-loops-method, design D8; open-loops "References to the method"): the
// move a screen serves, as a link beside the page title (the subtitle line on
// phones) that opens the method page in the Help panel. Nothing in Lists only.
import type { ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { METHOD_NAME, move as moveOf, termName, type MoveId } from '../../lib/method'
import { methodShown, useMethodMode } from '../../lib/method/mode'
import { openHelp } from '../../lib/helpRequest'

const OVERVIEW = 'overview'

/** Help screen of each move's method page (and the overview); the docs check reads these ids from this object. */
export const METHOD_HELP_SCREENS: Readonly<Record<MoveId | 'overview', string>> = {
  overview: 'method/overview', catch: 'method/catch', clarify: 'method/clarify', place: 'method/place', do: 'method/do', review: 'method/review',
}

/** "Clarify · Open Loops" as a link that opens the method page; the overview when no move is given. */
export function MethodLink({ move }: { move?: MoveId }) {
  const mode = useMethodMode()
  if (!methodShown(mode)) return null
  const label = move ? termName(moveOf(move)) : null
  const page = move ?? OVERVIEW
  const screen = METHOD_HELP_SCREENS[page]
  return (
    <button type="button" data-method-link={page} data-help-screen={screen} aria-haspopup="dialog"
      className="touch-target inline-flex min-w-0 items-center gap-1 truncate rounded-control text-meta text-muted underline decoration-dotted underline-offset-2 hover:text-default"
      onClick={(e) => openHelp(screen, e.currentTarget)}>
      {label && <><span>{label}</span><span aria-hidden="true">·</span></>}
      <span>{METHOD_NAME}</span>
      {/* The visible words start the accessible name (WCAG 2.5.3 Label in Name); the purpose follows for screen readers. */}
      <span className="sr-only">{t(': open the method guide')}</span>
    </button>
  )
}

/**
 * A page header's meta or phone subtitle with the method link after it; in Lists
 * only (or without a move) the existing value itself, so the header is unchanged.
 */
export function useWithMethod(move: MoveId | undefined, existing?: ReactNode): ReactNode {
  const mode = useMethodMode()
  if (!move || !methodShown(mode)) return existing
  if (existing === undefined || existing === null || existing === false || existing === '') return <MethodLink move={move} />
  return <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2">{existing}<span aria-hidden="true">·</span><MethodLink move={move} /></span>
}

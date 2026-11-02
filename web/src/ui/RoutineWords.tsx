// The words of a routine's sentence cards (OpenSpec change routines-editor,
// design D2 and D13): a WordButton is an input of a step read inside its
// sentence ("Create tasks from **the lines** in **Errands**"), its value or an
// accent placeholder, outlined in the danger colour when the check found an
// error there; a DataChip is a step's output used as a value ("the lines").
// Arrow keys move between the word buttons of one card (data-word).
import { forwardRef, type KeyboardEvent, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

export interface WordButtonProps {
  /** The input's name as read ("Project"). */
  label: string
  /** The value as shown; empty shows the placeholder. */
  value?: ReactNode
  /** The value as read ("Errands"); defaults to the shown value when it is text. */
  valueText?: string
  /** The accent placeholder ("choose a project"). */
  placeholder: string
  /** Outlined in the danger colour. */
  error?: boolean
  /** A reference to an earlier step (shown as a chip). */
  chip?: boolean
  onClick: () => void
  /** "change" in "Project: Errands, change". */
  action: string
  /** The picker the word opens (routines-dynamic-data D13): a list of choices or an editor. */
  haspopup?: 'listbox' | 'dialog'
  /** Whether that picker is open. */
  expanded?: boolean
  /**
   * A text value (a comment, a note): it wraps over as many lines as it needs,
   * values inside it shown as chips, instead of being cut to one line
   * (routines-editor-polish). `clamp` keeps a very long one to four lines.
   */
  wrap?: boolean
  clamp?: boolean
}

/** Moves focus to the previous or next word button of the same card. */
export function wordKeys(e: KeyboardEvent<HTMLElement>): void {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const card = e.currentTarget.closest('[data-word-group]')
  if (!card) return
  const words = [...card.querySelectorAll<HTMLElement>('[data-word]')].filter((w) => w.closest('[data-word-group]') === card)
  const i = words.indexOf(e.currentTarget)
  const next = words[i + (e.key === 'ArrowRight' ? 1 : -1)]
  if (next) {
    e.preventDefault()
    next.focus()
  }
}

export const WordButton = forwardRef<HTMLButtonElement, WordButtonProps>(function WordButton(
  { label, value, valueText, placeholder, error, chip, onClick, action, haspopup, expanded, wrap, clamp }, ref,
) {
  const empty = value === undefined || value === null || value === ''
  const read = empty ? placeholder : valueText ?? (typeof value === 'string' ? value : '')
  const asChip = chip && !empty
  const text = wrap && !empty ? `whitespace-pre-wrap break-words text-left${clamp ? ' line-clamp-4' : ''}` : 'truncate'
  return (
    // No minimum width: a short word ("all") reads as a word, not a 44 px box with a gap
    // after it (the touch rule sets one on buttons, unlayered, so it is undone inline). A
    // word is a target inside running text (the WCAG 2.5.8 inline exception, like a link in
    // a sentence): 44 px high on touch screens without opening up the line (-my), as wide
    // as its word.
    <button ref={ref} type="button" data-word={label} data-touch-exempt="inline" onClick={onClick} onKeyDown={wordKeys} style={{ minWidth: 0 }}
      aria-label={`${label}: ${read}, ${action}`} aria-invalid={error || undefined} aria-haspopup={haspopup} aria-expanded={haspopup ? !!expanded : undefined}
      className={`mx-0.5 -my-1.5 inline-flex min-h-11 max-w-full items-center rounded-control align-baseline font-semibold underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-accent sm:my-0 sm:min-h-8 ${
        asChip ? 'px-0' : 'px-1'} ${error ? 'ring-1 ring-danger text-danger' : empty ? 'text-accent' : 'text-strong'} hover:bg-sunken dark:hover:bg-raised`}>
      {asChip ? <DataChip>{value}</DataChip> : <span className={text}>{empty ? placeholder : value}</span>}
    </button>
  )
})

export interface DataChipProps {
  children: ReactNode
  icon?: IconName
  /** Dimmed: a value that needs a conversion first. */
  muted?: boolean
  /** Inside a line of text (a comment with «each task» in it). */
  inline?: boolean
}

/** A step's output used as a value. */
export function DataChip({ children, icon = 'corner-down-right', muted, inline }: DataChipProps) {
  return (
    <span data-chip className={`${inline ? 'mx-px inline-flex align-baseline leading-tight' : 'inline-flex'} max-w-full items-center gap-1 rounded-chip px-1.5 py-0.5 text-meta font-medium no-underline ${muted ? 'bg-sunken text-muted' : 'bg-accent-soft text-on-accent-soft'}`}>
      <Icon name={icon} size="xs" />
      <span className="truncate">{children}</span>
    </span>
  )
}

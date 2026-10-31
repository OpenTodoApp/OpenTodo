// The Formatting toggle on a computer (OpenSpec change notes-toolbar-desktop, D1):
// one button beside notes and in the comment composer that shows or hides the
// editor's formatting row. Its own small module, so the composer's chunk does not
// pull in the editor's.
import { formattingButtonOn } from '../lib/userPrefs'
import { useFormattingRow, type FormattingSurface } from '../lib/formattingRow'
import { t } from '../lib/i18n'
import { useUserPrefsRow } from '../lib/localData'
import { IconButton, useMediaQuery } from '../ui'

/**
 * Whether the surface offers the toggle (an editable field on a fine pointer while
 * the account's Formatting button is on, D4) and whether its row is open on this
 * device; `open` is false while the toggle is not offered, the remembered state is kept.
 */
export function useFormattingToggle(surface: FormattingSurface, editable: boolean): { offered: boolean; open: boolean; pressed: boolean; set: (on: boolean) => void } {
  const coarse = useMediaQuery('(pointer: coarse)')
  const buttonOn = formattingButtonOn(useUserPrefsRow())
  const [pressed, set] = useFormattingRow(surface)
  const offered = editable && !coarse && buttonOn
  return { offered, open: offered && pressed, pressed, set }
}

export function FormattingToggle({ pressed, onToggle, controls, className, ...data }: {
  pressed: boolean
  onToggle: (next: boolean) => void
  /** The id of the row it shows (aria-controls). */
  controls?: string
  className?: string
} & Record<`data-${string}`, string | undefined>) {
  return (
    <IconButton icon="bold" size="sm" label={t('Formatting')} aria-pressed={pressed} aria-controls={pressed ? controls : undefined}
      className={className ? `formatting-toggle ${className}` : 'formatting-toggle'} onClick={() => onToggle(!pressed)} {...data} />
  )
}

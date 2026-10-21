// A day's planned load in the Day and Week headers and the Month cell (OpenSpec
// change surfaces-v2, design D5): muted text with tabular figures in the interface
// face, the danger pair only when the day is over capacity, which is also said in words.
import { formatLoad, type DayLoad } from '../../lib/calendar'
import { t } from '../../lib/i18n'

export function CapacityLine({ load, dayLength, unestimated = false, focusable = false, sayOver = true }: {
  load: DayLoad
  dayLength: number
  /** Say "over capacity" here; false where the enclosing cell's label already says it (Month). */
  sayOver?: boolean
  /** Show "+N?" for tasks without an estimate (Day and Week headers). */
  unestimated?: boolean
  /** A tab stop for the tooltip around it (Day and Week headers). */
  focusable?: boolean
}) {
  return (
    <span
      data-capacity
      data-over={load.over || undefined}
      tabIndex={focusable ? 0 : undefined}
      className={`whitespace-nowrap rounded-chip px-1 text-hint tabular-nums ${load.over ? 'bg-danger-soft font-semibold text-danger' : 'text-muted'}`}
    >
      {formatLoad(load, dayLength)}
      {load.over && sayOver && <span className="sr-only">{' '}{t('over capacity')}</span>}
      {unestimated && load.unestimated > 0 && <span className="ml-1 text-faint">+{load.unestimated}?</span>}
    </span>
  )
}

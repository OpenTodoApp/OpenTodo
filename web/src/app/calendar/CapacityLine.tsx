// A day's planned load in the Day and Week headers and the Month cell (OpenSpec
// change surfaces-v2, design D5): muted text with tabular figures in the interface
// face, the danger pair only when the tasks alone are over capacity, the warning pair
// when only tasks plus counted meetings are (meeting-aware-capacity D3); both are also
// said in words, never by colour alone.
import type { ComponentPropsWithRef } from 'react'
import { formatLoad, type DayLoad } from '../../lib/calendar'
import { formatMinutes } from '../../lib/duration'
import { t } from '../../lib/i18n'
import type { DayMeetings } from './meetingCapacity'

export function CapacityLine({ load, dayLength, unestimated = false, focusable = false, sayOver = true, className = '', ...rest }: Omit<ComponentPropsWithRef<'span'>, 'children'> & {
  load: DayLoad
  dayLength: number
  /** Say "over capacity" here; false where the enclosing cell's label already says it (Month). */
  sayOver?: boolean
  /** Show "+N?" for tasks without an estimate (Day and Week headers). */
  unestimated?: boolean
  /** A tab stop for the tooltip around it (Day and Week headers). */
  focusable?: boolean
}) {
  const tone = load.overTasks ? 'bg-danger-soft font-semibold text-danger' : load.overWithEvents ? 'bg-warning-soft font-semibold text-on-warning-soft' : 'text-muted'
  // The rest are a Tooltip's handlers, ref and aria-describedby: without them the
  // header's tooltip never opened on hover or focus.
  return (
    <span
      {...rest}
      data-capacity
      data-over={load.overTasks || undefined}
      data-over-meetings={load.overWithEvents || undefined}
      tabIndex={focusable ? 0 : undefined}
      className={`whitespace-nowrap rounded-chip px-1 text-hint tabular-nums ${tone} ${className}`}
    >
      {formatLoad(load, dayLength)}
      {load.over && sayOver && <span className="sr-only">{' '}{capacityState(load)}</span>}
      {unestimated && load.unestimated > 0 && <span className="ml-1 text-faint">+{load.unestimated}?</span>}
    </span>
  )
}

/** The over state in words for an accessible name: "over capacity", "over with meetings", or "". */
export function capacityState(load: DayLoad): string {
  return load.overTasks ? t('over capacity') : load.overWithEvents ? t('over with meetings') : ''
}

/**
 * The capacity tooltip of a Day or Week header. Without counted meetings: "Planned
 * estimates against an 8h day; 2 unestimated (counted as 0)". With them: "4h 15m of
 * tasks, 2h 30m in meetings · 3 tasks without estimate", plus the offline note.
 */
export function capacityTooltip(load: DayLoad, dayLength: number, meetings?: DayMeetings | null): string {
  const lead = load.overTasks ? t('Over capacity.') : load.overWithEvents ? t('Over with meetings.') : ''
  // Projected occurrences are named apart (series-occurrences D5): "45m repeating".
  const repeating = load.projected ? t('{minutes} repeating', { minutes: formatMinutes(load.projected) }) : ''
  if (!meetings) {
    const base = t('Planned estimates against a {minutes} day', { minutes: formatMinutes(dayLength) }) + (load.unestimated ? t('; {n} unestimated (counted as 0)', { n: load.unestimated }) : '')
    return [lead, [base, repeating].filter(Boolean).join(' · ')].filter(Boolean).join(' ')
  }
  const parts = [
    load.tasks ? t('{minutes} of tasks', { minutes: formatMinutes(load.tasks) }) : '',
    load.events ? t('{minutes} in meetings', { minutes: formatMinutes(load.events) }) : '',
    repeating,
  ].filter(Boolean)
  const head = parts.length ? parts.join(', ') : t('Nothing estimated against a {minutes} day', { minutes: formatMinutes(dayLength) })
  const tail = [
    load.unestimated ? t('{n, plural, one {# task} other {# tasks}} without estimate', { n: load.unestimated }) : '',
    meetings.unavailable ? t('Calendars unavailable offline for this day') : '',
  ].filter(Boolean)
  return [lead, [head, ...tail].join(' · ')].filter(Boolean).join(' ')
}

/** The capacity tooltip's note while the calendar's filter hides tasks of the day (calendar-clarity D4); capacity still counts them. */
export function hiddenByFilter(n: number): string {
  return n > 0 ? t('{n, plural, one {# task hidden by the filter} other {# tasks hidden by the filter}}', { n }) : ''
}

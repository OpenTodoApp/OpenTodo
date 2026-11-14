// The Day | Week | Month | Plan | Year switch of the Calendar destination (OpenSpec changes
// ux-overhaul, month-and-timeline-views, planner-view and year-view): one control in each calendar view's
// page header. Switching keeps the anchor date, so Week of 18 November → Month
// opens November and Day from there opens the 18th. Below 768 px it is one button
// with the view's name that opens the five as a menu (phone-calendar-chrome), so it
// shares its row with Previous, Today and Next.
import { useCalendarGo } from './calendar/scope'
import { t, msg, translatedList } from '../lib/i18n'
import { DESKTOP_HEADER_QUERY, Icon, Menu, MenuItem, useMediaQuery } from '../ui'

export type CalendarRangeMode = 'day' | 'week' | 'month' | 'plan' | 'year'

const MODES: { mode: CalendarRangeMode; label: string }[] = translatedList([
  { mode: 'day', label: msg('Day') },
  { mode: 'week', label: msg('Week') },
  { mode: 'month', label: msg('Month') },
  { mode: 'plan', label: msg('Plan') },
  { mode: 'year', label: msg('Year') },
], 'label')

export function CalendarRangeSwitch({ mode, date }: { mode: CalendarRangeMode; date?: string }) {
  // Inside a project's Calendar layout the switch stays in the project page (calendar-clarity D5).
  const go = useCalendarGo()
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  if (!desktop) {
    return (
      <Menu kind="menu" label={t('Calendar range')} namedByContent triggerClassName="ui-btn ui-btn--ghost ui-btn--sm ml-auto" triggerProps={{ 'data-calendar-range': mode }}
        trigger={<><span className="sr-only">{t('Calendar range')} </span>{MODES.find((m) => m.mode === mode)?.label}<Icon name="chevron-down" size="sm" /></>}>
        {MODES.map((m) => <MenuItem key={m.mode} label={m.label} checked={mode === m.mode} radio data-calendar-range-item={m.mode} onSelect={() => go(m.mode, date)} />)}
      </Menu>
    )
  }
  return (
    <span className="flex rounded-control border border-default text-meta" role="group" aria-label={t('Calendar range')}>
      {MODES.map((m, i) => (
        <button key={m.mode} type="button" aria-pressed={mode === m.mode} onClick={() => go(m.mode, date)}
          className={`px-1 py-1 lg:px-2 ${i === 0 ? 'rounded-l-control' : ''} ${i === MODES.length - 1 ? 'rounded-r-control' : ''} ${mode === m.mode ? 'bg-sunken font-medium dark:bg-raised' : 'text-muted'}`}>
          {m.label}
        </button>
      ))}
    </span>
  )
}

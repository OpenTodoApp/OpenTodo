// The "Calendars" menu of the calendar headers (calendar-feeds "Events are read-only and
// can be hidden", "Calendars shown per workspace"): first the device's switch for every
// calendar, in Day, Week, Plan, Month and Year alike (calendar-events-all-views), then one
// row per enabled calendar, checked while it shows in the current workspace
// (calendars-per-workspace). Absent while the user has no calendar. Below 768 px the same
// items are in the page's menu, so the row under the phone bar holds only the range and
// the view (phone-calendar-chrome).
import { useMemo } from 'react'
import { setShowEvents } from '../../lib/calendarFeeds'
import { setCalendarHidden } from '../../lib/calendarVisibility'
import { t } from '../../lib/i18n'
import { useHiddenCalendars } from '../../lib/liveData'
import { currentUserPrefsRow } from '../../lib/localData'
import type { CalendarSubscription } from '../../lib/types'
import { DESKTOP_HEADER_QUERY, hueFor, Icon, Menu, MenuItem, MenuSeparator, useMediaQuery } from '../../ui'
import { act } from '../actionError'

export function CalendarsToggle({ shown, subs, menu = false }: { shown: boolean; subs: readonly CalendarSubscription[]; menu?: boolean }) {
  const desktop = useMediaQuery(DESKTOP_HEADER_QUERY)
  if (subs.length === 0 || desktop === menu) return null
  if (menu) {
    return (
      <>
        <MenuItem label={t('Calendars')} icon="calendar-range" checked={shown} data-calendars-toggle onSelect={() => act(setShowEvents(!shown))} />
        <MenuSeparator />
        <CalendarRows subs={subs} shown={shown} />
      </>
    )
  }
  return (
    <Menu kind="menu" label={t('Calendars')} namedByContent triggerProps={{ 'data-calendars-menu': true }}
      triggerClassName={`ui-btn ui-btn--ghost ui-btn--sm ${shown ? 'bg-sunken dark:bg-raised' : 'text-muted'}`}
      trigger={<><Icon name="calendar-range" size="sm" />{t('Calendars')}</>}>
      <MenuItem label={t('Show calendar events')} checked={shown} keepOpen data-calendars-toggle onSelect={() => act(setShowEvents(!shown))} />
      <MenuSeparator />
      <CalendarRows subs={subs} shown={shown} />
    </Menu>
  )
}

/**
 * One checkable row per enabled calendar, by name, for the current workspace: unchecked
 * and disabled while the device switch is off, and disabled until the workspace and its hides are known.
 */
function CalendarRows({ subs, shown }: { subs: readonly CalendarSubscription[]; shown: boolean }) {
  const { workspace, hidden } = useHiddenCalendars()
  const rows = useMemo(() => subs.filter((s) => s.enabled).sort((a, b) => a.name.localeCompare(b.name)), [subs])
  const toggle = (id: string) => {
    if (hidden) act(setCalendarHidden(currentUserPrefsRow(), { workspace, calendars: subs.map((s) => s.id) }, id, !hidden.has(id)))
  }
  return rows.map((s) => (
    <MenuItem key={s.id} label={s.name} checked={shown && !!hidden && !hidden.has(s.id)} disabled={!shown || !workspace || !hidden} keepOpen data-calendar-row={s.id} onSelect={() => toggle(s.id)}
      marker={<span className="block h-2.5 w-2.5 rounded-full bg-hue-solid" data-hue={hueFor(s.color)} aria-hidden />} />
  ))
}

// The menu of a list's page (OpenSpec change phone-lists, design D3): the list's own
// items (the briefing, calendar events, the parts of the day, the Today limit, Replan,
// Away, Brief me, Upcoming's Start with Today and projections, tasks assigned to
// others), the Inbox's and a label's own menu, and Print. The desktop header and the
// phone list both build their menu here, so an item added to a list is in both.
import { type ReactNode } from 'react'
import { t } from '../../lib/i18n'
import { useMemberships, useUserPrefsRow } from '../../lib/localData'
import { briefingHidden, othersTasksShown, setBriefingShown, setOthersTasksShown, setTodayEventsShown, setUpcomingEventsShown, setUpcomingStartsWithToday, upcomingStartsWithToday } from '../../lib/userPrefs'
import { useMe } from '../../lib/sharing'
import type { Label } from '../../lib/types'
import { MenuGroup, MenuItem, MenuSeparator } from '../../ui'
import { openAssistantWith, useAssistantStatus } from '../../lib/assistantStatus'
import { act } from '../actionError'
import { AwayMenuItems } from '../away/AwayMenu'
import { LabelMenu } from '../LabelsView'
import { type PhoneItem, PhoneMenuItems, phoneGroups } from './ListChrome'
import { ProjectionsMenuItem } from '../calendar/projectionSwitches'
import type { ListRoute } from './useListModel'
import { InboxMenu } from '../SampleNotice'
import { canPrint, PrintMenuItem } from '../menus/printItem'
import { ClosedListMenuItems } from './ClosedListActions'
import { ReplanTodayItem } from '../calendar/ReplanMenuItem'
import { closedListOffered } from '../../lib/closedListPrefs'
import { dayPartsOn, setDayParts } from '../../lib/dayParts'
import { readMethodMode } from '../../lib/method/mode'

export function useListMenu(route: ListRoute, { items, label, agenda, upcomingEvents }: {
  /** The header's actions that do not fit a phone's bar (usePhoneListActions); empty on a desktop. */
  items: PhoneItem[]
  label?: Label
  /** Today's calendar events option (today-agenda D2): undefined when not offered, else whether it is on. */
  agenda?: boolean
  /** Upcoming's calendar events option: undefined when not offered, else whether it is on. */
  upcomingEvents?: boolean
}): { menu: ReactNode; overflow: ReactNode } {
  // The briefing under a day page's title (OpenSpec change briefing), unless the account hid it (briefing-links D4).
  const day = route.view === 'today' || route.view === 'upcoming'
  const hidden = briefingHidden(useUserPrefsRow())
  const menu = route.view === 'label' && label ? <LabelMenu label={label} extra={phoneGroups(items)} />
    : route.view === 'inbox' ? <InboxMenu extra={items.length > 0 ? <PhoneMenuItems items={items} /> : undefined} /> : undefined
  const toggle = day && (
    <MenuItem icon={hidden ? 'eye' : 'eye-off'} label={hidden ? t('Show briefing') : t('Hide briefing')} data-briefing-toggle
      onSelect={() => act(setBriefingShown(hidden))} />
  )
  // Day parts (day-parts D4): offered here in the method modes; Settings has it in every mode.
  const prefs = useUserPrefsRow()
  const mode = readMethodMode(prefs)
  const partsOn = dayPartsOn(prefs)
  const partsItem = route.view === 'today' && mode !== 'lists' && (
    <MenuItem icon="sun" label={partsOn ? t('Stop grouping by part of the day') : t('Group by part of the day')} data-day-parts-toggle
      onSelect={() => act(setDayParts(!partsOn))} />
  )
  // The closed list (today-closed-list D5): in the method modes, or once a limit is set.
  const closedItems = route.view === 'today' && closedListOffered(prefs) && <ClosedListMenuItems prefs={prefs} />
  // Start with Today (upcoming-start-with-today D1): Today's own groups lead Upcoming; synced per account.
  const withToday = upcomingStartsWithToday(prefs)
  const startItem = route.view === 'upcoming' && (
    <MenuItem icon="sun" label={t('Start with Today')} checked={withToday} description={t('Show Today’s tasks before Tomorrow')} data-upcoming-today-toggle
      onSelect={() => act(setUpcomingStartsWithToday(!withToday))} />
  )
  const agendaItem = agenda !== undefined && (
    <MenuItem icon="calendar-range" label={agenda ? t('Hide calendar events') : t('Show calendar events')} data-today-events-toggle
      onSelect={() => act(setTodayEventsShown(!agenda))} />
  )
  const upcomingItem = upcomingEvents !== undefined && (
    <MenuItem icon="calendar-range" label={upcomingEvents ? t('Hide calendar events') : t('Show calendar events')} data-upcoming-events-toggle
      onSelect={() => act(setUpcomingEventsShown(!upcomingEvents))} />
  )
  // Show tasks assigned to others (others-tasks-toggle D3): the personal lists, in a shared workspace; checked while on.
  const me = useMe()
  const shared = useMemberships().some((ms) => (ms.members ?? []).some((u) => !!me && !!u.userId && u.userId !== me))
  const othersShown = othersTasksShown(prefs)
  const othersItem = shared && (day || route.view === 'anytime' || route.view === 'someday') && (
    <MenuItem icon="eye" label={t('Show tasks assigned to others')} checked={othersShown} data-others-tasks-toggle
      onSelect={() => act(setOthersTasksShown(!othersShown))} />
  )
  // Brief me (assistant-in-context): the brief-today skill, from Today while the assistant is available.
  const assistantAvailable = !!useAssistantStatus()?.available
  const briefItem = route.view === 'today' && assistantAvailable && (
    <MenuGroup label={t('Assistant')}>
      <MenuItem icon="sparkles" label={t('Brief me')} data-assistant-brief onSelect={() => openAssistantWith({ skill: 'brief-today', text: t('Brief me'), send: true })} />
    </MenuGroup>
  )
  const phoneItems = route.view !== 'inbox' && route.view !== 'label' && items.length > 0 ? <PhoneMenuItems items={items} /> : null
  const own = phoneItems || toggle || othersItem ? <>{phoneItems}{phoneItems && (toggle || othersItem) && <MenuSeparator />}{toggle}{othersItem}{startItem}{route.view === 'upcoming' && <ProjectionsMenuItem surface="upcoming" />}{upcomingItem}{agendaItem}{partsItem}{closedItems}{route.view === 'today' && <><ReplanTodayItem /><AwayMenuItems /></>}{briefItem}</> : briefItem || null
  // Print… ends every list's menu (print-lists); the Inbox and a label have their own menu.
  return { menu, overflow: menu || (!own && !canPrint()) ? undefined : <>{own}{own && canPrint() && <MenuSeparator />}<PrintMenuItem /></> }
}

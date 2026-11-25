// The page header of a list that is not a project (OpenSpec changes ux-overhaul and
// phone-lists): its title, lead line, actions and menu, for the desktop list and the
// phone list alike.
import { type ReactNode } from 'react'
import type { Label } from '../../lib/types'
import { hueFor, PageHeader } from '../../ui'
import { AwayHost } from '../away/AwayMenu'
import { BriefingText } from '../Briefing'
import type { Briefing } from '../../lib/briefing'
import type { Route } from '../router'
import { type PhoneItem } from './ListChrome'
import type { ListRoute } from './useListModel'
import { useListMenu } from './ListMenu'

/** The guide section of each list page (user-documentation "Contextual help"); projects use their header's. */
const HELP_SCREENS: Partial<Record<Route['view'], string>> = {
  inbox: 'inbox', today: 'today', upcoming: 'upcoming', anytime: 'anytime', someday: 'someday', completed: 'completed', assigned: 'assigned', label: 'label',
}

/**
 * The page header of a list that is not a project (ux-overhaul, app-shell "Page template";
 * task-list-presentation "Nothing between the header and the list"): title, meta, actions,
 * Help. On a phone the actions are the bar's slots and the rest joins its menu (phone-v2 D1).
 */
export function ListHeader({ route, title, label, meta, subtitle, briefing, actions, phone, agenda, upcomingEvents }: {
  route: ListRoute
  title: string
  label?: Label
  meta: ReactNode
  subtitle: ReactNode
  /** A day page's briefing, read before the list is shown (today-no-shift). */
  briefing: Briefing | null
  actions: ReactNode
  phone: { slots: ReactNode; items: PhoneItem[] } | null
  /** Today's calendar events option (today-agenda D2): undefined when not offered, else whether it is on. */
  agenda?: boolean
  /** Upcoming's calendar events option: undefined when not offered, else whether it is on. */
  upcomingEvents?: boolean
}) {
  const { menu, overflow } = useListMenu(route, { items: phone?.items ?? [], label, agenda, upcomingEvents })
  // Print… ends every list's menu (print-lists); the Inbox and a label have their own menu.
  return (
    <>
      <PageHeader title={title} help={HELP_SCREENS[route.view] ?? 'inbox'} actions={phone ? phone.slots : actions} barActions={!!phone}
        overflow={overflow}
        leading={label && <span className="h-3 w-3 rounded-full bg-hue-solid" data-hue={hueFor(label.color)} />}
        meta={meta} subtitle={subtitle} menu={menu} kind={route.view === 'today' || route.view === 'upcoming' ? 'day' : 'tool'}
        briefing={briefing && <BriefingText briefing={briefing} />} />
      {route.view === 'today' && <AwayHost />}
    </>
  )
}

// When a list may be drawn (ux-fixes-phone, today-no-shift; audit M12): only once
// everything above its rows is read. A page that fills in stages moves what it
// already shows, and on a phone that is a list moving under the finger.
import { useEffect } from 'react'
import type { Briefing } from '../../lib/briefing'
import { useMembership, useUserPrefsRow } from '../../lib/localData'
import { LIST_READY, perfMark } from '../../lib/perfMarks'
import { briefingHidden } from '../../lib/userPrefs'
import { useBriefing } from '../Briefing'
import type { ListRoute } from './useListModel'

/**
 * The briefing a day page shows under its title: null on any other list and when the
 * account hid it, undefined while it (or the preference that hides it) is read.
 */
function useDayBriefing(route: ListRoute): Briefing | null | undefined {
  const prefs = useUserPrefsRow()
  const day = route.view === 'today' || route.view === 'upcoming'
  const briefing = useBriefing(day && !briefingHidden(prefs) ? route.view : null)
  return day && prefs === undefined ? undefined : briefing
}

/**
 * Nothing until the tasks are read, on a project its row and membership (undefined
 * while read, null when not shared), and on a day page its briefing (undefined while
 * read), which is handed back for the header. All of them are local reads asked for in
 * the same render, so the gate adds no round trip.
 */
export function useListReady(route: ListRoute, loaded: boolean, hasProject: boolean): { ready: boolean; briefing: Briefing | null } {
  const membership = useMembership(route.view === 'project' ? route.id : '')
  const briefing = useDayBriefing(route)
  const ready = loaded && briefing !== undefined && (route.view !== 'project' || (hasProject && membership !== undefined))
  useListReadyMark(ready, route)
  return { ready, briefing: briefing ?? null }
}

/** LIST_READY once per list opened, after the rows' first commit (performance-10k D4). */
function useListReadyMark(ready: boolean, route: ListRoute) {
  const key = 'id' in route ? `${route.view}:${route.id}` : route.view
  useEffect(() => { if (ready) perfMark(LIST_READY, { view: route.view }) }, [ready, key]) // eslint-disable-line react-hooks/exhaustive-deps -- the key names the route
}

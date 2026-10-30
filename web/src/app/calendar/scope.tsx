// A project's Calendar layout (OpenSpec change calendar-clarity, design D5): the Day,
// Week, Month and Plan views rendered inside the project page. The scope narrows their
// tasks to the project and its sub-projects (by id, not shown as a chip), keeps their
// navigation inside the page, and lets the page's own header carry the range controls.
import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { navigate } from '../router'
import type { CalendarRangeMode } from '../CalendarRange'

export interface CalendarHeaderParts {
  /** The range: "12 – 18 May", "May 2026". */
  title: string
  /** Previous, Today, Next and the mode switch. */
  actions: ReactNode
  /** The calendar's overflow items (Plan from a list, Frames, Filter, Colour by). */
  overflow: ReactNode
  /** The lead line: the active filter, the status. */
  meta?: ReactNode
}

export interface CalendarScope {
  projectId: string
  /** The project and its sub-projects. */
  projectIds: ReadonlySet<string>
  /** Goes to a mode and an anchor date inside the project page. */
  go: (mode: CalendarRangeMode, date?: string) => void
  /** The project page's header, with the calendar's parts in it. */
  header: (parts: CalendarHeaderParts) => ReactNode
}

const Ctx = createContext<CalendarScope | null>(null)

export function CalendarScopeProvider({ scope, children }: { scope: CalendarScope; children: ReactNode }) {
  return <Ctx.Provider value={scope}>{children}</Ctx.Provider>
}

/** The project scope the calendar is shown in, or null in the Calendar destination. */
export function useCalendarScope(): CalendarScope | null {
  return useContext(Ctx)
}

/** Navigation of a calendar view: the Calendar destination's routes, or the project page's own state. */
export function useCalendarGo(): (mode: CalendarRangeMode, date?: string) => void {
  const scope = useCalendarScope()
  const go = scope?.go
  return useCallback((mode: CalendarRangeMode, date?: string) => {
    if (go) go(mode, date)
    else navigate({ view: mode, date })
  }, [go])
}

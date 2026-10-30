// What Day, Week, Month and Plan share of calendar-clarity: Colour by (D3), the
// calendar's query filter and its chip (D4), the project scope (D5), adding with the
// pointer (D2) and the overflow items that choose them.
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { CALENDAR_COLOR_BY_KEY } from '../../lib/colorBy'
import { t } from '../../lib/i18n'
import type { ProjectRef } from '../../lib/nlp'
import { deadlineMarkers } from '../../lib/calendar'
import type { Project, Task } from '../../lib/types'
import { MenuItem, MenuSeparator, PageHeader } from '../../ui'
import { saveTray } from './planSource'
import { useAddHere, type AddHere } from './addHere'
import { ColorByMenuItems, useColorBy, type ColorByState } from './colorByControls'
import { CALENDAR_FILTER_KEY, FilterQueryChip, QueryFilterHost, useQueryFilter } from './queryFilter'
import { useCalendarScope, type CalendarHeaderParts, type CalendarScope } from './scope'

export interface CalendarChrome {
  color: ColorByState
  scope: CalendarScope | null
  /** True when a task is drawn: inside the scope and kept by the filter. */
  keeps: (task: Task) => boolean
  /** True when a task belongs to the scope (capacity counts these, filtered or not). */
  inScope: (task: Task) => boolean
  /** The active filter's chip, or null. */
  chip: ReactNode
  /** Filter… and Colour by, for the view's overflow menu. */
  overflow: ReactNode
  add: AddHere
  /** The filter dialog and the add dialog and menu. */
  element: ReactNode
  /** Plan from a list: in a project's Calendar layout the planning list opens on the project (D5). */
  plan: (open: boolean, toggle: () => void) => void
}

/** The calendar's page header, or the project page's header in a project's Calendar layout (design D5). */
export function CalendarPageHeader({ chrome, ...parts }: { chrome: Pick<CalendarChrome, 'scope'> } & CalendarHeaderParts) {
  if (chrome.scope) return <>{chrome.scope.header(parts)}</>
  return <PageHeader title={parts.title} help="calendar" meta={parts.meta ?? undefined} actions={parts.actions} overflow={parts.overflow} />
}

/**
 * What a view draws (design D1, D4): the shown tasks the scope and the filter keep, how
 * many open ones the filter hides per day (capacity still counts them), and the
 * deadline markers of the kept tasks among `all` over [from, to].
 */
export function useDrawn(chrome: Pick<CalendarChrome, 'keeps' | 'inScope'>, shown: readonly Task[], all: readonly Task[], projects: readonly Pick<Project, 'id' | 'archived'>[], from: string, to: string) {
  const { keeps, inScope } = chrome
  const drawn = useMemo(() => shown.filter(keeps), [shown, keeps])
  const hidden = useMemo(() => {
    const out = new Map<string, number>()
    for (const tk of shown) if (tk.due && !tk.completed_at && inScope(tk) && !keeps(tk)) out.set(tk.due.date, (out.get(tk.due.date) ?? 0) + 1)
    return out
  }, [shown, inScope, keeps])
  const deadlines = useMemo(() => deadlineMarkers(all.filter(keeps), projects, from, to), [all, keeps, projects, from, to])
  return { drawn, hidden, deadlines }
}

/** `all` are every live task (for `blocked` and friends in the filter). */
export function useCalendarChrome(all: readonly Task[], projects: readonly ProjectRef[]): CalendarChrome {
  const color = useColorBy(CALENDAR_COLOR_BY_KEY)
  const filter = useQueryFilter(CALENDAR_FILTER_KEY, all)
  const scope = useCalendarScope()
  const [open, setOpen] = useState(false)
  const add = useAddHere(projects)
  const ids = scope?.projectIds
  const inScope = useCallback((task: Task) => !ids || (!!task.project_id && ids.has(task.project_id)), [ids])
  const test = filter.test
  const keeps = useCallback((task: Task) => inScope(task) && (!test || test(task)), [inScope, test])
  const chip = filter.query ? <FilterQueryChip query={filter.query} onOpen={() => setOpen(true)} onClear={() => filter.setQuery('')} /> : null
  const overflow = useMemo(() => (
    <>
      <MenuSeparator />
      <MenuItem label={t('Filter…')} icon="filter" description={t('Show only the tasks a query matches')} data-calendar-filter onSelect={() => setOpen(true)} />
      <ColorByMenuItems mode={color.mode} onChange={color.setMode} />
    </>
  ), [color.mode, color.setMode])
  const element = (
    <>
      <QueryFilterHost open={open} filter={filter} title={t('Filter the calendar')} onClose={() => setOpen(false)} />
      {add.element}
    </>
  )
  const projectId = scope?.projectId
  const plan = useCallback((isOpen: boolean, toggle: () => void) => {
    if (!isOpen && projectId) saveTray(`project:${projectId}`)
    toggle()
  }, [projectId])
  return { color, scope, keeps, inScope, chip, overflow, add, element, plan }
}

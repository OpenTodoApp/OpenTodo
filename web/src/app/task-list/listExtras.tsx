// What calendar-clarity adds to the task list page: Colour by on a project's board
// (the card edge and the project menu's choice), Upcoming's query filter (its header
// control and dialog), and a project's Calendar layout, loaded when first shown.
import { useState, type ReactNode } from 'react'
import { BOARD_COLOR_BY_KEY } from '../../lib/colorBy'
import { t } from '../../lib/i18n'
import type { Project, Task } from '../../lib/types'
import type { HueName } from '../../ui'
import { COLOR_BY_LABEL, useColorBy } from '../calendar/colorByControls'
import { QueryFilterHost, type QueryFilter } from '../calendar/queryFilter'
import type { ActionGroup } from '../menus/ActionMenu'
import type { QueryFilterControl } from './ListChrome'
import ProjectCalendar from '../calendar/ProjectCalendar'


export interface ListExtras {
  /** A board card's leading edge, or undefined with Colour by Project. */
  edgeOf?: (task: Task) => HueName
  /** The project menu's Colour by, on a board. */
  boardGroups?: ActionGroup[]
  /** Upcoming's filter control in the header. */
  queryControl: QueryFilterControl | null
  /** Upcoming's filter dialog. */
  queryHost: ReactNode
}

export function useListExtras(board: boolean, filter: QueryFilter | null): ListExtras {
  // One device choice for every board; Project leaves cards as they were.
  const color = useColorBy(BOARD_COLOR_BY_KEY)
  const [open, setOpen] = useState(false)
  const boardGroups: ActionGroup[] | undefined = board ? [{ items: [{ kind: 'submenu', id: 'color-by', label: t('Colour by'), icon: 'palette',
    items: (['project', 'label', 'priority'] as const).map((mode) => ({ kind: 'check' as const, id: `color-by-${mode}`, label: COLOR_BY_LABEL[mode], checked: color.mode === mode, onSelect: () => color.setMode(mode) })) }] }] : undefined
  return {
    edgeOf: board && color.mode !== 'project' ? color.hueOf : undefined,
    boardGroups,
    queryControl: filter ? { query: filter.query, onOpen: () => setOpen(true), onClear: () => filter.setQuery('') } : null,
    queryHost: filter ? <QueryFilterHost open={open} filter={filter} title={t('Filter Upcoming')} onClose={() => setOpen(false)} /> : null,
  }
}

/** A project's Calendar layout in place of its list. */
export function ProjectCalendarLayout(props: { project: Project; userId?: string; layout: ReactNode; onCycle: () => void }) {
  return <ProjectCalendar {...props} />
}

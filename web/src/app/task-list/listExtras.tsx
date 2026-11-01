// What calendar-clarity adds to the task list page: Colour by on a project's board
// (the card edge and the project menu's choice), Upcoming's query filter (its header
// control and dialog), and a project's Calendar layout, loaded when first shown.
import { lazy, Suspense, useState, type ReactNode } from 'react'
import { BOARD_COLOR_BY_KEY } from '../../lib/colorBy'
import { t } from '../../lib/i18n'
import type { Project, Task } from '../../lib/types'
import type { HueName } from '../../ui'
import { COLOR_BY_LABEL, useColorBy } from '../calendar/colorByControls'
import { QueryFilterHost, type QueryFilter } from '../calendar/queryFilter'
import type { ActionGroup } from '../menus/ActionMenu'
import { COMPACT_LAYOUT_QUERY, layoutGroup, type QueryFilterControl } from './ListChrome'
import type { ProjectViewMode } from '../../lib/sections'
import { useMediaQuery } from '../../ui'
import { useProjectPrefsRow } from '../../lib/liveData'
import { mutate } from '../../lib/ops'
import { act } from '../actionError'

// A project's Calendar layout draws CalendarView: its chunk loads with the layout, not the first screen.
const ProjectCalendar = lazy(() => import('../calendar/ProjectCalendar'))


export interface ListExtras {
  /** A board card's leading edge, or undefined with Colour by Project. */
  edgeOf?: (task: Task) => HueName
  /** The project menu's Colour by, on a board. */
  boardGroups?: ActionGroup[]
  /** Upcoming's filter control in the header. */
  queryControl: QueryFilterControl | null
  /** Upcoming's filter dialog. */
  queryHost: ReactNode
  /** The project board's notes preview is on for this user (board-polish D4). */
  cardNotes: boolean
}

/**
 * `layout`: a project's layout and its choice, which join the project menu on mid-size touch screens.
 * `projectId`: the project whose board offers "Show notes on cards" (board-polish D4), personal and synced.
 */
export function useListExtras(board: boolean, filter: QueryFilter | null, layout: { mode: ProjectViewMode; onChoose: (m: ProjectViewMode) => void } | null, projectId: string | null = null): ListExtras {
  const compact = useMediaQuery(COMPACT_LAYOUT_QUERY)
  // One device choice for every board; Project leaves cards as they were.
  const color = useColorBy(BOARD_COLOR_BY_KEY)
  const [open, setOpen] = useState(false)
  // The user's own choice for this project's board, also on a shared project and as a viewer.
  const cardNotes = useProjectPrefsRow(board ? projectId : null)?.card_notes === true
  const boardGroups: ActionGroup[] | undefined = board ? [{ items: [{ kind: 'submenu', id: 'color-by', label: t('Colour by'), icon: 'palette',
    items: (['project', 'label', 'priority'] as const).map((mode) => ({ kind: 'check' as const, id: `color-by-${mode}`, label: COLOR_BY_LABEL[mode], checked: color.mode === mode, onSelect: () => color.setMode(mode) })) },
  ...(projectId ? [{ kind: 'check' as const, id: 'card-notes', label: t('Show notes on cards'), icon: 'text-quote' as const, checked: cardNotes,
    onSelect: () => act(mutate('project_prefs', projectId, { card_notes: !cardNotes })) }] : [])] }] : undefined
  const groups = [...(boardGroups ?? []), ...(compact && layout ? [layoutGroup(layout.mode, layout.onChoose)] : [])]
  return {
    edgeOf: board && color.mode !== 'project' ? color.hueOf : undefined,
    boardGroups: groups.length ? groups : undefined,
    queryControl: filter ? { query: filter.query, onOpen: () => setOpen(true), onClear: () => filter.setQuery('') } : null,
    queryHost: filter ? <QueryFilterHost open={open} filter={filter} title={t('Filter Upcoming')} onClose={() => setOpen(false)} /> : null,
    cardNotes: board && cardNotes,
  }
}

/** A project's Calendar layout in place of its list. */
export function ProjectCalendarLayout(props: { project: Project; userId?: string; layout: ReactNode; onCycle: () => void; onChoose: (m: ProjectViewMode) => void }) {
  return <Suspense fallback={null}><ProjectCalendar {...props} /></Suspense>
}

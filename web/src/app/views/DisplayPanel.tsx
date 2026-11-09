// The display panel of a view (OpenSpec change views-and-display, design D2): how the
// results are shown, never which tasks match. Layout, grouping, order, completed tasks
// and the properties a row shows; the sort direction is folded under "More options".
// Opened from the toolbar's display button; every change applies at once. Project and
// label pages show the same panel with the parts they have (list-display-options D2):
// a part whose value is absent is left out. The panel's content (DisplayOptionsBody)
// loads with the first list that shows the button, after the first screen
// (builtin-view-options: bundle budget).
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { IconButton, Popover } from '../../ui'
import type { FieldDef, GroupBy, RowProperty, SortBy, SortDir, ViewLayout } from '../../lib/types'
import { msg, t, translatedMap } from '../../lib/i18n'
import type { ListGroupBy } from '../../lib/listDisplay'
import type { RowLayout } from '../../lib/rowLayout'
import type { ColorByMode } from '../../lib/colorBy'

const loadBody = () => import('./DisplayOptionsBody')
/** Generic like the component it loads (lazy() drops the type parameter). */
const DisplayOptionsBody = lazy(loadBody) as unknown as <V extends PanelValue>(props: DisplayPanelProps<V>) => ReactNode

export interface ViewDisplay {
  layout: ViewLayout
  groupBy: GroupBy
  sortBy: SortBy
  sortDir: SortDir
  showCompleted: boolean
  hidden: readonly RowProperty[]
  /** The view's own row layout (row-layouts); absent follows the account's. */
  rowLayout?: RowLayout
  /** The Board layout's notes preview (board-polish D4); off by default. */
  cardNotes?: boolean
}

/** What the panel shows: a part without a value (layout, completed tasks, row properties) is left out. */
export interface PanelValue {
  groupBy: ListGroupBy
  sortBy: SortBy
  sortDir: SortDir
  layout?: ViewLayout
  showCompleted?: boolean
  hidden?: readonly RowProperty[]
  /** One line or detailed rows (row-layouts). */
  rowLayout?: RowLayout
  /** Notes on cards, offered only while the layout is Board (board-polish D4). */
  cardNotes?: boolean
  /** Nest subtasks on Today and Upcoming (builtin-view-options D5). */
  subtasks?: boolean
}

export const GROUP_LABEL = translatedMap<ListGroupBy>({ project: msg('Project'), due: msg('Due date'), priority: msg('Priority'), label: msg('Label'), none: msg('None'), section: msg('Section'), day: msg('Time of day') })
export const SORT_LABEL = translatedMap<SortBy>({ due: msg('Due date'), priority: msg('Priority'), position: msg('Manual order'), created: msg('Created'), deadline: msg('Deadline'), title: msg('Title') })
export const LAYOUT_LABEL = translatedMap<ViewLayout>({ list: msg('List'), board: msg('Board') })
export const ROW_LAYOUT_LABEL = translatedMap<RowLayout>({ line: msg('One line'), detailed: msg('Detailed') })
export const PROPERTY_LABEL = translatedMap<RowProperty>({
  date: msg('Date'), project: msg('Project'), labels: msg('Labels'), estimate: msg('Estimate'), assignee: msg('Assignee'),
  deadline: msg('Deadline'), start: msg('Start'), origin: msg('Origin'), energy: msg('Energy'),
})

export interface DisplayPanelProps<V extends PanelValue = ViewDisplay> {
  value: V
  onChange: (patch: Partial<V>) => void
  /** Group by choices, in order; a view's by default. */
  groupOptions?: readonly V['groupBy'][]
  /** Order by choices, in order; a view's by default. */
  sortOptions?: readonly SortBy[]
  /** Live definitions used to offer local-only custom-field sorts. */
  sortFields?: readonly FieldDef[]
  /** A board's Colour by (calendar-clarity "Colour by on boards"): a device choice for every board, not part of the view. */
  colorBy?: { mode: ColorByMode; onChange: (mode: ColorByMode) => void }
  /** Puts every option back (builtin-view-options D7); given only while an option differs from the default. */
  onReset?: () => void
}

/** The toolbar's display button and its panel. */
export function DisplayPanel<V extends PanelValue = ViewDisplay>(props: DisplayPanelProps<V>) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  // Loaded once the button is on screen, so the panel opens at once.
  useEffect(() => { void loadBody() }, [])
  return (
    <>
      <IconButton ref={anchor} icon="sliders-horizontal" size="sm" label={t('Display options')} aria-haspopup="dialog" aria-expanded={open}
        data-display-trigger className={open ? 'bg-selected text-default' : ''} onClick={() => setOpen(!open)} />
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label={t('Display options')} width="sm:w-[22rem]" className="p-0">
        <Suspense fallback={null}><DisplayOptionsBody {...props} /></Suspense>
      </Popover>
    </>
  )
}


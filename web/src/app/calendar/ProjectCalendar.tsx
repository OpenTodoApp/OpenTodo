// A project's Calendar layout (OpenSpec change calendar-clarity, design D5): the
// Calendar in the mode last used (Day, Week, Month or Plan), narrowed to the project
// and its sub-projects, inside the project page. The project header stays, with the
// calendar's range controls among its actions and its options in a menu beside them;
// the range is the page's own state, so moving through weeks never leaves the project.
// Loaded only when a project shows this layout.
import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import { readCalendarMode, type CalendarMode } from '../../lib/calendarMode'
import { t } from '../../lib/i18n'
import { useProjects } from '../../lib/localData'
import { descendants } from '../../lib/tree'
import type { Project } from '../../lib/types'
import { Icon, Menu, useMediaQuery } from '../../ui'
import type { ProjectViewMode } from '../../lib/sections'
import { COMPACT_LAYOUT_QUERY, layoutGroup } from '../task-list/ListChrome'
import { CalendarView } from '../CalendarView'
import { MonthView } from '../MonthView'
import { ProjectHeader } from '../ProjectHeader'
import { useShortcutScope } from '../shortcuts'
import { CalendarScopeProvider, type CalendarHeaderParts, type CalendarScope } from './scope'

const PlanView = lazy(() => import('../PlanView').then((m) => ({ default: m.PlanView })))

export default function ProjectCalendar({ project, userId, layout, onCycle, onChoose }: {
  project: Project
  userId?: string
  /** The project's List / Board / Timeline / Calendar switch. */
  layout: ReactNode
  /** `v`: the next layout. */
  onCycle: () => void
  /** A layout chosen from the project menu (mid-size touch screens, where the switch is hidden). */
  onChoose: (m: ProjectViewMode) => void
}) {
  const compact = useMediaQuery(COMPACT_LAYOUT_QUERY)
  const [range, setRange] = useState<{ mode: CalendarMode; date?: string }>(() => ({ mode: readCalendarMode() }))
  const projects = useProjects()
  const ids = useMemo(() => new Set([project.id, ...descendants(project.id, projects)]), [project.id, projects])
  // `v` cycles the layouts here too: the list's keys are not mounted under this layout.
  useShortcutScope('view', { 'project.view-mode': () => onCycle() }, { view: 'project' })
  const scope = useMemo<CalendarScope>(() => ({
    projectId: project.id,
    projectIds: ids,
    go: (mode, date) => setRange({ mode, date }),
    header: (parts: CalendarHeaderParts) => (
      <ProjectHeader project={project} userId={userId} layout={layout} subtitle={parts.title} lead={parts.meta} extraGroups={compact ? [layoutGroup('calendar', onChoose)] : undefined}
        secondary={<>
          {parts.actions}
          <Menu kind="menu" label={t('Calendar options')} trigger={<Icon name="sliders-horizontal" />} triggerClassName="ui-btn ui-btn--ghost ui-btn--sm touch-target px-2 py-1.5" width="sm:w-64"
            triggerProps={{ 'data-calendar-options': '' }}>
            {parts.overflow}
          </Menu>
        </>} />
    ),
  }), [project, userId, layout, ids, compact, onChoose])
  const { mode, date } = range
  return (
    <CalendarScopeProvider scope={scope}>
      <div data-project-calendar={project.id} className="contents">
        {mode === 'month' ? <MonthView date={date} /> : mode === 'plan' ? <Suspense fallback={null}><PlanView date={date} /></Suspense> : <CalendarView mode={mode} date={date} />}
      </div>
    </CalendarScopeProvider>
  )
}

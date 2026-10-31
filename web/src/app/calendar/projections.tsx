// Projected occurrences in Day, Week, Month and Upcoming (OpenSpec change
// series-occurrences, design D3, D4, D6): the selection of the
// series a view draws (the calendar's scope and filter apply to the series), and the
// read-only item every view draws one with. A projection is never selected, dragged,
// completed or written; activating it opens its series with the projected date named.
import { useCallback, useMemo } from 'react'
import { formatDate, formatTime as formatWallTime } from '../../lib/dates'
import { formatMinutes } from '../../lib/duration'
import { t } from '../../lib/i18n'
import { MAX_PROJECTIONS, projectedOccurrences, type Projection } from '../../lib/occurrences'
import { planSeries } from '../../lib/plan'
import type { Project, Task } from '../../lib/types'
import { Icon, Tooltip, type HueName } from '../../ui'
import { useCalendarProjectionsOn } from './projectionSwitches'
import { setPanelTaskId } from '../panel'

// The switches live apart so the first load carries only them (projectionSwitches.tsx).
export { CALENDAR_PROJECTIONS_KEY, ProjectionsMenuItem, setCalendarProjections, setUpcomingProjections, UPCOMING_PROJECTION_DAYS, UPCOMING_PROJECTIONS_KEY, useCalendarProjectionsOn, useUpcomingProjectionsOn } from './projectionSwitches'

/**
 * The projections a view draws over [from, to]: every open series outside archived
 * projects that `keeps` (the calendar's scope and filter, on the viewed row) keeps;
 * none while `on` is false. `raw` are the stored rows (the walk and the record count
 * read them), `viewed` the same rows in the viewer's zone by id.
 */
export function useProjections({ on, raw, viewed, projects, keeps, today, from, to, zone }: {
  on: boolean
  raw: readonly Task[]
  viewed: ReadonlyMap<string, Task>
  projects: readonly Pick<Project, 'id' | 'archived'>[]
  keeps?: (task: Task) => boolean
  today: string
  from: string
  to: string
  zone?: string
}): Projection[] {
  return useMemo(() => {
    if (!on || from > to) return []
    const series = planSeries(raw, projects).filter((task) => !keeps || keeps(viewed.get(task.id) ?? task))
    return projectedOccurrences(series, raw, today, from, to, zone)
  }, [on, raw, viewed, projects, keeps, today, from, to, zone])
}

/**
 * What Day, Week and Month draw: the projections over [from, to] while the device's
 * calendar switch is on, and the hue of each one, its series' under Colour by.
 */
export function useCalendarProjections(args: Omit<Parameters<typeof useProjections>[0], 'on'> & { hueOf: (task: Task) => HueName }) {
  const on = useCalendarProjectionsOn()
  const projections = useProjections({ ...args, on })
  const { viewed, hueOf } = args
  const hue = useCallback((p: Projection) => { const series = viewed.get(p.seriesId); return series ? hueOf(series) : undefined }, [viewed, hueOf])
  return { projections, hue }
}

/** "Study, repeating, projected, Thursday, October 15 18:00": a projection's accessible name (design D3). */
export function projectionLabel(p: Projection): string {
  const when = [formatDate(p.date, 'full'), p.time ? formatWallTime(p.time) : ''].filter(Boolean).join(' ')
  return [p.title || t('Untitled'), t('repeating, projected'), when, p.estimate_minutes ? formatMinutes(p.estimate_minutes) : ''].filter(Boolean).join(', ')
}

/** The tooltip of a capped series' projections ("Showing the next 31 occurrences"). */
export const cappedNote = (p: Projection): string | undefined => (p.capped ? t('Showing the next {n} occurrences', { n: MAX_PROJECTIONS }) : undefined)

/** Focus is on a projection: the views' "open the selected task" Enter stands back for its own click. */
export function isProjectionTarget(target: EventTarget | null): boolean {
  const el = target as Element | null
  return !!el && typeof el.closest === 'function' && !!el.closest('[data-projected],[data-plan-projected]')
}

/** Open the series of a projection with the projected date named (design D6). */
export function openProjection(p: Projection): void {
  setPanelTaskId(p.seriesId, p.date)
}

/**
 * One projection as a row (a Day/Week lane chip, a Month row, an agenda or Upcoming
 * row) or, with `style`, as a positioned block of the Day and Week grid. A button: Tab
 * reaches it, click, tap or Enter opens the series; no pointer-down handler, so no drag starts.
 */
export function ProjectedItem({ p, hue, variant, style, className = '' }: {
  p: Projection
  hue?: HueName
  variant: 'block' | 'row' | 'large'
  style?: React.CSSProperties
  className?: string
}) {
  const block = variant === 'block'
  const size = variant === 'large' ? 'min-h-11 px-2 py-1 text-body' : block ? 'px-1.5 py-0.5 text-meta' : 'min-h-6 px-1.5 py-0.5 text-meta'
  const note = cappedNote(p)
  const item = (
    <button type="button" data-projected={p.id} data-hue={hue} style={style}
      onClick={() => openProjection(p)}
      className={`ui-block ui-block--projected ${block ? 'absolute z-10 flex flex-col overflow-hidden' : 'ui-block--row flex w-full items-center'} touch-manipulation gap-1 text-left ${size} ${className}`}>
      <span className="sr-only">{projectionLabel(p)}</span>
      <span aria-hidden className={`flex min-w-0 items-center ${variant === 'large' ? 'flex-1 gap-2' : block ? 'gap-1' : 'flex-1 gap-1'}`}>
        {/* The phone agenda's time column, as its task rows have. */}
        {variant === 'large' && <span className="w-14 shrink-0 text-meta tabular-nums">{p.time ? formatWallTime(p.time) : t('all day')}</span>}
        <Icon name="repeat" size="xs" className="shrink-0" />
        {variant === 'row' && p.time && <span className="shrink-0 tabular-nums">{formatWallTime(p.time)}</span>}
        <span className="min-w-0 flex-1 truncate">{p.title || t('Untitled')}</span>
      </span>
      {!block && p.estimate_minutes ? <span aria-hidden className="ml-auto shrink-0 text-hint tabular-nums">{formatMinutes(p.estimate_minutes)}</span> : null}
    </button>
  )
  // A capped series says so (design D2): "Showing the next 31 occurrences".
  return note ? <Tooltip label={note}>{item}</Tooltip> : item
}

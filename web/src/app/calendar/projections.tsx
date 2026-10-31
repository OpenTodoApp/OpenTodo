// Projected occurrences in Day, Week, Month and Upcoming (OpenSpec change
// series-occurrences, design D3, D4, D6): the selection of the
// series a view draws (the calendar's scope and filter apply to the series), and the
// item every view draws one with. A projection is never selected with j and k or
// written by being drawn; activating it opens the occurrence panel for its date.
// Acting on it (series-exceptions D4): its menu (right-click, long press, Shift+F10,
// the menu key) and, for those who may edit the series, a drag that moves this
// occurrence alone. The menu loads on first use.
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { formatDate, formatTime as formatWallTime } from '../../lib/dates'
import { beginDrag, swallowNextClick } from '../../lib/dnd'
import { formatMinutes } from '../../lib/duration'
import { t } from '../../lib/i18n'
import { useMembershipMap } from '../../lib/localData'
import { MAX_PROJECTIONS, projectedOccurrences, type Projection } from '../../lib/occurrences'
import { planSeries } from '../../lib/plan'
import { roleOf } from '../../lib/sharing'
import type { Project, Task } from '../../lib/types'
import { Icon, Tooltip, type HueName } from '../../ui'
import { useCalendarProjectionsOn } from './projectionSwitches'
import { setPanelTaskId } from '../panel'
import { startHold } from './hold'

const OccurrenceMenu = lazy(() => import('./occurrenceMenu'))

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
  const memberships = useMembershipMap()
  return useMemo(() => {
    if (!on || from > to) return []
    const series = planSeries(raw, projects).filter((task) => !keeps || keeps(viewed.get(task.id) ?? task))
    const projectOf = new Map(series.map((s) => [s.id, s.project_id]))
    // Who may act on a projection (series-exceptions D4): an editor of a calendar series.
    return projectedOccurrences(series, raw, today, from, to, zone)
      .map((p) => ({ ...p, actionable: !p.afterCompletion && roleOf(projectOf.get(p.seriesId), memberships) !== 'viewer' }))
  }, [on, raw, viewed, projects, keeps, today, from, to, zone, memberships])
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

/** Open the occurrence panel of a projection: the series on This occurrence for its date (series-exceptions D5). */
export function openProjection(p: Projection): void {
  setPanelTaskId(p.seriesId, p.occurrence)
}

/** Move a projection's occurrence alone to a day (and time), with Undo (series-exceptions D4). */
export function moveProjectionTo(p: Pick<Projection, 'seriesId' | 'occurrence'>, date: string, time?: string | null): Promise<void> {
  return import('./occurrenceMenu').then((m) => m.moveProjection(p, date, time))
}

/** A Day or Week drop of a projection (its drag carries the projection's id): true when it was one. */
export function commitProjectionDrop(id: string, target: { type: string; date?: string; start?: number }, hhmm: (minutes: number) => string): boolean {
  if (!id.startsWith('proj:')) return false
  const occurrence = id.slice(id.lastIndexOf(':') + 1)
  const seriesId = id.slice('proj:'.length, id.lastIndexOf(':'))
  if (target.type === 'slot' && target.date && target.start !== undefined) void moveProjectionTo({ seriesId, occurrence }, target.date, hhmm(target.start))
  else if (target.type === 'lane' && target.date) void moveProjectionTo({ seriesId, occurrence }, target.date, null)
  return true
}

/** A Month or Plan drag of a projection: dropped on a day, the occurrence moves there alone. */
export function dayDrag(p: Projection): (e: React.PointerEvent) => void {
  return (e) => {
    beginDrag(e, { label: p.title || t('Untitled'), onDrop: (key) => { if (key.startsWith('day:') && key.slice(4) !== p.date) void moveProjectionTo(p, key.slice(4)) } })
  }
}

/**
 * A projection's gestures (series-exceptions D4): its menu at a right-click, a long
 * press, Shift+F10 or the menu key; with `onDrag`, a mouse or pen drag for those who
 * may act on it (a finger's press is the long press, so it scrolls or opens the menu).
 */
export function useProjectionMenu(p: Projection, onDrag?: (e: React.PointerEvent) => void) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null)
  const handlers = {
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); setAt({ x: e.clientX, y: e.clientY }) },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (!((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')) return
      e.preventDefault()
      e.stopPropagation()
      const r = e.currentTarget.getBoundingClientRect()
      setAt({ x: r.left, y: r.bottom })
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'touch') {
        startHold(e, (x, y) => {
          // The release that follows is not a tap.
          window.addEventListener('pointerup', () => swallowNextClick(), { capture: true, once: true })
          setAt({ x, y })
        })
        return
      }
      if (onDrag && p.actionable) {
        e.stopPropagation()
        onDrag(e)
      }
    },
  }
  const menu = at ? <Suspense fallback={null}><OccurrenceMenu p={p} x={at.x} y={at.y} onClose={() => setAt(null)} /></Suspense> : null
  return { handlers, menu }
}

/**
 * One projection as a row (a Day/Week lane chip, a Month row, an agenda or Upcoming
 * row) or, with `style`, as a positioned block of the Day and Week grid. A button: Tab
 * reaches it, click, tap or Enter opens the occurrence panel; its menu and, with
 * `onDrag`, a drag act on this occurrence alone (series-exceptions D4).
 */
export function ProjectedItem({ p, hue, variant, style, className = '', onDrag }: {
  p: Projection
  hue?: HueName
  variant: 'block' | 'row' | 'large'
  style?: React.CSSProperties
  className?: string
  onDrag?: (e: React.PointerEvent) => void
}) {
  const { handlers, menu } = useProjectionMenu(p, onDrag)
  const block = variant === 'block'
  const size = variant === 'large' ? 'min-h-11 px-2 py-1 text-body' : block ? 'px-1.5 py-0.5 text-meta' : 'min-h-6 px-1.5 py-0.5 text-meta'
  const note = cappedNote(p)
  const item = (
    <button type="button" data-projected={p.id} data-hue={hue} style={style} aria-haspopup="menu" aria-keyshortcuts="Shift+F10"
      data-projection-movable={onDrag && p.actionable ? '' : undefined}
      onClick={() => openProjection(p)} {...handlers}
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
  return <>{note ? <Tooltip label={note}>{item}</Tooltip> : item}{menu}</>
}

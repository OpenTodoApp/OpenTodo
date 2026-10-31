// The Year view (OpenSpec change year-view): the twelve months of a year as compact
// grids, each day with a density mark from what is planned on it and an over-capacity
// dot, for seeing a year at a glance and going from it to a month or a day. It reads
// local rows only, writes nothing and works offline. One keyboard grid across the
// months (D5); below 640 px a month is the touch target (D6). Loads on first use.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, PageBody, useMediaQuery } from '../ui'
import { calendarTasks } from '../lib/calendar'
import { rememberCalendarMode } from '../lib/calendarMode'
import { addDaysISO, formatDateParts, monthName, viewedTask } from '../lib/dates'
import { t } from '../lib/i18n'
import { useGridPrefs } from '../lib/liveData'
import { NO_TASKS, useLiveTasks } from '../lib/liveTasks'
import { useProjects } from '../lib/localData'
import { addMonthsISO, monthEnd, monthGrid } from '../lib/month'
import { planSeries } from '../lib/plan'
import { slotCapacity, slotsByDate, useSlots } from '../lib/slots'
import { densityStep, yearCounts, type YearDay } from '../lib/yearView'
import { CalendarRangeSwitch } from './CalendarRange'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { CalendarPageHeader, useCalendarChrome } from './calendar/useCalendarChrome'
import { useCalendarProjectionsOn } from './calendar/projectionSwitches'
import { useCalendarGo } from './calendar/scope'
import { focusHeading, pageHeading } from './pageFocus'
import { useShortcutScope } from './shortcuts'
import { useToday, useViewerZone } from './useViews'
import { useResetOnChange } from '../lib/useResetOnChange'

const NO_DAY: YearDay = { count: 0, minutes: 0, titles: [] }
// A step's mark (D3): the chart ramp's fill, a longer bar and a heavier numeral, so no step rests on colour alone.
const STEP_BAR = ['', 'w-1/3 bg-chart-seq-3', 'w-2/3 bg-chart-seq-4', 'w-full bg-chart-seq-5']
const STEP_WEIGHT = ['font-normal', 'font-medium', 'font-semibold', 'font-bold']

/** "4 tasks" and up to three titles, then "+1 more" (the day's tip). */
function tipText(day: YearDay): string[] {
  const rest = day.count - day.titles.length
  return [t('{n, plural, one {# task} other {# tasks}}', { n: day.count }), ...day.titles.map((x) => x || t('Untitled')), ...(rest > 0 ? [t('+{hidden} more', { hidden: rest })] : [])]
}

/** The counts of the shown year: the calendar's selection, the scope and filter, and the projections while they are shown. */
function useYearCounts(year: string, today: string) {
  const zone = useViewerZone()
  const projects = useProjects()
  const rawTasks = useLiveTasks() ?? NO_TASKS
  const viewed = useMemo(() => rawTasks.map((task) => viewedTask(task, zone)), [rawTasks, zone])
  const viewedMap = useMemo(() => new Map(viewed.map((task) => [task.id, task])), [viewed])
  const chrome = useCalendarChrome(viewed, projects, { projections: true, colorBy: false })
  const projectionsOn = useCalendarProjectionsOn()
  const keeps = chrome.keeps
  const from = `${year}-01-01`, to = `${year}-12-31`
  const shown = useMemo(() => calendarTasks(viewed, projects, from, to), [viewed, projects, from, to])
  const series = useMemo(() => (projectionsOn ? planSeries(rawTasks, projects).filter((s) => keeps(viewedMap.get(s.id) ?? s)) : []), [projectionsOn, rawTasks, projects, keeps, viewedMap])
  // Slots count once toward a day's capacity, as in Month (calendar-slots D6).
  const slotRows = useSlots()
  const days = useMemo(() => {
    const out: string[] = []
    for (let d = from; d <= to; d = addDaysISO(d, 1)) out.push(d)
    return out
  }, [from, to])
  const slotViews = useMemo(() => slotsByDate(slotRows, days, viewedMap), [slotRows, days, viewedMap])
  const counts = useMemo(() => yearCounts({ tasks: shown, keeps, series, records: rawTasks, today, from, to, zone }), [shown, keeps, series, rawTasks, today, from, to, zone])
  const extra = useCallback((d: string) => slotCapacity(slotViews.get(d)).extra, [slotViews])
  return { chrome, counts, extra }
}

export default function YearView({ date }: { date?: string }) {
  const today = useToday()
  const anchor = date ?? today
  const year = anchor.slice(0, 4)
  const { resolved } = useDateTimeFormat()
  const prefs = useGridPrefs()
  const narrow = useMediaQuery('(max-width: 39.99rem)')
  useEffect(() => rememberCalendarMode('year'), [])
  const { chrome, counts, extra } = useYearCounts(year, today)

  const [focused, setFocused] = useState(anchor)
  useResetOnChange([anchor], () => setFocused(anchor))
  const go = useCalendarGo()
  const goTo = useCallback((d: string) => go('year', d === today ? undefined : d), [go, today])
  /** Moves the focused day; another year opens that year with the day focused. */
  const focusDay = useCallback((d: string) => {
    setFocused(d)
    if (d.slice(0, 4) !== year) goTo(d)
  }, [year, goTo])
  const openDay = useCallback((d: string) => go('day', d), [go])
  const openMonth = useCallback((m: string) => go('month', focused.slice(0, 7) === m ? focused : `${m}-01`), [go, focused])

  const gridRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ date: string; top: number; left: number } | null>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(hoverTimer.current), [])
  const showTip = useCallback((el: HTMLElement | null, delay: number) => {
    clearTimeout(hoverTimer.current)
    const d = el?.dataset.yearDay
    if (!el || !d) { setTip(null); return }
    const place = () => { const r = el.getBoundingClientRect(); setTip({ date: d, top: r.bottom + 6, left: r.left + r.width / 2 }) }
    if (delay) hoverTimer.current = setTimeout(place, delay)
    else place()
  }, [])

  const ARROWS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  useShortcutScope('view', {
    'year.move': (e) => focusDay(addDaysISO(focused, ARROWS[e.key])),
    'year.month': (e) => focusDay(addMonthsISO(focused, e.key === 'PageUp' ? -1 : 1)),
    'year.edge': (e) => focusDay(e.key === 'Home' ? `${focused.slice(0, 7)}-01` : monthEnd(focused)),
    'year.range-prev': () => goTo(addMonthsISO(focused, -12)),
    'year.range-next': () => goTo(addMonthsISO(focused, 12)),
    'year.today': () => goTo(today),
    // A focused button (a month's name, the header's controls) keeps its own Enter.
    'year.open': (e) => { if ((e.target as Element | null)?.closest?.('button, a')) return false; openDay(focused) },
    'year.escape': () => { setTip(null); const h = pageHeading(document); if (h) focusHeading(h) },
  }, { view: 'year' })

  // The focused day takes the browser focus while the grid has it (roving tabindex), and its tip shows.
  useEffect(() => {
    const g = gridRef.current
    if (!g || !g.contains(document.activeElement)) return
    const el = g.querySelector<HTMLElement>(`[data-year-day="${focused}"]`)
    el?.focus()
    showTip(el, 0)
  }, [focused, showTip])

  const weekdays = monthGrid(`${year}-01-01`, resolved.weekStart)[0].map((d) => formatDateParts(d, { weekday: 'narrow' }))
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const dayOf = (d: string) => counts.get(d) ?? NO_DAY
  const over = (d: string, day: YearDay) => day.minutes + extra(d) > prefs.dayLength
  const tipDay = tip ? dayOf(tip.date) : null

  return (
    <PageBody width="full" className="flex flex-col" data-calendar-page="year">
      <CalendarPageHeader chrome={chrome} title={year} meta={chrome.chip} overflow={chrome.overflow}
        actions={<>
          <span className="flex items-center" role="group" aria-label={t('Range')}>
            <Button variant="ghost" size="sm" icon="chevron-left" aria-label={t('Previous year')} onClick={() => goTo(addMonthsISO(focused, -12))} />
            <Button variant="ghost" size="sm" onClick={() => goTo(today)}>{t('Today')}</Button>
            <Button variant="ghost" size="sm" icon="chevron-right" aria-label={t('Next year')} onClick={() => goTo(addMonthsISO(focused, 12))} />
          </span>
          <CalendarRangeSwitch mode="year" date={focused} />
        </>} />
      <div ref={gridRef} data-year-grid={year} className="@container/year"
        onClick={(e) => { const d = (e.target as Element).closest<HTMLElement>('[data-year-day]')?.dataset.yearDay; if (d) openDay(d) }}
        onPointerOver={(e) => { if (e.pointerType !== 'touch') showTip((e.target as Element).closest<HTMLElement>('[data-year-day]'), 400) }}
        onPointerLeave={() => { clearTimeout(hoverTimer.current); setTip(null) }}
        onFocus={(e) => { const d = (e.target as HTMLElement).dataset.yearDay; if (d) { setFocused(d); showTip(e.target as HTMLElement, 0) } }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTip(null) }}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 @3xl/year:grid-cols-3 @5xl/year:grid-cols-4 @5xl/year:gap-x-6">
          {months.map((m) => {
            const name = monthName(m, 'long')
            const weeks = monthGrid(`${m}-01`, resolved.weekStart)
            const total = weeks.flat().reduce((n, d) => n + (d.slice(0, 7) === m ? dayOf(d).count : 0), 0)
            const cells = (
              <MonthCells weeks={weeks} month={m} today={today} focused={focused} tipped={tip?.date} weekdays={weekdays} interactive={!narrow}
                day={dayOf} over={over} label={name} />
            )
            // On a phone the whole month opens Month (D6): day cells are too small to tap, so the
            // month's name is a button stretched over the month and the cells are only drawn.
            return narrow ? (
              <div key={m} data-year-month={m} className="relative min-w-0 rounded-card p-1 pointer-fine:hover:bg-hover">
                <button type="button" onClick={() => openMonth(m)} data-year-month-link={m}
                  aria-label={[monthName(m, 'long', true), total ? t('{n, plural, one {# task} other {# tasks}}', { n: total }) : ''].filter(Boolean).join(', ')}
                  className="mb-1 block w-full truncate rounded-card text-left text-h3 text-strong after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-solid focus-visible:after:outline-focus">
                  {name}
                </button>
                <div aria-hidden>{cells}</div>
              </div>
            ) : (
              <section key={m} data-year-month={m} className="min-w-0" aria-label={monthName(m, 'long', true)}>
                <button type="button" onClick={() => openMonth(m)} data-year-month-link={m}
                  className="mb-1 inline-flex min-h-6 max-w-full items-center truncate rounded-chip px-1 text-h3 text-strong hover:bg-hover focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus">
                  {name}
                </button>
                {cells}
              </section>
            )
          })}
        </div>
      </div>
      {tip && tipDay && tipDay.count > 0 && !narrow && (
        <div role="tooltip" id="year-day-tip" data-tooltip data-year-tip={tip.date}
          className="overlay-fade-in pointer-events-none fixed z-[70] max-w-64 -translate-x-1/2 rounded-chip border border-strong bg-pop px-2 py-1 text-meta text-default shadow-2"
          style={{ top: tip.top, left: tip.left }}>
          {tipText(tipDay).map((line, i) => <span key={i} className={`block truncate ${i === 0 ? 'font-medium' : ''}`}>{line}</span>)}
        </div>
      )}
      <p className="mt-4 hidden text-meta text-faint sm:block">
        {t.rich('Arrows move the focused day, {pgup} / {pgdn} a month, {open} opens it in Day. Marks count open tasks, repeating occurrences while shown and every day of a multi-day task.', {
          pgup: <span className="ui-kbd">Page Up</span>, pgdn: <span className="ui-kbd">Page Down</span>, open: <span className="ui-kbd">Enter</span>,
        })}
      </p>
      {chrome.element}
    </PageBody>
  )
}

/**
 * One compact month (D3): weekday initials and six weeks of plain day cells, no hooks or
 * state per cell (D7). On a phone the cells are drawn inside the month's button, without
 * grid roles.
 */
function MonthCells({ weeks, month, today, focused, tipped, weekdays, interactive, day, over, label }: {
  weeks: string[][]
  month: string
  today: string
  focused: string
  /** The day whose tip is open. */
  tipped?: string
  weekdays: string[]
  interactive: boolean
  day: (d: string) => YearDay
  over: (d: string, day: YearDay) => boolean
  label: string
}) {
  const g = interactive
  return (
    <div role={g ? 'grid' : undefined} aria-label={g ? t('{title} calendar', { title: label }) : undefined} aria-readonly={g ? true : undefined} className="w-full select-none" data-year-cells={month}>
      <div role={g ? 'row' : undefined} className="grid grid-cols-7">
        {weekdays.map((w, i) => <div key={i} role={g ? 'columnheader' : undefined} className="text-center text-hint text-faint">{w}</div>)}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} role={g ? 'row' : undefined} className="grid grid-cols-7">
          {week.map((d) => {
            if (d.slice(0, 7) !== month) return <div key={d} role={g ? 'gridcell' : undefined} className="min-h-6" />
            const x = day(d)
            const step = densityStep(x.count)
            const isOver = over(d, x)
            const isFocused = g && d === focused
            const name = [formatDateParts(d, { day: 'numeric', month: 'long' }), x.count ? t('{n, plural, one {# task} other {# tasks}}', { n: x.count }) : '', isOver ? t('over capacity') : ''].filter(Boolean).join(', ')
            return (
              <div key={d} role={g ? 'gridcell' : undefined} tabIndex={g ? (isFocused ? 0 : -1) : undefined} data-year-day={g ? d : undefined} data-density={step}
                aria-selected={g ? isFocused : undefined} aria-current={d === today ? 'date' : undefined} aria-describedby={g && d === tipped && x.count > 0 ? 'year-day-tip' : undefined}
                {...(isOver ? { 'data-over': '' } : {})}
                className={`relative flex min-h-6 min-w-0 flex-col items-center justify-center rounded-chip py-0.5 outline-none ${g ? 'cursor-pointer pointer-fine:hover:bg-hover focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-[-2px] focus-visible:outline-focus' : ''} ${isFocused ? 'bg-accent-soft/40' : ''}`}>
                <span className="sr-only">{name}</span>
                <span aria-hidden className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-0.5 text-hint tabular-nums ${STEP_WEIGHT[step]} ${d === today ? 'bg-accent text-on-accent' : d < today ? 'text-faint' : 'text-default'}`}>{Number(d.slice(8))}</span>
                <span aria-hidden className="flex h-1 w-4/5 justify-center">{step > 0 && <span data-density-mark className={`h-1 rounded-full ${STEP_BAR[step]}`} />}</span>
                {isOver && <span aria-hidden data-over-mark className="absolute end-0.5 top-0.5 size-1.5 rounded-full bg-danger" />}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

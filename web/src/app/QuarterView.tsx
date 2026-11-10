// The Quarter view (OpenSpec change quarter-view-and-plan-spans): the three months of
// the anchor's calendar quarter as compact density grids, the horizon between Month
// and Year. It shares the Year's month cell, density counts and keyboard grid, reads
// local rows only, writes nothing and works offline. Loads on first use.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, PageBody, useMediaQuery } from '../ui'
import { useOnline } from '../lib/online'
import { CalendarsToggle } from './calendar/CalendarsToggle'
import { CalendarStatus } from './calendar/CalendarStatus'
import { rememberCalendarMode } from '../lib/calendarMode'
import { addDaysISO, formatDateParts, monthName } from '../lib/dates'
import { t } from '../lib/i18n'
import { useGridPrefs } from '../lib/liveData'
import { addMonthsISO, monthEnd, monthGrid } from '../lib/month'
import type { YearDay } from '../lib/yearView'
import { quarterOf } from '../lib/quarter'
import { MonthCells, tipText } from './calendar/MonthDensityCells'
import { useRangeCounts, useRangeEvents } from './calendar/useRangeDensity'
import { CalendarRangeSwitch } from './CalendarRange'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { CalendarPageHeader } from './calendar/useCalendarChrome'
import { useCalendarGo } from './calendar/scope'
import { focusHeading, pageHeading } from './pageFocus'
import { useShortcutScope } from './shortcuts'
import { useToday } from './useViews'
import { useResetOnChange } from '../lib/useResetOnChange'

const NO_DAY: YearDay = { count: 0, minutes: 0, titles: [] }

export default function QuarterView({ date }: { date?: string }) {
  const today = useToday()
  const anchor = date ?? today
  const quarter = useMemo(() => quarterOf(anchor), [anchor])
  const title = t('Q{n} {year}', { n: quarter.n, year: quarter.year })
  const { resolved } = useDateTimeFormat()
  const prefs = useGridPrefs()
  const narrow = useMediaQuery('(max-width: 39.99rem)')
  useEffect(() => rememberCalendarMode('quarter'), [])
  const { chrome, counts, extra } = useRangeCounts(quarter.from, quarter.to, today)
  const { feeds, counts: eventCounts } = useRangeEvents(quarter.from, quarter.to)
  const online = useOnline()

  const [focused, setFocused] = useState(anchor)
  useResetOnChange([anchor], () => setFocused(anchor))
  const go = useCalendarGo()
  const goTo = useCallback((d: string) => go('quarter', d === today ? undefined : d), [go, today])
  /** Moves the focused day; a day outside the quarter opens the quarter that holds it. */
  const focusDay = useCallback((d: string) => {
    setFocused(d)
    if (!quarter.months.includes(d.slice(0, 7))) goTo(d)
  }, [quarter, goTo])
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
    'quarter.move': (e) => focusDay(addDaysISO(focused, ARROWS[e.key])),
    'quarter.month': (e) => focusDay(addMonthsISO(focused, e.key === 'PageUp' ? -1 : 1)),
    'quarter.edge': (e) => focusDay(e.key === 'Home' ? `${focused.slice(0, 7)}-01` : monthEnd(focused)),
    'quarter.range-prev': () => goTo(addMonthsISO(focused, -3)),
    'quarter.range-next': () => goTo(addMonthsISO(focused, 3)),
    'quarter.today': () => goTo(today),
    // A focused button (a month's name, the header's controls) keeps its own Enter.
    'quarter.open': (e) => { if ((e.target as Element | null)?.closest?.('button, a')) return false; openDay(focused) },
    'quarter.escape': () => { setTip(null); const h = pageHeading(document); if (h) focusHeading(h) },
  }, { view: 'quarter' })

  // The focused day takes the browser focus while the grid has it (roving tabindex), and its tip shows.
  useEffect(() => {
    const g = gridRef.current
    if (!g || !g.contains(document.activeElement)) return
    const el = g.querySelector<HTMLElement>(`[data-year-day="${focused}"]`)
    el?.focus()
    showTip(el, 0)
  }, [focused, showTip])

  const weekdays = monthGrid(`${quarter.months[0]}-01`, resolved.weekStart)[0].map((d) => formatDateParts(d, { weekday: 'narrow' }))
  const dayOf = (d: string) => counts.get(d) ?? NO_DAY
  const over = (d: string, day: YearDay) => day.minutes + extra(d) > prefs.dayLength
  const tipDay = tip ? dayOf(tip.date) : null
  const eventsOf = (d: string) => eventCounts.get(d) ?? 0
  const tipEvents = tip ? eventsOf(tip.date) : 0
  const status = <CalendarStatus status={feeds.status} online={online} fetchedAt={feeds.win?.fetchedAt} />
  const meta = chrome.chip ? <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-2">{chrome.chip}{status}</span> : status

  return (
    <PageBody width="full" className="flex flex-col" data-calendar-page="quarter">
      <CalendarPageHeader chrome={chrome} title={title} meta={meta} overflow={chrome.overflow}
        actions={<>
          <CalendarsToggle shown={feeds.eventsShown} count={feeds.subs.length} />
          <span className="flex items-center" role="group" aria-label={t('Range')}>
            <Button variant="ghost" size="sm" icon="chevron-left" aria-label={t('Previous quarter')} onClick={() => goTo(addMonthsISO(focused, -3))} />
            <Button variant="ghost" size="sm" onClick={() => goTo(today)}>{t('Today')}</Button>
            <Button variant="ghost" size="sm" icon="chevron-right" aria-label={t('Next quarter')} onClick={() => goTo(addMonthsISO(focused, 3))} />
          </span>
          <CalendarRangeSwitch mode="quarter" date={focused} />
        </>} />
      <div ref={gridRef} data-quarter-grid={title} className="@container/quarter"
        onClick={(e) => { const d = (e.target as Element).closest<HTMLElement>('[data-year-day]')?.dataset.yearDay; if (d) openDay(d) }}
        onPointerOver={(e) => { if (e.pointerType !== 'touch') showTip((e.target as Element).closest<HTMLElement>('[data-year-day]'), 400) }}
        onPointerLeave={() => { clearTimeout(hoverTimer.current); setTip(null) }}
        onFocus={(e) => { const d = (e.target as HTMLElement).dataset.yearDay; if (d) { setFocused(d); showTip(e.target as HTMLElement, 0) } }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setTip(null) }}>
        <div className="grid grid-cols-1 gap-x-4 gap-y-5 @3xl/quarter:grid-cols-3">
          {quarter.months.map((m) => {
            const name = monthName(m, 'long')
            const weeks = monthGrid(`${m}-01`, resolved.weekStart)
            const total = weeks.flat().reduce((n, d) => n + (d.slice(0, 7) === m ? dayOf(d).count : 0), 0)
            const eventDays = weeks.flat().reduce((n, d) => n + (d.slice(0, 7) === m && eventsOf(d) > 0 ? 1 : 0), 0)
            const cells = (
              <MonthCells weeks={weeks} month={m} today={today} focused={focused} tipped={tip?.date} weekdays={weekdays} interactive={!narrow}
                day={dayOf} events={eventsOf} over={over} label={name} tipId="quarter-day-tip" />
            )
            // On a phone the whole month opens Month: day cells are too small to tap.
            return narrow ? (
              <div key={m} data-year-month={m} className="relative min-w-0 rounded-card p-1 pointer-fine:hover:bg-hover">
                <button type="button" onClick={() => openMonth(m)} data-year-month-link={m}
                  aria-label={[monthName(m, 'long', true), total ? t('{n, plural, one {# task} other {# tasks}}', { n: total }) : '', eventDays ? t('{n, plural, one {# day with events} other {# days with events}}', { n: eventDays }) : ''].filter(Boolean).join(', ')}
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
      {tip && tipDay && (tipDay.count > 0 || tipEvents > 0) && !narrow && (
        <div role="tooltip" id="quarter-day-tip" data-tooltip data-quarter-tip={tip.date}
          className="overlay-fade-in pointer-events-none fixed z-[70] max-w-64 -translate-x-1/2 rounded-chip border border-strong bg-pop px-2 py-1 text-meta text-default shadow-2"
          style={{ top: tip.top, left: tip.left }}>
          {tipText(tipDay, tipEvents).map((line, i) => <span key={i} className={`block truncate ${i === 0 ? 'font-medium' : ''}`}>{line}</span>)}
        </div>
      )}
      <p className="mt-4 hidden text-meta text-faint sm:block">
        {t.rich('Arrows move the focused day, {pgup} / {pgdn} a month, {open} opens it in Day. Marks count open tasks, repeating occurrences while shown and every day of a multi-day task.', {
          pgup: <span className="ui-kbd">Page Up</span>, pgdn: <span className="ui-kbd">Page Down</span>, open: <span className="ui-kbd">Enter</span>,
        })}
        {feeds.visibleEvents.length > 0 ? ` ${t('A small ring marks a day with calendar events.')}` : ''}
      </p>
      {chrome.element}
    </PageBody>
  )
}

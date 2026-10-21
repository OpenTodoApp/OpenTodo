// Dashboard charts (OpenSpec change stats-dashboard, design D1, D2, D6): hand-made
// SVG and HTML on the design tokens, no chart library. Every chart is a figure with
// the question it answers as its heading, a one-sentence summary as the drawing's
// accessible name, a "Show as table" control with the same values (always shown
// under forced colours), and one roving-tabindex grid of its marks: the arrow keys
// move, and the focused mark shows the tooltip a pointer gets. Marks wear the chart
// tokens; every text wears text tokens.
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Icon, type IconName } from '../../ui'
import { t } from '../../lib/i18n'

// ---------------------------------------------------------------- figure

export interface TableData {
  head: string[]
  rows: string[][]
}

/** The frame every chart shares: question, summary, drawing, "Show as table". */
export function ChartFigure({ title, summary, table, children, note, wide, testId }: {
  title: string
  summary: string
  table: TableData
  children: ReactNode
  /** One quiet line under the heading ("based on this device's history"). */
  note?: string
  wide?: boolean
  testId?: string
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <figure className={`min-w-0 rounded-card border border-default bg-surface p-4 ${wide ? 'lg:col-span-2' : ''}`} data-panel={testId} aria-labelledby={`${id}-h`}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 id={`${id}-h`} className="text-body font-semibold text-default">{title}</h2>
        {note && <p className="text-meta text-muted">{note}</p>}
        <button type="button" className="ml-auto touch-target rounded-control px-2 py-1 text-meta text-muted hover:text-default focus-visible:outline-2 focus-visible:outline-focus"
          aria-expanded={open} aria-controls={`${id}-t`} onClick={() => setOpen(!open)} data-show-table>
          {open ? t('Hide table') : t('Show as table')}
        </button>
      </div>
      <div data-chart-summary={summary}>{children}</div>
      <div id={`${id}-t`} className={`${open ? 'block' : 'hidden'} mt-3 max-w-full overflow-x-auto forced-colors:block`} data-scroll-x data-chart-table>
        <table className="w-full border-collapse text-meta tabular-nums">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>{table.head.map((h, i) => <th key={i} scope="col" className="border-b border-default px-2 py-1 text-left font-medium text-muted">{h}</th>)}</tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => (j === 0
                ? <th key={j} scope="row" className="px-2 py-1 text-left font-normal text-default">{c}</th>
                : <td key={j} className="px-2 py-1 text-default">{c}</td>))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  )
}

/** A panel with nothing to show for the period: one line saying what it needs. */
export function EmptyPanel({ title, children, wide, testId }: { title: string; children: ReactNode; wide?: boolean; testId?: string }) {
  return (
    <section className={`rounded-card border border-dashed border-input px-4 py-3 ${wide ? 'lg:col-span-2' : ''}`} aria-label={title} data-panel={testId} data-empty>
      <h2 className="inline text-body font-semibold text-default">{title}</h2>
      <span className="text-meta text-muted"> · {children}</span>
    </section>
  )
}

// ---------------------------------------------------------------- roving grid and tooltip

interface Cell {
  r: number
  c: number
}

/**
 * One roving-tabindex grid per chart (design D6): one mark is in the tab order,
 * the arrow keys, Home and End move between marks that exist, and the focused or
 * hovered mark's label is the tooltip. A tap shows it too.
 */
export function useChartGrid(rows: number, cols: number, label: (r: number, c: number) => string | null, start?: Cell, byDay = false) {
  const first = useCallback((): Cell => {
    if (start && label(start.r, start.c) !== null) return start
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (label(r, c) !== null) return { r, c }
    return { r: 0, c: 0 }
  }, [rows, cols, label, start])
  const [active, setActive] = useState<Cell>(first)
  const [shown, setShown] = useState<Cell | null>(null)
  const refs = useRef(new Map<string, HTMLElement>())
  const key = (r: number, c: number) => `${r}:${c}`
  // The data changed under the cursor (a new period): keep it on a mark that exists.
  useEffect(() => { if (label(active.r, active.c) === null) setActive(first()) }, [label, active, first])

  const move = (e: KeyboardEvent) => {
    let { r, c } = active
    const step = (dr: number, dc: number) => {
      let nr = r + dr
      let nc = c + dc
      while (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        if (label(nr, nc) !== null) { r = nr; c = nc; return }
        nr += dr
        nc += dc
      }
    }
    // A calendar grid (weeks as columns) reads by day: left and right are the day
    // before and after, up and down the same day of the week before and after.
    const day = (d: number) => {
      let i = c * rows + r + d
      while (i >= 0 && i < rows * cols) {
        if (label(i % rows, Math.floor(i / rows)) !== null) { r = i % rows; c = Math.floor(i / rows); return }
        i += d
      }
    }
    if (byDay && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) day(e.key === 'ArrowRight' ? 1 : -1)
    else if (byDay && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) step(0, e.key === 'ArrowDown' ? 1 : -1)
    else if (e.key === 'ArrowRight') step(0, 1)
    else if (e.key === 'ArrowLeft') step(0, -1)
    else if (e.key === 'ArrowDown') step(1, 0)
    else if (e.key === 'ArrowUp') step(-1, 0)
    else if (e.key === 'Home') { c = 0; while (c < cols - 1 && label(r, c) === null) c++ }
    else if (e.key === 'End') { c = cols - 1; while (c > 0 && label(r, c) === null) c-- }
    else if (e.key === 'Escape') { setShown(null); return }
    else return
    e.preventDefault()
    setActive({ r, c })
    setShown({ r, c })
    refs.current.get(key(r, c))?.focus()
  }

  const cellProps = (r: number, c: number) => {
    const text = label(r, c)
    return {
      ref: (el: HTMLElement | null) => { if (el) refs.current.set(key(r, c), el); else refs.current.delete(key(r, c)) },
      role: 'gridcell',
      tabIndex: active.r === r && active.c === c ? 0 : -1,
      'aria-label': text ?? undefined,
      onFocus: () => { setActive({ r, c }); setShown({ r, c }) },
      onBlur: () => setShown(null),
      onMouseEnter: () => setShown({ r, c }),
      onMouseLeave: () => setShown(null),
      onClick: () => { setActive({ r, c }); setShown({ r, c }) },
    }
  }
  const tooltip = shown ? { text: label(shown.r, shown.c), el: refs.current.get(key(shown.r, shown.c)) ?? null } : null
  return { gridProps: { role: 'grid', onKeyDown: move }, cellProps, tooltip }
}

/** The tooltip over a mark, placed inside the chart's box and kept within it. */
export function ChartTooltip({ tip, box }: { tip: { text: string | null; el: HTMLElement | null } | null; box: React.RefObject<HTMLElement | null> }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const b = box.current
    if (!tip?.el || !b) { setPos(null); return }
    const br = b.getBoundingClientRect()
    const er = tip.el.getBoundingClientRect()
    const w = ref.current?.offsetWidth ?? 0
    const left = Math.max(0, Math.min(br.width - w, er.left - br.left + er.width / 2 - w / 2))
    setPos({ left, top: Math.max(0, er.top - br.top - 30) })
  }, [tip, box])
  if (!tip?.text) return null
  return (
    <div ref={ref} aria-hidden="true" data-chart-tooltip
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-control bg-raised px-2 py-1 text-meta text-default shadow-2"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}>
      {tip.text}
    </div>
  )
}

// ---------------------------------------------------------------- stat tile

export type Direction = 'up' | 'down' | 'same'
const ARROW: Record<Direction, IconName> = { up: 'arrow-up', down: 'arrow-down', same: 'minus' }

/** A headline number: its change in words and an arrow, never a judging colour (D2). */
export function StatTile({ label, value, change, note, testId }: {
  label: string
  value: string
  /** The comparison, already worded ("+12 % vs last month"). */
  change?: { text: string; direction: Direction }
  note?: string
  testId: string
}) {
  return (
    <div className="min-w-0 rounded-card border border-default bg-surface p-3" data-tile={testId}>
      <dt className="text-meta text-muted">{label}</dt>
      <dd className="text-h2 font-semibold text-default" data-tile-value>{value}</dd>
      {change && (
        <dd className="flex items-center gap-1 text-meta text-muted" data-tile-change={change.direction}>
          <Icon name={ARROW[change.direction]} size="xs" />{change.text}
        </dd>
      )}
      {note && <dd className="text-hint text-faint" data-tile-note>{note}</dd>}
    </div>
  )
}

// ---------------------------------------------------------------- line chart

export interface LinePoint {
  /** Axis label, shown sparingly ("Mon", "5 Oct", "Oct"). */
  label: string
  /** The point's full name for the tooltip and the table. */
  name: string
  a: number
  b: number
}

const PLOT_H = 100
/** Two series over time (D2): `a` solid in the chart hue, `b` dashed in the neutral, labelled at the line ends. */
export function LineChart({ points, aName, bName, summary }: { points: readonly LinePoint[]; aName: string; bName: string; summary: string }) {
  const box = useRef<HTMLDivElement>(null)
  const max = Math.max(1, ...points.flatMap((p) => [p.a, p.b]))
  const n = points.length
  // Points sit at the centre of their slice, under their axis label and hover target.
  const x = (i: number) => ((i + 0.5) / n) * 100
  const y = (v: number) => PLOT_H - (v / max) * (PLOT_H - 8) - 2
  const line = (k: 'a' | 'b') => points.map((p, i) => `${x(i)},${y(p[k])}`).join(' ')
  const label = useCallback((_r: number, c: number) => {
    const p = points[c]
    return p ? t('{name}: {a} {aName}, {b} {bName}', { name: p.name, a: p.a, aName: aName.toLowerCase(), b: p.b, bName: bName.toLowerCase() }) : null
  }, [points, aName, bName])
  const start = useMemo(() => ({ r: 0, c: n - 1 }), [n])
  const grid = useChartGrid(1, n, label, start)
  const every = Math.max(1, Math.ceil(n / 7))
  const last = points[n - 1]
  // End labels at their line's height, pulled apart when the lines end close together.
  const ends = (() => {
    if (!last) return { a: 0, b: 0 }
    let a = y(last.a)
    let b = y(last.b)
    const GAP = 14
    if (Math.abs(a - b) < GAP) {
      const mid = (a + b) / 2
      const aUp = a <= b
      a = aUp ? mid - GAP / 2 : mid + GAP / 2
      b = aUp ? mid + GAP / 2 : mid - GAP / 2
      const shift = Math.max(0, Math.max(a, b) - 96) - Math.max(0, 4 - Math.min(a, b))
      a -= shift
      b -= shift
    }
    return { a, b }
  })()
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-meta text-muted" aria-hidden="true" data-legend>
        <li className="flex items-center gap-1.5"><svg width="18" height="6" aria-hidden="true"><line x1="0" x2="18" y1="3" y2="3" className="stroke-chart-base" strokeWidth="2" strokeLinecap="round" /></svg>{aName}</li>
        <li className="flex items-center gap-1.5"><svg width="18" height="6" aria-hidden="true"><line x1="0" x2="18" y1="3" y2="3" className="stroke-(--ot-border-input)" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" /></svg>{bName}</li>
      </ul>
      <div className="flex gap-2">
        <div ref={box} className="relative h-40 min-w-0 flex-1">
          <svg role="img" aria-label={summary} viewBox={`0 0 100 ${PLOT_H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" data-line-chart>
            <line x1="0" x2="100" y1={PLOT_H - 1} y2={PLOT_H - 1} className="stroke-(--ot-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <polyline points={line('b')} fill="none" className="stroke-(--ot-border-input)" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" data-series="b" />
            <polyline points={line('a')} fill="none" className="stroke-chart-base" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" data-series="a" />
          </svg>
          {/* End markers and the focused point, as HTML so they stay round at any width. */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {points.map((p, i) => (i === n - 1 || (grid.tooltip && label(0, i) === grid.tooltip.text)) && (
              <span key={i}>
                <span className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-chart-base ring-2 ring-(--ot-surface)" style={{ left: `${x(i)}%`, top: `${y(p.a)}%` }} />
                <span className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--ot-border-input) ring-2 ring-(--ot-surface)" style={{ left: `${x(i)}%`, top: `${y(p.b)}%` }} />
              </span>
            ))}
          </div>
          <div {...grid.gridProps} role="grid" aria-label={summary} className="absolute inset-0 flex" data-chart-grid>
            <div role="row" className="flex h-full w-full">
              {points.map((_, i) => (
                <div key={i} {...grid.cellProps(0, i)} className="h-full min-w-0 flex-1 cursor-default outline-none focus-visible:bg-sunken/60 focus-visible:outline-2 focus-visible:outline-focus" data-point={i} />
              ))}
            </div>
          </div>
          <ChartTooltip tip={grid.tooltip} box={box} />
        </div>
        {last && (
          <div className="relative w-24 shrink-0 text-meta" aria-hidden="true" data-end-labels>
            <span className="absolute left-0 max-w-full -translate-y-1/2 truncate text-default" style={{ top: `${(ends.a / PLOT_H) * 100}%` }}>{aName} {last.a}</span>
            <span className="absolute left-0 max-w-full -translate-y-1/2 truncate text-muted" style={{ top: `${(ends.b / PLOT_H) * 100}%` }}>{bName} {last.b}</span>
          </div>
        )}
      </div>
      <div className="mt-1 flex text-hint text-muted" aria-hidden="true">
        {points.map((p, i) => <span key={i} className="min-w-0 flex-1 truncate text-center">{i % every === 0 || i === n - 1 ? p.label : ''}</span>)}
        <span className="w-24 shrink-0" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- horizontal bars

export interface HBar {
  label: string
  value: number
  /** The value as shown ("3h", "12"). */
  text: string
}

/** Magnitude by category: one hue, values at the bar tips, labels in text tokens. */
export function HBars({ bars, summary }: { bars: readonly HBar[]; summary: string }) {
  const box = useRef<HTMLDivElement>(null)
  const max = Math.max(1, ...bars.map((b) => b.value))
  const label = useCallback((r: number) => (bars[r] ? `${bars[r].label}: ${bars[r].text}` : null), [bars])
  const grid = useChartGrid(bars.length, 1, label)
  return (
    <div ref={box} className="relative">
      <div {...grid.gridProps} role="grid" aria-label={summary} className="space-y-1.5" data-chart-grid data-hbars>
        {bars.map((b, i) => (
          <div key={i} role="row" className="grid grid-cols-[minmax(0,7rem)_1fr] items-center gap-2">
            <span className="truncate text-meta text-default" aria-hidden="true">{b.label}</span>
            <div {...grid.cellProps(i, 0)} className="flex min-h-6 items-center gap-2 rounded-control outline-none focus-visible:outline-2 focus-visible:outline-focus" data-bar={b.label}>
              <span className="h-3 rounded-r-[4px] bg-chart-base" style={{ width: `${Math.max(2, (b.value / max) * 85)}%` }} aria-hidden="true" />
              <span className="text-meta tabular-nums text-muted" aria-hidden="true">{b.text}</span>
            </div>
          </div>
        ))}
      </div>
      <ChartTooltip tip={grid.tooltip} box={box} />
    </div>
  )
}

// ---------------------------------------------------------------- heatmap

export interface HeatDay {
  date: string
  count: number
  level: number
}

const LEVEL_CLASS = ['bg-chart-seq-1', 'bg-chart-seq-2', 'bg-chart-seq-3', 'bg-chart-seq-4', 'bg-chart-seq-5']

/**
 * Weeks as columns, weekdays as rows, five shades (D4). It scrolls sideways inside
 * the figure on narrow screens, with the current week in view.
 */
export function Heatmap({ weeks, rowLabels, columnLabels, tip, summary }: {
  weeks: readonly (HeatDay | null)[][]
  /** The weekdays, from the first day of the week; shown for every other row. */
  rowLabels: string[]
  /** A month name on the first week of each month, '' elsewhere. */
  columnLabels: string[]
  tip: (d: HeatDay) => string
  summary: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const label = useCallback((r: number, c: number) => { const d = weeks[c]?.[r]; return d ? tip(d) : null }, [weeks, tip])
  const lastCol = weeks.length - 1
  const todayRow = weeks[lastCol]?.reduce((at, d, i) => (d ? i : at), 0) ?? 0
  const start = useMemo(() => ({ r: todayRow, c: lastCol }), [todayRow, lastCol])
  const grid = useChartGrid(7, weeks.length, label, start, true)
  return (
    <div ref={box} className="relative min-w-0">
    {/* A reversed row starts scrolled to its end, so the current week is in view on a
        narrow screen without measuring or scrolling after paint. */}
    <div className="flex max-w-full flex-row-reverse overflow-x-auto pb-1" data-scroll-x data-heatmap>
      <div className="inline-grid shrink-0 grid-cols-[2rem_auto] gap-x-1 [--heat:14px] pointer-coarse:[--heat:24px]">
        <span aria-hidden="true" />
        <div className="grid grid-flow-col auto-cols-(--heat) gap-[2px] pb-1 text-hint text-muted" aria-hidden="true">
          {columnLabels.map((m, i) => <span key={i} className="overflow-visible whitespace-nowrap">{m}</span>)}
        </div>
        <div className="grid grid-rows-7 gap-[2px] text-hint text-muted" aria-hidden="true">
          {rowLabels.map((l, i) => <span key={i} className="h-(--heat) leading-(--heat)">{i % 2 === 0 ? l : ''}</span>)}
        </div>
        <div {...grid.gridProps} role="grid" aria-label={summary} className="grid auto-cols-(--heat) grid-rows-7 gap-[2px]" data-chart-grid>
          {Array.from({ length: 7 }, (_, r) => (
            <div key={r} role="row" className="contents">
              {weeks.map((col, c) => {
                const d = col[r]
                return d
                  ? <div key={c} {...grid.cellProps(r, c)} style={{ gridRow: r + 1, gridColumn: c + 1 }} className={`size-(--heat) rounded-[3px] outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus ${LEVEL_CLASS[d.level]}`} data-day={d.date} data-level={d.level} />
                  : <div key={c} role="gridcell" aria-hidden="true" style={{ gridRow: r + 1, gridColumn: c + 1 }} className="size-(--heat)" />
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
    <ChartTooltip tip={grid.tooltip} box={box} />
    {/* Outside the sideways scroller, so it stays in view. */}
    <div className="mt-2 flex items-center gap-1 text-hint text-muted" aria-hidden="true" data-heat-legend>
      <span>{t('Fewer')}</span>
      {LEVEL_CLASS.map((c, i) => <span key={i} className={`size-3 rounded-[3px] ${c}`} />)}
      <span>{t('More')}</span>
    </div>
    </div>
  )
}

// ---------------------------------------------------------------- dot grid

/** Weekday × hour: dot area encodes the count; empty cells show a faint point (D4). */
export function DotGrid({ counts, max, rowLabels, columnLabels, tip, summary }: {
  counts: readonly number[][]
  max: number
  rowLabels: string[]
  columnLabels: string[]
  tip: (r: number, c: number) => string
  summary: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const label = useCallback((r: number, c: number) => (counts[r]?.[c] === undefined ? null : tip(r, c)), [counts, tip])
  const grid = useChartGrid(counts.length, columnLabels.length, label)
  return (
    <div ref={box} className="relative min-w-0">
    <div className="max-w-full overflow-x-auto" data-scroll-x data-dot-grid>
      <div className="inline-grid grid-cols-[2.5rem_repeat(24,var(--dot))] items-center [--dot:18px] pointer-coarse:[--dot:24px]" aria-hidden="true">
        <span />
        {columnLabels.map((h, i) => <span key={i} className="text-center text-hint text-muted">{i % 6 === 0 ? h : ''}</span>)}
      </div>
      <div {...grid.gridProps} role="grid" aria-label={summary} className="grid" data-chart-grid>
        {counts.map((row, r) => (
          <div key={r} role="row" className="inline-grid grid-cols-[2.5rem_repeat(24,var(--dot))] items-center [--dot:18px] pointer-coarse:[--dot:24px]">
            <span className="text-hint text-muted" aria-hidden="true">{rowLabels[r]}</span>
            {row.map((n, c) => {
              const d = n === 0 ? 3 : 5 + 11 * Math.sqrt(n / Math.max(1, max))
              return (
                <div key={c} {...grid.cellProps(r, c)} className="flex size-(--dot) items-center justify-center rounded-control outline-none focus-visible:outline-2 focus-visible:outline-focus" data-count={n}>
                  <span className={`rounded-full ${n === 0 ? 'bg-(--ot-border)' : 'bg-chart-base'}`} style={{ width: d, height: d }} aria-hidden="true" />
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
      <ChartTooltip tip={grid.tooltip} box={box} />
    </div>
  )
}

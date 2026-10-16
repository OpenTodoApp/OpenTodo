// A small bar chart as inline SVG (OpenSpec change `stats-and-review`, design D2):
// no chart library. Bars use the accent token and the axis the border token, so
// light and dark follow the theme; every value is also printed above its bar, so
// colour never carries meaning alone. The SVG is one image with a summary, and a
// visually hidden table after it carries the same values for screen readers.
import { useId } from 'react'

export interface Bar {
  /** Short axis label ("Mon", "12 Oct", "Work"). */
  label: string
  /** Full name for the table ("Monday 12 October"). */
  name?: string
  value: number
}

// SVG units: the chart stretches to the figure's width; text is HTML over it, so it keeps its size.
const HEIGHT = 100
const AXIS = 16 // room for the labels under the axis
const TOP = 14 // room for the value over the tallest bar

export function Bars({ title, bars, unit = 'completed' }: { title: string; bars: readonly Bar[]; unit?: string }) {
  const id = useId()
  const max = Math.max(1, ...bars.map((b) => b.value))
  const slot = 100 / Math.max(1, bars.length)
  const total = bars.reduce((n, b) => n + b.value, 0)
  const summary = `${title}: ${total} ${unit} in total; ${bars.map((b) => `${b.name ?? b.label} ${b.value}`).join(', ')}`
  const room = HEIGHT - AXIS - TOP
  const heightOf = (v: number) => (v / max) * room
  return (
    <figure className="min-w-0" data-chart={title}>
      <figcaption id={`${id}-cap`} className="mb-2 text-meta font-semibold text-default">{title}</figcaption>
      <div className="relative h-36">
        <svg role="img" aria-label={summary} viewBox={`0 0 100 ${HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" data-bars>
          <line x1="0" x2="100" y1={HEIGHT - AXIS} y2={HEIGHT - AXIS} className="stroke-(--ot-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          {bars.map((b, i) => {
            const h = heightOf(b.value)
            return <rect key={i} x={i * slot + slot * 0.18} y={HEIGHT - AXIS - h} width={slot * 0.64} height={h} className="fill-accent" data-value={b.value} />
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {bars.map((b, i) => (
            <div key={i} className="absolute top-0 bottom-0" style={{ left: `${i * slot}%`, width: `${slot}%` }}>
              <span className="absolute inset-x-0 text-center text-hint tabular-nums text-default" style={{ bottom: `${(AXIS + heightOf(b.value)) / HEIGHT * 100}%` }}>{b.value}</span>
              <span className="absolute inset-x-0 bottom-0 truncate px-0.5 text-center text-hint text-muted" style={{ height: `${AXIS / HEIGHT * 100}%` }}>{b.label}</span>
            </div>
          ))}
        </div>
      </div>
      <table className="sr-only" aria-labelledby={`${id}-cap`}>
        <thead><tr><th scope="col">{title}</th><th scope="col">{unit}</th></tr></thead>
        <tbody>
          {bars.map((b, i) => <tr key={i}><th scope="row">{b.name ?? b.label}</th><td>{b.value}</td></tr>)}
        </tbody>
      </table>
    </figure>
  )
}

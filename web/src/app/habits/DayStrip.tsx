// The day strip of the phone's Habits screen (OpenSpec change habits-complete, design
// D2): the seven days ending on the logical today, each with its weekday, its date
// and a ring filled by the share of that day's habits kept. The chosen day is pressed;
// choosing an earlier one lets the screen fix it.
import { formatDate, weekday } from '../../lib/dates'
import type { DayProgress } from '../../lib/habitDay'
import { t } from '../../lib/i18n'

const R = 17
const C = 2 * Math.PI * R

export function DayStrip({ days, chosen, today, progressOf, onChoose }: {
  /** Seven ISO dates, oldest first, ending on today. */
  days: readonly string[]
  chosen: string
  today: string
  progressOf: (date: string) => DayProgress
  onChoose: (date: string) => void
}) {
  return (
    <div role="group" aria-label={t('Last seven days')} className="-mx-1 mb-3 flex" data-day-strip>
      {days.map((d) => {
        const p = progressOf(d)
        const on = d === chosen
        const share = p.due ? p.kept / p.due : 0
        const name = p.due ? `${formatDate(d, 'full', undefined, today)}, ${t('{kept} of {of}', { kept: p.kept, of: p.due })}` : formatDate(d, 'full', undefined, today)
        return (
          <button key={d} type="button" aria-pressed={on} onClick={() => onChoose(d)} data-strip-day={d} data-chosen={on || undefined}
            className="press-selected flex min-h-14 min-w-11 flex-1 flex-col items-center gap-0.5 rounded-control py-1 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus">
            {/* The name in words; the letters and the number are what it looks like (a name that holds what is seen). */}
            <span className="sr-only">{name}</span>
            <span aria-hidden className={`text-hint ${on ? 'font-semibold text-strong' : 'text-muted'}`}>{weekday(d).slice(0, 2)}</span>
            <span aria-hidden className="relative flex h-10 w-10 items-center justify-center">
              <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden="true">
                <circle cx="20" cy="20" r={R} fill="none" strokeWidth="2.5" className={p.due ? 'stroke-(--border-color-default)' : 'stroke-transparent'} />
                {share > 0 && <circle cx="20" cy="20" r={R} fill="none" strokeWidth="2.5" strokeLinecap="round" className="stroke-accent" strokeDasharray={`${C * share} ${C}`} data-strip-share={share.toFixed(2)} />}
              </svg>
              <span className={`relative flex h-7 w-7 items-center justify-center rounded-full text-meta tabular-nums ${on ? 'bg-accent text-on-accent font-semibold' : d === today ? 'text-accent font-semibold' : 'text-default'}`}>{Number(d.slice(8))}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

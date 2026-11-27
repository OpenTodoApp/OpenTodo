// By weekday on a habit's page (OpenSpec change habits-board, design D4): per weekday
// from the first day of the week, the share of its due days kept in the last 12
// weeks, as a bar in the habit's hue. A list, one entry per weekday, for a screen
// reader; the bars are decoration.
import { useMemo } from 'react'
import { weekdayName } from '../../lib/dates'
import { weekdayRates } from '../../lib/habitDay'
import type { HabitOptions } from '../../lib/habits'
import { t } from '../../lib/i18n'
import type { Task } from '../../lib/types'

export function WeekdayChart({ series, rows, today, opts }: { series: Task; rows: readonly Task[]; today: string; opts?: HabitOptions }) {
  const start = opts?.weekStart ?? 1
  const rates = useMemo(() => weekdayRates(series, rows, today, 12, opts), [series, rows, today, opts])
  const order = Array.from({ length: 7 }, (_, i) => (start + i) % 7)
  return (
    <div className="flex h-full flex-col" data-weekday-chart>
      <h2 className="mb-3 text-meta font-semibold text-default">{t('By weekday')}</h2>
      <ul className="flex min-h-36 flex-1 items-end gap-2">
        {order.map((wd) => {
          const r = rates[wd]
          const share = r.of ? r.kept / r.of : 0
          return (
            <li key={wd} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1" data-weekday={wd} data-share={share.toFixed(2)}>
              <span className="sr-only">{`${weekdayName(wd, 'long')}, ${t('{kept} of {of}', { kept: r.kept, of: r.of })}`}</span>
              <span aria-hidden className="text-hint tabular-nums text-muted">{r.of ? `${Math.round(share * 100)}%` : ''}</span>
              <span aria-hidden className="relative w-full max-w-8 flex-1 overflow-hidden rounded-chip bg-sunken">
                <span className="absolute inset-x-0 bottom-0 rounded-chip bg-hue-solid" style={{ height: `${Math.round(share * 100)}%` }} />
              </span>
              <span aria-hidden className="text-hint text-muted">{weekdayName(wd, 'short').slice(0, 2)}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

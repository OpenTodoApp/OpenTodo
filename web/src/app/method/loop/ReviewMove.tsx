// The Review move in place (loop-guided-dashboard D4): the three rhythms with when
// each was last done and whether it is due, each opening its screen, then Close the
// day (close-the-day D6), a plain link that does not change the next move.
import type { MouseEvent } from 'react'
import { formatInstant } from '../../../lib/dates'
import { t } from '../../../lib/i18n'
import type { RhythmId } from '../../../lib/method'
import { Icon } from '../../../ui'
import { navigate, routePath, type Route } from '../../router'
import type { MoveProps } from '../LoopHome'

const ROUTES: Record<RhythmId, Route> = { daily: { view: 'review', step: 'daily' }, weekly: { view: 'review' }, monthly: { view: 'review', step: 'monthly' } }
const CLOSE_ROUTE: Route = { view: 'review', step: 'close' }

function linkTo(route: Route) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(route)
  }
}

export default function ReviewMove({ data }: MoveProps) {
  return (
    <div data-loop-part="review">
      <ul className="flex flex-col">
        {data.rhythms.map((r) => (
          <li key={r.id} data-loop-rhythm={r.id} data-due={r.due || undefined}>
            <a href={routePath(ROUTES[r.id])} onClick={linkTo(ROUTES[r.id])}
              className="flex min-h-11 items-center gap-3 rounded-card px-2 py-2 outline-none hover:bg-hover focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-focus">
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${r.due ? 'bg-warning' : 'bg-success'}`} />
              <span className="min-w-0 flex-1 text-body text-default">{r.name}{' '}</span>
              <span className={`text-meta tabular-nums ${r.due ? 'font-semibold text-on-warning-soft' : 'text-muted'}`}>{r.when}</span>
              <Icon name="chevron-right" className="shrink-0 text-faint" />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-soft px-2 pt-3 text-meta text-muted">
        {data.closedAt
          ? <span data-loop-day="closed">{t('Day: closed {time}', { time: formatInstant(data.closedAt, 'time') })}</span>
          : <a href={routePath(CLOSE_ROUTE)} onClick={linkTo(CLOSE_ROUTE)} className="inline-flex min-h-6 items-center text-accent underline" data-loop-day="open">{t('Close the day')}</a>}
      </p>
    </div>
  )
}

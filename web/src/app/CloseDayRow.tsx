// The row at the end of Today (OpenSpec change close-the-day, design D6): "Close the
// day", or "Day closed, 18:42" with "Reopen the day" (ux-feedback-2 D2) and "Close
// again" after a close on the logical today. Content below the list, so Today gains
// no row of chrome above its first task.
import { formatInstant } from '../lib/dates'
import { t } from '../lib/i18n'
import { useReviewRow } from '../lib/localData'
import { canReopenDay, dayClosed } from '../lib/review'
import { Button } from '../ui'
import { reopenDayAction } from './reopenDay'
import { navigate } from './router'
import { useToday } from './useViews'

export function CloseDayRow() {
  const review = useReviewRow()
  const today = useToday()
  const closed = dayClosed(review?.closed_at, today)
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-default pt-3" data-close-day={closed ? 'closed' : 'open'}>
      {closed
        ? <p className="text-meta text-muted">{t('Day closed, {time}', { time: formatInstant(review!.closed_at, 'time') })}</p>
        : <span />}
      <span className="flex flex-wrap items-center gap-1">
        {closed && canReopenDay(review, today) && (
          <Button variant="secondary" size="sm" icon="rotate-ccw" onClick={() => reopenDayAction(today)} data-reopen-day>{t('Reopen the day')}</Button>
        )}
        <Button variant="ghost" size="sm" icon="moon" onClick={() => navigate({ view: 'review', step: 'close' })}>{closed ? t('Close again') : t('Close the day')}</Button>
      </span>
    </div>
  )
}

// The row at the end of Today (OpenSpec change close-the-day, design D6): "Close the
// day", or "Day closed, 18:42" with "Close again" after a close on the logical
// today. Content below the list, so Today gains no row of chrome above its first task.
import { formatInstant } from '../lib/dates'
import { t } from '../lib/i18n'
import { useReviewRow } from '../lib/localData'
import { dayClosed } from '../lib/review'
import { Button } from '../ui'
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
      <Button variant="ghost" size="sm" icon="moon" onClick={() => navigate({ view: 'review', step: 'close' })}>{closed ? t('Close again') : t('Close the day')}</Button>
    </div>
  )
}

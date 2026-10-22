// The Daily check offer (OpenSpec change open-loops-method, weekly-review "Rhythm
// markers"): in Open Loops first, the first time the app is opened on a day whose
// Daily check is not done, a toast offers to start it, at most once a day on each
// device (the day it was offered is kept on the device, never synced).
import { useEffect, useState } from 'react'
import { t } from '../../lib/i18n'
import { useReviewRow } from '../../lib/localData'
import { useMethodMode } from '../../lib/method/mode'
import { dailyDue } from '../../lib/review'
import { Button, ToastRegion } from '../../ui'
import { navigate, useRoute } from '../router'
import { useToday } from '../useViews'

export const DAILY_OFFER_KEY = 'ot.daily.offered'

function offeredOn(): string | null {
  try { return localStorage.getItem(DAILY_OFFER_KEY) } catch { return null }
}
function markOffered(day: string): void {
  try { localStorage.setItem(DAILY_OFFER_KEY, day) } catch { /* private mode: offered again next launch */ }
}

export function DailyCheckToast() {
  const mode = useMethodMode()
  const review = useReviewRow()
  const today = useToday()
  const route = useRoute()
  const [shown, setShown] = useState(false)
  const onDaily = route.view === 'review' && route.step === 'daily'
  useEffect(() => {
    // Wait for the review row (undefined while loading), so a done check is never offered again.
    if (mode !== 'first' || review === undefined || onDaily || offeredOn() === today) return
    if (!dailyDue(review?.daily_at, today)) return
    markOffered(today)
    setShown(true)
  }, [mode, review, today, onDaily])
  useEffect(() => { if (onDaily) setShown(false) }, [onDaily])
  if (!shown) return null
  return (
    <ToastRegion label={t('Daily check', { context: 'method' })}>
      <div role="status" data-daily-toast className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-control border border-default bg-surface p-3 shadow-2">
        <p className="min-w-0 flex-1 text-body">{t('Start your daily check: the Inbox, what is open from earlier and today’s focus.')}</p>
        <Button size="sm" variant="primary" onClick={() => { setShown(false); navigate({ view: 'review', step: 'daily' }) }}>{t('Start')}</Button>
        <Button size="sm" variant="ghost" onClick={() => setShown(false)}>{t('Not today')}</Button>
      </div>
    </ToastRegion>
  )
}

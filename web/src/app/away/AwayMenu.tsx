// Away in Today (OpenSpec change away-periods, design D4): the menu item that
// opens the dialog, End now while away, and the title's meta "Away until
// Friday". The dialog loads on first use.
import { lazy, Suspense } from 'react'
import { useAwayOn, type Away } from '../../lib/away'
import { addDaysISO, formatDate, weekday } from '../../lib/dates'
import { t } from '../../lib/i18n'
import { createStore } from '../../lib/store'
import { MenuItem } from '../../ui'
import { act } from '../actionError'
import { useToday } from '../useViews'

const AwayDialog = lazy(() => import('./AwayDialog'))

const requested = createStore('awayDialog', false)

/** Opens the Away dialog (Today's host renders it; the palette navigates to Today first). */
export function requestAway(): void {
  requested.set(true)
}

/** Today's host of the dialog, while requested. */
export function AwayHost() {
  if (!requested.use()) return null
  return <Suspense fallback={null}><AwayDialog onDone={() => requested.set(false)} /></Suspense>
}

/** The day the period ends, as Today's meta names it. */
export function awayUntil(away: Away, today: string): string {
  const day = away.to <= addDaysISO(today, 6) ? weekday(away.to) : formatDate(away.to, 'heading')
  return t('Away until {day}', { day })
}

/** "Away until Friday" while today is in the stored period, else null. */
export function useAwayMeta(today: string, on: boolean): string | null {
  const away = useAwayOn(today)
  return on && away ? awayUntil(away, today) : null
}

/** Today's menu items: Away… and, while away, End now. */
export function AwayMenuItems() {
  const away = useAwayOn(useToday())
  return (
    <>
      <MenuItem icon="plane" label={t('Away…')} data-away-item onSelect={requestAway} />
      {away && <MenuItem icon="x" label={t('End now')} data-away-end
        onSelect={() => act(import('../../lib/awayActions').then((m) => m.endAway()))} />}
    </>
  )
}

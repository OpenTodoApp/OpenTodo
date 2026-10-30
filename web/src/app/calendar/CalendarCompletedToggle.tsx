import { t } from '../../lib/i18n'
import { setCalendarShowCompleted } from '../../lib/localData'
import { Button, MenuItem, useMediaQuery } from '../../ui'
import { act } from '../actionError'

/** One device-local visibility control shared by every Calendar mode. */
export function CalendarCompletedToggle({ shown, menu = false }: { shown: boolean; menu?: boolean }) {
  const wide = useMediaQuery('(min-width: 80rem)')
  if (wide === menu) return null
  const label = shown ? t('Hide completed') : t('Show completed')
  const toggle = () => act(setCalendarShowCompleted(!shown))
  if (menu) return <MenuItem label={label} icon="circle-check-big" checked={shown} data-calendar-completed-toggle onSelect={toggle} />
  return (
    <Button variant="ghost" size="sm" icon="circle-check-big" aria-pressed={shown} data-calendar-completed-toggle
      className={shown ? 'bg-sunken dark:bg-raised' : 'text-muted'}
      onClick={toggle}>
      {label}
    </Button>
  )
}

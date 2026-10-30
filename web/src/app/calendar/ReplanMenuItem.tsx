// Today's overflow item "Re-plan the rest of the day" (OpenSpec change replan-the-day,
// design D4): shown only while today has missed blocks; it opens the Day view of today
// with the preview already open.
import { t } from '../../lib/i18n'
import { MenuItem } from '../../ui'
import { openReplan } from '../signals'
import { useMissedBlocks } from './useMissedBlocks'

export function ReplanTodayItem() {
  const missed = useMissedBlocks().length
  if (missed === 0) return null
  return <MenuItem icon="calendar-clock" label={t('Re-plan the rest of the day')} description={t('{n, plural, one {# block behind} other {# blocks behind}}', { n: missed })}
    data-replan-item onSelect={() => openReplan(false)} />
}

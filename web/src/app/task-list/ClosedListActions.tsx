// Today's overflow items for the closed list (OpenSpec change today-closed-list, design
// D5): "Limit Today…" opens the Today limit in Settings, "Show done today" switches the
// Done today group. Offered in the method modes, or once a limit is set.
import { doneTodayShown, setDoneTodayShown } from '../../lib/closedListPrefs'
import { t } from '../../lib/i18n'
import type { UserPrefs } from '../../lib/types'
import { MenuItem } from '../../ui'
import { act } from '../actionError'
import { navigate } from '../router'

export function ClosedListMenuItems({ prefs }: { prefs: Partial<UserPrefs> | null | undefined }) {
  const done = doneTodayShown(prefs)
  return (
    <>
      <MenuItem icon="list-checks" label={t('Limit Today…')} data-today-limit-item
        onSelect={() => navigate({ view: 'settings', section: 'general', page: 'start', anchor: 'today-limit' })} />
      <MenuItem icon={done ? 'eye-off' : 'eye'} label={done ? t('Hide done today') : t('Show done today')} data-today-done-toggle
        onSelect={() => act(setDoneTodayShown(!done))} />
    </>
  )
}

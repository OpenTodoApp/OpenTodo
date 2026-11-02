// App icon badge (OpenSpec change `app-icon-badge`): the signed-in app keeps the badge
// current, and Settings → Notifications has the per-device switch, shown only where
// the browser can badge the installed app.
import { badgeSupported, setBadgeEnabled, useAppBadge, useBadgeEnabled } from '../lib/appBadge'
import { t } from '../lib/i18n'
import { useLiveTasks, useOpenTasks } from '../lib/liveTasks'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'
import { Notice, SettingRow, SettingsSection, Switch } from '../ui'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { useToday, useViewerZone } from './useViews'

/** Sets the badge from the live open tasks; rendered once beside the signed-in Shell. */
export function AppBadgeSync(): null {
  const live = useLiveTasks()
  const open = useOpenTasks()
  const today = useToday()
  const zone = useViewerZone()
  const { dayStart } = useDateTimeFormat()
  useAppBadge(open, live !== undefined, today, dayStart, zone)
  return null
}

export function AppBadgeView({ on, permission, onChange }: { on: boolean; permission: NotificationPermission | 'unsupported'; onChange: (on: boolean) => void }) {
  return (
    <SettingsSection {...cardCopy('app-badge')}>
      <SettingRow {...rowCopy('app-badge', 'show')} id="app-badge" htmlFor="app-badge-switch"
        control={<Switch id="app-badge-switch" checked={on} onChange={onChange} label={t('Show today\'s count')} hideLabel />} />
      {on && permission !== 'granted' && <Notice>{noticeCopy('app-badge', 'permission')}</Notice>}
    </SettingsSection>
  )
}

/** Settings → Notifications → App icon badge; nothing where badges are not supported. */
export function AppBadgeSection() {
  const on = useBadgeEnabled()
  if (!badgeSupported()) return null
  const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  return <AppBadgeView on={on} permission={permission} onChange={setBadgeEnabled} />
}

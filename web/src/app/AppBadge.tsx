// App icon badge (OpenSpec changes `app-icon-badge`, `badge-overdue`): the signed-in
// app keeps the badge current, and Settings → Notifications has the per-device choice
// of what it counts (Today, Earlier, Off), shown only where the browser can badge the
// installed app.
import { BADGE_MODES, badgeSupported, setBadgeMode, useAppBadge, useBadgeMode, type BadgeMode } from '../lib/appBadge'
import { useMe } from '../lib/sharing'
import { t } from '../lib/i18n'
import { useLiveTasks, useOpenTasks } from '../lib/liveTasks'
import { useSettledValue } from '../lib/useSettledValue'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'
import { Notice, SegmentedControl, SettingRow, SettingsSection } from '../ui'
import { useDateTimeFormat } from './DateTimePrefsProvider'
import { useToday, useViewerZone } from './useViews'

/** Sets the badge from the live open tasks; rendered once beside the signed-in Shell. */
export function AppBadgeSync(): null {
  const live = useLiveTasks()
  // Counted once the writes stop (list-rendering-at-scale D6): the badge need not follow each tick.
  const open = useSettledValue(useOpenTasks())
  const today = useToday()
  const zone = useViewerZone()
  const { dayStart } = useDateTimeFormat()
  const me = useMe()
  useAppBadge(open, live !== undefined, today, dayStart, zone, me)
  return null
}

const MODE_LABEL: Record<BadgeMode, () => string> = { today: () => t('Today'), overdue: () => t('Earlier'), off: () => t('Off') }

export function AppBadgeView({ mode, permission, onChange }: { mode: BadgeMode; permission: NotificationPermission | 'unsupported'; onChange: (mode: BadgeMode) => void }) {
  const row = rowCopy('app-badge', 'count')
  return (
    <SettingsSection {...cardCopy('app-badge')}>
      <SettingRow {...row} id="app-badge"
        control={<SegmentedControl<BadgeMode> label={row.label} value={mode} onChange={onChange}
          options={BADGE_MODES.map((m) => ({ id: m, label: MODE_LABEL[m]() }))} data-app-badge-mode />} />
      {mode !== 'off' && permission !== 'granted' && <Notice>{noticeCopy('app-badge', 'permission')}</Notice>}
    </SettingsSection>
  )
}

/** Settings → Notifications → App icon badge; nothing where badges are not supported. */
export function AppBadgeSection() {
  const mode = useBadgeMode()
  if (!badgeSupported()) return null
  const permission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  return <AppBadgeView mode={mode} permission={permission} onChange={setBadgeMode} />
}

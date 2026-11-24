// App icon badge (OpenSpec changes `app-icon-badge`, `badge-overdue`): the signed-in
// app keeps the badge current, and Settings → Notifications has the per-device choice
// of what it counts (Today, Earlier, Off), shown only where the browser can badge the
// installed app. The badge itself is kept by AppBadgeSync (its own module, so the
// first load does not carry the settings copy).
import { BADGE_MODES, badgeSupported, setBadgeMode, useBadgeMode, type BadgeMode } from '../lib/appBadge'
import { t } from '../lib/i18n'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'
import { Notice, SegmentedControl, SettingRow, SettingsSection } from '../ui'

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

// Settings → Notifications inside a native shell (OpenSpec change native-shells,
// reminders "Notification settings"): the same per-device switch, but reminders are
// handed to the shell and shown by the system without a push subscription; the test
// shows a notification through the shell and reports what the shell answered.
import { useEffect, useState } from 'react'
import { Badge, Button, Notice, SettingRow, SettingsSection, Switch } from '../ui'
import { t } from '../lib/i18n'
import { testNotification, type ShellPermission } from '../lib/shell'
import { setShellNotifications, setShellTitles, shellNotificationsEnabled, shellTitlesEnabled } from '../lib/shellPublish'
import { cardCopy, rowCopy } from '../lib/settingsCopy'

export interface ShellNotificationsState {
  enabled: boolean
  includeContent: boolean
  permission: ShellPermission | null
}

export function ShellNotifications() {
  const [state, setState] = useState<ShellNotificationsState | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null)

  useEffect(() => {
    void Promise.all([shellNotificationsEnabled(), shellTitlesEnabled()])
      .then(([enabled, includeContent]) => setState({ enabled, includeContent, permission: null }))
  }, [])

  const enable = async (on: boolean) => {
    if (!state) return
    setBusy(true)
    setMessage(null)
    const permission = await setShellNotifications(on)
    const enabled = on && permission !== 'denied'
    setState({ ...state, enabled, permission })
    if (on && enabled) setMessage({ kind: 'info', text: t('Notifications enabled on this device.') })
    setBusy(false)
  }
  const includeContent = async (on: boolean) => {
    if (!state) return
    await setShellTitles(on)
    setState({ ...state, includeContent: on })
  }
  const test = async () => {
    setBusy(true)
    setMessage(null)
    const shown = await testNotification()
    setMessage(shown
      ? { kind: 'info', text: t('The app showed a test notification on this device.') }
      : { kind: 'error', text: t('The app could not show a notification. Allow notifications for OpenTodo in Android\'s settings.') })
    setBusy(false)
  }
  return <ShellNotificationsView state={state} busy={busy} message={message} onEnable={(on) => void enable(on)} onIncludeContent={(on) => void includeContent(on)} onTest={() => void test()} />
}

/** Presentational part, rendered without effects for tests and stories. */
export function ShellNotificationsView({ state: s, busy, message, onEnable, onIncludeContent, onTest }: {
  state: ShellNotificationsState | null
  busy: boolean
  message: { kind: 'error' | 'info'; text: string } | null
  onEnable: (on: boolean) => void
  onIncludeContent: (on: boolean) => void
  onTest: () => void
}) {
  return (
    <SettingsSection {...cardCopy('notifications')}>
      {!s ? (
        <p className="py-2 text-meta text-faint">{t('Checking…')}</p>
      ) : (
        <>
          <SettingRow label={t('Notifications through the app')} description={t('The Android app schedules your reminders on this phone and shows them without a push service.')}
            status={<Badge hue={s.enabled ? 'green' : 'slate'}>{s.enabled ? t('On') : t('Off')}</Badge>}
            control={<Switch checked={s.enabled} disabled={busy} onChange={onEnable} label={t('Enable notifications on this device')} hideLabel />} />
          {s.permission === 'denied' && (
            <Notice tone="warning">{t('Android refused notifications for OpenTodo. Allow them in Android\'s settings (Apps → OpenTodo → Notifications); reminders still appear inside the app.')}</Notice>
          )}
          {s.permission === 'exact-denied' && (
            <Notice tone="warning">{t('Exact alarms are not allowed for OpenTodo, so reminders may arrive a few minutes late. Allow "Alarms & reminders" for the app in Android\'s settings.')}</Notice>
          )}
          <SettingRow {...rowCopy('notifications', 'titles')}
            control={<Switch checked={s.includeContent} disabled={busy} onChange={onIncludeContent} label={t('Include task titles')} hideLabel />} />
          <div className="py-3">
            <Button size="sm" disabled={busy || !s.enabled} onClick={onTest}>{t('Send a test notification')}</Button>
          </div>
        </>
      )}
      {message && <Notice tone={message.kind === 'error' ? 'danger' : 'success'}>{message.text}</Notice>}
    </SettingsSection>
  )
}

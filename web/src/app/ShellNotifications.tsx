// Settings → Notifications inside a native shell (OpenSpec change native-shells,
// reminders "Notification settings"): the same per-device switch, but reminders are
// handed to the shell and shown by the system without a push subscription; the test
// shows a notification through the shell and reports what the shell answered.
import { useEffect, useState } from 'react'
import { Badge, Button, Notice, SettingRow, SettingsSection, Switch } from '../ui'
import { t } from '../lib/i18n'
import { has, openAlarmSettings, shell, testNotification, type ShellPermission } from '../lib/shell'
import { publishReminders, setShellNotifications, setShellTitles, shellNotificationsEnabled, shellTitlesEnabled } from '../lib/shellPublish'
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
    // What the phone allows now (shell-reminders-on D3): the notice shows while exact alarms are refused,
    // and goes once the user allowed them and came back.
    const read = () => void Promise.all([publishReminders().catch(() => null), shellNotificationsEnabled(), shellTitlesEnabled()])
      .then(([permission, enabled, includeContent]) => setState({ enabled, includeContent, permission: enabled ? permission : null }))
    read()
    const onVisible = () => { if (document.visibilityState === 'visible') read() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
  const ios = shell()?.platform === 'ios'

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
      : { kind: 'error', text: ios
        ? t('The app could not show a notification. Allow notifications for OpenTodo in the iPhone\'s Settings.')
        : t('The app could not show a notification. Allow notifications for OpenTodo in Android\'s settings.') })
    setBusy(false)
  }
  return <ShellNotificationsView state={state} busy={busy} message={message} ios={ios} onAllowAlarms={has('alarm-settings') ? () => void openAlarmSettings() : undefined}
    onEnable={(on) => void enable(on)} onIncludeContent={(on) => void includeContent(on)} onTest={() => void test()} />
}

/** Presentational part, rendered without effects for tests and stories. */
export function ShellNotificationsView({ state: s, busy, message, ios = false, onAllowAlarms, onEnable, onIncludeContent, onTest }: {
  state: ShellNotificationsState | null
  busy: boolean
  message: { kind: 'error' | 'info'; text: string } | null
  /** The app runs on an iPhone or iPad: the explanations name its Settings. */
  ios?: boolean
  /** Opens the system page for exact alarms; absent in a shell that cannot. */
  onAllowAlarms?: () => void
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
          <SettingRow {...rowCopy('notifications', 'shell')}
            status={<Badge hue={s.enabled ? 'green' : 'slate'}>{s.enabled ? t('On') : t('Off')}</Badge>}
            control={<Switch checked={s.enabled} disabled={busy} onChange={onEnable} label={t('Enable notifications on this device')} hideLabel />} />
          {s.permission === 'denied' && (
            <Notice tone="warning">{ios
              ? t('Notifications are not allowed for OpenTodo. Allow them in the iPhone\'s Settings (Notifications → OpenTodo); reminders still appear inside the app.')
              : t('Android refused notifications for OpenTodo. Allow them in Android\'s settings (Apps → OpenTodo → Notifications); reminders still appear inside the app.')}</Notice>
          )}
          {s.permission === 'exact-denied' && (
            <Notice tone="warning">
              {t('Exact alarms are not allowed for OpenTodo, so reminders may arrive a few minutes late. Allow "Alarms & reminders" for the app in Android\'s settings.')}
              {onAllowAlarms && <div className="pt-2"><Button size="sm" onClick={onAllowAlarms}>{t('Allow')}</Button></div>}
            </Notice>
          )}
          <SettingRow {...rowCopy('notifications', 'shellTitles')}
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

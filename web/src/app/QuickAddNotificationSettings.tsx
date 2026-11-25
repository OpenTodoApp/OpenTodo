// Settings → Capture → Quick add → Quick add notification (OpenSpec change
// android-quick-add-notification): in the Android app that lists
// `quick-add-notification`, the phone's switch, off by default. The shell keeps it
// (D1); a refusal of the notification permission leaves it off with one notice.
import { useEffect, useState } from 'react'
import { Notice, SettingRow, SettingsSection, Switch } from '../ui'
import { has, type ShellQuickAddState } from '../lib/shell'
import { quickAddNotificationState, setQuickAddNotification } from '../lib/shellQuickAdd'
import { cardCopy, noticeCopy, rowCopy } from '../lib/settingsCopy'

export function QuickAddNotificationSection() {
  const [state, setState] = useState<ShellQuickAddState | null>(null)
  const [busy, setBusy] = useState(false)
  const offered = has('quick-add-notification')
  useEffect(() => {
    if (offered) void quickAddNotificationState().then(setState, () => undefined)
  }, [offered])
  if (!offered) return null
  const toggle = async (on: boolean) => {
    setBusy(true)
    setState(await setQuickAddNotification(on).catch(() => null))
    setBusy(false)
  }
  return <QuickAddNotificationView state={state} busy={busy} onToggle={(on) => void toggle(on)} />
}

/** Presentational part, rendered without effects for tests and stories. */
export function QuickAddNotificationView({ state, busy, onToggle }: { state: ShellQuickAddState | null; busy: boolean; onToggle: (on: boolean) => void }) {
  const row = rowCopy('quick-add-notification', 'phone')
  return (
    <SettingsSection {...cardCopy('quick-add-notification')} testId="quick-add-notification">
      <SettingRow {...row} control={<Switch checked={state === 'on'} disabled={busy || state == null} onChange={onToggle} label={row.label} hideLabel />} />
      {state === 'denied' && <Notice tone="warning">{noticeCopy('quick-add-notification', 'denied')}</Notice>}
    </SettingsSection>
  )
}

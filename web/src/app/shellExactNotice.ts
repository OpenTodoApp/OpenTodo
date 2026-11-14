// Android refused exact alarms (shell-reminders-on D3): the app says once per device
// that reminders can be a few minutes late, with the way to allow them. Settings →
// Notifications keeps the notice while it is so. Loaded only in a shell (main.tsx).
import { t } from '../lib/i18n'
import { has, openAlarmSettings } from '../lib/shell'
import { EXACT_ALARMS_EVENT, takeExactNotice } from '../lib/shellPublish'
import { showBulkToast } from './bulk/toastStore'

const TTL_MS = 12_000

/** Shows the notice unless this device has seen it. Returns whether it was shown. */
export async function noticeExactAlarms(): Promise<boolean> {
  if (!(await takeExactNotice())) return false
  showBulkToast(t('Reminders may arrive a few minutes late.'), null,
    has('alarm-settings') ? { ttl: TTL_MS, action: { label: t('Allow'), run: () => void openAlarmSettings() } } : { ttl: TTL_MS })
  return true
}

/** Listens for the publisher's announcement; returns the remover. */
export function watchExactAlarms(): () => void {
  const heard = () => void noticeExactAlarms().catch(() => undefined)
  window.addEventListener(EXACT_ALARMS_EVENT, heard)
  return () => window.removeEventListener(EXACT_ALARMS_EVENT, heard)
}

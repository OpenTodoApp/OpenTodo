// Settings → Account: session and a pointer to Security (OpenSpec settings-redesign D1, D3).
import { useState } from 'react'
import { Button } from '../ui'
import { ConfirmDialog } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { t } from '../lib/i18n'

/** Sign out of this device, after confirming what it clears (web-app "Settings"). */
export function SessionPanel({ onLogout }: { onLogout: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <SettingsSection title={t('Session')} headingId="session-heading" description={t('This device is signed in to your server.')}>
      <SettingRow label={t('Sign out of this device')} description={t('Clears the local copy of your tasks on this device. Unsynced changes are uploaded first when online.')}
        control={<Button variant="danger" icon="log-out" onClick={() => setConfirming(true)}>{t('Sign out')}</Button>} />
      {confirming && (
        <ConfirmDialog title={t('Sign out of this device?')} confirmLabel={t('Sign out')}
          consequence={t('Unsynced changes are uploaded first when you are online, then the local copy of your tasks is cleared from this device. Your data stays on your server.')}
          onConfirm={onLogout} onCancel={() => setConfirming(false)} />
      )}
    </SettingsSection>
  )
}

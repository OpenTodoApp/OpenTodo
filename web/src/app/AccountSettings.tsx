// Settings → Account: session and a pointer to Security (OpenSpec settings-redesign D1, D3).
import { useState } from 'react'
import { Button } from '../ui'
import { ConfirmDialog } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { api } from '../lib/api'
import { t } from '../lib/i18n'

/**
 * Ends every session of the account on the server (route-authorization-policy),
 * after a last upload of this device's unsynced changes.
 */
async function signOutEverywhere(): Promise<void> {
  await import('../lib/sync').then((m) => m.syncNow()).catch(() => undefined)
  await api.signOutEverywhere()
}

/**
 * Sign out of this device, or of every device, after confirming what it clears
 * (web-app "Settings"). Signing out everywhere also revokes API tokens and app
 * passwords; this device then signs out like a regular sign-out.
 */
export function SessionPanel({ onLogout, onSignOutEverywhere = signOutEverywhere }: { onLogout: () => void; onSignOutEverywhere?: () => Promise<void> }) {
  const [confirming, setConfirming] = useState<'device' | 'everywhere' | null>(null)
  return (
    <SettingsSection title={t('Session')} headingId="session-heading" description={t('This device is signed in to your server.')}>
      <SettingRow label={t('Sign out of this device')} description={t('Clears the local copy of your tasks on this device. Unsynced changes are uploaded first when online.')}
        control={<Button variant="danger" icon="log-out" onClick={() => setConfirming('device')}>{t('Sign out')}</Button>} />
      <SettingRow label={t('Sign out everywhere')} description={t('Signs out every device and browser, including this one, and revokes your API tokens and app passwords.')}
        control={<Button variant="secondary" icon="log-out" onClick={() => setConfirming('everywhere')}>{t('Sign out everywhere')}</Button>} />
      {confirming === 'device' && (
        <ConfirmDialog title={t('Sign out of this device?')} confirmLabel={t('Sign out')}
          consequence={t('Unsynced changes are uploaded first when you are online, then the local copy of your tasks is cleared from this device. Your data stays on your server.')}
          onConfirm={onLogout} onCancel={() => setConfirming(null)} />
      )}
      {confirming === 'everywhere' && (
        <ConfirmDialog title={t('Sign out everywhere?')} confirmLabel={t('Sign out everywhere')}
          consequence={t('Every device and browser signed in to your account is signed out, remembered browsers must enter a code again, and your API tokens and app passwords stop working at once. Scripts, calendar apps and assistants need new ones. Changes another device has not synced yet are lost. Your data stays on your server.')}
          onConfirm={async () => { await onSignOutEverywhere(); onLogout() }} onCancel={() => setConfirming(null)} />
      )}
    </SettingsSection>
  )
}

// Settings → Account: session and a pointer to Security (OpenSpec settings-redesign D1, D3).
import { useState } from 'react'
import { Button } from '../ui'
import { ConfirmDialog } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { api } from '../lib/api'
import { t } from '../lib/i18n'
import { cardCopy, rowCopy } from '../lib/settingsCopy'

/**
 * Ends every session of the account on the server (route-authorization-policy),
 * after a last upload of this device's unsynced changes.
 */
async function signOutEverywhere(): Promise<void> {
  await import('../lib/sync').then((m) => m.syncNow()).catch(() => undefined)
  await api.signOutEverywhere()
}

/**
 * "Sign out of this device?" (web-app "Settings"; quiet-sidebar D5): the same
 * confirmation from Settings → Account and from the account menu in the sidebar.
 */
export function SignOutDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <ConfirmDialog title={t('Sign out of this device?')} confirmLabel={t('Sign out')}
      consequence={t('Unsynced changes are uploaded first when you are online, then the local copy of your tasks is cleared from this device. Your data stays on your server.')}
      onConfirm={onConfirm} onCancel={onCancel} />
  )
}

/**
 * Sign out of this device, or of every device, after confirming what it clears
 * (web-app "Settings"). Signing out everywhere also revokes API tokens and app
 * passwords; this device then signs out like a regular sign-out.
 */
export function SessionPanel({ onLogout, onSignOutEverywhere = signOutEverywhere }: { onLogout: () => void; onSignOutEverywhere?: () => Promise<void> }) {
  const [confirming, setConfirming] = useState<'device' | 'everywhere' | null>(null)
  return (
    <SettingsSection {...cardCopy('session')} tier="primary">
      <SettingRow {...rowCopy('session', 'device')}
        control={<Button variant="danger" icon="log-out" onClick={() => setConfirming('device')}>{t('Sign out')}</Button>} />
      <SettingRow {...rowCopy('session', 'everywhere')}
        control={<Button variant="secondary" icon="log-out" onClick={() => setConfirming('everywhere')}>{t('Sign out everywhere')}</Button>} />
      {confirming === 'device' && <SignOutDialog onConfirm={onLogout} onCancel={() => setConfirming(null)} />}
      {confirming === 'everywhere' && (
        <ConfirmDialog title={t('Sign out everywhere?')} confirmLabel={t('Sign out everywhere')}
          consequence={t('Every device and browser signed in to your account is signed out, remembered browsers must enter a code again, and your API tokens and app passwords stop working at once. Scripts, calendar apps and assistants need new ones. Changes another device has not synced yet are lost. Your data stays on your server.')}
          onConfirm={async () => { await onSignOutEverywhere(); onLogout() }} onCancel={() => setConfirming(null)} />
      )}
    </SettingsSection>
  )
}

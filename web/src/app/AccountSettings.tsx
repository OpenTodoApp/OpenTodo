// Settings → Account: session and a pointer to Security (OpenSpec settings-redesign D1, D3).
import { useState } from 'react'
import { Button } from '../ui'
import { ConfirmDialog } from '../ui'
import { SettingRow, SettingsSection } from '../ui'
import { navigate } from './router'

/** Sign out of this device, after confirming what it clears (web-app "Settings"). */
export function SessionPanel({ onLogout }: { onLogout: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <SettingsSection title="Session" helpId="settings/session" description="This device is signed in to your server.">
      <SettingRow label="Password, two-factor and passkeys" description="They moved to their own section."
        control={<Button variant="secondary" iconEnd="chevron-right" onClick={() => navigate({ view: 'settings', section: 'security' })}>Security</Button>} />
      <SettingRow label="Sign out of this device" description="Clears the local copy of your tasks on this device. Unsynced changes are uploaded first when online."
        control={<Button variant="danger" icon="log-out" onClick={() => setConfirming(true)}>Sign out</Button>} />
      {confirming && (
        <ConfirmDialog title="Sign out of this device?" confirmLabel="Sign out"
          consequence="Unsynced changes are uploaded first when you are online, then the local copy of your tasks is cleared from this device. Your data stays on your server."
          onConfirm={onLogout} onCancel={() => setConfirming(false)} />
      )}
    </SettingsSection>
  )
}

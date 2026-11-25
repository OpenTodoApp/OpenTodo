import { ConfirmDialog } from '../ui'
import { t } from '../lib/i18n'

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

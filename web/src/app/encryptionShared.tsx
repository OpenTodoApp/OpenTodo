// What the unlock screen and Settings → End-to-end encryption share (OpenSpec `e2ee`):
// the message of a failed step and the "both lost" confirmation. Their own small
// module, so the unlock screen does not load the whole encryption panel.
import { ApiError, isNetworkError } from '../lib/api'
import { RecoveryKeyFormatError, WrongSecretError } from '../lib/crypto'
import { EncryptionConflictError, UnlockThrottledError } from '../lib/e2ee'
import { messageOf } from '../lib/errorText'
import { t } from '../lib/i18n'

export function encryptionMessage(err: unknown): string {
  if (err instanceof WrongSecretError || err instanceof RecoveryKeyFormatError || err instanceof UnlockThrottledError || err instanceof EncryptionConflictError) return err.message
  if (err instanceof ApiError) return err.message
  // fetch() rejects with TypeError when the server is unreachable.
  if (err instanceof TypeError && isNetworkError(err)) return t('You are offline. This needs a connection to your server.')
  return messageOf(err)
}

/** The "both lost" path, shared with the unlock screen: states the loss plainly before acting. */
export function LostKeysConfirm({ busy, onConfirm, onCancel }: { busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="space-y-2 rounded-control border border-danger p-3">
      <p className="text-body">
        {t('Without your passphrase or recovery key, encrypted content cannot be recovered: not by you, not by the server owner. The only way forward is to turn encryption off and delete the encrypted content (it moves to the Trash). Plaintext data (due dates, structure) is kept.')}
      </p>
      <div className="flex gap-2">
        <button type="button" className="ui-btn ui-btn--danger ui-btn--md" disabled={busy} onClick={onConfirm}>{busy ? t('Deleting…') : t('Turn off and delete encrypted content')}</button>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--md" onClick={onCancel}>{t('Cancel')}</button>
      </div>
    </div>
  )
}

// The assistant's short notices used outside its lazy chunk (the Ask entry in the
// shell, the composer): kept apart so the transcript stays out of the first load
// (assistant-generative-ui D9).
import { msg, t } from '../../lib/i18n'
import { navigate } from '../router'

export const ENCRYPTED_MESSAGE = msg('The assistant can’t read end-to-end encrypted tasks. Your tasks never leave your devices unencrypted.')

/** What an encrypted account can do to use the assistant: a link to the encryption settings. */
export function EncryptionOffHint() {
  return (
    <span data-assistant-encryption-hint>
      {t.rich('To use the assistant, you can turn encryption off in <a>Settings → Account → Encryption</a>; your tasks are then stored on the server without end-to-end encryption.', { a: (chunks) => <a className="underline" href="/settings/account/encryption" onClick={(e) => { e.preventDefault(); navigate({ view: 'settings', section: 'account', page: 'encryption' }) }}>{chunks}</a> })}
    </span>
  )
}
export const OFFLINE_MESSAGE = msg('The assistant needs a connection.')

import { useState } from 'react'
import { disableWithoutKey, unlock } from '../lib/e2ee'
import { requestSync } from '../lib/sync'
import { encryptionMessage, LostKeysConfirm } from './EncryptionPanel'
import { t } from '../lib/i18n'

// The unlock screen (OpenSpec `e2ee`, design D5, task 4.2): shown instead of the
// app while the account encrypts and this device holds no key (a new device
// after sign-in, or after "Lock this device"). Sync is paused until unlocked;
// the passphrase stays in component state and never leaves the device.

export interface UnlockViewProps {
  kind: 'passphrase' | 'recovery'
  busy: boolean
  error: string | null
  lost: boolean
  onKind: (k: 'passphrase' | 'recovery') => void
  onSubmit: (secret: string) => void
  onLost: (open: boolean) => void
  onConfirmLost: () => void
  onLogout: () => void
}

export function UnlockView(p: UnlockViewProps) {
  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4 rounded-control border border-default p-6">
        <h1 className="text-h3 font-semibold">{t('Unlock your tasks')}</h1>
        <p className="text-body text-muted">
          {p.kind === 'passphrase' ? t('Your account uses end-to-end encryption. Enter your encryption passphrase to decrypt your tasks on this device. Sync stays paused until then. You only need to do this once per device.') : t('Your account uses end-to-end encryption. Enter your encryption recovery key to decrypt your tasks on this device. Sync stays paused until then. You only need to do this once per device.')}
        </p>
        <form className="space-y-2" onSubmit={(e) => {
          e.preventDefault()
          p.onSubmit((e.currentTarget.elements.namedItem('secret') as HTMLInputElement).value)
        }}>
          <label className="block text-body">{p.kind === 'passphrase' ? t('Passphrase') : t('Recovery key')}
            <input className={`ui-input mt-1 ${p.kind === 'recovery' ? 'font-mono' : ''}`} name="secret" type={p.kind === 'passphrase' ? 'password' : 'text'}
              autoComplete={p.kind === 'passphrase' ? 'current-password' : 'off'} spellCheck={false} autoFocus required />
          </label>
          {p.error && <p role="alert" className="text-body text-danger">{p.error}</p>}
          <button className="ui-btn ui-btn--primary ui-btn--md w-full" disabled={p.busy}>{p.busy ? t('Unlocking…') : t('Unlock')}</button>
        </form>
        <div className="flex flex-wrap justify-between gap-2 text-body">
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--md" onClick={() => p.onKind(p.kind === 'passphrase' ? 'recovery' : 'passphrase')}>
            {p.kind === 'passphrase' ? t('Use the recovery key instead') : t('Use the passphrase instead')}
          </button>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--md" onClick={p.onLogout}>{t('Sign out')}</button>
        </div>
        {p.lost
          ? <LostKeysConfirm busy={p.busy} onConfirm={p.onConfirmLost} onCancel={() => p.onLost(false)} />
          : <button type="button" className="text-meta text-muted underline" onClick={() => p.onLost(true)}>{t('I lost both my passphrase and my recovery key')}</button>}
      </div>
    </div>
  )
}

export function UnlockScreen({ onLogout }: { onLogout: () => void }) {
  const [kind, setKind] = useState<'passphrase' | 'recovery'>('passphrase')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lost, setLost] = useState(false)
  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      requestSync(0)
    } catch (err) {
      setError(encryptionMessage(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <UnlockView
      kind={kind} busy={busy} error={error} lost={lost} onKind={(k) => { setKind(k); setError(null) }} onLost={setLost} onLogout={onLogout}
      onSubmit={(secret) => void act(() => unlock(secret, kind))}
      onConfirmLost={() => void act(() => disableWithoutKey())}
    />
  )
}
